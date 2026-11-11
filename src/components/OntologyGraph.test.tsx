import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ontology, Relationship } from '../data/ontology';
import {
  createGraphView,
  LARGE_GRAPH_LONG_TASK_BUDGET_MS,
  LARGE_GRAPH_RETAINED_HEAP_BUDGET_BYTES,
  MAX_RENDERED_EDGES,
  MAX_RENDERED_NODES,
} from '../lib/graphView';
import { useAppStore } from '../store/appStore';
import { describeOntologyGraph } from '../lib/graphA11y';
import { OntologyGraph } from './OntologyGraph';

const graphMocks = vi.hoisted(() => {
  const collection: Record<string, unknown> & { length: number } = { length: 1 };
  const chain = vi.fn(() => collection);
  const addClass = vi.fn(() => collection);
  const removeClass = vi.fn(() => collection);
  const connectedEdges = vi.fn(() => collection);
  Object.assign(collection, {
    addClass,
    removeClass,
    unselect: chain,
    select: chain,
    style: chain,
    not: chain,
    connectedEdges,
    connectedNodes: chain,
    closedNeighborhood: chain,
    toggleClass: chain,
    forEach: vi.fn((callback: (node: {
      id: () => string;
      position: () => { x: number; y: number };
    }) => void) => {
      callback({
        id: () => 'node-0',
        position: () => ({ x: 100, y: 100 }),
      });
    }),
    renderedBoundingBox: vi.fn(() => ({
      x1: 200,
      y1: 200,
      x2: 240,
      y2: 240,
      w: 40,
      h: 40,
    })),
    boundingBox: vi.fn(() => ({
      x1: 0,
      y1: 0,
      x2: 800,
      y2: 600,
      w: 800,
      h: 600,
    })),
  });

  let autoCompleteLayout = true;
  let layoutStopHandler: (() => void) | null = null;
  const emitLayoutStop = () => {
    const handler = layoutStopHandler;
    layoutStopHandler = null;
    handler?.();
  };
  const layout = {
    one: vi.fn((eventName: string, handler: () => void) => {
      if (eventName === 'layoutstop') {
        layoutStopHandler = handler;
      }
      return layout;
    }),
    run: vi.fn(() => {
      if (autoCompleteLayout) {
        emitLayoutStop();
      }
      return layout;
    }),
    stop: vi.fn(() => {
      emitLayoutStop();
      return layout;
    }),
  };
  const cy = {
    on: vi.fn(),
    off: vi.fn(),
    destroy: vi.fn(),
    destroyed: vi.fn(() => false),
    container: vi.fn(() => ({})),
    elements: vi.fn(() => collection),
    edges: vi.fn(() => collection),
    nodes: vi.fn(() => collection),
    $: vi.fn(() => collection),
    getElementById: vi.fn(() => collection),
    layout: vi.fn(() => layout),
    zoom: vi.fn(() => 1),
    pan: vi.fn(() => ({ x: 123, y: 77 })),
    width: vi.fn(() => 800),
    height: vi.fn(() => 600),
    center: vi.fn(),
    fit: vi.fn(),
    png: vi.fn(async () => {
      const bytes = new Uint8Array(67);
      bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
      return new Blob([bytes], { type: 'image/png' });
    }),
  };
  const cytoscape = vi.fn(() => cy);
  return {
    addClass,
    connectedEdges,
    cy,
    cytoscape,
    layout,
    setAutoCompleteLayout(value: boolean) {
      autoCompleteLayout = value;
    },
    resetLayout() {
      autoCompleteLayout = true;
      layoutStopHandler = null;
    },
  };
});

vi.mock('cytoscape', () => {
  Object.assign(graphMocks.cytoscape, { use: vi.fn() });
  return { default: graphMocks.cytoscape };
});

vi.mock('cytoscape-fcose', () => ({ default: vi.fn() }));

function createLargeFixture(
  nodeCount = 350,
  relationshipCount = nodeCount - 1,
): Ontology {
  const entityTypes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `node-${index}`,
    name: `Node ${index}`,
    description: `Taxonomy node ${index}`,
    properties: [],
    icon: 'N',
    color: '#0078D4',
  }));
  const relationships: Relationship[] = entityTypes.slice(1).map((entity, index) => ({
    id: `parent-${index + 1}`,
    name: 'subClassOf',
    from: entity.id,
    to: entityTypes[Math.floor(index / 3)].id,
    cardinality: 'many-to-one',
    kind: 'subclass',
  }));
  for (
    let index = 0;
    relationships.length < relationshipCount;
    index += 1
  ) {
    relationships.push({
      id: `related-${index}`,
      name: 'relatedTo',
      from: entityTypes[index % entityTypes.length].id,
      to: entityTypes[(index + 17) % entityTypes.length].id,
      cardinality: 'many-to-many',
    });
  }

  return {
    name: 'Large Taxonomy Fixture',
    description: 'Large rendering fixture',
    entityTypes,
    relationships,
  };
}

function createDenseFixture(): Ontology {
  const entityTypes = Array.from({ length: 90 }, (_, index) => ({
    id: `dense-${index}`,
    name: `Dense ${index}`,
    description: `Dense node ${index}`,
    properties: [],
    icon: 'D',
    color: '#0078D4',
  }));
  const relationships: Relationship[] = entityTypes.slice(1).map((entity) => ({
    id: `dense-edge-${entity.id}`,
    name: 'connectedTo',
    from: entity.id,
    to: entityTypes[0].id,
    cardinality: 'many-to-one',
  }));

  return {
    name: 'Dense Graph Fixture',
    description: 'Dense rendering fixture',
    entityTypes,
    relationships,
  };
}

function createWideInheritanceFixture(): Ontology {
  const root = {
    id: 'root',
    name: 'Root',
    description: 'Wide hierarchy root',
    properties: [],
    icon: 'R',
    color: '#0078D4',
  };
  const children = Array.from({ length: 349 }, (_, index) => ({
    id: `child-${index}`,
    name: `Child ${index}`,
    description: `Wide hierarchy child ${index}`,
    properties: [],
    icon: 'C',
    color: '#107C10',
  }));

  return {
    name: 'Wide Inheritance Fixture',
    description: 'A root with more children than the graph budget',
    entityTypes: [root, ...children],
    relationships: children.map((child, index) => ({
      id: `parent-${index}`,
      name: 'subClassOf',
      from: child.id,
      to: root.id,
      cardinality: 'many-to-one',
      kind: 'subclass',
    })),
  };
}

interface CapturedConfig {
  elements: Array<{ data: { id: string } }>;
  layout: { name: string; quality?: string };
  style: Array<{
    selector: string;
    style: Record<string, unknown>;
  }>;
}

describe('OntologyGraph adaptive rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    graphMocks.resetLayout();
    useAppStore.getState().resetToDefault();
    localStorage.removeItem('ontology-legend-collapsed');
    delete window.__ONTOLOGY_PREVIEW_CY__;
    delete window.__ONTOLOGY_GRAPH_METRICS__;
    delete window.__ONTOLOGY_GRAPH_PERFORMANCE_ENABLED__;
    delete window.__ONTOLOGY_GRAPH_PAGE_MAX_LONG_TASK_MS__;
    delete window.__ONTOLOGY_GRAPH_LAYOUT_ANIMATION_MS__;
    window.__ONTOLOGY_GRAPH_LAYOUT_DELAY_MS__ = 0;
  });

  it('exposes a named canvas without hiding controls or changing canvas focus', async () => {
    const user = userEvent.setup();
    render(<OntologyGraph />);
    const canvas = screen.getByRole('img', {
      name: describeOntologyGraph(useAppStore.getState().currentOntology),
    });
    expect(canvas).toHaveClass('graph-canvas');
    expect(canvas).not.toHaveAttribute('tabindex');
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
    const zoomOut = screen.getByRole('button', { name: 'Zoom out' });
    const fit = screen.getByRole('button', { name: 'Fit graph to view' });
    const reset = screen.getByRole('button', { name: 'Reset graph layout' });
    const download = screen.getByRole('button', { name: 'Download Graph as PNG' });
    for (const control of [zoomIn, zoomOut, fit, reset, download]) {
      expect(canvas).not.toContainElement(control);
      expect(control).toHaveAttribute('title');
    }
    expect(canvas).not.toContainElement(
      screen.getByRole('button', { name: 'Hide Entity Types legend' }),
    );
    zoomIn.focus();
    await user.keyboard('{Enter}');
    expect(graphMocks.cy.zoom).toHaveBeenCalledWith({
      level: 1.3,
      renderedPosition: { x: 400, y: 300 },
    });
    await user.click(zoomOut);
    expect(graphMocks.cy.zoom).toHaveBeenCalledWith({
      level: 0.7,
      renderedPosition: { x: 400, y: 300 },
    });
    await user.click(fit);
    expect(graphMocks.cy.fit).toHaveBeenCalledWith(undefined, 60);
    await user.click(reset);
    expect(graphMocks.cy.layout).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'fcose', quality: 'proof' }),
    );
  });

  it('updates the canvas summary when loading another ontology without adding layouts', async () => {
    render(<OntologyGraph />);
    const canvas = screen.getByRole('img');
    expect(canvas).toHaveAccessibleName(
      describeOntologyGraph(useAppStore.getState().currentOntology),
    );
    const nextOntology = createDenseFixture();
    act(() => useAppStore.getState().loadOntology(nextOntology));
    expect(canvas).toHaveAccessibleName(
      'Dense Graph Fixture ontology graph: 90 entity types, 89 relationships. Interactive diagram.',
    );
    await waitFor(() => expect(graphMocks.cytoscape).toHaveBeenCalledTimes(2));
  });

  it('exposes the loaded catalogue identity and clears it for non-catalogue graphs', () => {
    const ontology = createDenseFixture();
    const entry = {
      id: 'official/preview-fixture',
      name: ontology.name,
      description: ontology.description,
      category: 'Education',
      tags: [],
      author: 'Ontology Playground',
      source: 'official' as const,
      entityCount: ontology.entityTypes.length,
      relationshipCount: ontology.relationships.length,
      payloadUrl: '/preview-fixture.json',
      payloadHash: `sha256:${'a'.repeat(64)}`,
    };
    useAppStore.getState().loadOntology(ontology, [], entry);
    render(<OntologyGraph />);
    const canvas = screen.getByTestId('ontology-graph-canvas');
    expect(canvas).toHaveAttribute('data-catalogue-id', entry.id);
    expect(canvas).toHaveAttribute('data-layout-status', 'idle');
    expect(screen.getByRole('button', {
      name: 'Show Entity Types legend',
    })).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelector('.legend-item')).toBeNull();
    act(() => useAppStore.getState().loadOntology(createDenseFixture()));
    expect(canvas).not.toHaveAttribute('data-catalogue-id');
  });

  it('names the bounded projection and updates visible counts with semantic detail', async () => {
    const ontology = createLargeFixture();
    useAppStore.getState().loadOntology(ontology);
    render(<OntologyGraph />);
    const canvas = screen.getByRole('img');
    const initialView = createGraphView(ontology, { depth: 1 });
    expect(canvas).toHaveAccessibleName(
      describeOntologyGraph(ontology, initialView),
    );
    expect(canvas).not.toContainElement(
      screen.getByRole('region', { name: 'Large ontology controls' }),
    );
    expect(screen.getByRole('button', {
      name: 'Download Visible Graph as PNG',
    })).toBeEnabled();
    await waitFor(() => expect(graphMocks.cytoscape).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole('slider', { name: 'Detail: 1 hop' }), {
      target: { value: '2' },
    });
    const detailedView = createGraphView(ontology, { depth: 2 });
    expect(detailedView.visibleNodeCount).not.toBe(initialView.visibleNodeCount);
    expect(canvas).toHaveAccessibleName(
      describeOntologyGraph(ontology, detailedView),
    );
    await waitFor(() => expect(graphMocks.cytoscape).toHaveBeenCalledTimes(2));
  });

  it('preserves the proof-quality layout for a small ontology', async () => {
    render(<OntologyGraph />);

    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(1);
    });

    const config = graphMocks.cytoscape.mock.calls[0][0] as CapturedConfig;
    expect(config.layout.name).toBe('fcose');
    expect(config.layout.quality).toBe('proof');
    expect(
      screen.getByRole('button', { name: 'Hide Entity Types legend' }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.queryByRole('region', { name: 'Large ontology controls' }),
    ).not.toBeInTheDocument();
  });

  it('renders a bounded semantic overview for a massive ontology', async () => {
    useAppStore.getState().loadOntology(createLargeFixture());

    render(<OntologyGraph />);

    expect(
      screen.getByRole('region', { name: 'Large ontology controls' }),
    ).toHaveTextContent('Showing');
    expect(
      screen.queryByRole('button', { name: /Entity Types legend/ }),
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(1);
    });

    const config = graphMocks.cytoscape.mock.calls[0][0] as CapturedConfig;
    expect(config.layout.name).toBe('preset');
    expect(graphMocks.cy.layout).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'breadthfirst',
        animate: true,
      }),
    );
    expect(config.elements.length).toBeLessThanOrEqual(
      MAX_RENDERED_NODES + MAX_RENDERED_EDGES,
    );
    expect(config.elements.length).toBeLessThan(350 + 349);
    expect(config.style).toContainEqual(expect.objectContaining({
      selector: 'edge.hovered',
      style: expect.objectContaining({ label: 'data(label)' }),
    }));
    expect(config.style).toContainEqual(expect.objectContaining({
      selector: 'edge.selected-node-edge',
      style: expect.objectContaining({
        label: 'data(label)',
        'min-zoomed-font-size': 0,
      }),
    }));
    expect(graphMocks.cy.on).toHaveBeenCalledWith(
      'mouseover',
      'edge',
      expect.any(Function),
    );
    expect(graphMocks.cy.on).toHaveBeenCalledWith(
      'mouseout',
      'edge',
      expect.any(Function),
    );

    const resetView = screen.getByRole('button', { name: 'Reset view' });
    const detailSlider = screen.getByRole('slider', { name: 'Detail: 1 hop' });
    expect(detailSlider.parentElement).toHaveClass('large-graph-options');
    expect(detailSlider.previousElementSibling).toHaveClass('large-graph-detail-header');
    expect(resetView).toBeDisabled();
    expect(
      screen.getByRole('button', {
        name: 'Select a +N entity to show neighbors',
      }),
    ).toBeDisabled();
    expect(Number(detailSlider.getAttribute('max'))).toBeGreaterThan(1);
    fireEvent.change(detailSlider, {
      target: { value: '2' },
    });
    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByRole('slider', { name: 'Detail: 2 hops' })).toHaveValue('2');
    expect(resetView).toBeEnabled();
  });

  it('lays out a newly loaded massive ontology exactly once', async () => {
    render(<OntologyGraph />);
    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(1);
    });

    act(() => {
      useAppStore.getState().loadOntology(createLargeFixture());
    });
    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(2);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(graphMocks.cytoscape).toHaveBeenCalledTimes(2);
  });

  it('records the Brick-scale rendering budgets', async () => {
    window.__ONTOLOGY_GRAPH_PERFORMANCE_ENABLED__ = true;
    useAppStore.getState().loadOntology(
      createLargeFixture(1_518, 1_736),
    );

    render(<OntologyGraph />);
    await waitFor(() => {
      expect(window.__ONTOLOGY_GRAPH_METRICS__?.status).toBe('idle');
    });

    expect(window.__ONTOLOGY_GRAPH_METRICS__).toMatchObject({
      totalNodeCount: 1_518,
      totalEdgeCount: 1_736,
      layoutCount: 1,
      status: 'idle',
    });
    expect(
      window.__ONTOLOGY_GRAPH_METRICS__?.renderedNodeCount,
    ).toBeLessThanOrEqual(MAX_RENDERED_NODES);
    expect(
      window.__ONTOLOGY_GRAPH_METRICS__?.renderedEdgeCount,
    ).toBeLessThanOrEqual(MAX_RENDERED_EDGES);
    expect(
      window.__ONTOLOGY_GRAPH_METRICS__?.lastLayoutDurationMs,
    ).toBeLessThan(LARGE_GRAPH_LONG_TASK_BUDGET_MS);
    expect(
      window.__ONTOLOGY_GRAPH_METRICS__?.maxLongTaskDurationMs,
    ).toBeLessThan(LARGE_GRAPH_LONG_TASK_BUDGET_MS);
    const heapBytes = window.__ONTOLOGY_GRAPH_METRICS__?.retainedHeapBytes;
    if (heapBytes != null) {
      expect(heapBytes).toBeLessThan(
        LARGE_GRAPH_RETAINED_HEAP_BUDGET_BYTES,
      );
    }

    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Jump to an entity' }),
      { target: { value: 'Node 100' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));
    await waitFor(() => {
      expect(window.__ONTOLOGY_GRAPH_METRICS__?.layoutCount).toBe(2);
    });
    expect(
      window.__ONTOLOGY_GRAPH_METRICS__?.lastInteractionDurationMs,
    ).toEqual(expect.any(Number));
  });

  it('cancels and resumes a scheduled massive graph layout', () => {
    vi.useFakeTimers();
    window.__ONTOLOGY_GRAPH_LAYOUT_DELAY_MS__ = 1_000;
    try {
      useAppStore.getState().loadOntology(createLargeFixture());
      render(<OntologyGraph />);
      const canvas = screen.getByTestId('ontology-graph-canvas');
      expect(canvas).toHaveAttribute('data-layout-status', 'scheduled');

      fireEvent.click(
        screen.getByRole('button', { name: 'Cancel rendering' }),
      );
      act(() => {
        vi.runAllTimers();
      });
      expect(screen.getByText('Rendering paused')).toBeInTheDocument();
      expect(canvas).toHaveAttribute('data-layout-status', 'cancelled');
      expect(graphMocks.cytoscape).not.toHaveBeenCalled();

      fireEvent.click(
        screen.getByRole('button', { name: 'Resume rendering' }),
      );
      act(() => {
        vi.advanceTimersByTime(1_000);
      });
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(1);
      expect(canvas).toHaveAttribute('data-layout-status', 'idle');
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops and resumes an active massive graph layout', () => {
    vi.useFakeTimers();
    graphMocks.setAutoCompleteLayout(false);
    try {
      useAppStore.getState().loadOntology(createLargeFixture());
      render(<OntologyGraph />);

      act(() => {
        vi.advanceTimersByTime(0);
      });
      expect(screen.getByText('Laying out bounded graph')).toBeInTheDocument();
      expect(screen.getByTestId('ontology-graph-canvas'))
        .toHaveAttribute('data-layout-status', 'running');
      expect(graphMocks.layout.run).toHaveBeenCalledTimes(1);

      fireEvent.click(
        screen.getByRole('button', { name: 'Cancel rendering' }),
      );
      expect(graphMocks.layout.stop).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Rendering paused')).toBeInTheDocument();

      graphMocks.setAutoCompleteLayout(true);
      fireEvent.click(
        screen.getByRole('button', { name: 'Resume rendering' }),
      );
      act(() => {
        vi.advanceTimersByTime(0);
      });
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(2);
      expect(screen.queryByText('Rendering paused')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries a failed standard graph layout', async () => {
    graphMocks.cytoscape.mockImplementationOnce(() => {
      throw new Error('Layout failed once');
    });

    render(<OntologyGraph />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Layout failed once',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('applies a view change before a scheduled layout starts', () => {
    vi.useFakeTimers();
    window.__ONTOLOGY_GRAPH_LAYOUT_DELAY_MS__ = 1_000;
    try {
      useAppStore.getState().loadOntology(createLargeFixture());
      render(<OntologyGraph />);

      fireEvent.change(
        screen.getByRole('searchbox', { name: 'Jump to an entity' }),
        { target: { value: 'Node 349' } },
      );
      fireEvent.click(screen.getByRole('button', { name: 'Find' }));
      act(() => {
        vi.advanceTimersByTime(1_000);
      });

      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(1);
      const config = graphMocks.cytoscape.mock.calls[0][0] as CapturedConfig;
      expect(config.elements).toContainEqual(
        expect.objectContaining({
          data: expect.objectContaining({ id: 'node-349' }),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps relationship labels occluded for selected dense graph hubs', async () => {
    useAppStore.getState().loadOntology(createDenseFixture());
    render(<OntologyGraph />);
    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(1);
    });

    const config = graphMocks.cytoscape.mock.calls[0][0] as CapturedConfig;
    expect(config.style).toContainEqual(expect.objectContaining({
      selector: 'edge',
      style: expect.objectContaining({ label: '' }),
    }));

    act(() => {
      useAppStore.getState().selectEntity('dense-0');
    });

    expect(graphMocks.connectedEdges).toHaveBeenCalled();
    expect(graphMocks.addClass).not.toHaveBeenCalledWith(
      'selected-node-edge',
    );
  });

  it('lets a visible boundary entity expand and collapse without a dead end', async () => {
    const ontology = createLargeFixture();
    const initialView = createGraphView(ontology);
    const boundary = [...initialView.hiddenNeighborCounts.entries()][0];
    expect(boundary).toBeDefined();
    const [boundaryId, hiddenNeighborCount] = boundary!;

    useAppStore.getState().loadOntology(ontology);
    render(<OntologyGraph />);
    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(1);
    });
    const initialConfig = graphMocks.cytoscape.mock.calls[0][0] as CapturedConfig;
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));

    act(() => {
      useAppStore.getState().selectEntity(boundaryId);
    });

    const boundaryName = ontology.entityTypes.find(
      ({ id }) => id === boundaryId,
    )?.name;
    const expandButton = await screen.findByRole('button', {
      name: `Expand ${boundaryName} to show ${hiddenNeighborCount} hidden ${
        hiddenNeighborCount === 1 ? 'neighbor' : 'neighbors'
      }`,
    });
    expect(expandButton).toHaveClass(
      'graph-neighbor-action',
      'graph-neighbor-action--above',
    );
    expect(expandButton).toHaveStyle({ left: '220px', top: '190px' });
    expect(graphMocks.cytoscape).toHaveBeenCalledTimes(1);
    expect(graphMocks.connectedEdges).toHaveBeenCalled();
    expect(graphMocks.addClass).toHaveBeenCalledWith('selected-node-edge');

    graphMocks.addClass.mockClear();
    fireEvent.click(expandButton);
    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(2);
    });
    expect(graphMocks.addClass).toHaveBeenCalledWith('selected-node-edge');
    expect(screen.queryByRole('button', {
      name: `Expand ${boundaryName} to show ${hiddenNeighborCount} hidden ${
        hiddenNeighborCount === 1 ? 'neighbor' : 'neighbors'
      }`,
    })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const collapseButton = screen.getByRole('button', {
      name: `Hide shown neighbors for ${boundaryName}`,
    });
    expect(collapseButton).toBeEnabled();
    fireEvent.click(collapseButton);
    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(3);
    });
    const explicitlyCollapsedConfig =
      graphMocks.cytoscape.mock.calls[2][0] as CapturedConfig;
    expect(explicitlyCollapsedConfig.elements).toHaveLength(
      initialConfig.elements.length,
    );
    const panelExpandButton = screen.getByRole('button', {
      name: `Show ${hiddenNeighborCount} hidden ${
        hiddenNeighborCount === 1 ? 'neighbor' : 'neighbors'
      } for ${boundaryName}`,
    });
    expect(panelExpandButton).toBeEnabled();
    fireEvent.click(panelExpandButton);
    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(4);
    });

    fireEvent.change(screen.getByRole('slider', { name: 'Detail: 1 hop' }), {
      target: { value: '2' },
    });
    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(5);
    });
    expect(useAppStore.getState().selectedEntityId).toBeNull();
    expect(useAppStore.getState().selectedRelationshipId).toBeNull();
    expect(
      screen.getByRole('button', {
        name: 'Select a +N entity to show neighbors',
      }),
    ).toBeDisabled();
    fireEvent.change(screen.getByRole('slider', { name: 'Detail: 2 hops' }), {
      target: { value: '1' },
    });
    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(6);
    });

    const collapsedConfig =
      graphMocks.cytoscape.mock.calls[5][0] as CapturedConfig;
    expect(collapsedConfig.elements).toHaveLength(initialConfig.elements.length);
    expect(
      screen.getByRole('button', {
        name: 'Select a +N entity to show neighbors',
      }),
    ).toBeDisabled();
  });

  it('keeps partial expansions reversible and explains the view limit', async () => {
    const ontology = createWideInheritanceFixture();
    const initialView = createGraphView(ontology);
    const initialHiddenCount = initialView.hiddenNeighborCounts.get('root');
    expect(initialHiddenCount).toBe(290);

    useAppStore.getState().loadOntology(ontology);
    render(<OntologyGraph />);
    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(1);
    });
    act(() => {
      useAppStore.getState().selectEntity('root');
    });

    fireEvent.click(screen.getByRole('button', {
      name: `Show ${initialHiddenCount} hidden neighbors for Root`,
    }));
    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(2);
    });

    expect(screen.getByRole('button', {
      name: 'Hide shown neighbors for Root',
    })).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      '170 neighbors remain hidden because the 180-entity view limit is full.',
    );
    expect(screen.queryByRole('button', {
      name: /Expand Root to show/,
    })).not.toBeInTheDocument();
  });

  it('preserves unrelated highlighted reveals when collapsing neighbors', async () => {
    const ontology = createLargeFixture();
    const highlightedEntityId = 'node-349';
    const initialView = createGraphView(ontology);
    const boundary = [...initialView.hiddenNeighborCounts.entries()][0];
    expect(boundary).toBeDefined();
    const [boundaryId, hiddenNeighborCount] = boundary!;
    const boundaryName = ontology.entityTypes.find(
      ({ id }) => id === boundaryId,
    )?.name;

    useAppStore.getState().loadOntology(ontology);
    render(<OntologyGraph />);
    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(1);
    });
    act(() => {
      useAppStore.getState().setHighlightedEntities([highlightedEntityId]);
    });
    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(2);
    });
    act(() => {
      useAppStore.getState().selectEntity(boundaryId);
    });

    const expandButton = await screen.findByRole('button', {
      name: `Show ${hiddenNeighborCount} hidden ${
        hiddenNeighborCount === 1 ? 'neighbor' : 'neighbors'
      } for ${boundaryName}`,
    });
    const callsBeforeExpansion = graphMocks.cytoscape.mock.calls.length;
    fireEvent.click(expandButton);
    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(
        callsBeforeExpansion + 1,
      );
    });

    const callsBeforeCollapse = graphMocks.cytoscape.mock.calls.length;
    fireEvent.click(screen.getByRole('button', {
      name: `Hide shown neighbors for ${boundaryName}`,
    }));
    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(
        callsBeforeCollapse + 1,
      );
    });

    expect(useAppStore.getState().highlightedEntities).toEqual([
      highlightedEntityId,
    ]);
    const collapsedConfig =
      graphMocks.cytoscape.mock.calls.at(-1)?.[0] as CapturedConfig;
    expect(collapsedConfig.elements).toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({ id: highlightedEntityId }),
      }),
    );
  });

  it('retains an off-projection highlight after a detail change clears focus', async () => {
    const ontology = createLargeFixture();
    const initialView = createGraphView(ontology);
    const highlightedEntityId = 'node-349';
    expect(initialView.entities.some(({ id }) => id === highlightedEntityId))
      .toBe(false);
    const boundaryId = [...initialView.hiddenNeighborCounts.keys()][0];
    expect(boundaryId).toBeDefined();

    useAppStore.getState().loadOntology(ontology);
    render(<OntologyGraph />);
    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(1);
    });
    act(() => {
      useAppStore.getState().setHighlightedEntities([highlightedEntityId]);
      useAppStore.getState().selectEntity(boundaryId);
    });
    await waitFor(() => {
      expect(graphMocks.addClass).toHaveBeenCalledWith('highlighted');
    });
    const callsBeforeDepthChange = graphMocks.cytoscape.mock.calls.length;
    graphMocks.addClass.mockClear();

    fireEvent.change(screen.getByRole('slider', { name: 'Detail: 1 hop' }), {
      target: { value: '2' },
    });
    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(
        callsBeforeDepthChange + 1,
      );
    });

    expect(useAppStore.getState().selectedEntityId).toBeNull();
    expect(useAppStore.getState().highlightedEntities).toEqual([
      highlightedEntityId,
    ]);
    await waitFor(() => {
      expect(graphMocks.addClass).toHaveBeenCalledWith('highlighted');
    });
    expect(graphMocks.addClass).not.toHaveBeenCalledWith(
      'selected-node-edge',
    );
    const config = graphMocks.cytoscape.mock.calls.at(-1)?.[0] as CapturedConfig;
    expect(config.elements).toContainEqual(expect.objectContaining({
      data: expect.objectContaining({ id: highlightedEntityId }),
    }));
  });

  it('preserves positions and viewport when revealing an external selection', async () => {
    const ontology = createLargeFixture();
    const hiddenEntityId = 'node-349';
    expect(createGraphView(ontology).entities.some(
      ({ id }) => id === hiddenEntityId,
    )).toBe(false);

    useAppStore.getState().loadOntology(ontology);
    render(<OntologyGraph />);
    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(1);
    });

    act(() => {
      useAppStore.getState().selectEntity(hiddenEntityId);
    });
    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(2);
    });

    const config = graphMocks.cytoscape.mock.calls[1][0] as CapturedConfig;
    expect(config.layout.name).toBe('preset');
    expect(config.elements).toContainEqual(expect.objectContaining({
      data: expect.objectContaining({ id: hiddenEntityId }),
    }));
    expect(graphMocks.cy.zoom).toHaveBeenCalledWith(1);
    expect(graphMocks.cy.pan).toHaveBeenCalledWith({ x: 123, y: 77 });
  });

  it('clears a deep selection when lowering hierarchy detail', async () => {
    const ontology = createLargeFixture();
    const initialView = createGraphView(ontology, { depth: 1 });
    const detailedView = createGraphView(ontology, { depth: 2 });
    const initialIds = new Set(initialView.entities.map(({ id }) => id));
    const deepEntity = detailedView.entities.find(
      ({ id }) => !initialIds.has(id),
    );
    expect(deepEntity).toBeDefined();

    useAppStore.getState().loadOntology(ontology);
    render(<OntologyGraph />);
    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(1);
    });
    const initialConfig = graphMocks.cytoscape.mock.calls[0][0] as CapturedConfig;

    fireEvent.change(screen.getByRole('slider', { name: 'Detail: 1 hop' }), {
      target: { value: '2' },
    });
    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(2);
    });
    act(() => {
      useAppStore.getState().selectEntity(deepEntity!.id);
    });
    expect(graphMocks.cytoscape).toHaveBeenCalledTimes(2);

    fireEvent.change(screen.getByRole('slider', { name: 'Detail: 2 hops' }), {
      target: { value: '1' },
    });
    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(3);
    });

    const collapsedConfig =
      graphMocks.cytoscape.mock.calls[2][0] as CapturedConfig;
    expect(collapsedConfig.elements).toHaveLength(initialConfig.elements.length);
    expect(useAppStore.getState().selectedEntityId).toBeNull();
  });

  it('reveals a hidden entity selected from another navigation surface', async () => {
    useAppStore.getState().loadOntology(createLargeFixture());
    render(<OntologyGraph />);
    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(1);
    });

    act(() => {
      useAppStore.getState().selectEntity('node-349');
    });

    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(2);
    });
    const config = graphMocks.cytoscape.mock.calls[1][0] as CapturedConfig;
    expect(config.elements).toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({ id: 'node-349' }),
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }));
    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(3);
    });
    const resetConfig = graphMocks.cytoscape.mock.calls[2][0] as CapturedConfig;
    expect(resetConfig.elements).not.toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({ id: 'node-349' }),
      }),
    );
  });

  it('jumps to a deep entity from the semantic overview search', async () => {
    useAppStore.getState().loadOntology(createLargeFixture());
    render(<OntologyGraph />);
    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByLabelText('Jump to an entity'), {
      target: { value: 'Node 349' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));

    await waitFor(() => {
      expect(graphMocks.cytoscape).toHaveBeenCalledTimes(2);
    });
    const config = graphMocks.cytoscape.mock.calls[1][0] as CapturedConfig;
    expect(config.elements).toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({ id: 'node-349' }),
      }),
    );
    expect(
      screen.getByText('1 matching entity.').closest('.large-graph-status'),
    ).not.toBeNull();
  });

  it('downloads a validated PNG blob within explicit canvas limits', async () => {
    const createObjectURL = vi.fn(() => 'blob:ontology-graph');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    render(<OntologyGraph />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Download Graph as PNG' }),
    );

    await waitFor(() => {
      expect(click).toHaveBeenCalledTimes(1);
    });
    expect(graphMocks.cy.png).toHaveBeenCalledWith({
      maxWidth: 1_600,
      maxHeight: 1_200,
      full: true,
      bg: '#1E1E1E',
      output: 'blob-promise',
    });
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:ontology-graph');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    click.mockRestore();
  });

  it('reports invalid PNG output instead of downloading an empty file', async () => {
    graphMocks.cy.png.mockResolvedValueOnce(
      new Blob([], { type: 'image/png' }),
    );
    const createObjectURL = vi.fn(() => 'blob:empty-graph');
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<OntologyGraph />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Download Graph as PNG' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not create a PNG in this browser.',
    );
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      'PNG export failed',
      expect.any(Error),
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss PNG export error' }),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    click.mockRestore();
    consoleError.mockRestore();
  });
});
