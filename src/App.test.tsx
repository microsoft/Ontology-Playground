import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useAppStore } from './store/appStore';
import { useDesignerStore } from './store/designerStore';
import { loadCatalogueEntry } from './lib/catalogue';
import { navigate } from './lib/router';
import {
  createCatalogueRdfDocumentReference,
} from './lib/rdf/document';
import type { LoadedCatalogueEntry } from './types/catalogue';

const appMocks = vi.hoisted(() => ({
  route: {
    page: 'catalogue' as const,
    ontologyId: 'official/deep-link-test',
  } as {
    page: string;
    ontologyId?: string;
  },
}));

vi.mock('./hooks/useRoute', () => ({
  useRoute: () => appMocks.route,
}));

vi.mock('./lib/router', () => ({
  navigate: vi.fn(),
}));

vi.mock('./lib/catalogue', () => ({
  loadCatalogueEntry: vi.fn(),
}));

vi.mock('./components', () => {
  const Stub = () => null;
  return {
    Header: ({
      onDesignerClick,
    }: {
      onDesignerClick: () => void;
    }) => (
      <button type="button" onClick={onDesignerClick}>
        Open Designer
      </button>
    ),
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
    appMocks.route = {
      page: 'catalogue',
      ontologyId: 'official/deep-link-test',
    };
    vi.mocked(loadCatalogueEntry).mockReset();
    vi.mocked(navigate).mockReset();
    useAppStore.getState().resetToDefault();
    useDesignerStore.getState().resetDraft();
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

  it('does not open the Designer after newer navigation supersedes a pending source load', async () => {
    appMocks.route = { page: 'home' };
    let resolveDocument: ((value: null) => void) | undefined;
    const pendingDocument = new Promise<null>((resolve) => {
      resolveDocument = resolve;
    });
    const ensureCurrentRdfDocument = vi.spyOn(
      useAppStore.getState(),
      'ensureCurrentRdfDocument',
    ).mockReturnValue(pendingDocument);
    const loadDraft = vi.spyOn(
      useDesignerStore.getState(),
      'loadDraft',
    );
    const user = userEvent.setup();
    const view = render(<App />);

    await user.click(screen.getByText('Open Designer'));
    expect(ensureCurrentRdfDocument).toHaveBeenCalledTimes(1);

    appMocks.route = { page: 'learn' };
    view.rerender(<App />);
    await act(async () => {
      resolveDocument?.(null);
      await pendingDocument;
    });

    expect(loadDraft).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalledWith({ page: 'designer' });
  });

  it('does not overwrite a newer ontology while Designer entry is pending', async () => {
    appMocks.route = { page: 'home' };
    let resolveDocument: ((value: null) => void) | undefined;
    const pendingDocument = new Promise<null>((resolve) => {
      resolveDocument = resolve;
    });
    vi.spyOn(
      useAppStore.getState(),
      'ensureCurrentRdfDocument',
    ).mockReturnValue(pendingDocument);
    const loadDraft = vi.spyOn(
      useDesignerStore.getState(),
      'loadDraft',
    );
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText('Open Designer'));
    useAppStore.getState().loadOntology({
      name: 'Newer Ontology',
      description: '',
      entityTypes: [],
      relationships: [],
    });
    await act(async () => {
      resolveDocument?.(null);
      await pendingDocument;
    });

    expect(loadDraft).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalledWith({ page: 'designer' });
  });

  it('does not open an ontology above the safe Designer graph limit', async () => {
    appMocks.route = { page: 'home' };
    useAppStore.getState().loadOntology({
      name: 'Large Ontology',
      description: '',
      entityTypes: Array.from({ length: 1_000 }, (_, index) => ({
        id: `entity-${index}`,
        name: `Entity ${index}`,
        description: '',
        properties: [],
      })),
      relationships: [],
    });
    const ensureCurrentRdfDocument = vi.spyOn(
      useAppStore.getState(),
      'ensureCurrentRdfDocument',
    );
    const loadDraft = vi.spyOn(
      useDesignerStore.getState(),
      'loadDraft',
    );
    const user = userEvent.setup();
    render(<App />);
    const callsBeforeClick =
      ensureCurrentRdfDocument.mock.calls.length;

    await user.click(screen.getByText('Open Designer'));

    expect(ensureCurrentRdfDocument).toHaveBeenCalledTimes(
      callsBeforeClick,
    );
    expect(loadDraft).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalledWith({ page: 'designer' });
  });
});
