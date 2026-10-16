import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cosmicCoffeeOntology } from '../data/ontology';
import {
  createCatalogueRdfDocumentReference,
  ensureRdfDocumentReady,
} from '../lib/rdf/document';
import type { CatalogueEntry } from '../types/catalogue';
import type {
  RdfDocumentReference,
  ReadyRdfDocument,
} from '../types/rdfDocument';
import { useAppStore } from './appStore';

vi.mock('../lib/rdf/document', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../lib/rdf/document')
  >();
  return {
    ...actual,
    ensureRdfDocumentReady: vi.fn(actual.ensureRdfDocumentReady),
  };
});

const entry: CatalogueEntry = {
  id: 'external/example/source',
  name: 'Source',
  description: 'Source-backed ontology',
  category: 'general',
  tags: [],
  author: 'Example',
  source: 'external',
  entityCount: 1,
  relationshipCount: 0,
  payloadUrl: `catalogue-payloads/external/example/source/${'a'.repeat(64)}.json`,
  payloadHash: `sha256:${'a'.repeat(64)}`,
  sourceArtifactUrl: `catalogue-sources/external/example/source/${'b'.repeat(64)}.rdf`,
  sourceArtifactHash: `sha256:${'b'.repeat(64)}`,
  sourceArtifactByteLength: 42,
  sourceArtifactMediaType: 'application/rdf+xml',
};

beforeEach(() => {
  useAppStore.getState().resetToDefault();
  vi.mocked(ensureRdfDocumentReady).mockReset();
});

function readyDocument(
  reference: RdfDocumentReference,
): ReadyRdfDocument {
  return {
    ...reference,
    state: 'ready',
    originalBytes: new Uint8Array([1]),
    originalQuads: [],
    projection: {
      entities: {},
      relationships: {},
    },
    patches: [],
  };
}

describe('application RDF document lifecycle', () => {
  it('keeps a source reference with the loaded visual projection', () => {
    const reference = createCatalogueRdfDocumentReference(entry);
    useAppStore.getState().loadOntology(
      cosmicCoffeeOntology,
      [],
      entry,
      reference,
    );

    expect(useAppStore.getState().rdfDocument).toEqual(reference);
    expect(useAppStore.getState().currentCatalogueEntry?.id).toBe(entry.id);
  });

  it('clears source identity when loading an authored ontology', () => {
    const reference = createCatalogueRdfDocumentReference(entry);
    useAppStore.getState().loadOntology(
      cosmicCoffeeOntology,
      [],
      entry,
      reference,
    );

    useAppStore.getState().loadOntology(cosmicCoffeeOntology);
    expect(useAppStore.getState().rdfDocument).toBeNull();
    expect(useAppStore.getState().currentCatalogueEntry).toBeNull();
  });

  it('retains the active source reference when source resolution fails', async () => {
    const reference = createCatalogueRdfDocumentReference(entry)!;
    useAppStore.getState().loadOntology(
      cosmicCoffeeOntology,
      [],
      entry,
      reference,
    );
    vi.mocked(ensureRdfDocumentReady).mockRejectedValueOnce(
      new Error('Integrity check failed'),
    );

    await expect(
      useAppStore.getState().ensureCurrentRdfDocument(),
    ).rejects.toThrow('Integrity check failed');
    expect(useAppStore.getState().rdfDocument).toBe(reference);
    expect(useAppStore.getState().currentCatalogueEntry).toBe(entry);
  });

  it('does not replace a newer active document with a stale source result', async () => {
    const reference = createCatalogueRdfDocumentReference(entry)!;
    let resolveSource!: (document: ReadyRdfDocument) => void;
    vi.mocked(ensureRdfDocumentReady).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSource = resolve;
      }),
    );
    useAppStore.getState().loadOntology(
      cosmicCoffeeOntology,
      [],
      entry,
      reference,
    );

    const pending = useAppStore.getState().ensureCurrentRdfDocument();
    useAppStore.getState().loadOntology(cosmicCoffeeOntology);
    resolveSource(readyDocument(reference));

    await expect(pending).rejects.toThrow(
      'active ontology changed',
    );
    expect(useAppStore.getState().rdfDocument).toBeNull();
    expect(useAppStore.getState().currentCatalogueEntry).toBeNull();
  });
});
