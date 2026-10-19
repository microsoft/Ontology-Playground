import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Catalogue, CatalogueEntryPayload } from '../types/catalogue';
import {
  CatalogueLoadError,
  clearCatalogueCache,
  loadCatalogueEntry,
  loadCatalogueIndex,
  loadCatalogueSource,
  loadCatalogueSourceForEntry,
} from './catalogue';

const payload: CatalogueEntryPayload = {
  schemaVersion: 1,
  id: 'official/test',
  ontology: {
    name: 'Test Ontology',
    description: 'Test description',
    entityTypes: [],
    relationships: [],
  },
  bindings: [],
};

function payloadContent(value: unknown = payload): string {
  return JSON.stringify(value, null, 2) + '\n';
}

function payloadHash(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

const sourceContent = '<?xml version="1.0"?><rdf:RDF/>\n';
const sourceHash = payloadHash(sourceContent);

function createCatalogue(content = payloadContent()): Catalogue {
  const hash = payloadHash(content);
  return {
    schemaVersion: 2,
    generatedAt: '2026-01-01T00:00:00.000Z',
    count: 1,
    entries: [{
      id: 'official/test',
      name: 'Test Ontology',
      description: 'Test description',
      category: 'general',
      tags: ['test'],
      author: 'test-author',
      source: 'official',
      entityCount: 0,
      relationshipCount: 0,
      payloadUrl:
        `catalogue-payloads/official/test/${hash.slice('sha256:'.length)}.json`,
      payloadHash: hash,
      sourceArtifactUrl:
        `catalogue-sources/official/test/${
          sourceHash.slice('sha256:'.length)
        }.rdf`,
      sourceArtifactHash: sourceHash,
      sourceArtifactByteLength: new TextEncoder().encode(sourceContent).byteLength,
      sourceArtifactMediaType: 'application/rdf+xml',
      sourceUrl: 'https://upstream.example/ontology',
    }],
  };
}

function createLegacyCatalogue(content = payloadContent()): Catalogue {
  const catalogue = createCatalogue(content);
  const entry = catalogue.entries[0];
  delete entry.sourceArtifactUrl;
  delete entry.sourceArtifactHash;
  delete entry.sourceArtifactByteLength;
  delete entry.sourceArtifactMediaType;
  return catalogue;
}

function response(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  clearCatalogueCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('catalogue loader', () => {
  it('loads only the lightweight index when browsing the catalogue', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response(JSON.stringify(createCatalogue())),
    );

    const catalogue = await loadCatalogueIndex('/playground/');

    expect(catalogue.entries[0]).not.toHaveProperty('ontology');
    expect(catalogue.entries[0]).not.toHaveProperty('bindings');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0].toString()).toMatch(
      /\/playground\/catalogue\.json$/,
    );
  });

  it('treats a base URL without a trailing slash as a directory', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response(JSON.stringify(createCatalogue())),
    );

    await loadCatalogueIndex('/published-catalogue');

    expect(fetchMock.mock.calls[0][0].toString()).toMatch(
      /\/published-catalogue\/catalogue\.json$/,
    );
  });

  it('refreshes a cached legacy schema-v2 index before using it', async () => {
    const currentCatalogue = createCatalogue();
    let indexRequests = 0;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => {
        indexRequests++;
        return response(JSON.stringify(
          indexRequests === 1
            ? createLegacyCatalogue()
            : currentCatalogue,
        ));
      },
    );

    const catalogue = await loadCatalogueIndex('/playground/');

    expect(catalogue.entries[0].sourceArtifactHash).toBe(sourceHash);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      cache: 'no-store',
    });
  });

  it('can load payloads from a legacy index when refresh is still legacy', async () => {
    const content = payloadContent();
    let indexRequests = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (input.toString().endsWith('/catalogue.json')) {
        indexRequests++;
        return response(JSON.stringify(createLegacyCatalogue(content)));
      }
      return response(content);
    });

    const loaded = await loadCatalogueEntry(
      'official/test',
      '/playground/',
    );

    expect(loaded.ontology.name).toBe('Test Ontology');
    expect(loaded.sourceArtifactUrl).toBeUndefined();
    expect(indexRequests).toBe(2);
  });

  it('loads only the requested entry payload', async () => {
    const content = payloadContent();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input) => input.toString().endsWith('/catalogue.json')
        ? response(JSON.stringify(createCatalogue(content)))
        : response(content),
    );

    const loaded = await loadCatalogueEntry('official/test', '/playground/');

    expect(loaded.ontology.name).toBe('Test Ontology');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0].toString()).toContain(
      '/catalogue-payloads/official/test/',
    );
  });

  it('loads and verifies the exact same-origin source artifact', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input) => input.toString().endsWith('/catalogue.json')
        ? response(JSON.stringify(createCatalogue()))
        : new Response(sourceContent, {
            status: 200,
            headers: { 'Content-Type': 'application/rdf+xml' },
          }),
    );

    const loaded = await loadCatalogueSource(
      'official/test',
      '/playground/',
    );

    expect(loaded.text).toBe(sourceContent);
    expect(Array.from(loaded.bytes)).toEqual(
      Array.from(new TextEncoder().encode(sourceContent)),
    );
    expect(loaded.hash).toBe(sourceHash);
    expect(loaded.sourceArtifactUrl).toBe(
      createCatalogue().entries[0].sourceArtifactUrl,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0].toString()).toContain(
      '/catalogue-sources/official/test/',
    );
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      redirect: 'error',
    });
    expect(fetchMock.mock.calls.some(
      ([input]) => input.toString().startsWith('https://upstream.example/'),
    )).toBe(false);
  });

  it('returns refreshed source metadata after a stale source URL', async () => {
    const refreshedSource =
      '<?xml version="1.0"?><rdf:RDF data-version="2"/>\n';
    const refreshedHash = payloadHash(refreshedSource);
    const originalCatalogue = createCatalogue();
    const refreshedCatalogue: Catalogue = {
      ...originalCatalogue,
      entries: [{
        ...originalCatalogue.entries[0],
        sourceArtifactUrl:
          `catalogue-sources/official/test/${
            refreshedHash.slice('sha256:'.length)
          }.rdf`,
        sourceArtifactHash: refreshedHash,
        sourceArtifactByteLength: new TextEncoder()
          .encode(refreshedSource).byteLength,
      }],
    };
    let indexRequests = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input.toString();
      if (url.endsWith('/catalogue.json')) {
        indexRequests++;
        return response(JSON.stringify(
          indexRequests === 1
            ? originalCatalogue
            : refreshedCatalogue,
        ));
      }
      if (url.endsWith(originalCatalogue.entries[0].sourceArtifactUrl)) {
        return new Response('not found', { status: 404 });
      }
      return new Response(refreshedSource, { status: 200 });
    });

    const loaded = await loadCatalogueSource(
      'official/test',
      '/playground/',
    );

    expect(loaded.text).toBe(refreshedSource);
    expect(loaded.hash).toBe(refreshedHash);
    expect(loaded.sourceArtifactUrl).toBe(
      refreshedCatalogue.entries[0].sourceArtifactUrl,
    );
    expect(indexRequests).toBe(2);
  });

  it('does not replace an exact entry source with a newer catalogue version', async () => {
    const originalCatalogue = createCatalogue();
    let indexRequests = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input.toString();
      if (url.endsWith('/catalogue.json')) {
        indexRequests++;
        return response(JSON.stringify(originalCatalogue));
      }
      return new Response('not found', { status: 404 });
    });

    await expect(loadCatalogueSourceForEntry(
      originalCatalogue.entries[0],
      '/playground/',
    )).rejects.toThrow(
      'Failed to load original source for "official/test" (404)',
    );
    expect(indexRequests).toBe(0);
  });

  it('rejects source integrity failures and allows a later retry', async () => {
    let sourceRequests = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (input.toString().endsWith('/catalogue.json')) {
        return response(JSON.stringify(createCatalogue()));
      }
      sourceRequests++;
      return new Response(
        sourceRequests === 1 ? 'corrupt source' : sourceContent,
        { status: 200 },
      );
    });

    await expect(loadCatalogueSource(
      'official/test',
      '/playground/',
    )).rejects.toThrow(
      'Original source size check failed for "official/test"',
    );
    await expect(loadCatalogueSource(
      'official/test',
      '/playground/',
    )).resolves.toMatchObject({
      text: sourceContent,
      hash: sourceHash,
    });
    expect(sourceRequests).toBe(2);
  });

  it('deduplicates concurrent requests and caches successful entries', async () => {
    const content = payloadContent();
    let indexRequests = 0;
    let payloadRequests = 0;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input) => {
        if (input.toString().endsWith('/catalogue.json')) {
          indexRequests++;
          return response(JSON.stringify(createCatalogue(content)));
        }
        payloadRequests++;
        return response(content);
      },
    );

    const [first, second] = await Promise.all([
      loadCatalogueEntry('official/test', '/playground/'),
      loadCatalogueEntry('official/test', '/playground/'),
    ]);
    const third = await loadCatalogueEntry('official/test', '/playground/');

    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(indexRequests).toBe(1);
    expect(payloadRequests).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports a missing payload and allows a later retry', async () => {
    const content = payloadContent();
    let payloadRequests = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (input.toString().endsWith('/catalogue.json')) {
        return response(JSON.stringify(createCatalogue(content)));
      }
      payloadRequests++;
      return response('not found', 404);
    });

    await expect(
      loadCatalogueEntry('official/test', '/playground/'),
    ).rejects.toThrow('Failed to load ontology "official/test" (404)');
    await expect(
      loadCatalogueEntry('official/test', '/playground/'),
    ).rejects.toThrow(CatalogueLoadError);

    expect(payloadRequests).toBe(2);
  });

  it('refreshes a stale index once when a deployed payload hash changed', async () => {
    const oldContent = payloadContent();
    const updatedContent = payloadContent({
      ...payload,
      ontology: {
        ...payload.ontology,
        name: 'Updated Ontology',
      },
    });
    const oldCatalogue = createCatalogue(oldContent);
    const updatedCatalogue = createCatalogue(updatedContent);
    let indexRequests = 0;
    let payloadRequests = 0;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input) => {
        const url = input.toString();
        if (url.endsWith('/catalogue.json')) {
          indexRequests++;
          return response(JSON.stringify(
            indexRequests === 1 ? oldCatalogue : updatedCatalogue,
          ));
        }
        payloadRequests++;
        return url.endsWith(oldCatalogue.entries[0].payloadUrl)
          ? response('not found', 404)
          : response(updatedContent);
      },
    );

    const loaded = await loadCatalogueEntry(
      'official/test',
      '/playground/',
    );

    expect(loaded.ontology.name).toBe('Updated Ontology');
    expect(indexRequests).toBe(2);
    expect(payloadRequests).toBe(2);
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ cache: 'no-store' });
  });

  it('uses the refreshed index generation for previously cached entries', async () => {
    const oldContent = payloadContent();
    const updatedContent = payloadContent({
      ...payload,
      ontology: {
        ...payload.ontology,
        name: 'Updated Ontology',
      },
    });
    const addedPayload: CatalogueEntryPayload = {
      ...payload,
      id: 'official/added',
      ontology: {
        ...payload.ontology,
        name: 'Added Ontology',
      },
    };
    const addedContent = payloadContent(addedPayload);
    const oldCatalogue = createCatalogue(oldContent);
    const updatedCatalogue = createCatalogue(updatedContent);
    const addedHash = payloadHash(addedContent);
    updatedCatalogue.entries.push({
      ...updatedCatalogue.entries[0],
      id: addedPayload.id,
      name: addedPayload.ontology.name,
      payloadUrl:
        `catalogue-payloads/official/added/${addedHash.slice('sha256:'.length)}.json`,
      payloadHash: addedHash,
      sourceArtifactUrl:
        `catalogue-sources/official/added/${
          sourceHash.slice('sha256:'.length)
        }.rdf`,
    });
    updatedCatalogue.count = updatedCatalogue.entries.length;
    let indexRequests = 0;
    let payloadRequests = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input.toString();
      if (url.endsWith('/catalogue.json')) {
        indexRequests++;
        return response(JSON.stringify(
          indexRequests === 1 ? oldCatalogue : updatedCatalogue,
        ));
      }
      payloadRequests++;
      if (url.endsWith(oldCatalogue.entries[0].payloadUrl)) {
        return response(oldContent);
      }
      if (url.endsWith(updatedCatalogue.entries[0].payloadUrl)) {
        return response(updatedContent);
      }
      return response(addedContent);
    });

    const oldEntry = await loadCatalogueEntry(
      'official/test',
      '/playground/',
    );
    await loadCatalogueEntry('official/added', '/playground/');
    const refreshedEntry = await loadCatalogueEntry(
      'official/test',
      '/playground/',
    );

    expect(oldEntry.ontology.name).toBe('Test Ontology');
    expect(refreshedEntry.ontology.name).toBe('Updated Ontology');
    expect(indexRequests).toBe(2);
    expect(payloadRequests).toBe(3);
  });

  it('allows retry after a stale-index refresh fails', async () => {
    const oldContent = payloadContent();
    const updatedContent = payloadContent({
      ...payload,
      ontology: {
        ...payload.ontology,
        name: 'Recovered Ontology',
      },
    });
    const oldCatalogue = createCatalogue(oldContent);
    const updatedCatalogue = createCatalogue(updatedContent);
    let indexRequests = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input.toString();
      if (url.endsWith('/catalogue.json')) {
        indexRequests++;
        if (indexRequests === 1) {
          return response(JSON.stringify(oldCatalogue));
        }
        if (indexRequests === 2) return response('unavailable', 503);
        return response(JSON.stringify(updatedCatalogue));
      }
      return url.endsWith(oldCatalogue.entries[0].payloadUrl)
        ? response('not found', 404)
        : response(updatedContent);
    });

    await expect(
      loadCatalogueEntry('official/test', '/playground/'),
    ).rejects.toThrow('Failed to load catalogue (503)');
    await expect(
      loadCatalogueEntry('official/test', '/playground/'),
    ).resolves.toMatchObject({
      ontology: { name: 'Recovered Ontology' },
    });
    expect(indexRequests).toBe(3);
  });

  it('reports an index failure and allows a later retry', async () => {
    let indexRequests = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      indexRequests++;
      return indexRequests === 1
        ? response('unavailable', 503)
        : response(JSON.stringify(createCatalogue()));
    });

    await expect(loadCatalogueIndex('/playground/')).rejects.toThrow(
      'Failed to load catalogue (503)',
    );
    await expect(loadCatalogueIndex('/playground/')).resolves.toMatchObject({
      count: 1,
    });
    expect(indexRequests).toBe(2);
  });

  it('rejects malformed payload JSON after verifying its hash', async () => {
    const content = '{not-json';
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input) => input.toString().endsWith('/catalogue.json')
        ? response(JSON.stringify(createCatalogue(content)))
        : response(content),
    );

    await expect(
      loadCatalogueEntry('official/test', '/playground/'),
    ).rejects.toThrow(
      'Catalogue payload for "official/test" is not valid JSON',
    );
  });

  it('rejects a payload with malformed ontology structures', async () => {
    const content = payloadContent({
      ...payload,
      ontology: {
        ...payload.ontology,
        entityTypes: [{
          id: 42,
          name: 'Invalid ID',
          description: '',
          properties: [],
          icon: 'I',
          color: '#000000',
        }],
      },
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input) => input.toString().endsWith('/catalogue.json')
        ? response(JSON.stringify(createCatalogue(content)))
        : response(content),
    );

    await expect(
      loadCatalogueEntry('official/test', '/playground/'),
    ).rejects.toThrow(
      'Malformed catalogue payload for "official/test": entityTypes[0].id must be a string.',
    );
  });

  it('rejects payload counts that do not match the index', async () => {
    const content = payloadContent();
    const catalogue = createCatalogue(content);
    catalogue.entries[0].entityCount = 1;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input) => input.toString().endsWith('/catalogue.json')
        ? response(JSON.stringify(catalogue))
        : response(content),
    );

    await expect(
      loadCatalogueEntry('official/test', '/playground/'),
    ).rejects.toThrow(
      'Catalogue payload counts do not match the index for "official/test"',
    );
  });

  it('rejects a payload whose content does not match the index hash', async () => {
    const expectedContent = payloadContent();
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input) => input.toString().endsWith('/catalogue.json')
        ? response(JSON.stringify(createCatalogue(expectedContent)))
        : response(payloadContent({ ...payload, id: 'official/tampered' })),
    );

    await expect(
      loadCatalogueEntry('official/test', '/playground/'),
    ).rejects.toThrow(
      'Catalogue payload integrity check failed for "official/test"',
    );
  });

  it('does not request a payload for an unknown catalogue ID', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => response(JSON.stringify(createCatalogue())),
    );

    await expect(
      loadCatalogueEntry('official/missing', '/playground/'),
    ).rejects.toThrow(
      'Ontology "official/missing" not found in catalogue',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ cache: 'no-store' });
  });

  it('rejects payload URLs that are not content-addressed for their entry', async () => {
    const catalogue = createCatalogue();
    catalogue.entries[0].payloadUrl =
      'catalogue-payloads/official/test/not-the-payload-hash.json';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response(JSON.stringify(catalogue)),
    );

    await expect(loadCatalogueIndex('/playground/')).rejects.toThrow(
      'Catalogue entry has invalid payload URL',
    );
  });

  it('rejects incomplete source artifact metadata', async () => {
    const catalogue = createLegacyCatalogue();
    catalogue.entries[0].sourceArtifactHash = sourceHash;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response(JSON.stringify(catalogue)),
    );

    await expect(loadCatalogueIndex('/playground/')).rejects.toThrow(
      'Catalogue entry has incomplete source artifact metadata',
    );
  });

  it('rejects duplicate entry IDs in the catalogue index', async () => {
    const catalogue = createCatalogue();
    catalogue.entries.push({ ...catalogue.entries[0] });
    catalogue.count = catalogue.entries.length;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response(JSON.stringify(catalogue)),
    );

    await expect(loadCatalogueIndex('/playground/')).rejects.toThrow(
      'Catalogue index contains duplicate entry IDs',
    );
  });

  it('rejects malformed catalogue indexes explicitly', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response(JSON.stringify({ entries: [] })),
    );

    await expect(loadCatalogueIndex('/playground/')).rejects.toThrow(
      'Unsupported or malformed catalogue index',
    );
  });
});
