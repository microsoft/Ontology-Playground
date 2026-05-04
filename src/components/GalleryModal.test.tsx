import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GalleryModal } from './GalleryModal';
import { useAppStore } from '../store/appStore';
import { useDesignerStore } from '../store/designerStore';
import type { Catalogue } from '../types/catalogue';
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

const fakeCatalogue: Catalogue = {
  generatedAt: '2025-01-01T00:00:00Z',
  count: 3,
  entries: [
    {
      id: 'official/cosmic-coffee',
      name: 'Cosmic Coffee',
      description: 'Coffee supply chain ontology',
      icon: '☕',
      category: 'retail',
      tags: ['coffee', 'supply-chain'],
      author: 'Ontology Playground',
      source: 'official',
      ontology: makeOntology('Cosmic Coffee', 3, 2),
      bindings: [],
    },
    {
      id: 'community/drsmith/hospital-net',
      name: 'Hospital Network',
      description: 'Healthcare facility ontology',
      icon: '🏥',
      category: 'healthcare',
      tags: ['health', 'hospital'],
      author: 'Dr. Smith',
      source: 'community',
      ontology: makeOntology('Hospital Network', 4, 3),
      bindings: [],
    },
    {
      id: 'official/finance-ledger',
      name: 'Finance Ledger',
      description: 'Financial transactions ontology',
      category: 'finance',
      tags: ['finance', 'ledger'],
      author: 'FinCorp',
      source: 'official',
      ontology: makeOntology('Finance Ledger', 2, 1),
      bindings: [],
    },
  ],
};

function mockFetchSuccess(data: Catalogue = fakeCatalogue) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  } as Response);
}

function mockFetchFailure(status = 404) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: false,
    status,
  } as Response);
}

describe('GalleryModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
    useAppStore.getState().resetToDefault();
    window.location.hash = '#/catalogue';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state then renders catalogue entries', async () => {
    mockFetchSuccess();
    render(<GalleryModal onClose={onClose} />);

    // Loading state appears first
    expect(screen.getByText('Loading catalogue…')).toBeTruthy();

    // Entries appear after fetch
    await waitFor(() => {
      expect(screen.getByText('Cosmic Coffee')).toBeTruthy();
    });
    expect(screen.getByText('Hospital Network')).toBeTruthy();
    expect(screen.getByText('Finance Ledger')).toBeTruthy();
    expect(screen.queryByText('Loading catalogue…')).toBeNull();
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
      expect(screen.getByText('Cosmic Coffee')).toBeTruthy();
    });

    const searchInput = screen.getByPlaceholderText(/Search by name/);
    await user.type(searchInput, 'hospital');

    expect(screen.queryByText('Cosmic Coffee')).toBeNull();
    expect(screen.getByText('Hospital Network')).toBeTruthy();
    expect(screen.queryByText('Finance Ledger')).toBeNull();
  });

  it('filters entries by search query (tag)', async () => {
    mockFetchSuccess();
    const user = userEvent.setup();
    render(<GalleryModal onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Cosmic Coffee')).toBeTruthy();
    });

    const searchInput = screen.getByPlaceholderText(/Search by name/);
    await user.type(searchInput, 'ledger');

    expect(screen.queryByText('Cosmic Coffee')).toBeNull();
    expect(screen.queryByText('Hospital Network')).toBeNull();
    expect(screen.getByText('Finance Ledger')).toBeTruthy();
  });

  it('filters by category', async () => {
    mockFetchSuccess();
    const user = userEvent.setup();
    render(<GalleryModal onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Cosmic Coffee')).toBeTruthy();
    });

    // Select healthcare category
    const categorySelect = screen.getByDisplayValue('All categories');
    await user.selectOptions(categorySelect, 'healthcare');

    expect(screen.queryByText('Cosmic Coffee')).toBeNull();
    expect(screen.getByText('Hospital Network')).toBeTruthy();
    expect(screen.queryByText('Finance Ledger')).toBeNull();
  });

  it('filters by source (community)', async () => {
    mockFetchSuccess();
    const user = userEvent.setup();
    render(<GalleryModal onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Cosmic Coffee')).toBeTruthy();
    });

    const sourceSelect = screen.getByDisplayValue('All sources');
    await user.selectOptions(sourceSelect, 'community');

    expect(screen.queryByText('Cosmic Coffee')).toBeNull();
    expect(screen.getByText('Hospital Network')).toBeTruthy();
    expect(screen.queryByText('Finance Ledger')).toBeNull();
  });

  it('shows empty message when no entries match filters', async () => {
    mockFetchSuccess();
    const user = userEvent.setup();
    render(<GalleryModal onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Cosmic Coffee')).toBeTruthy();
    });

    const searchInput = screen.getByPlaceholderText(/Search by name/);
    await user.type(searchInput, 'xyznonexistent');

    expect(screen.getByText('No ontologies match your filters.')).toBeTruthy();
  });

  it('loads an ontology and navigates to its deep link', async () => {
    mockFetchSuccess();
    const user = userEvent.setup();
    render(<GalleryModal onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Cosmic Coffee')).toBeTruthy();
    });

    // Click the "Load" button for Cosmic Coffee
    const loadButtons = screen.getAllByText('Load');
    await user.click(loadButtons[0]);

    const state = useAppStore.getState();
    expect(state.currentOntology.name).toBe('Cosmic Coffee');
    expect(state.currentOntology.entityTypes).toHaveLength(3);
    // Now navigates to deep link instead of calling onClose
    expect(window.location.hash).toBe('#/catalogue/official/cosmic-coffee');
  });

  it('shows "Community" badge only on community entries', async () => {
    mockFetchSuccess();
    render(<GalleryModal onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Cosmic Coffee')).toBeTruthy();
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

  it('displays entity and relationship counts', async () => {
    mockFetchSuccess();
    render(<GalleryModal onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Cosmic Coffee')).toBeTruthy();
    });

    // Cosmic Coffee: 3 entities, 2 relationships
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
      expect(screen.getByText('Cosmic Coffee')).toBeTruthy();
    });

    // Click the "Edit in Designer" pencil button for the first entry
    const editButtons = screen.getAllByTitle('Edit in Designer');
    expect(editButtons.length).toBeGreaterThan(0);
    await user.click(editButtons[0]);

    // The designer store should have the ontology loaded
    const designerState = useDesignerStore.getState();
    expect(designerState.ontology.name).toBe('Cosmic Coffee');
    expect(designerState.ontology.entityTypes).toHaveLength(3);
    expect(designerState.ontology.relationships).toHaveLength(2);

    // The app store (playground) should also have the ontology loaded
    const appState = useAppStore.getState();
    expect(appState.currentOntology.name).toBe('Cosmic Coffee');
    expect(appState.currentOntology.entityTypes).toHaveLength(3);

    // Should navigate to designer, NOT to home
    expect(window.location.hash).toBe('#/designer');

    // onClose should NOT be called (navigation handles unmounting)
    expect(onClose).not.toHaveBeenCalled();
  });
});
