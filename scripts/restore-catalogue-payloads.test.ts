import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CataloguePayloadManifest } from '../src/types/catalogue';
import { restoreCataloguePayloads } from './restore-catalogue-payloads';

const temporaryDirectories: string[] = [];

function createOutputDirectory(): string {
  const directory = mkdtempSync(
    join(tmpdir(), 'ontology-payload-restore-test-'),
  );
  temporaryDirectories.push(directory);
  return directory;
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('published catalogue payload restoration', () => {
  it('restores verified payload history into a clean output directory', async () => {
    const content = '{"schemaVersion":1,"id":"official/previous"}\n';
    const hash = createHash('sha256').update(content).digest('hex');
    const payloadUrl = `catalogue-payloads/official/previous/${hash}.json`;
    const sourceContent = new TextEncoder().encode(
      '<?xml version="1.0"?><rdf:RDF/>\n',
    );
    const sourceHash = createHash('sha256')
      .update(sourceContent)
      .digest('hex');
    const sourceArtifactUrl =
      `catalogue-sources/official/previous/${sourceHash}.rdf`;
    const manifest: CataloguePayloadManifest = {
      schemaVersion: 1,
      payloads: [{
        payloadUrl,
        payloadHash: `sha256:${hash}`,
      }],
      sources: [{
        sourceArtifactUrl,
        sourceArtifactHash: `sha256:${sourceHash}`,
      }],
    };
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = input.toString();
      if (url.endsWith('/catalogue.json')) {
        return jsonResponse({
          schemaVersion: 2,
          entries: [{
            ...manifest.payloads[0],
            ...manifest.sources[0],
            sourceArtifactByteLength: sourceContent.byteLength,
            sourceArtifactMediaType: 'application/rdf+xml',
          }],
        });
      }
      if (url.endsWith('/catalogue-payloads-manifest.json')) {
        return jsonResponse(manifest);
      }
      if (url.endsWith(payloadUrl)) {
        return new Response(content, { status: 200 });
      }
      if (url.endsWith(sourceArtifactUrl)) {
        return new Response(sourceContent, { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });
    const outputDirectory = createOutputDirectory();
    const cacheOnlyPayload = join(
      outputDirectory,
      'catalogue-payloads',
      'official',
      'cache-only',
      `${'a'.repeat(64)}.json`,
    );
    const cacheOnlySource = join(
      outputDirectory,
      'catalogue-sources',
      'external',
      'cache-only',
      `${'b'.repeat(64)}.rdf`,
    );
    mkdirSync(join(cacheOnlyPayload, '..'), { recursive: true });
    mkdirSync(join(cacheOnlySource, '..'), { recursive: true });
    writeFileSync(cacheOnlyPayload, 'not published\n');
    writeFileSync(cacheOnlySource, 'not published\n');

    await expect(restoreCataloguePayloads(
      'https://example.com/playground/',
      outputDirectory,
      fetchMock,
    )).resolves.toBe(2);

    const restoredPath = join(outputDirectory, payloadUrl);
    expect(readFileSync(restoredPath, 'utf-8')).toBe(content);
    expect(readFileSync(
      join(outputDirectory, sourceArtifactUrl),
    ).equals(sourceContent)).toBe(true);
    expect(existsSync(cacheOnlyPayload)).toBe(false);
    expect(existsSync(cacheOnlySource)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    await restoreCataloguePayloads(
      'https://example.com/playground/',
      outputDirectory,
      fetchMock,
    );
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('accepts legacy manifests without source artifacts', async () => {
    const content = '{"schemaVersion":1,"id":"official/previous"}\n';
    const hash = createHash('sha256').update(content).digest('hex');
    const payloadUrl = `catalogue-payloads/official/previous/${hash}.json`;
    const legacyManifest = {
      schemaVersion: 1,
      payloads: [{
        payloadUrl,
        payloadHash: `sha256:${hash}`,
      }],
    };
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = input.toString();
      if (url.endsWith('/catalogue.json')) {
        return jsonResponse({
          schemaVersion: 2,
          entries: legacyManifest.payloads,
        });
      }
      if (url.endsWith('/catalogue-payloads-manifest.json')) {
        return jsonResponse(legacyManifest);
      }
      return new Response(content, { status: 200 });
    });

    await expect(restoreCataloguePayloads(
      'https://example.com/playground/',
      createOutputDirectory(),
      fetchMock,
    )).resolves.toBe(1);
  });

  it('reports source response read failures with artifact context', async () => {
    const payloadContent =
      '{"schemaVersion":1,"id":"official/previous"}\n';
    const payloadHash = createHash('sha256')
      .update(payloadContent)
      .digest('hex');
    const payloadUrl =
      `catalogue-payloads/official/previous/${payloadHash}.json`;
    const sourceContent = new TextEncoder().encode(
      '<?xml version="1.0"?><rdf:RDF/>\n',
    );
    const sourceHash = createHash('sha256')
      .update(sourceContent)
      .digest('hex');
    const sourceArtifactUrl =
      `catalogue-sources/official/previous/${sourceHash}.rdf`;
    const manifest: CataloguePayloadManifest = {
      schemaVersion: 1,
      payloads: [{
        payloadUrl,
        payloadHash: `sha256:${payloadHash}`,
      }],
      sources: [{
        sourceArtifactUrl,
        sourceArtifactHash: `sha256:${sourceHash}`,
      }],
    };
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = input.toString();
      if (url.endsWith('/catalogue.json')) {
        return jsonResponse({
          schemaVersion: 2,
          entries: [{
            ...manifest.payloads[0],
            ...manifest.sources[0],
            sourceArtifactByteLength: sourceContent.byteLength,
            sourceArtifactMediaType: 'application/rdf+xml',
          }],
        });
      }
      if (url.endsWith('/catalogue-payloads-manifest.json')) {
        return jsonResponse(manifest);
      }
      if (url.endsWith(payloadUrl)) {
        return new Response(payloadContent, { status: 200 });
      }
      return {
        ok: true,
        status: 200,
        arrayBuffer: vi.fn().mockRejectedValue(
          new Error('response body failed'),
        ),
      } as unknown as Response;
    });

    await expect(restoreCataloguePayloads(
      'https://example.com/playground/',
      createOutputDirectory(),
      fetchMock,
    )).rejects.toThrow(
      `Could not read ${sourceArtifactUrl}: response body failed`,
    );
  });

  it('rejects schema-v2 deployments without a complete payload manifest', async () => {
    const fetchMock = vi.fn(async (input: string | URL) =>
      input.toString().endsWith('/catalogue.json')
        ? jsonResponse({ schemaVersion: 2, entries: [] })
        : new Response('not found', { status: 404 }));

    await expect(restoreCataloguePayloads(
      'https://example.com/playground/',
      createOutputDirectory(),
      fetchMock,
    )).rejects.toThrow(
      'Could not read the published payload manifest (404)',
    );
  });

  it('starts fresh when the deployed catalogue predates lazy payloads', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([]));
    const outputDirectory = createOutputDirectory();
    const cacheOnlyPayload = join(
      outputDirectory,
      'catalogue-payloads',
      'official',
      'cache-only',
      `${'a'.repeat(64)}.json`,
    );
    const cacheOnlySource = join(
      outputDirectory,
      'catalogue-sources',
      'external',
      'cache-only',
      `${'b'.repeat(64)}.rdf`,
    );
    mkdirSync(join(cacheOnlyPayload, '..'), { recursive: true });
    mkdirSync(join(cacheOnlySource, '..'), { recursive: true });
    writeFileSync(cacheOnlyPayload, 'not published\n');
    writeFileSync(cacheOnlySource, 'not published\n');

    await expect(restoreCataloguePayloads(
      'https://example.com/playground/',
      outputDirectory,
      fetchMock,
    )).resolves.toBe(0);
    expect(existsSync(join(
      outputDirectory,
      'catalogue-payloads',
    ))).toBe(false);
    expect(existsSync(cacheOnlyPayload)).toBe(false);
    expect(existsSync(cacheOnlySource)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
