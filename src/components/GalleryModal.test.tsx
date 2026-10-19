import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GalleryModal } from './GalleryModal';
import { useAppStore } from '../store/appStore';
import { useDesignerStore } from '../store/designerStore';
import { clearCatalogueCache } from '../lib/catalogue';
import type {
  Catalogue,
  CatalogueEntry,
  CatalogueEntryPayload,
} from '../types/catalogue';
import type { Ontology } from '../data/ontology';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const htmlProps = Object.fromEntries(
        Object.entries(props).filter(
          ([k]) =>
            !['initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap', 'layout'].includes(k),
        ),
      );
      return <div {...htmlProps}>{children}</div>;
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

const makeOntology = (name: string, entityCount = 2, relCount = 1): Ontology => ({
  name,
  description: `${name} description`,
  entityTypes: Array.from({ length: entityCount }, (_, i) => ({
    id: `entity-${i}`,
    name: `Entity ${i}`,
    description: '',
    icon: '📦',
    color: '#000',
    properties: [{ name: 'id', type: 'string' as const, isIdentifier: true }],
  })),
  relationships: Array.from({ length: relCount }, (_, i) => ({
    id: `rel-${i}`,
    name: `rel-${i}`,
    from: 'entity-0',
    to: `entity-${Math.min(i + 1, entityCount - 1)}`,
    cardinality: 'one-to-many' as const,
    description: '',
  })),
});

const fakePayloads: Record<string, CatalogueEntryPayload> = {
  'official/cosmic-coffee': {
    schemaVersion: 1,
    id: 'official/cosmic-coffee',
    ontology: makeOntology('Fourth Coffee', 3, 2),
    bindings: [],
  },
  'community/drsmith/hospital-net': {
    schemaVersion: 1,
    id: 'community/drsmith/hospital-net',
    ontology: makeOntology('Hospital Network', 4, 3),
    bindings: [],
  },
  'official/finance-ledger': {
    schemaVersion: 1,
    id: 'official/finance-ledger',
    ontology: makeOntology('Finance Ledger', 2, 1),
    bindings: [],
  },
};

const fakeSources: Record<string, string> = Object.fromEntries(
  Object.keys(fakePayloads).map((id) => [
    id,
    `<?xml version="1.0" encoding="UTF-8"?>\n<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" data-id="${id}" />\n`,
  ]),
);

function createEntry(
  metadata: Omit<
    CatalogueEntry,
    | 'entityCount'
    | 'relationshipCount'
    | 'payloadUrl'
    | 'payloadHash'
    | 'sourceArtifactUrl'
    | 'sourceArtifactHash'
    | 'sourceArtifactByteLength'
    | 'sourceArtifactMediaType'
  >,
): CatalogueEntry {
  const payload = fakePayloads[metadata.id];
  const content = JSON.stringify(payload, null, 2) + '\n';
  const hash = createHash('sha256').update(content).digest('hex');
  const source = fakeSources[metadata.id];
  const sourceHash = createHash('sha256').update(source).digest('hex');

  return {
    ...metadata,
    entityCount: payload.ontology.entityTypes.length,
    relationshipCount: payload.ontology.relationships.length,
    payloadUrl: `catalogue-payloads/${metadata.id}/${hash}.json`,
    payloadHash: `sha256:${hash}`,
    sourceArtifactUrl:
      `catalogue-sources/${metadata.id}/${sourceHash}.rdf`,
    sourceArtifactHash: `sha256:${sourceHash}`,
    sourceArtifactByteLength: new TextEncoder().encode(source).byteLength,
    sourceArtifactMediaType: 'application/rdf+xml',
  };
}

const fakeCatalogue: Catalogue = {
  schemaVersion: 2,
  generatedAt: '2025-01-01T00:00:00Z',
  count: 3,
  entries: [
    createEntry({
      id: 'official/cosmic-coffee',
      name: 'Fourth Coffee',
      description: 'Coffee supply chain ontology',
      icon: '☕',
      category: 'retail',
      tags: ['coffee', 'supply-chain'],
      author: 'Ontology Playground',
      source: 'official',
    }),
    createEntry({
      id: 'community/drsmith/hospital-net',
      name: 'Hospital Network',
      description: 'Healthcare facility ontology',
      icon: '🏥',
      category: 'healthcare',
      tags: ['health', 'hospital'],
      author: 'Dr. Smith',
      source: 'community',
      license: 'MIT',
      sourceUrl: 'https://example.com/hospital-network',
      version: '1.2.0',
    }),
    createEntry({
      id: 'official/finance-ledger',
      name: 'Finance Ledger',
      description: 'Financial transactions ontology',
      category: 'finance',
      tags: ['finance', 'ledger'],
      author: 'FinCorp',
      source: 'external',
    }),
  ],
};

function mockFetchSuccess(
  data: Catalogue = fakeCatalogue,
  payloadFailures: Record<string, number> = {},
) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = input.toString();
    if (url.endsWith('/catalogue.json')) {
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const entry = data.entries.find((candidate) =>
      url.endsWith(candidate.payloadUrl));
    if (entry) {
      const failureStatus = payloadFailures[entry.id];
      if (failureStatus) {
        return new Response('payload unavailable', { status: failureStatus });
      }

      return new Response(
        JSON.stringify(fakePayloads[entry.id], null, 2) + '\n',
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const sourceEntry = data.entries.find((candidate) =>
      url.endsWith(candidate.sourceArtifactUrl));
    if (!sourceEntry) {
      return new Response('not found', { status: 404 });
    }

    return new Response(fakeSources[sourceEntry.id], {
      status: 200,
      headers: { 'Content-Type': 'application/rdf+xml' },
    });
  });
}

function mockFetchFailure(status = 404) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response('failed', { status }),
  );
}

function deferredResponse(): {
  promise: Promise<Response>;
  resolve: (response: Response) => void;
} {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

describe('GalleryModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    clearCatalogueCache();
    onClose.mockClear();
    useAppStore.getState().resetToDefault();
    window.location.hash = '#/catalogue';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state then renders catalogue entries', async () => {
    const fetchMock = mockFetchSuccess();
    render(<GalleryModal onClose={onClose} />);

    // Loading state appears first
    expect(screen.getByText('Loading catalogue…')).toBeTruthy();

    // Entries appear after fetch
    await waitFor(() => {
      expect(screen.getByText('Fourth Coffee')).toBeTruthy();
    });
    expect(screen.getByText('Hospital Network')).toBeTruthy();
    expect(screen.getByText('Finance Ledger')).toBeTruthy();
    expect(screen.queryByText('Loading catalogue…')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0].toString()).toMatch(/catalogue\.json$/);
  });

  it('shows error state on fetch failure', async () => {
    mockFetchFailure(500);
    render(<GalleryModal onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load catalogue/)).toBeTruthy();
    });
  });

  it('filters entries by search query (name)', async () => {
    mockFetchSuccess();
    const user = userEvent.setup();
    render(<GalleryModal onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Fourth Coffee')).toBeTruthy();
    });

    const searchInput = screen.getByPlaceholderText(/Search by name/);
    await user.type(searchInput, 'hospital');

    expect(screen.queryByText('Fourth Coffee')).toBeNull();
    expect(screen.getByText('Hospital Network')).toBeTruthy();
    expect(screen.queryByText('Finance Ledger')).toBeNull();
  });

  it('filters entries by search query (tag)', async () => {
    mockFetchSuccess();
    const user = userEvent.setup();
    render(<GalleryModal onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Fourth Coffee')).toBeTruthy();
    });

    const searchInput = screen.getByPlaceholderText(/Search by name/);
    await user.type(searchInput, 'ledger');

    expect(screen.queryByText('Fourth Coffee')).toBeNull();
    expect(screen.queryByText('Hospital Network')).toBeNull();
    expect(screen.getByText('Finance Ledger')).toBeTruthy();
  });

  it('filters entries by license', async () => {
    mockFetchSuccess();
    const user = userEvent.setup();
    render(<GalleryModal onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Fourth Coffee')).toBeTruthy();
    });

    const searchInput = screen.getByPlaceholderText(/Search by name/);
    await user.type(searchInput, 'MIT');

    expect(screen.queryByText('Fourth Coffee')).toBeNull();
    expect(screen.getByText('Hospital Network')).toBeTruthy();
    expect(screen.queryByText('Finance Ledger')).toBeNull();
  });

  it('filters by category', async () => {
    mockFetchSuccess();
    const user = userEvent.setup();
    render(<GalleryModal onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Fourth Coffee')).toBeTruthy();
    });

    // Select healthcare category
    const categorySelect = screen.getByDisplayValue('All categories');
    await user.selectOptions(categorySelect, 'healthcare');

    expect(screen.queryByText('Fourth Coffee')).toBeNull();
    expect(screen.getByText('Hospital Network')).toBeTruthy();
    expect(screen.queryByText('Finance Ledger')).toBeNull();
  });

  it('filters by source (community)', async () => {
    mockFetchSuccess();
    const user = userEvent.setup();
    render(<GalleryModal onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Fourth Coffee')).toBeTruthy();
    });

    const sourceSelect = screen.getByDisplayValue('All sources');
    await user.selectOptions(sourceSelect, 'community');

    expect(screen.queryByText('Fourth Coffee')).toBeNull();
    expect(screen.getByText('Hospital Network')).toBeTruthy();
    expect(screen.queryByText('Finance Ledger')).toBeNull();
  });

  it('shows empty message when no entries match filters', async () => {
    mockFetchSuccess();
    const user = userEvent.setup();
    render(<GalleryModal onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Fourth Coffee')).toBeTruthy();
    });

    const searchInput = screen.getByPlaceholderText(/Search by name/);
    await user.type(searchInput, 'xyznonexistent');

    expect(screen.getByText('No ontologies match your filters.')).toBeTruthy();
  });

  it('preloads one payload and lets the deep-link effect load the ontology once', async () => {
    const fetchMock = mockFetchSuccess();
    const user = userEvent.setup();
    render(<GalleryModal onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Fourth Coffee')).toBeTruthy();
    });

    const initialOntology = useAppStore.getState().currentOntology;
    const loadButtons = screen.getAllByText('Load');
    await user.click(loadButtons[0]);

    await waitFor(() => {
      expect(window.location.hash).toBe(
        '#/catalogue/community/drsmith/hospital-net',
      );
    });
    expect(useAppStore.getState().currentOntology).toBe(initialOntology);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not let a slower selection override a newer selection', async () => {
    const hospitalResponse = deferredResponse();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input.toString();
      if (url.endsWith('/catalogue.json')) {
        return new Response(JSON.stringify(fakeCatalogue), { status: 200 });
      }
      const entry = fakeCatalogue.entries.find((candidate) =>
        url.endsWith(candidate.payloadUrl));
      if (!entry) return new Response('not found', { status: 404 });
      if (entry.id === 'community/drsmith/hospital-net') {
        return hospitalResponse.promise;
      }
      return new Response(
        JSON.stringify(fakePayloads[entry.id], null, 2) + '\n',
        { status: 200 },
      );
    });
    const user = userEvent.setup();
    render(<GalleryModal onClose={onClose} />);
    await screen.findByText('Hospital Network');

    await user.click(screen.getAllByText('Load')[0]);
    await user.click(screen.getByText('Load'));
    await waitFor(() => {
      expect(window.location.hash).toBe(
        '#/catalogue/official/finance-ledger',
      );
    });

    await act(async () => {
      hospitalResponse.resolve(new Response(
        JSON.stringify(
          fakePayloads['community/drsmith/hospital-net'],
          null,
          2,
        ) + '\n',
        { status: 200 },
      ));
      await hospitalResponse.promise;
    });
    expect(window.location.hash).toBe(
      '#/catalogue/official/finance-ledger',
    );
  });

  it('does not navigate after the gallery is dismissed during a load', async () => {
    const hospitalResponse = deferredResponse();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input.toString();
      if (url.endsWith('/catalogue.json')) {
        return new Response(JSON.stringify(fakeCatalogue), { status: 200 });
      }
      return hospitalResponse.promise;
    });
    const user = userEvent.setup();
    render(<GalleryModal onClose={onClose} />);
    await screen.findByText('Hospital Network');

    await user.click(screen.getAllByText('Load')[0]);
    await user.click(screen.getByText('Done'));
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      hospitalResponse.resolve(new Response(
        JSON.stringify(
          fakePayloads['community/drsmith/hospital-net'],
          null,
          2,
        ) + '\n',
        { status: 200 },
      ));
      await hospitalResponse.promise;
    });
    expect(window.location.hash).toBe('#/catalogue');
  });

  it('does not enter Designer after browser history leaves the gallery', async () => {
    const payloadResponse = deferredResponse();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (input.toString().endsWith('/catalogue.json')) {
        return new Response(JSON.stringify(fakeCatalogue), { status: 200 });
      }
      return payloadResponse.promise;
    });
    const initialOntology = useAppStore.getState().currentOntology;
    const initialDraft = useDesignerStore.getState().ontology;
    const user = userEvent.setup();
    render(<GalleryModal onClose={onClose} />);
    await screen.findByText('Fourth Coffee');

    await user.click(screen.getAllByTitle('Edit in Designer')[0]);
    act(() => {
      window.history.pushState(null, '', '#/');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    await act(async () => {
      payloadResponse.resolve(new Response(
        JSON.stringify(
          fakePayloads['official/cosmic-coffee'],
          null,
          2,
        ) + '\n',
        { status: 200 },
      ));
      await payloadResponse.promise;
    });

    expect(window.location.hash).toBe('#/');
    expect(useAppStore.getState().currentOntology).toBe(initialOntology);
    expect(useDesignerStore.getState().ontology).toBe(initialDraft);
  });

  it('surfaces payload failures without loading an empty ontology', async () => {
    mockFetchSuccess(fakeCatalogue, {
      'community/drsmith/hospital-net': 503,
    });
    const user = userEvent.setup();
    render(<GalleryModal onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Hospital Network')).toBeTruthy();
    });
    await user.click(screen.getAllByText('Load')[0]);

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain(
        'Failed to load ontology "community/drsmith/hospital-net" (503)',
      );
    });
    expect(useAppStore.getState().currentOntology.name).not.toBe('Hospital Network');
  });

  it('shows "Community" badge only on community entries', async () => {
    mockFetchSuccess();
    render(<GalleryModal onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Fourth Coffee')).toBeTruthy();
    });

    // "Community" appears in the source filter dropdown AND as a badge.
    // Only Hospital Network is community, so there should be exactly 1 badge
    // plus 1 option in the dropdown = 2 total.
    const allCommunity = screen.getAllByText('Community');
    expect(allCommunity).toHaveLength(2); // 1 dropdown option + 1 badge

    // The badge is a <span> inside a card, the option is in a <select>
    const badges = allCommunity.filter((el) => el.tagName !== 'OPTION');
    expect(badges).toHaveLength(1);
  });

  it('shows license, version, and a safe upstream source link', async () => {
    mockFetchSuccess();
    render(<GalleryModal onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Hospital Network')).toBeTruthy();
    });

    expect(screen.getByText('License: MIT')).toBeTruthy();
    expect(screen.getByText('Version: 1.2.0')).toBeTruthy();

    const sourceLink = screen.getByRole('link', {
      name: 'View upstream source for Hospital Network',
    });
    expect(sourceLink.getAttribute('href')).toBe('https://example.com/hospital-network');
    expect(sourceLink.getAttribute('target')).toBe('_blank');
    expect(sourceLink.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('loads and identifies the hash-verified original source', async () => {
    const fetchMock = mockFetchSuccess();
    const user = userEvent.setup();
    render(<GalleryModal onClose={onClose} />);

    await screen.findByText('Fourth Coffee');
    await user.click(screen.getByRole('button', {
      name: 'View original RDF source for Fourth Coffee',
    }));

    expect(await screen.findByText('Original reviewed RDF source')).toBeTruthy();
    expect(Array.from(document.querySelectorAll('pre')).some(
      (element) =>
        element.textContent === fakeSources['official/cosmic-coffee'],
    )).toBe(true);
    expect(Array.from(document.querySelectorAll('code')).some(
      (element) =>
        element.textContent?.includes(
          fakeCatalogue.entries[0].sourceArtifactHash,
        ),
    )).toBe(true);
    expect(fetchMock.mock.calls.some(([input]) =>
      input.toString().endsWith(
        fakeCatalogue.entries[0].sourceArtifactUrl,
      ),
    )).toBe(true);
    expect(fetchMock.mock.calls.some(([input]) =>
      input.toString() === fakeCatalogue.entries[0].sourceUrl,
    )).toBe(false);
  });

  it('labels external graphs as projections and presents complete RDF', async () => {
    mockFetchSuccess();
    const user = userEvent.setup();
    render(<GalleryModal onClose={onClose} />);

    await screen.findByText('Finance Ledger');
    const note = screen.getByRole('note');
    expect(note.classList.contains('source-fidelity-note')).toBe(true);
    expect(note.querySelector('.lucide-info')).toBeTruthy();
    expect(note.textContent).toContain(
      'The graph is a visual projection',
    );
    expect(note.textContent).toContain(
      'Designer preserves the complete verified RDF source',
    );

    await user.click(screen.getByRole('button', {
      name: 'View original RDF source for Finance Ledger',
    }));

    expect(await screen.findByText(
      'Original reviewed RDF source',
    )).toBeTruthy();
    expect(document.querySelector('pre')?.textContent).toBe(
      fakeSources['official/finance-ledger'],
    );
  });

  it('displays entity and relationship counts', async () => {
    mockFetchSuccess();
    render(<GalleryModal onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Fourth Coffee')).toBeTruthy();
    });

    // Fourth Coffee: 3 entities, 2 relationships
    expect(screen.getByText('3 entities')).toBeTruthy();
    expect(screen.getByText('2 relationships')).toBeTruthy();
    // Hospital Network: 4 entities, 3 relationships
    expect(screen.getByText('4 entities')).toBeTruthy();
    expect(screen.getByText('3 relationships')).toBeTruthy();
  });

  it('Edit in Designer loads ontology into designer store and navigates to designer', async () => {
    mockFetchSuccess();
    const user = userEvent.setup();
    render(<GalleryModal onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Fourth Coffee')).toBeTruthy();
    });

    // Click the "Edit in Designer" pencil button for the first entry
    const editButtons = screen.getAllByTitle('Edit in Designer');
    expect(editButtons.length).toBeGreaterThan(0);
    await user.click(editButtons[0]);

    await waitFor(() => {
      expect(useDesignerStore.getState().ontology.name).toBe('Fourth Coffee');
    });
    expect(useDesignerStore.getState().ontology.entityTypes).toHaveLength(3);
    expect(useDesignerStore.getState().ontology.relationships).toHaveLength(2);

    // The app store (playground) should also have the ontology loaded
    const appState = useAppStore.getState();
    expect(appState.currentOntology.name).toBe('Fourth Coffee');
    expect(appState.currentOntology.entityTypes).toHaveLength(3);
    expect(appState.currentCatalogueEntry?.id).toBe(
      'official/cosmic-coffee',
    );

    // Should navigate to designer, NOT to home
    expect(window.location.hash).toBe('#/designer');

    // onClose should NOT be called (navigation handles unmounting)
    expect(onClose).not.toHaveBeenCalled();
  });

  it('disables Designer entry for catalogue ontologies above the safe graph limit', async () => {
    const largeEntry: CatalogueEntry = {
      ...fakeCatalogue.entries[0],
      id: 'official/large-ontology',
      name: 'Large Ontology',
      entityCount: 1_000,
      relationshipCount: 0,
      payloadUrl:
        `catalogue-payloads/official/large-ontology/${'c'.repeat(64)}.json`,
      payloadHash: `sha256:${'c'.repeat(64)}`,
      sourceArtifactUrl:
        `catalogue-sources/official/large-ontology/${'d'.repeat(64)}.rdf`,
      sourceArtifactHash: `sha256:${'d'.repeat(64)}`,
    };
    mockFetchSuccess({
      ...fakeCatalogue,
      count: fakeCatalogue.count + 1,
      entries: [largeEntry, ...fakeCatalogue.entries],
    });
    render(<GalleryModal onClose={onClose} />);

    await screen.findByText('Large Ontology');

    const editButton = screen.getByTitle(
      'Large Ontology contains 1,000 graph elements, which is too large for safe all-at-once editing. Open it in the catalogue viewer instead.',
    );
    expect(editButton).toBeDisabled();
    expect(window.location.hash).toBe('#/catalogue');
  });
});
