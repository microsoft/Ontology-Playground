import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  CataloguePayloadManifest,
  CataloguePayloadManifestEntry,
  CatalogueSourceManifestEntry,
} from '../src/types/catalogue.js';

const ROOT = join(import.meta.dirname, '..');
const DEFAULT_OUTPUT_DIRECTORY = join(ROOT, 'public');
const MANIFEST_FILENAME = 'catalogue-payloads-manifest.json';
const MAX_MANIFEST_ENTRIES = 10_000;
const MAX_PAYLOAD_BYTES = 20 * 1024 * 1024;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const DOWNLOAD_CONCURRENCY = 8;
const PAYLOAD_PATH_PATTERN =
  /^catalogue-payloads\/(?:[a-z0-9][a-z0-9_-]*\/)+([a-f0-9]{64})\.json$/;
const SOURCE_PATH_PATTERN =
  /^catalogue-sources\/(?:[a-z0-9][a-z0-9_-]*\/)+([a-f0-9]{64})\.rdf$/;

type FetchImplementation = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJsonResponse(
  response: Response,
  description: string,
): Promise<unknown> {
  let content: string;
  try {
    content = await response.text();
  } catch (error) {
    throw new Error(
      `Could not read ${description}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new Error(`${description} is not valid JSON`);
  }
}

function parseManifest(value: unknown): CataloguePayloadManifest {
  if (
    !isRecord(value)
    || value.schemaVersion !== 1
    || !Array.isArray(value.payloads)
    || value.payloads.length > MAX_MANIFEST_ENTRIES
  ) {
    throw new Error('Published catalogue payload manifest is malformed');
  }

  const seenUrls = new Set<string>();
  const payloads = value.payloads.map((candidate) => {
    if (
      !isRecord(candidate)
      || typeof candidate.payloadUrl !== 'string'
      || typeof candidate.payloadHash !== 'string'
    ) {
      throw new Error('Published catalogue payload manifest is malformed');
    }
    const match = candidate.payloadUrl.match(PAYLOAD_PATH_PATTERN);
    if (
      !match
      || candidate.payloadHash !== `sha256:${match[1]}`
      || seenUrls.has(candidate.payloadUrl)
    ) {
      throw new Error(
        `Invalid published catalogue payload: ${candidate.payloadUrl}`,
      );
    }
    seenUrls.add(candidate.payloadUrl);
    return {
      payloadUrl: candidate.payloadUrl,
      payloadHash: candidate.payloadHash,
    };
  });

  const rawSources = value.sources ?? [];
  if (
    !Array.isArray(rawSources)
    || rawSources.length > MAX_MANIFEST_ENTRIES
  ) {
    throw new Error('Published catalogue payload manifest is malformed');
  }
  const seenSourceUrls = new Set<string>();
  const sources = rawSources.map((candidate) => {
    if (
      !isRecord(candidate)
      || typeof candidate.sourceArtifactUrl !== 'string'
      || typeof candidate.sourceArtifactHash !== 'string'
    ) {
      throw new Error('Published catalogue payload manifest is malformed');
    }
    const match = candidate.sourceArtifactUrl.match(SOURCE_PATH_PATTERN);
    if (
      !match
      || candidate.sourceArtifactHash !== `sha256:${match[1]}`
      || seenSourceUrls.has(candidate.sourceArtifactUrl)
    ) {
      throw new Error(
        `Invalid published catalogue source: ${candidate.sourceArtifactUrl}`,
      );
    }
    seenSourceUrls.add(candidate.sourceArtifactUrl);
    return {
      sourceArtifactUrl: candidate.sourceArtifactUrl,
      sourceArtifactHash: candidate.sourceArtifactHash,
    };
  });

  return { schemaVersion: 1, payloads, sources };
}

function validateCurrentIndex(
  value: Record<string, unknown>,
  manifest: CataloguePayloadManifest,
): void {
  if (!Array.isArray(value.entries)) {
    throw new Error('Published schema-v2 catalogue index is malformed');
  }
  const manifestHashes = new Map(
    manifest.payloads.map((entry) => [entry.payloadUrl, entry.payloadHash]),
  );
  const sourceHashes = new Map(
    manifest.sources.map((entry) => [
      entry.sourceArtifactUrl,
      entry.sourceArtifactHash,
    ]),
  );

  for (const candidate of value.entries) {
    if (
      !isRecord(candidate)
      || typeof candidate.payloadUrl !== 'string'
      || typeof candidate.payloadHash !== 'string'
      || manifestHashes.get(candidate.payloadUrl) !== candidate.payloadHash
    ) {
      throw new Error(
        'Published payload manifest does not cover the current catalogue index',
      );
    }
    const hasSourceArtifact = [
      'sourceArtifactUrl',
      'sourceArtifactHash',
      'sourceArtifactByteLength',
      'sourceArtifactMediaType',
    ].some((field) => candidate[field] !== undefined);
    if (
      hasSourceArtifact
      && (
        typeof candidate.sourceArtifactUrl !== 'string'
        || typeof candidate.sourceArtifactHash !== 'string'
        || !Number.isInteger(candidate.sourceArtifactByteLength)
        || candidate.sourceArtifactMediaType !== 'application/rdf+xml'
        || sourceHashes.get(candidate.sourceArtifactUrl)
          !== candidate.sourceArtifactHash
      )
    ) {
      throw new Error(
        'Published source manifest does not cover the current catalogue index',
      );
    }
  }
}

function payloadOutputPath(
  outputDirectory: string,
  payloadUrl: string,
): string {
  const payloadRoot = resolve(outputDirectory, 'catalogue-payloads');
  const relativePath = payloadUrl.slice('catalogue-payloads/'.length);
  const outputPath = resolve(payloadRoot, relativePath);
  if (!outputPath.startsWith(`${payloadRoot}${sep}`)) {
    throw new Error(`Unsafe published catalogue payload: ${payloadUrl}`);
  }
  return outputPath;
}

function sourceOutputPath(
  outputDirectory: string,
  sourceArtifactUrl: string,
): string {
  const sourceRoot = resolve(outputDirectory, 'catalogue-sources');
  const relativePath = sourceArtifactUrl.slice('catalogue-sources/'.length);
  const outputPath = resolve(sourceRoot, relativePath);
  if (!outputPath.startsWith(`${sourceRoot}${sep}`)) {
    throw new Error(
      `Unsafe published catalogue source: ${sourceArtifactUrl}`,
    );
  }
  return outputPath;
}

function hasExpectedContent(path: string, expectedHash: string): boolean {
  if (!existsSync(path)) return false;
  const stats = lstatSync(path);
  if (!stats.isFile()) {
    throw new Error(`Catalogue payload output is not a file: ${path}`);
  }
  const actualHash = createHash('sha256')
    .update(readFileSync(path))
    .digest('hex');
  return expectedHash === `sha256:${actualHash}`;
}

function pruneUnpublishedAssets(
  outputDirectory: string,
  directoryName: 'catalogue-payloads' | 'catalogue-sources',
  publishedUrls: Set<string>,
): void {
  const assetRoot = resolve(outputDirectory, directoryName);
  if (!existsSync(assetRoot)) return;
  const rootStat = lstatSync(assetRoot);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error(
      `Cached catalogue artifact root must be a directory: ${assetRoot}`,
    );
  }

  const visit = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relativePath = prefix
        ? `${prefix}/${entry.name}`
        : entry.name;
      const entryPath = resolve(directory, entry.name);
      if (!entryPath.startsWith(`${assetRoot}${sep}`)) {
        throw new Error(
          `Unsafe cached catalogue artifact: ${relativePath}`,
        );
      }
      if (entry.isSymbolicLink()) {
        throw new Error(
          `Cached catalogue artifacts cannot contain symlinks: ${relativePath}`,
        );
      }
      if (entry.isDirectory()) {
        visit(entryPath, relativePath);
        if (readdirSync(entryPath).length === 0) {
          rmdirSync(entryPath);
        }
        continue;
      }
      if (!entry.isFile()) {
        throw new Error(
          `Unsupported cached catalogue artifact: ${relativePath}`,
        );
      }

      const publishedUrl = `${directoryName}/${relativePath}`;
      if (!publishedUrls.has(publishedUrl)) {
        rmSync(entryPath);
      }
    }
  };

  visit(assetRoot, '');
  if (readdirSync(assetRoot).length === 0) {
    rmdirSync(assetRoot);
  }
}

function clearUnpublishedCatalogueCache(
  outputDirectory: string,
): void {
  pruneUnpublishedAssets(
    outputDirectory,
    'catalogue-payloads',
    new Set(),
  );
  pruneUnpublishedAssets(
    outputDirectory,
    'catalogue-sources',
    new Set(),
  );
}

async function restorePayload(
  entry: CataloguePayloadManifestEntry,
  publishedBaseUrl: URL,
  outputDirectory: string,
  fetchImplementation: FetchImplementation,
): Promise<boolean> {
  const outputPath = payloadOutputPath(outputDirectory, entry.payloadUrl);
  if (hasExpectedContent(outputPath, entry.payloadHash)) return false;

  const payloadUrl = new URL(entry.payloadUrl, publishedBaseUrl);
  if (
    payloadUrl.origin !== publishedBaseUrl.origin
    || !payloadUrl.pathname.startsWith(publishedBaseUrl.pathname)
  ) {
    throw new Error(`Unsafe published catalogue payload: ${entry.payloadUrl}`);
  }

  let response: Response;
  try {
    response = await fetchImplementation(payloadUrl, { cache: 'no-store' });
  } catch (error) {
    throw new Error(
      `Could not download ${entry.payloadUrl}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `Could not download ${entry.payloadUrl} (${response.status})`,
    );
  }

  const content = await response.text();
  if (Buffer.byteLength(content, 'utf-8') > MAX_PAYLOAD_BYTES) {
    throw new Error(`Published catalogue payload is too large: ${entry.payloadUrl}`);
  }
  const actualHash = createHash('sha256').update(content).digest('hex');
  if (entry.payloadHash !== `sha256:${actualHash}`) {
    throw new Error(
      `Published catalogue payload failed integrity verification: ${entry.payloadUrl}`,
    );
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  try {
    rmSync(temporaryPath, { force: true });
    writeFileSync(temporaryPath, content, 'utf-8');
    renameSync(temporaryPath, outputPath);
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    throw error;
  }
  return true;
}

async function restoreSource(
  entry: CatalogueSourceManifestEntry,
  publishedBaseUrl: URL,
  outputDirectory: string,
  fetchImplementation: FetchImplementation,
): Promise<boolean> {
  const outputPath = sourceOutputPath(
    outputDirectory,
    entry.sourceArtifactUrl,
  );
  if (hasExpectedContent(outputPath, entry.sourceArtifactHash)) return false;

  const sourceUrl = new URL(entry.sourceArtifactUrl, publishedBaseUrl);
  if (
    sourceUrl.origin !== publishedBaseUrl.origin
    || !sourceUrl.pathname.startsWith(publishedBaseUrl.pathname)
  ) {
    throw new Error(
      `Unsafe published catalogue source: ${entry.sourceArtifactUrl}`,
    );
  }

  let response: Response;
  try {
    response = await fetchImplementation(sourceUrl, {
      cache: 'no-store',
      redirect: 'error',
    });
  } catch (error) {
    throw new Error(
      `Could not download ${entry.sourceArtifactUrl}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `Could not download ${entry.sourceArtifactUrl} (${response.status})`,
    );
  }

  let content: Buffer;
  try {
    content = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    throw new Error(
      `Could not read ${entry.sourceArtifactUrl}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (content.byteLength > MAX_SOURCE_BYTES) {
    throw new Error(
      `Published catalogue source is too large: ${entry.sourceArtifactUrl}`,
    );
  }
  const actualHash = createHash('sha256').update(content).digest('hex');
  if (entry.sourceArtifactHash !== `sha256:${actualHash}`) {
    throw new Error(
      `Published catalogue source failed integrity verification: ${entry.sourceArtifactUrl}`,
    );
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  try {
    rmSync(temporaryPath, { force: true });
    writeFileSync(temporaryPath, content);
    renameSync(temporaryPath, outputPath);
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    throw error;
  }
  return true;
}

export async function restoreCataloguePayloads(
  baseUrl: string,
  outputDirectory: string = DEFAULT_OUTPUT_DIRECTORY,
  fetchImplementation: FetchImplementation = fetch,
): Promise<number> {
  const requestedBaseUrl = new URL(baseUrl);
  if (!['http:', 'https:'].includes(requestedBaseUrl.protocol)) {
    throw new Error('Published catalogue URL must use HTTP or HTTPS');
  }
  if (!requestedBaseUrl.pathname.endsWith('/')) {
    requestedBaseUrl.pathname += '/';
  }

  const requestedIndexUrl = new URL('catalogue.json', requestedBaseUrl);
  let indexResponse: Response;
  try {
    indexResponse = await fetchImplementation(
      requestedIndexUrl,
      { cache: 'no-store' },
    );
  } catch (error) {
    throw new Error(
      `Could not read the published catalogue: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (indexResponse.status === 404) {
    clearUnpublishedCatalogueCache(outputDirectory);
    console.log('No published catalogue found; starting payload history');
    return 0;
  }
  if (!indexResponse.ok) {
    throw new Error(
      `Could not read the published catalogue (${indexResponse.status})`,
    );
  }

  const indexValue = await readJsonResponse(
    indexResponse,
    'published catalogue index',
  );
  if (!isRecord(indexValue) || indexValue.schemaVersion !== 2) {
    clearUnpublishedCatalogueCache(outputDirectory);
    console.log('Published catalogue predates payload history; starting fresh');
    return 0;
  }

  const finalIndexUrl = indexResponse.url || requestedIndexUrl.href;
  const publishedBaseUrl = new URL('.', finalIndexUrl);
  const manifestUrl = new URL(MANIFEST_FILENAME, publishedBaseUrl);
  let manifestResponse: Response;
  try {
    manifestResponse = await fetchImplementation(
      manifestUrl,
      { cache: 'no-store' },
    );
  } catch (error) {
    throw new Error(
      `Could not read the published payload manifest: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!manifestResponse.ok) {
    throw new Error(
      `Could not read the published payload manifest (${manifestResponse.status})`,
    );
  }
  const manifest = parseManifest(await readJsonResponse(
    manifestResponse,
    'published catalogue payload manifest',
  ));
  validateCurrentIndex(indexValue, manifest);
  pruneUnpublishedAssets(
    outputDirectory,
    'catalogue-payloads',
    new Set(manifest.payloads.map((entry) => entry.payloadUrl)),
  );
  pruneUnpublishedAssets(
    outputDirectory,
    'catalogue-sources',
    new Set(manifest.sources.map((entry) => entry.sourceArtifactUrl)),
  );

  let downloaded = 0;
  for (
    let offset = 0;
    offset < manifest.payloads.length;
    offset += DOWNLOAD_CONCURRENCY
  ) {
    const results = await Promise.all(
      manifest.payloads
        .slice(offset, offset + DOWNLOAD_CONCURRENCY)
        .map((entry) => restorePayload(
          entry,
          publishedBaseUrl,
          outputDirectory,
          fetchImplementation,
        )),
    );
    downloaded += results.filter(Boolean).length;
  }
  for (
    let offset = 0;
    offset < manifest.sources.length;
    offset += DOWNLOAD_CONCURRENCY
  ) {
    const results = await Promise.all(
      manifest.sources
        .slice(offset, offset + DOWNLOAD_CONCURRENCY)
        .map((entry) => restoreSource(
          entry,
          publishedBaseUrl,
          outputDirectory,
          fetchImplementation,
        )),
    );
    downloaded += results.filter(Boolean).length;
  }

  console.log(
    `✔ Restored ${manifest.payloads.length} published payloads and `
      + `${manifest.sources.length} source artifacts`
      + ` (${downloaded} downloaded)`,
  );
  return manifest.payloads.length + manifest.sources.length;
}

const isMainModule =
  process.argv[1] !== undefined
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMainModule) {
  const baseUrl = process.argv[2];
  if (!baseUrl) {
    console.error(
      'Usage: npm run catalogue:restore -- https://example.com/base/',
    );
    process.exitCode = 1;
  } else {
    restoreCataloguePayloads(baseUrl).catch((error) => {
      console.error(
        error instanceof Error ? error.message : String(error),
      );
      process.exitCode = 1;
    });
  }
}
