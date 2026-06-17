import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

interface PreviewRecord {
  id: string;
  file: string;
  bytes: number;
}

interface RenderedManifest {
  prNumber: number;
  headSha: string;
  repository: string;
  previews: PreviewRecord[];
}

interface CliOptions {
  manifest: string;
  artifactDir: string;
  publishDir: string;
  comment: string;
  branch: string;
  githubOutput?: string;
}

const SAFE_FILE_RE = /^[a-z0-9._-]+\.png$/;
const SHA_RE = /^[a-f0-9]{40}$/i;

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

  return {
    manifest: values.get('manifest') ?? 'ontology-preview/manifest.json',
    artifactDir: values.get('artifact-dir') ?? 'ontology-preview',
    publishDir: values.get('publish-dir') ?? 'ontology-preview-publish',
    comment: values.get('comment') ?? 'ontology-preview-comment.md',
    branch: values.get('branch') ?? 'ontology-preview-assets',
    githubOutput: values.get('github-output') ?? process.env.GITHUB_OUTPUT,
  };
}

function validateManifest(manifest: RenderedManifest) {
  if (!Number.isInteger(manifest.prNumber) || manifest.prNumber <= 0) {
    throw new Error('Preview manifest has an invalid PR number');
  }
  if (!SHA_RE.test(manifest.headSha)) {
    throw new Error('Preview manifest has an invalid head SHA');
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(manifest.repository)) {
    throw new Error('Preview manifest has an invalid repository');
  }
  if (!Array.isArray(manifest.previews)) {
    throw new Error('Preview manifest is missing previews');
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(options.manifest, 'utf-8')) as RenderedManifest;
  validateManifest(manifest);

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
    copyFileSync(source, join(targetDir, preview.file));

    const imageUrl = `https://raw.githubusercontent.com/${manifest.repository}/${options.branch}/${targetPath}/${preview.file}`;
    imageLines.push(`### ${preview.id}\n\n![${preview.id}](${imageUrl})`);
  }

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

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}