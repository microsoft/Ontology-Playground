import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useAppStore } from './store/appStore';
import { loadCatalogueEntry } from './lib/catalogue';
import {
  createCatalogueRdfDocumentReference,
} from './lib/rdf/document';
import type { LoadedCatalogueEntry } from './types/catalogue';

vi.mock('./hooks/useRoute', () => {
  const route = {
    page: 'catalogue' as const,
    ontologyId: 'official/deep-link-test',
  };
  return { useRoute: () => route };
});

vi.mock('./lib/catalogue', () => ({
  loadCatalogueEntry: vi.fn(),
}));

vi.mock('./components', () => {
  const Stub = () => null;
  return {
    Header: Stub,
    OntologyGraph: Stub,
    QuestPanel: Stub,
    InspectorPanel: Stub,
    QueryPlayground: Stub,
    SearchFilter: Stub,
    WelcomeModal: Stub,
    AboutModal: Stub,
    HelpModal: Stub,
    DataSourcesModal: Stub,
    ImportExportModal: Stub,
    FabricExportModal: Stub,
    GalleryModal: Stub,
    OntologySummaryModal: Stub,
    OntologyDesigner: Stub,
    LearnPage: Stub,
    Toast: Stub,
    CommandPalette: Stub,
    GuidedTour: Stub,
    AppFooter: Stub,
    OntologyStatsPanel: Stub,
    PathFinderPanel: Stub,
    isTourDismissed: () => true,
  };
});

const linkedEntry: LoadedCatalogueEntry = {
  id: 'official/deep-link-test',
  name: 'Deep Link Test',
  description: 'Loaded by a catalogue route',
  category: 'general',
  tags: [],
  author: 'ontology-quest',
  source: 'official',
  entityCount: 1,
  relationshipCount: 0,
  payloadUrl: 'catalogue-payloads/official/deep-link-test/hash.json',
  payloadHash: `sha256:${'a'.repeat(64)}`,
  sourceArtifactUrl:
    `catalogue-sources/official/deep-link-test/${'b'.repeat(64)}.rdf`,
  sourceArtifactHash: `sha256:${'b'.repeat(64)}`,
  sourceArtifactByteLength: 42,
  sourceArtifactMediaType: 'application/rdf+xml',
  ontology: {
    name: 'Deep Link Test',
    namespace: 'https://example.com/deep-link-test#',
    entityTypes: [
      {
        id: 'test',
        name: 'Test',
        description: 'A test entity',
        properties: [],
        position: { x: 0, y: 0 },
      },
    ],
    relationships: [],
  },
  bindings: [],
};

describe('catalogue deep links', () => {
  beforeEach(() => {
    vi.mocked(loadCatalogueEntry).mockReset();
    useAppStore.getState().resetToDefault();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the linked catalogue entry exactly once', async () => {
    vi.mocked(loadCatalogueEntry).mockResolvedValue(linkedEntry);
    const loadOntology = vi.spyOn(useAppStore.getState(), 'loadOntology');

    render(<App />);

    await waitFor(() => {
      expect(useAppStore.getState().currentOntology.name).toBe('Deep Link Test');
    });
    expect(loadCatalogueEntry).toHaveBeenCalledTimes(1);
    expect(loadCatalogueEntry).toHaveBeenCalledWith('official/deep-link-test');
    expect(loadOntology).toHaveBeenCalledTimes(1);
    expect(loadOntology).toHaveBeenCalledWith(
      linkedEntry.ontology,
      linkedEntry.bindings,
      linkedEntry,
      createCatalogueRdfDocumentReference(linkedEntry),
    );
    expect(useAppStore.getState().currentCatalogueEntry).toBe(linkedEntry);
  });
});
