/**
 * Materialises explicitly configured local RDF files as ignored catalogue
 * entries. This keeps a file outside the repository as the source of truth
 * without weakening the catalogue compiler's symlink protections.
 */
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import type { CatalogueMetadata } from './catalogue-validation.js';
import {
  DEFAULT_VALIDATION_LIMITS,
  validateCatalogueMetadata,
  validateRdfSource,
} from './catalogue-validation.js';

const PROJECT_ROOT = resolve(import.meta.dirname, '..');
export const LOCAL_ONTOLOGY_LINKS_CONFIG = '.ontology-links.local.json';
const GENERATED_MARKER = '.ontology-link.json';
const SAFE_SLUG_RE = /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/;
const STAGING_DIRECTORY = '.ontology-links-tmp';
const ORPHAN_TEMP_FILE_RE = /^(?:ontology\.rdf|metadata\.json|\.ontology-link\.json)\.tmp-\d+-[0-9a-f-]+$/;

if (globalThis.DOMParser === undefined) {
  const dom = new JSDOM('');
  globalThis.DOMParser = dom.window.DOMParser;
}

interface ReplacementConfig {
  description: string;
  from: string;
  to: string;
  expectedMatches?: number;
}

interface OntologyLinkConfig {
  id: string;
  source: string;
  metadata: CatalogueMetadata;
  replacements?: ReplacementConfig[];
}

interface OntologyLinksConfig {
  version: 1;
  links: OntologyLinkConfig[];
}

interface GeneratedMarker {
  schemaVersion: 1;
  source: string;
}

export interface SyncedOntologyLink {
  catalogueId: string;
  outputPath: string;
  sourcePath: string;
  transformed: boolean;
  updated: boolean;
}

export interface SyncLinkedOntologiesOptions {
  configPath?: string;
  projectRoot?: string;
  silent?: boolean;
}

export interface SyncLinkedOntologiesResult {
  configPath: string;
  configFound: boolean;
  links: SyncedOntologyLink[];
  removedCatalogueIds: string[];
  sourcePaths: string[];
}

interface PreparedOntologyLink extends SyncedOntologyLink {
  markerContent: Buffer;
  metadataContent: Buffer;
  outputDirectory: string;
  rdfContent: Buffer;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(
  value: unknown,
  field: string,
  options: { allowEmpty?: boolean } = {},
): string {
  if (
    typeof value !== 'string'
    || (!options.allowEmpty && value.trim().length === 0)
  ) {
    throw new Error(`${field} must be ${options.allowEmpty ? 'a string' : 'a non-empty string'}.`);
  }
  return value;
}

function parseReplacement(
  value: unknown,
  linkIndex: number,
  replacementIndex: number,
): ReplacementConfig {
  const field = `links[${linkIndex}].replacements[${replacementIndex}]`;
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object.`);
  }
  const expectedMatches = value.expectedMatches ?? 1;
  if (
    typeof expectedMatches !== 'number'
    || !Number.isSafeInteger(expectedMatches)
    || expectedMatches < 0
  ) {
    throw new Error(`${field}.expectedMatches must be a non-negative integer.`);
  }
  const from = requireString(value.from, `${field}.from`);
  const to = requireString(value.to, `${field}.to`, { allowEmpty: true });
  if (from === to) {
    throw new Error(`${field} must change the matched text.`);
  }
  return {
    description: requireString(value.description, `${field}.description`),
    from,
    to,
    expectedMatches,
  };
}

function parseConfig(value: unknown): OntologyLinksConfig {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.links)) {
    throw new Error('Local ontology links config must contain version 1 and a links array.');
  }

  const seenIds = new Set<string>();
  const links = value.links.map((candidate, index): OntologyLinkConfig => {
    const field = `links[${index}]`;
    if (!isRecord(candidate)) {
      throw new Error(`${field} must be an object.`);
    }
    const id = requireString(candidate.id, `${field}.id`);
    if (!SAFE_SLUG_RE.test(id)) {
      throw new Error(`${field}.id must be a lowercase catalogue slug.`);
    }
    if (seenIds.has(id)) {
      throw new Error(`Duplicate local ontology link id "${id}".`);
    }
    seenIds.add(id);

    const metadataReport = validateCatalogueMetadata(candidate.metadata, 'official');
    if (metadataReport.errors.length > 0) {
      throw new Error(
        `${field}.metadata is invalid: ${metadataReport.errors.map((issue) => issue.message).join(' ')}`,
      );
    }

    let replacements: ReplacementConfig[] | undefined;
    if (candidate.replacements !== undefined) {
      if (!Array.isArray(candidate.replacements)) {
        throw new Error(`${field}.replacements must be an array when provided.`);
      }
      replacements = candidate.replacements.map((replacement, replacementIndex) =>
        parseReplacement(replacement, index, replacementIndex));
    }

    return {
      id,
      source: requireString(candidate.source, `${field}.source`),
      metadata: candidate.metadata as unknown as CatalogueMetadata,
      replacements,
    };
  });

  return { version: 1, links };
}

function countOccurrences(value: string, search: string): number {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = value.indexOf(search, offset);
    if (index < 0) return count;
    count++;
    offset = index + search.length;
  }
}

function applyReplacements(
  source: Buffer,
  replacements: readonly ReplacementConfig[],
  sourcePath: string,
): Buffer {
  if (replacements.length === 0) return source;

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(source);
  } catch {
    throw new Error(`${sourcePath}: replacements require valid UTF-8 source text.`);
  }

  for (const replacement of replacements) {
    const matchCount = countOccurrences(text, replacement.from);
    const expectedMatches = replacement.expectedMatches ?? 1;
    if (matchCount !== expectedMatches) {
      throw new Error(
        `${sourcePath}: replacement "${replacement.description}" expected ${expectedMatches} match(es), found ${matchCount}.`,
      );
    }
    text = text.split(replacement.from).join(replacement.to);
  }
  return Buffer.from(text, 'utf-8');
}

function assertRegularDirectory(path: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`${path}: expected a regular directory, not a symlink.`);
  }
}

function officialCatalogueDirectory(projectRoot: string): string {
  const catalogueDirectory = join(projectRoot, 'catalogue');
  const officialDirectory = join(catalogueDirectory, 'official');
  assertRegularDirectory(projectRoot);
  assertRegularDirectory(catalogueDirectory);
  assertRegularDirectory(officialDirectory);
  return officialDirectory;
}

function readRegularFileNoFollow(path: string): Buffer {
  let descriptor: number;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
      throw new Error(`${path}: symlinks are not allowed.`);
    }
    throw error;
  }

  try {
    if (!fstatSync(descriptor).isFile()) {
      throw new Error(`${path}: expected a regular file.`);
    }
    return readFileSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function assertRegularGeneratedFile(path: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`${path}: generated entry files must be regular files, not symlinks.`);
  }
}

function readGeneratedMarker(outputDirectory: string): GeneratedMarker {
  const markerPath = join(outputDirectory, GENERATED_MARKER);
  assertRegularGeneratedFile(markerPath);
  const marker = JSON.parse(readRegularFileNoFollow(markerPath).toString('utf-8')) as unknown;
  if (
    !isRecord(marker)
    || marker.schemaVersion !== 1
    || typeof marker.source !== 'string'
  ) {
    throw new Error(`${markerPath}: invalid generated-entry marker.`);
  }
  return { schemaVersion: 1, source: marker.source };
}

function assertOwnedOutputDirectory(outputDirectory: string): void {
  const stat = lstatSync(outputDirectory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`${outputDirectory}: expected a regular directory, not a symlink.`);
  }

  const entries = readdirSync(outputDirectory);
  if (entries.length === 0) return;

  if (!entries.includes(GENERATED_MARKER)) {
    throw new Error(
      `${outputDirectory}: refusing to overwrite a catalogue entry not created by the local link synchronizer.`,
    );
  }
  readGeneratedMarker(outputDirectory);

  const allowedEntries = new Set([
    GENERATED_MARKER,
    'metadata.json',
    'ontology.rdf',
  ]);
  for (const entry of entries) {
    const entryPath = join(outputDirectory, entry);
    if (ORPHAN_TEMP_FILE_RE.test(entry)) {
      assertRegularGeneratedFile(entryPath);
      unlinkSync(entryPath);
      continue;
    }
    if (!allowedEntries.has(entry)) {
      throw new Error(`${outputDirectory}: unexpected generated-entry file "${entry}".`);
    }
    assertRegularGeneratedFile(entryPath);
  }
}

function writeFileAtomicallyIfChanged(path: string, content: Buffer): boolean {
  if (existsSync(path)) {
    assertRegularGeneratedFile(path);
    if (readRegularFileNoFollow(path).equals(content)) return false;
  }

  const temporaryPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  let descriptor: number | undefined;
  try {
    descriptor = openSync(
      temporaryPath,
      constants.O_WRONLY
        | constants.O_CREAT
        | constants.O_EXCL
        | constants.O_NOFOLLOW,
      0o600,
    );
    writeFileSync(descriptor, content);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporaryPath, path);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    rmSync(temporaryPath, { force: true });
  }
  return true;
}

function readSource(path: string): Buffer {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`${path}: linked ontology source must be a regular file, not a symlink.`);
  }
  if (stat.size > DEFAULT_VALIDATION_LIMITS.maxSourceBytes) {
    throw new Error(
      `${path}: source is ${stat.size.toLocaleString()} bytes; the limit is ${DEFAULT_VALIDATION_LIMITS.maxSourceBytes.toLocaleString()} bytes.`,
    );
  }
  return readRegularFileNoFollow(path);
}

function prepareLink(
  link: OntologyLinkConfig,
  projectRoot: string,
  configDirectory: string,
): PreparedOntologyLink {
  const sourcePath = resolve(configDirectory, link.source);
  const sourceExtension = extname(sourcePath).toLowerCase();
  if (sourceExtension !== '.rdf' && sourceExtension !== '.owl') {
    throw new Error(`${sourcePath}: linked ontology source must end in .rdf or .owl.`);
  }

  const outputDirectory = join(
    projectRoot,
    'catalogue',
    'official',
    `local-${link.id}`,
  );

  const source = readSource(sourcePath);
  const transformed = applyReplacements(
    source,
    link.replacements ?? [],
    sourcePath,
  );
  const sourceReport = validateRdfSource(transformed);
  if (sourceReport.errors.length > 0) {
    throw new Error(
      `${sourcePath}: synchronized RDF is invalid: ${sourceReport.errors.map((issue) => issue.message).join(' ')}`,
    );
  }

  const outputPath = join(outputDirectory, 'ontology.rdf');
  const metadataContent = Buffer.from(`${JSON.stringify(link.metadata, null, 2)}\n`, 'utf-8');
  const marker: GeneratedMarker = { schemaVersion: 1, source: sourcePath };
  const markerContent = Buffer.from(`${JSON.stringify(marker, null, 2)}\n`, 'utf-8');

  return {
    catalogueId: `official/local-${link.id}`,
    markerContent,
    metadataContent,
    outputDirectory,
    outputPath,
    rdfContent: transformed,
    sourcePath,
    transformed: (link.replacements?.length ?? 0) > 0,
    updated: false,
  };
}

function materializeLink(
  link: PreparedOntologyLink,
  projectRoot: string,
): SyncedOntologyLink {
  const officialDirectory = officialCatalogueDirectory(projectRoot);
  if (dirname(link.outputDirectory) !== officialDirectory) {
    throw new Error(`${link.outputDirectory}: generated entry escaped the official catalogue.`);
  }
  let updated: boolean;
  if (!existsSync(link.outputDirectory)) {
    stageNewOutputDirectory(link, projectRoot);
    updated = true;
  } else {
    assertOwnedOutputDirectory(link.outputDirectory);
    updated = [
      writeFileAtomicallyIfChanged(link.outputPath, link.rdfContent),
      writeFileAtomicallyIfChanged(
        join(link.outputDirectory, 'metadata.json'),
        link.metadataContent,
      ),
      writeFileAtomicallyIfChanged(
        join(link.outputDirectory, GENERATED_MARKER),
        link.markerContent,
      ),
    ].some(Boolean);
  }
  return { ...link, updated };
}

function writeNewRegularFile(path: string, content: Buffer): void {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(
      path,
      constants.O_WRONLY
        | constants.O_CREAT
        | constants.O_EXCL
        | constants.O_NOFOLLOW,
      0o600,
    );
    writeFileSync(descriptor, content);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function removeStagingDirectory(path: string): void {
  assertRegularDirectory(path);
  for (const entry of readdirSync(path)) {
    const entryPath = join(path, entry);
    assertRegularGeneratedFile(entryPath);
    unlinkSync(entryPath);
  }
  rmdirSync(path);
}

function cleanupStagingRoot(projectRoot: string): void {
  assertRegularDirectory(projectRoot);
  const stagingRoot = join(projectRoot, STAGING_DIRECTORY);
  if (!existsSync(stagingRoot)) return;
  assertRegularDirectory(stagingRoot);
  for (const entry of readdirSync(stagingRoot)) {
    const entryPath = join(stagingRoot, entry);
    if (!/^local-[a-z0-9_-]+-[0-9a-f-]+$/.test(entry)) {
      throw new Error(`${stagingRoot}: unexpected staging entry "${entry}".`);
    }
    removeStagingDirectory(entryPath);
  }
  rmdirSync(stagingRoot);
}

function prepareStagingRoot(projectRoot: string): string {
  cleanupStagingRoot(projectRoot);
  const stagingRoot = join(projectRoot, STAGING_DIRECTORY);
  mkdirSync(stagingRoot);
  return stagingRoot;
}

function stageNewOutputDirectory(
  link: PreparedOntologyLink,
  projectRoot: string,
): void {
  const stagingRoot = prepareStagingRoot(projectRoot);
  const stagingDirectory = join(
    stagingRoot,
    `${link.catalogueId.slice('official/'.length)}-${randomUUID()}`,
  );
  mkdirSync(stagingDirectory);
  try {
    writeNewRegularFile(
      join(stagingDirectory, GENERATED_MARKER),
      link.markerContent,
    );
    writeNewRegularFile(
      join(stagingDirectory, 'metadata.json'),
      link.metadataContent,
    );
    writeNewRegularFile(
      join(stagingDirectory, 'ontology.rdf'),
      link.rdfContent,
    );
    renameSync(stagingDirectory, link.outputDirectory);
  } finally {
    if (existsSync(stagingDirectory)) {
      removeStagingDirectory(stagingDirectory);
    }
    if (existsSync(stagingRoot) && readdirSync(stagingRoot).length === 0) {
      rmdirSync(stagingRoot);
    }
  }
}

function recoverMarkerlessDesiredOutput(link: PreparedOntologyLink): void {
  if (!existsSync(link.outputDirectory)) return;
  assertRegularDirectory(link.outputDirectory);
  const entries = readdirSync(link.outputDirectory);
  if (entries.includes(GENERATED_MARKER)) return;
  if (entries.length === 0) {
    throw new Error(
      `${link.outputDirectory}: refusing to recover an empty unowned catalogue entry.`,
    );
  }

  const expectedContent = new Map<string, Buffer>([
    ['metadata.json', link.metadataContent],
    ['ontology.rdf', link.rdfContent],
  ]);
  for (const entry of entries) {
    const entryPath = join(link.outputDirectory, entry);
    if (ORPHAN_TEMP_FILE_RE.test(entry)) {
      assertRegularGeneratedFile(entryPath);
      continue;
    }
    const expected = expectedContent.get(entry);
    if (expected === undefined) {
      throw new Error(
        `${link.outputDirectory}: refusing to recover an unowned catalogue entry with unexpected files.`,
      );
    }
    assertRegularGeneratedFile(entryPath);
    if (!readRegularFileNoFollow(entryPath).equals(expected)) {
      throw new Error(
        `${link.outputDirectory}: refusing to recover an unowned catalogue entry with different content.`,
      );
    }
  }
  for (const entry of readdirSync(link.outputDirectory)) {
    const entryPath = join(link.outputDirectory, entry);
    assertRegularGeneratedFile(entryPath);
    unlinkSync(entryPath);
  }
  rmdirSync(link.outputDirectory);
}

function discoverGeneratedOutputDirectories(
  officialDirectory: string,
): Map<string, string> {
  const directories = new Map<string, string>();
  for (const entry of readdirSync(officialDirectory)) {
    if (!entry.startsWith('local-')) continue;
    const path = join(officialDirectory, entry);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      throw new Error(`${path}: local catalogue entries cannot be symlinks.`);
    }
    if (!stat.isDirectory() || !existsSync(join(path, GENERATED_MARKER))) {
      continue;
    }
    assertOwnedOutputDirectory(path);
    directories.set(`official/${entry}`, path);
  }
  return directories;
}

function removeGeneratedOutputDirectory(path: string): void {
  assertOwnedOutputDirectory(path);
  for (const entry of readdirSync(path)) {
    assertRegularGeneratedFile(join(path, entry));
    unlinkSync(join(path, entry));
  }
  rmdirSync(path);
}

export function syncLinkedOntologies(
  options: SyncLinkedOntologiesOptions = {},
): SyncLinkedOntologiesResult {
  const projectRoot = resolve(options.projectRoot ?? PROJECT_ROOT);
  const configPath = resolve(
    options.configPath ?? join(projectRoot, LOCAL_ONTOLOGY_LINKS_CONFIG),
  );
  const configFound = existsSync(configPath);
  const config = configFound
    ? parseConfig(JSON.parse(readRegularFileNoFollow(configPath).toString('utf-8')) as unknown)
    : { version: 1 as const, links: [] };

  const officialDirectoryPath = join(projectRoot, 'catalogue', 'official');
  if (!configFound && !existsSync(officialDirectoryPath)) {
    if (!options.silent) {
      console.log(`No ${LOCAL_ONTOLOGY_LINKS_CONFIG} found; skipping local ontology sync.`);
    }
    return {
      configPath,
      configFound: false,
      links: [],
      removedCatalogueIds: [],
      sourcePaths: [],
    };
  }

  const officialDirectory = officialCatalogueDirectory(projectRoot);
  cleanupStagingRoot(projectRoot);
  const preparedLinks = config.links.map((link) =>
    prepareLink(link, projectRoot, dirname(configPath)));
  const desiredCatalogueIds = new Set(
    preparedLinks.map((link) => link.catalogueId),
  );
  const generatedDirectories = discoverGeneratedOutputDirectories(
    officialDirectory,
  );

  // Preflight every existing destination before writing any configured link.
  for (const link of preparedLinks) {
    recoverMarkerlessDesiredOutput(link);
    if (existsSync(link.outputDirectory)) {
      assertOwnedOutputDirectory(link.outputDirectory);
    }
  }

  const links = preparedLinks.map((link) => materializeLink(link, projectRoot));
  const removedCatalogueIds: string[] = [];
  for (const [catalogueId, path] of generatedDirectories) {
    if (desiredCatalogueIds.has(catalogueId)) continue;
    removeGeneratedOutputDirectory(path);
    removedCatalogueIds.push(catalogueId);
  }

  if (!options.silent) {
    for (const link of links) {
      const state = link.updated ? 'synced' : 'unchanged';
      const transform = link.transformed ? ', configured replacements applied' : '';
      console.log(`  ${state.toUpperCase()}  ${link.catalogueId} <- ${link.sourcePath}${transform}`);
    }
    for (const catalogueId of removedCatalogueIds) {
      console.log(`  REMOVED  ${catalogueId}`);
    }
    if (!configFound && removedCatalogueIds.length === 0) {
      console.log(`No ${LOCAL_ONTOLOGY_LINKS_CONFIG} found; no local ontology links to remove.`);
    }
  }

  return {
    configPath,
    configFound,
    links,
    removedCatalogueIds,
    sourcePaths: links.map((link) => link.sourcePath),
  };
}

const isMainModule = process.argv[1] !== undefined
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMainModule) {
  try {
    syncLinkedOntologies();
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
