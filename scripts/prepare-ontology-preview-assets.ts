import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isValidCatalogueId } from '../src/lib/catalogueId.js';

export interface PreviewRecord {
  id: string;
  file: string;
  bytes: number;
}

export interface RenderedManifest {
  prNumber: number;
  headSha: string;
  repository: string;
  previews: PreviewRecord[];
}

export interface TrustedPreviewRun {
  prNumber: number;
  headSha: string;
  repository: string;
}

export interface PreparePreviewOptions {
  manifest: string;
  artifactDir: string;
  publishDir: string;
  comment: string;
  branch: string;
  githubOutput?: string;
  expectedRun: TrustedPreviewRun;
}

const SAFE_FILE_RE = /^[a-z0-9._-]+\.png$/;
const SHA_RE = /^[a-f0-9]{40}$/i;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function parseArgs(argv: string[]): PreparePreviewOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value) {
      throw new Error(`Invalid argument near "${key ?? ''}"`);
    }
    values.set(key.slice(2), value);
  }

  const expectedPrNumberRaw = values.get('expected-pr-number') ?? process.env.EXPECTED_PR_NUMBER;
  const expectedHeadSha = values.get('expected-head-sha') ?? process.env.EXPECTED_HEAD_SHA;
  const expectedRepository = values.get('expected-repository') ?? process.env.EXPECTED_REPOSITORY;
  if (!expectedPrNumberRaw || !expectedHeadSha || !expectedRepository) {
    throw new Error('Trusted preview run metadata is required');
  }

  const expectedPrNumber = Number(expectedPrNumberRaw);
  if (!Number.isInteger(expectedPrNumber) || expectedPrNumber <= 0) {
    throw new Error('Trusted preview run has an invalid PR number');
  }

  return {
    manifest: values.get('manifest') ?? 'ontology-preview/manifest.json',
    artifactDir: values.get('artifact-dir') ?? 'ontology-preview',
    publishDir: values.get('publish-dir') ?? 'ontology-preview-publish',
    comment: values.get('comment') ?? 'ontology-preview-comment.md',
    branch: values.get('branch') ?? 'ontology-preview-assets',
    githubOutput: values.get('github-output') ?? process.env.GITHUB_OUTPUT,
    expectedRun: {
      prNumber: expectedPrNumber,
      headSha: expectedHeadSha,
      repository: expectedRepository,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function validateManifest(
  manifest: unknown,
  expectedRun: TrustedPreviewRun,
): asserts manifest is RenderedManifest {
  if (!Number.isInteger(expectedRun.prNumber) || expectedRun.prNumber <= 0) {
    throw new Error('Trusted preview run has an invalid PR number');
  }
  if (!SHA_RE.test(expectedRun.headSha)) {
    throw new Error('Trusted preview run has an invalid head SHA');
  }
  if (!REPOSITORY_RE.test(expectedRun.repository)) {
    throw new Error('Trusted preview run has an invalid repository');
  }
  if (!isRecord(manifest)) {
    throw new Error('Preview manifest is not an object');
  }
  if (typeof manifest.prNumber !== 'number'
    || !Number.isInteger(manifest.prNumber)
    || manifest.prNumber <= 0) {
    throw new Error('Preview manifest has an invalid PR number');
  }
  if (typeof manifest.headSha !== 'string' || !SHA_RE.test(manifest.headSha)) {
    throw new Error('Preview manifest has an invalid head SHA');
  }
  if (typeof manifest.repository !== 'string' || !REPOSITORY_RE.test(manifest.repository)) {
    throw new Error('Preview manifest has an invalid repository');
  }
  if (!Array.isArray(manifest.previews)) {
    throw new Error('Preview manifest is missing previews');
  }

  if (manifest.prNumber !== expectedRun.prNumber) {
    throw new Error('Preview manifest PR number does not match the trusted workflow run');
  }
  if (manifest.headSha.toLowerCase() !== expectedRun.headSha.toLowerCase()) {
    throw new Error('Preview manifest head SHA does not match the trusted workflow run');
  }
  if (manifest.repository !== expectedRun.repository) {
    throw new Error('Preview manifest repository does not match the trusted workflow run');
  }

  const seenIds = new Set<string>();
  const seenFiles = new Set<string>();
  for (const preview of manifest.previews) {
    if (!isRecord(preview)
      || typeof preview.id !== 'string'
      || !isValidCatalogueId(preview.id)) {
      throw new Error('Preview manifest contains an invalid catalogue ID');
    }
    if (typeof preview.file !== 'string'
      || !SAFE_FILE_RE.test(preview.file)
      || basename(preview.file) !== preview.file) {
      throw new Error(`Unsafe preview filename: ${String(preview.file)}`);
    }
    if (preview.file !== `${preview.id.replaceAll('/', '-')}.png`) {
      throw new Error(`Preview filename does not match catalogue ID: ${preview.id}`);
    }
    if (typeof preview.bytes !== 'number'
      || !Number.isInteger(preview.bytes)
      || preview.bytes < 1024) {
      throw new Error(`Preview has an invalid byte count: ${preview.id}`);
    }
    if (seenIds.has(preview.id) || seenFiles.has(preview.file)) {
      throw new Error(`Preview manifest contains a duplicate record: ${preview.id}`);
    }
    seenIds.add(preview.id);
    seenFiles.add(preview.file);
  }
}

export function preparePreviewAssets(options: PreparePreviewOptions) {
  const manifest: unknown = JSON.parse(readFileSync(options.manifest, 'utf-8'));
  validateManifest(manifest, options.expectedRun);

  const targetPath = `pr-${manifest.prNumber}/${manifest.headSha}`;
  const targetDir = join(options.publishDir, targetPath);
  mkdirSync(targetDir, { recursive: true });

  const imageLines: string[] = [];
  for (const preview of manifest.previews) {
    if (!SAFE_FILE_RE.test(preview.file) || basename(preview.file) !== preview.file) {
      throw new Error(`Unsafe preview filename: ${preview.file}`);
    }
    const source = join(options.artifactDir, preview.file);
    if (!existsSync(source)) {
      throw new Error(`Missing preview image: ${source}`);
    }
    const image = readFileSync(source);
    if (!image.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
      throw new Error(`Preview is not a PNG image: ${preview.file}`);
    }
    if (statSync(source).size !== preview.bytes) {
      throw new Error(`Preview byte count does not match image: ${preview.file}`);
    }
    copyFileSync(source, join(targetDir, preview.file));

    const imageUrl = `https://raw.githubusercontent.com/${manifest.repository}/${options.branch}/${targetPath}/${preview.file}`;
    imageLines.push(`### ${preview.id}\n\n![${preview.id}](${imageUrl})`);
  }

  const sanitizedManifest: RenderedManifest = {
    prNumber: manifest.prNumber,
    headSha: manifest.headSha,
    repository: manifest.repository,
    previews: manifest.previews,
  };
  writeFileSync(
    join(targetDir, 'manifest.json'),
    `${JSON.stringify(sanitizedManifest, null, 2)}\n`,
    'utf-8',
  );

  const body = [
    '<!-- ontology-preview-render -->',
    '## Ontology Preview',
    '',
    manifest.previews.length === 0
      ? 'No changed catalogue ontology entries were detected in this PR.'
      : imageLines.join('\n\n'),
    '',
    `Rendered from commit \`${manifest.headSha.slice(0, 7)}\`.`,
  ].join('\n');

  writeFileSync(options.comment, `${body}\n`, 'utf-8');

  if (options.githubOutput) {
    writeFileSync(options.githubOutput, `pr_number=${manifest.prNumber}\nasset_path=${targetPath}\n`, { flag: 'a' });
  }
}

function main() {
  preparePreviewAssets(parseArgs(process.argv.slice(2)));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}