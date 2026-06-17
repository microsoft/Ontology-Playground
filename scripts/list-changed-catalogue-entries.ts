import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface OntologyPreviewEntry {
  id: string;
  safeName: string;
  changedFiles: string[];
}

export interface OntologyPreviewManifest {
  prNumber: number;
  headSha: string;
  baseSha: string;
  repository: string;
  entries: OntologyPreviewEntry[];
}

interface CliOptions {
  base: string;
  head: string;
  output: string;
  prNumber: number;
  repository: string;
}

const CATALOGUE_FILE_RE = /^catalogue\/(official|community|external)\/(.+)\/(metadata\.json|[^/]+\.(rdf|owl))$/;

function safeFileName(id: string): string {
  return id.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

export function catalogueIdFromPath(filePath: string): string | undefined {
  const normalized = filePath.replace(/\\/g, '/');
  const match = normalized.match(CATALOGUE_FILE_RE);
  if (!match) return undefined;

  const source = match[1];
  const rest = match[2].split('/').filter(Boolean);
  if (source === 'official') {
    if (rest.length !== 1) return undefined;
    return `${source}/${rest[0]}`;
  }

  if (rest.length !== 2) return undefined;
  return `${source}/${rest[0]}/${rest[1]}`;
}

export function entriesFromNameStatus(diffOutput: string): OntologyPreviewEntry[] {
  const byId = new Map<string, Set<string>>();

  for (const line of diffOutput.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const status = parts[0];
    if (!status || status.startsWith('D')) continue;

    const filePath = status.startsWith('R') || status.startsWith('C') ? parts[2] : parts[1];
    if (!filePath) continue;

    const id = catalogueIdFromPath(filePath);
    if (!id) continue;

    const files = byId.get(id) ?? new Set<string>();
    files.add(filePath);
    byId.set(id, files);
  }

  return [...byId.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, changedFiles]) => ({
      id,
      safeName: safeFileName(id),
      changedFiles: [...changedFiles].sort(),
    }));
}

function changedCataloguePreviewPaths(diffOutput: string): string[] {
  const paths: string[] = [];

  for (const line of diffOutput.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const status = parts[0];
    if (!status || status.startsWith('D')) continue;

    const filePath = status.startsWith('R') || status.startsWith('C') ? parts[2] : parts[1];
    if (!filePath) continue;
    if (/^catalogue\/.+\/(metadata\.json|[^/]+\.(rdf|owl))$/.test(filePath.replace(/\\/g, '/'))) {
      paths.push(filePath);
    }
  }

  return paths;
}

function parseArgs(argv: string[]): CliOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value) {
      throw new Error(`Invalid argument near "${key ?? ''}"`);
    }
    values.set(key.slice(2), value);
  }

  const base = values.get('base') ?? process.env.PR_BASE_SHA;
  const head = values.get('head') ?? process.env.PR_HEAD_SHA ?? process.env.GITHUB_SHA;
  const output = values.get('output') ?? 'ontology-preview/manifest.json';
  const prNumberRaw = values.get('pr-number') ?? process.env.PR_NUMBER;
  const repository = values.get('repository') ?? process.env.GITHUB_REPOSITORY;

  if (!base) throw new Error('Missing --base or PR_BASE_SHA');
  if (!head) throw new Error('Missing --head, PR_HEAD_SHA, or GITHUB_SHA');
  if (!prNumberRaw) throw new Error('Missing --pr-number or PR_NUMBER');
  if (!repository) throw new Error('Missing --repository or GITHUB_REPOSITORY');

  const prNumber = Number(prNumberRaw);
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new Error(`Invalid PR number: ${prNumberRaw}`);
  }

  return { base, head, output, prNumber, repository };
}

export function buildManifest(options: CliOptions): OntologyPreviewManifest {
  const diffOutput = execFileSync('git', ['diff', '--name-status', '-M', options.base, options.head, '--', 'catalogue'], {
    encoding: 'utf-8',
  });

  const entries = entriesFromNameStatus(diffOutput);
  const mappedFiles = new Set(entries.flatMap((entry) => entry.changedFiles));
  const invalidFiles = changedCataloguePreviewPaths(diffOutput).filter((filePath) => !mappedFiles.has(filePath));
  if (invalidFiles.length > 0) {
    throw new Error([
      'Changed catalogue files must live in compiler-compatible ontology directories:',
      '  official/<slug>/(metadata.json|*.rdf|*.owl)',
      '  community/<github-user>/<slug>/(metadata.json|*.rdf|*.owl)',
      '  external/<source>/<slug>/(metadata.json|*.rdf|*.owl)',
      ...invalidFiles.map((filePath) => `Invalid path: ${filePath}`),
    ].join('\n'));
  }

  return {
    prNumber: options.prNumber,
    headSha: options.head,
    baseSha: options.base,
    repository: options.repository,
    entries,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = buildManifest(options);
  mkdirSync(dirname(options.output), { recursive: true });
  writeFileSync(options.output, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

  console.log(`Found ${manifest.entries.length} changed catalogue entr${manifest.entries.length === 1 ? 'y' : 'ies'}.`);
  for (const entry of manifest.entries) {
    console.log(`- ${entry.id}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}