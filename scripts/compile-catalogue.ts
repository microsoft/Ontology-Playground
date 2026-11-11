/**
 * Build-time catalogue compiler.
 *
 * Reads all catalogue/**\/*.rdf files, parses each via the RDF parser,
 * reads associated metadata.json, and emits a lightweight catalogue index
 * plus one content-addressed payload per ontology.
 *
 * Usage: npx tsx scripts/compile-catalogue.ts
 */
import { createHash } from 'node:crypto';
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
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import type { Stats } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { parseRDF } from '../src/lib/rdf/parser.js';
import { serializeToRDF } from '../src/lib/rdf/serializer.js';
import type { DataBinding, Ontology } from '../src/data/ontology.js';
import type {
  CatalogueEntry,
  Catalogue,
  CatalogueEntryPayload,
  CataloguePayloadManifest,
  CataloguePayloadManifestEntry,
  CatalogueSourceManifestEntry,
} from '../src/types/catalogue.js';
import {
  CATALOGUE_TIERS,
  type CatalogueMetadata,
  type CatalogueTier,
  type ValidationReport,
  validateCatalogueMetadata,
  validateOntologyForTier,
  validateRdfSource,
} from './catalogue-validation.js';

// Provide DOMParser for the RDF parser (browser API not available in Node)
const dom = new JSDOM('');
globalThis.DOMParser = dom.window.DOMParser;

const ROOT = join(import.meta.dirname, '..');
const CATALOGUE_DIR = join(ROOT, 'catalogue');
const OUTPUT_PATH = join(ROOT, 'public', 'catalogue.json');
const PAYLOAD_DIR = join(ROOT, 'public', 'catalogue-payloads');
const SOURCE_DIR = join(ROOT, 'public', 'catalogue-sources');
const PAYLOAD_MANIFEST_FILENAME = 'catalogue-payloads-manifest.json';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

interface CataloguePathIdentity {
  dev: number;
  ino: number;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
}

interface DiscoveredOntologyFiles {
  directoryIdentity: CataloguePathIdentity;
  fileIdentities: Map<string, CataloguePathIdentity>;
  rdfFiles: string[];
}

export interface DiscoveredCatalogueSource {
  tier: CatalogueTier;
  directory: string;
  entryId: string;
  metadataPath: string;
  rdfPath: string;
  readMetadata: () => Buffer;
  readRdf: () => Buffer;
}

export interface CatalogueSourceDiscovery {
  sources: DiscoveredCatalogueSource[];
  errors: string[];
  findSourceByRdfFile: (
    path: string,
  ) => DiscoveredCatalogueSource | undefined;
  matchesRdfFile: (path: string) => boolean;
}

export interface CatalogueCompilerDependencies {
  beforeFileOpen?: (path: string) => void;
}

interface CompiledAsset {
  relativePath: string;
  content: string | Buffer;
}

interface CompiledCatalogue {
  catalogue: Catalogue;
  payloads: CompiledAsset[];
  sources: CompiledAsset[];
}

// ------------------------------------------------------------------
// Discover ontology directories
// ------------------------------------------------------------------

// Validate that a directory name is a safe slug (no traversal, no special chars)
const SAFE_SLUG_RE = /^[a-z0-9][a-z0-9\-_]*[a-z0-9]$|^[a-z0-9]$/;

export class CatalogueDiscoveryError extends Error {
  constructor(path: string, reason: string) {
    super(`${path}: ${reason}`);
    this.name = 'CatalogueDiscoveryError';
  }
}

function assertDiscoveryDirectory(path: string): Stats {
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new CatalogueDiscoveryError(path, 'directory does not exist');
    }
    throw error;
  }

  if (stat.isSymbolicLink()) {
    throw new CatalogueDiscoveryError(
      path,
      'symlinks are not allowed in the catalogue',
    );
  }
  if (!stat.isDirectory()) {
    throw new CatalogueDiscoveryError(path, 'expected a directory');
  }
  return stat;
}

function toPathIdentity(stat: Stats): CataloguePathIdentity {
  return {
    dev: stat.dev,
    ino: stat.ino,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    ctimeMs: stat.ctimeMs,
  };
}

function hasPathIdentity(
  stat: Stats,
  expected: CataloguePathIdentity,
): boolean {
  return stat.dev === expected.dev
    && stat.ino === expected.ino
    && stat.size === expected.size
    && stat.mtimeMs === expected.mtimeMs
    && stat.ctimeMs === expected.ctimeMs;
}

function assertDirectoryIdentity(
  path: string,
  expected: CataloguePathIdentity,
): void {
  const stat = assertDiscoveryDirectory(path);
  if (!hasPathIdentity(stat, expected)) {
    throw new CatalogueDiscoveryError(
      path,
      'filesystem entry changed during catalogue compilation',
    );
  }
}

function assertFileIdentity(
  path: string,
  expected: CataloguePathIdentity,
): Stats {
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new CatalogueDiscoveryError(
        path,
        'filesystem entry changed during catalogue compilation',
      );
    }
    throw error;
  }

  if (stat.isSymbolicLink()) {
    throw new CatalogueDiscoveryError(
      path,
      'symlinks are not allowed in the catalogue',
    );
  }
  if (!stat.isFile()) {
    throw new CatalogueDiscoveryError(path, 'expected a regular file');
  }
  if (!hasPathIdentity(stat, expected)) {
    throw new CatalogueDiscoveryError(
      path,
      'filesystem entry changed during catalogue compilation',
    );
  }
  return stat;
}

function validateCatalogueRoot(path: string): void {
  assertDiscoveryDirectory(path);
  const discoveredTiers = new Set<string>();

  for (const entry of readdirSync(path)) {
    const full = join(path, entry);
    const stat = lstatSync(full);
    if (stat.isSymbolicLink()) {
      throw new CatalogueDiscoveryError(
        full,
        'symlinks are not allowed in the catalogue',
      );
    }
    if (stat.isFile()) continue;
    if (!stat.isDirectory()) {
      throw new CatalogueDiscoveryError(
        full,
        'unsupported filesystem entry; only directories and regular files are allowed',
      );
    }
    if (!(CATALOGUE_TIERS as readonly string[]).includes(entry)) {
      throw new CatalogueDiscoveryError(
        full,
        `unexpected catalogue root directory (expected only ${CATALOGUE_TIERS.join(', ')})`,
      );
    }
    discoveredTiers.add(entry);
  }

  for (const tier of CATALOGUE_TIERS) {
    if (!discoveredTiers.has(tier)) {
      throw new CatalogueDiscoveryError(
        join(path, tier),
        'required catalogue tier directory does not exist',
      );
    }
  }
}

export function discoverOntologyDirs(baseDir: string): string[] {
  const dirs: string[] = [];
  assertDiscoveryDirectory(baseDir);
  for (const entry of readdirSync(baseDir)) {
    const full = join(baseDir, entry);
    const stat = lstatSync(full);
    if (stat.isSymbolicLink()) {
      throw new CatalogueDiscoveryError(
        full,
        'symlinks are not allowed in the catalogue',
      );
    }
    if (stat.isFile()) continue;
    if (!stat.isDirectory()) {
      throw new CatalogueDiscoveryError(
        full,
        'unsupported filesystem entry; only directories and regular files are allowed',
      );
    }
    if (!SAFE_SLUG_RE.test(entry)) {
      throw new CatalogueDiscoveryError(
        full,
        'directory name contains unsafe characters (only lowercase alphanumeric, hyphens, underscores allowed)',
      );
    }
    dirs.push(full);
  }
  return dirs;
}

function discoverOntologyFiles(directory: string): DiscoveredOntologyFiles {
  const directoryIdentity = toPathIdentity(
    assertDiscoveryDirectory(directory),
  );
  const fileIdentities = new Map<string, CataloguePathIdentity>();
  const rdfFiles: string[] = [];

  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    const stat = lstatSync(full);
    if (stat.isSymbolicLink()) {
      throw new CatalogueDiscoveryError(
        full,
        'symlinks are not allowed in the catalogue',
      );
    }
    if (stat.isDirectory()) {
      throw new CatalogueDiscoveryError(
        full,
        'nested directories are not allowed inside an ontology entry',
      );
    }
    if (!stat.isFile()) {
      throw new CatalogueDiscoveryError(
        full,
        'unsupported filesystem entry; only regular files are allowed inside an ontology entry',
      );
    }
    fileIdentities.set(full, toPathIdentity(stat));
    if (entry.endsWith('.rdf') || entry.endsWith('.owl')) {
      rdfFiles.push(entry);
    }
  }

  return {
    directoryIdentity,
    fileIdentities,
    rdfFiles,
  };
}

function readRegularCatalogueFile(
  path: string,
  directory: string,
  expectedDirectory: CataloguePathIdentity,
  expectedFile: CataloguePathIdentity,
  dependencies: CatalogueCompilerDependencies,
): Buffer {
  dependencies.beforeFileOpen?.(path);
  assertDirectoryIdentity(directory, expectedDirectory);
  assertFileIdentity(path, expectedFile);

  let descriptor: number;
  try {
    descriptor = openSync(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
      throw new CatalogueDiscoveryError(
        path,
        'symlinks are not allowed in the catalogue',
      );
    }
    throw error;
  }

  try {
    const openedStat = fstatSync(descriptor);
    if (!openedStat.isFile() || !hasPathIdentity(openedStat, expectedFile)) {
      throw new CatalogueDiscoveryError(
        path,
        'filesystem entry changed during catalogue compilation',
      );
    }
    assertFileIdentity(path, expectedFile);
    assertDirectoryIdentity(directory, expectedDirectory);
    const content = readFileSync(descriptor);
    if (!hasPathIdentity(fstatSync(descriptor), expectedFile)) {
      throw new CatalogueDiscoveryError(
        path,
        'filesystem entry changed during catalogue compilation',
      );
    }
    return content;
  } finally {
    closeSync(descriptor);
  }
}

export function discoverCatalogueSources(
  catalogueDir: string = CATALOGUE_DIR,
  dependencies: CatalogueCompilerDependencies = {},
): CatalogueSourceDiscovery {
  const sources: DiscoveredCatalogueSource[] = [];
  const errors: string[] = [];
  const seenIds = new Set<string>();
  const rdfFileIdentities: CataloguePathIdentity[] = [];
  const sourceIdentities: {
    identity: CataloguePathIdentity;
    source: DiscoveredCatalogueSource;
  }[] = [];

  validateCatalogueRoot(catalogueDir);

  for (const tier of CATALOGUE_TIERS) {
    const tierDir = join(catalogueDir, tier);
    const ontologyDirs: string[] = [];

    if (tier === 'official') {
      ontologyDirs.push(...discoverOntologyDirs(tierDir));
    } else {
      for (const ownerDir of discoverOntologyDirs(tierDir)) {
        ontologyDirs.push(...discoverOntologyDirs(ownerDir));
      }
    }

    for (const directory of ontologyDirs) {
      const discoveredFiles = discoverOntologyFiles(directory);
      for (const rdfFile of discoveredFiles.rdfFiles) {
        const rdfIdentity = discoveredFiles.fileIdentities.get(
          join(directory, rdfFile),
        );
        if (rdfIdentity) {
          rdfFileIdentities.push(rdfIdentity);
        }
      }
      if (discoveredFiles.rdfFiles.length !== 1) {
        errors.push(
          `${directory}: expected exactly one .rdf or .owl file, found ${discoveredFiles.rdfFiles.length}`,
        );
        continue;
      }

      const metadataPath = join(directory, 'metadata.json');
      const metadataIdentity = discoveredFiles.fileIdentities.get(metadataPath);
      if (!metadataIdentity) {
        errors.push(`${directory}: missing metadata.json`);
        continue;
      }

      const rdfPath = join(directory, discoveredFiles.rdfFiles[0]);
      const rdfIdentity = discoveredFiles.fileIdentities.get(rdfPath);
      if (!rdfIdentity) {
        throw new CatalogueDiscoveryError(
          rdfPath,
          'filesystem entry changed during catalogue compilation',
        );
      }

      const relativePath = directory
        .slice(tierDir.length + 1)
        .replace(/\\/g, '/');
      const entryId = `${tier}/${relativePath}`;
      if (seenIds.has(entryId)) {
        errors.push(
          `${directory}: duplicate catalogue path "${entryId}"`,
        );
        continue;
      }
      seenIds.add(entryId);

      const source: DiscoveredCatalogueSource = {
        tier,
        directory,
        entryId,
        metadataPath,
        rdfPath,
        readMetadata: () => readRegularCatalogueFile(
          metadataPath,
          directory,
          discoveredFiles.directoryIdentity,
          metadataIdentity,
          dependencies,
        ),
        readRdf: () => readRegularCatalogueFile(
          rdfPath,
          directory,
          discoveredFiles.directoryIdentity,
          rdfIdentity,
          dependencies,
        ),
      };
      sources.push(source);
      sourceIdentities.push({ identity: rdfIdentity, source });
    }
  }

  const identityForPath = (
    path: string,
  ): CataloguePathIdentity | undefined => {
    try {
      const stat = statSync(path);
      return stat.isFile() ? toPathIdentity(stat) : undefined;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  };
  const hasSamePhysicalIdentity = (
    actual: CataloguePathIdentity | undefined,
    expected: CataloguePathIdentity,
  ): boolean => Boolean(
    actual
    && actual.ino !== 0
    && expected.ino !== 0
    && actual.dev === expected.dev
    && actual.ino === expected.ino,
  );

  return {
    sources,
    errors,
    findSourceByRdfFile: (path) => {
      const actual = identityForPath(path);
      return sourceIdentities.find(({ identity }) =>
        hasSamePhysicalIdentity(actual, identity))?.source;
    },
    matchesRdfFile: (path) => {
      const actual = identityForPath(path);
      return rdfFileIdentities.some((identity) =>
        hasSamePhysicalIdentity(actual, identity));
    },
  };
}

function decodeUtf8(bytes: Uint8Array, path: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${path}: file must be valid UTF-8`);
  }
}

function printValidationReport(
  path: string,
  report: ValidationReport,
): number {
  for (const warning of report.warnings) {
    console.warn(`⚠ ${path}: ${warning.message}`);
  }
  for (const error of report.errors) {
    console.error(`✘ ${path}: ${error.message}`);
  }
  return report.errors.length;
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------

function compileCatalogueArtifacts(
  catalogueDir: string = CATALOGUE_DIR,
  dependencies: CatalogueCompilerDependencies = {},
): CompiledCatalogue {
  const entries: CatalogueEntry[] = [];
  const payloads: CompiledAsset[] = [];
  const sources: CompiledAsset[] = [];
  let errors = 0;

  const discovery = discoverCatalogueSources(catalogueDir, dependencies);
  for (const discoveryError of discovery.errors) {
    console.error(`✘ ${discoveryError}`);
    errors++;
  }

  for (const source of discovery.sources) {
    let metadata: CatalogueMetadata;
    let ontology: Ontology;
    let bindings: DataBinding[];
    let rdfBytes: Buffer;

    try {
      const rawMetadata = JSON.parse(decodeUtf8(
        source.readMetadata(),
        source.metadataPath,
      )) as unknown;
      const metadataReport = validateCatalogueMetadata(
        rawMetadata,
        source.tier,
      );
      errors += printValidationReport(
        source.metadataPath,
        metadataReport,
      );
      if (metadataReport.errors.length > 0) {
        continue;
      }
      metadata = rawMetadata as CatalogueMetadata;

      rdfBytes = source.readRdf();
      const sourceReport = validateRdfSource(rdfBytes);
      errors += printValidationReport(source.rdfPath, sourceReport);
      if (sourceReport.errors.length > 0 || sourceReport.text === undefined) {
        continue;
      }

      const parsed = parseRDF(sourceReport.text);
      ontology = parsed.ontology;
      bindings = parsed.bindings;

      const ontologyReport = validateOntologyForTier(
        ontology,
        source.tier,
      );
      errors += printValidationReport(source.rdfPath, ontologyReport);
      if (ontologyReport.errors.length > 0) {
        continue;
      }
    } catch (error) {
      if (error instanceof CatalogueDiscoveryError) throw error;
      console.error(`✘ ${source.directory}: ${(error as Error).message}`);
      errors++;
      continue;
    }

    try {
      const reserialized = serializeToRDF(ontology, bindings);
      parseRDF(reserialized);
    } catch (error) {
      console.error(
        `✘ ${source.rdfPath}: round-trip verification failed — ${(error as Error).message}`,
      );
      errors++;
      continue;
    }

    const payload: CatalogueEntryPayload = {
      schemaVersion: 1,
      id: source.entryId,
      ontology,
      bindings,
    };
    const payloadContent = JSON.stringify(payload, null, 2) + '\n';
    const payloadHash = createHash('sha256')
      .update(payloadContent)
      .digest('hex');
    const relativePayloadPath = `${source.entryId}/${payloadHash}.json`;
    const sourceArtifactHash = createHash('sha256')
      .update(rdfBytes)
      .digest('hex');
    const relativeSourcePath =
      `${source.entryId}/${sourceArtifactHash}.rdf`;

    entries.push({
      id: source.entryId,
      name: metadata.name,
      description: metadata.description,
      icon: metadata.icon,
      category: metadata.category,
      tags: metadata.tags ?? [],
      author: metadata.author ?? 'unknown',
      source: source.tier,
      entityCount: ontology.entityTypes.length,
      relationshipCount: ontology.relationships.length,
      payloadUrl: `catalogue-payloads/${relativePayloadPath}`,
      payloadHash: `sha256:${payloadHash}`,
      sourceArtifactUrl: `catalogue-sources/${relativeSourcePath}`,
      sourceArtifactHash: `sha256:${sourceArtifactHash}`,
      sourceArtifactByteLength: rdfBytes.byteLength,
      sourceArtifactMediaType: 'application/rdf+xml',
      license: metadata.license,
      sourceUrl: metadata.sourceUrl,
      version: metadata.version,
    });
    payloads.push({
      relativePath: relativePayloadPath,
      content: payloadContent,
    });
    sources.push({
      relativePath: relativeSourcePath,
      content: rdfBytes,
    });

    console.log(`✔ ${source.entryId}`);
  }

  if (errors > 0) {
    throw new Error(`Catalogue compilation failed with ${errors} error(s)`);
  }

  return {
    catalogue: {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      count: entries.length,
      entries,
    },
    payloads,
    sources,
  };
}

export function compileCatalogue(
  catalogueDir: string = CATALOGUE_DIR,
  dependencies: CatalogueCompilerDependencies = {},
): Catalogue {
  return compileCatalogueArtifacts(catalogueDir, dependencies).catalogue;
}

function collectPublishedAssets(
  assetDirectory: string,
  extension: 'json' | 'rdf',
  assetLabel: 'payload' | 'source',
  directory: string = assetDirectory,
  prefix = '',
): Array<{ relativePath: string; hash: string }> {
  const assets: Array<{ relativePath: string; hash: string }> = [];
  const entries = readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(entry.name)) {
        throw new Error(
          `Unsafe catalogue ${assetLabel} directory: ${relativePath}`,
        );
      }
      assets.push(...collectPublishedAssets(
        assetDirectory,
        extension,
        assetLabel,
        entryPath,
        relativePath,
      ));
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(
        `Unsupported catalogue ${assetLabel} path: ${relativePath}`,
      );
    }

    const match = relativePath.match(new RegExp(
      `^(?:[a-z0-9][a-z0-9_-]*/)+([a-f0-9]{64})\\.${extension}$`,
    ));
    if (!match) {
      throw new Error(
        `Invalid catalogue ${assetLabel} path: ${relativePath}`,
      );
    }
    const content = readFileSync(entryPath);
    const actualHash = createHash('sha256').update(content).digest('hex');
    if (actualHash !== match[1]) {
      throw new Error(
        `Catalogue ${assetLabel} hash does not match its path: ${relativePath}`,
      );
    }
    assets.push({
      relativePath,
      hash: actualHash,
    });
  }

  return assets;
}

function collectPublishedPayloads(
  payloadDirectory: string,
): CataloguePayloadManifestEntry[] {
  return collectPublishedAssets(
    payloadDirectory,
    'json',
    'payload',
  ).map(({ relativePath, hash }) => ({
    payloadUrl: `catalogue-payloads/${relativePath}`,
    payloadHash: `sha256:${hash}`,
  }));
}

function collectPublishedSources(
  sourceDirectory: string,
): CatalogueSourceManifestEntry[] {
  return collectPublishedAssets(
    sourceDirectory,
    'rdf',
    'source',
  ).map(({ relativePath, hash }) => ({
    sourceArtifactUrl: `catalogue-sources/${relativePath}`,
    sourceArtifactHash: `sha256:${hash}`,
  }));
}

function writeCompiledAssets(
  outputDirectory: string,
  assets: CompiledAsset[],
  temporaryPaths: string[],
): void {
  mkdirSync(outputDirectory, { recursive: true });
  for (const asset of assets) {
    const outputPath = join(outputDirectory, asset.relativePath);
    mkdirSync(dirname(outputPath), { recursive: true });
    const expectedContent = typeof asset.content === 'string'
      ? Buffer.from(asset.content, 'utf-8')
      : asset.content;
    if (
      existsSync(outputPath)
      && readFileSync(outputPath).equals(expectedContent)
    ) {
      continue;
    }

    const temporaryPath = `${outputPath}.tmp-${process.pid}`;
    temporaryPaths.push(temporaryPath);
    writeFileSync(temporaryPath, expectedContent);
    renameSync(temporaryPath, outputPath);
  }
}

export function runCatalogueCompiler(
  catalogueDir: string = CATALOGUE_DIR,
  outputPath: string = OUTPUT_PATH,
  dependencies: CatalogueCompilerDependencies = {},
): Catalogue {
  const { catalogue, payloads, sources } = compileCatalogueArtifacts(
    catalogueDir,
    dependencies,
  );
  const payloadDirectory = outputPath === OUTPUT_PATH
    ? PAYLOAD_DIR
    : join(dirname(outputPath), 'catalogue-payloads');
  const sourceDirectory = outputPath === OUTPUT_PATH
    ? SOURCE_DIR
    : join(dirname(outputPath), 'catalogue-sources');
  const manifestPath = join(dirname(outputPath), PAYLOAD_MANIFEST_FILENAME);
  const indexTemporaryPath = `${outputPath}.tmp-${process.pid}`;
  const manifestTemporaryPath = `${manifestPath}.tmp-${process.pid}`;
  const temporaryAssetPaths: string[] = [];

  try {
    writeCompiledAssets(
      payloadDirectory,
      payloads,
      temporaryAssetPaths,
    );
    writeCompiledAssets(
      sourceDirectory,
      sources,
      temporaryAssetPaths,
    );

    const manifest: CataloguePayloadManifest = {
      schemaVersion: 1,
      payloads: collectPublishedPayloads(payloadDirectory),
      sources: collectPublishedSources(sourceDirectory),
    };
    rmSync(manifestTemporaryPath, { force: true });
    writeFileSync(
      manifestTemporaryPath,
      JSON.stringify(manifest, null, 2) + '\n',
      'utf-8',
    );
    renameSync(manifestTemporaryPath, manifestPath);

    rmSync(indexTemporaryPath, { force: true });
    writeFileSync(
      indexTemporaryPath,
      JSON.stringify(catalogue, null, 2) + '\n',
      'utf-8',
    );
    renameSync(indexTemporaryPath, outputPath);
  } catch (error) {
    rmSync(indexTemporaryPath, { force: true });
    rmSync(manifestTemporaryPath, { force: true });
    for (const temporaryPath of temporaryAssetPaths) {
      rmSync(temporaryPath, { force: true });
    }
    throw error;
  }

  console.log(
    `\n✔ Wrote ${catalogue.count} index entries, ${payloads.length} payloads, and ${sources.length} source artifacts`,
  );
  return catalogue;
}

// ------------------------------------------------------------------
// Run
// ------------------------------------------------------------------

const isMainModule =
  process.argv[1] !== undefined
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMainModule) {
  try {
    runCatalogueCompiler();
  } catch (e) {
    console.error(`\n${(e as Error).message}`);
    process.exitCode = 1;
  }
}
