import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmbedWidget } from './EmbedWidget';
import type { EmbedConfig } from './EmbedWidget';
import type { Ontology } from '../data/ontology';
import { clearCatalogueCache } from '../lib/catalogue';
import type { Catalogue, CatalogueEntryPayload } from '../types/catalogue';
import { createGraphView } from '../lib/graphView';

// Minimal ontology for testing (ASCII-only icons to avoid btoa encoding issues in jsdom)
const testOntology: Ontology = {
  name: 'Test Ontology',
  description: 'A test ontology',
  entityTypes: [
    { id: 'e1', name: 'Customer', description: 'A customer', icon: 'C', color: '#0078D4', properties: [{ name: 'id', type: 'string', isIdentifier: true }, { name: 'name', type: 'string' }] },
    { id: 'e2', name: 'Order', description: 'An order', icon: 'O', color: '#107C10', properties: [{ name: 'orderId', type: 'string', isIdentifier: true }] },
  ],
  relationships: [
    { id: 'r1', name: 'places', from: 'e1', to: 'e2', cardinality: 'one-to-many', description: 'Customer places order' },
  ],
};

const fakePayload: CatalogueEntryPayload = {
  schemaVersion: 1,
  id: 'official/test',
  ontology: testOntology,
  bindings: [],
};
const fakePayloadContent = JSON.stringify(fakePayload, null, 2) + '\n';
const fakePayloadHash = createHash('sha256')
  .update(fakePayloadContent)
  .digest('hex');
const fakeSource = '<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" />\n';
const fakeSourceHash = createHash('sha256')
  .update(fakeSource)
  .digest('hex');

const fakeCatalogue: Catalogue = {
  schemaVersion: 2,
  generatedAt: '2025-01-01T00:00:00Z',
  count: 1,
  entries: [{
    id: 'official/test',
    name: 'Test Ontology',
    description: 'A test',
    icon: '📦',
    category: 'general',
    tags: [],
    author: 'Test',
    source: 'official',
    entityCount: 2,
    relationshipCount: 1,
    payloadUrl: `catalogue-payloads/official/test/${fakePayloadHash}.json`,
    payloadHash: `sha256:${fakePayloadHash}`,
    sourceArtifactUrl:
      `catalogue-sources/official/test/${fakeSourceHash}.rdf`,
    sourceArtifactHash: `sha256:${fakeSourceHash}`,
    sourceArtifactByteLength: new TextEncoder()
      .encode(fakeSource).byteLength,
    sourceArtifactMediaType: 'application/rdf+xml',
  }],
};

function createLargeOntology(): Ontology {
  const entityTypes = Array.from({ length: 350 }, (_, index) => ({
    id: `node-${index}`,
    name: `Node ${index}`,
    description: `Taxonomy node ${index}`,
    icon: 'N',
    color: '#0078D4',
    properties: [],
  }));

  return {
    name: 'Large Embedded Taxonomy',
    description: 'Large embed fixture',
    entityTypes,
    relationships: entityTypes.slice(1).map((entity, index) => ({
      id: `parent-${index + 1}`,
      name: 'subClassOf',
      from: entity.id,
      to: entityTypes[Math.floor(index / 3)].id,
      cardinality: 'many-to-one',
      kind: 'subclass',
    })),
  };
}

function createDenseOntology(): Ontology {
  const entityTypes = Array.from({ length: 90 }, (_, index) => ({
    id: `dense-${index}`,
    name: `Dense ${index}`,
    description: `Dense node ${index}`,
    icon: 'D',
    color: '#0078D4',
    properties: [],
  }));

  return {
    name: 'Dense Embedded Graph',
    description: 'Dense embed fixture',
    entityTypes,
    relationships: entityTypes.slice(1).map((entity) => ({
      id: `dense-edge-${entity.id}`,
      name: 'connectedTo',
      from: entity.id,
      to: entityTypes[0].id,
      cardinality: 'many-to-one',
    })),
  };
}

function createWideOntology(): Ontology {
  const root = {
    id: 'root',
    name: 'Root',
    description: 'Wide embedded hierarchy root',
    icon: 'R',
    color: '#0078D4',
    properties: [],
  };
  const children = Array.from({ length: 349 }, (_, index) => ({
    id: `child-${index}`,
    name: `Child ${index}`,
    description: `Wide embedded hierarchy child ${index}`,
    icon: 'C',
    color: '#107C10',
    properties: [],
  }));

  return {
    name: 'Wide Embedded Taxonomy',
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

function mockCatalogueFetch(catalogue: Catalogue = fakeCatalogue) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = input.toString();
    if (url.endsWith('/catalogue.json')) {
      return new Response(JSON.stringify(catalogue), { status: 200 });
    }
    if (url.endsWith(catalogue.entries[0].payloadUrl)) {
      return new Response(fakePayloadContent, { status: 200 });
    }
    if (url.endsWith(catalogue.entries[0].sourceArtifactUrl ?? '')) {
      return new Response(fakeSource, { status: 200 });
    }
    return new Response('not found', { status: 404 });
  });
}

function mockFetch(data: unknown, ok = true) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok,
    status: ok ? 200 : 404,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data)),
  } as Response);
}

type MockHandler = (...args: unknown[]) => void;

const embedGraphMocks = vi.hoisted(() => {
  const handlers: Record<string, MockHandler[]> = {};
  const nodes: Record<string, unknown> & { length: number } = { length: 1 };
  const addClass = vi.fn(() => nodes);
  const connectedEdges = vi.fn(() => nodes);
  Object.assign(nodes, {
    toggleClass: vi.fn(),
    select: vi.fn(),
    unselect: vi.fn(),
    addClass,
    removeClass: vi.fn(() => nodes),
    connectedEdges,
    renderedBoundingBox: vi.fn(() => ({
      x1: 200,
      y1: 200,
      x2: 240,
      y2: 240,
      w: 40,
      h: 40,
    })),
    forEach: vi.fn((callback: (node: {
      id: () => string;
      position: () => { x: number; y: number };
    }) => void) => {
      callback({
        id: () => 'node-0',
        position: () => ({ x: 100, y: 100 }),
      });
    }),
  });
  const mockCy = {
    on: (event: string, selectorOrFn: string | MockHandler, maybeFn?: MockHandler) => {
      const fn = maybeFn || selectorOrFn as MockHandler;
      const key = typeof selectorOrFn === 'string' ? `${event}:${selectorOrFn}` : event;
      (handlers[key] ||= []).push(fn);
    },
    off: vi.fn(),
    destroy: vi.fn(),
    destroyed: vi.fn(() => false),
    container: () => document.createElement('div'),
    elements: () => nodes,
    edges: () => nodes,
    nodes: () => nodes,
    getElementById: () => nodes,
    zoom: vi.fn(() => 1),
    pan: vi.fn(() => ({ x: 0, y: 0 })),
    width: vi.fn(() => 800),
    height: vi.fn(() => 600),
  };
  const cytoscape = vi.fn(() => mockCy);
  Object.assign(cytoscape, { use: vi.fn() });
  return { addClass, connectedEdges, cytoscape, handlers };
});

/* Cytoscape needs a DOM container with dimensions.
   jsdom doesn't render so we mock cytoscape to avoid layout errors. */
vi.mock('cytoscape', () => {
  return { default: embedGraphMocks.cytoscape };
});

vi.mock('cytoscape-fcose', () => ({ default: vi.fn() }));

beforeEach(() => {
  clearCatalogueCache();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  for (const key of Object.keys(embedGraphMocks.handlers)) {
    delete embedGraphMocks.handlers[key];
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EmbedWidget', () => {
  it('shows loading state then renders ontology name', async () => {
    const fetchMock = mockCatalogueFetch();
    const config: EmbedConfig = { catalogueId: 'official/test', theme: 'dark', height: '400px' };
    render(<EmbedWidget config={config} />);

    expect(screen.getByText('Loading ontology…')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText('Test Ontology')).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some(([input]) =>
      input.toString().endsWith(fakeCatalogue.entries[0].sourceArtifactUrl!),
    )).toBe(false);
  });

  it('loads ontology from inline base64 JSON', async () => {
    const inline = btoa(JSON.stringify(testOntology));
    const config: EmbedConfig = { ontologyInline: inline, theme: 'dark', height: '400px' };
    render(<EmbedWidget config={config} />);

    await waitFor(() => {
      expect(screen.getByText('Test Ontology')).toBeTruthy();
    });
    expect(screen.getByText(/2 entities/)).toBeTruthy();
    expect(screen.getByText(/1 relationship/)).toBeTruthy();
  });

  it('retains complete RDF text loaded from a URL', async () => {
    const rdf = `<?xml version="1.0"?>
<rdf:RDF
  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
  xmlns:owl="http://www.w3.org/2002/07/owl#">
  <owl:Ontology rdf:about="https://example.com/url">
    <rdfs:label>URL Ontology</rdfs:label>
  </owl:Ontology>
  <owl:Class rdf:about="https://example.com/url#Thing">
    <rdfs:label>Thing</rdfs:label>
  </owl:Class>
</rdf:RDF>`;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(rdf, {
        status: 200,
        headers: { 'Content-Type': 'application/rdf+xml' },
      }),
    );
    const user = userEvent.setup();
    render(<EmbedWidget config={{
      ontologyUrl: 'https://example.com/url.rdf',
      theme: 'dark',
      height: '400px',
    }} />);

    await screen.findByText('URL Ontology');
    await user.click(screen.getByText('Complete RDF source'));

    expect(document.querySelector('pre')?.textContent).toBe(rdf);
  });

  it('rejects a URL RDF DOCTYPE before visual projection', async () => {
    const rdf = `<?xml version="1.0"?>
<!DOCTYPE rdf:RDF [
  <!ENTITY external SYSTEM "https://attacker.invalid/value">
]>
<rdf:RDF
  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
  xmlns:owl="http://www.w3.org/2002/07/owl#">
  <owl:Ontology rdf:about="https://example.com/url">
    <rdfs:label>&external;</rdfs:label>
  </owl:Ontology>
</rdf:RDF>`;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(rdf, {
        status: 200,
        headers: { 'Content-Type': 'application/rdf+xml' },
      }),
    );

    render(<EmbedWidget config={{
      ontologyUrl: 'https://example.com/url.rdf',
      theme: 'dark',
      height: '400px',
    }} />);

    await screen.findByText(/DOCTYPE declarations are not accepted/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized URL sources from their declared length before reading', async () => {
    const arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(0));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'Content-Length': String(8 * 1024 * 1024 + 1),
      }),
      body: null,
      arrayBuffer,
    } as unknown as Response);

    render(<EmbedWidget config={{
      ontologyUrl: 'https://example.com/oversized.rdf',
      theme: 'dark',
      height: '400px',
    }} />);

    await screen.findByText(/exceeds the 8,388,608 byte limit/);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('cancels a URL response stream when its actual bytes exceed the limit', async () => {
    const chunks = [
      new Uint8Array(8 * 1024 * 1024),
      new Uint8Array([1]),
    ];
    const cancel = vi.fn().mockResolvedValue(undefined);
    const releaseLock = vi.fn();
    const reader = {
      read: vi.fn(async () => {
        const value = chunks.shift();
        return value
          ? { done: false as const, value }
          : { done: true as const, value: undefined };
      }),
      cancel,
      releaseLock,
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: { getReader: () => reader },
    } as unknown as Response);

    render(<EmbedWidget config={{
      ontologyUrl: 'https://example.com/streamed.rdf',
      theme: 'dark',
      height: '400px',
    }} />);

    await screen.findByText(/exceeds the 8,388,608 byte limit/);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });

  it('retains URL JSON ontology compatibility with bounded loading', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(testOntology), { status: 200 }),
    );

    render(<EmbedWidget config={{
      ontologyUrl: 'https://example.com/ontology.json',
      theme: 'dark',
      height: '400px',
    }} />);

    await screen.findByText('Test Ontology');
    expect(screen.getByText(/2 entities/)).toBeTruthy();
  });

  it('shows error when no source specified', async () => {
    const config: EmbedConfig = { theme: 'dark', height: '400px' };
    render(<EmbedWidget config={config} />);

    await waitFor(() => {
      expect(screen.getByText(/No ontology source specified/)).toBeTruthy();
    });
  });

  it('shows error on fetch failure', async () => {
    mockFetch(null, false);
    const config: EmbedConfig = { ontologyUrl: 'https://example.com/bad.rdf', theme: 'dark', height: '400px' };
    render(<EmbedWidget config={config} />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to fetch ontology/)).toBeTruthy();
    });
  });

  it('shows error when catalogue ID not found', async () => {
    const fetchMock = mockCatalogueFetch();
    const config: EmbedConfig = { catalogueId: 'nonexistent', theme: 'dark', height: '400px' };
    render(<EmbedWidget config={config} />);

    await waitFor(() => {
      expect(screen.getByText(/not found in catalogue/)).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ cache: 'no-store' });
  });

  it('switches between Graph and generated RDF tabs', async () => {
    const inline = btoa(JSON.stringify(testOntology));
    const config: EmbedConfig = { ontologyInline: inline, theme: 'dark', height: '400px' };
    const user = userEvent.setup();
    render(<EmbedWidget config={config} />);

    await waitFor(() => {
      expect(screen.getByText('Test Ontology')).toBeTruthy();
    });

    // Initially on Graph tab — no RDF source visible
    expect(screen.getByText('Graph')).toBeTruthy();
    expect(screen.getByText('Generated RDF')).toBeTruthy();

    // Switch to RDF tab
    await user.click(screen.getByText('Generated RDF'));

    // Should show RDF serialization (text is split across syntax-highlighted spans)
    await waitFor(() => {
      const pre = document.querySelector('pre');
      expect(pre?.textContent).toMatch(/owl:Ontology/);
    });

    // Copy generated RDF button should appear
    expect(screen.getByText('Copy generated RDF')).toBeTruthy();
  });

  it('shows the complete verified RDF for catalogue entries', async () => {
    const externalCatalogue: Catalogue = {
      ...fakeCatalogue,
      entries: [{
        ...fakeCatalogue.entries[0],
        source: 'external',
      }],
    };
    mockCatalogueFetch(externalCatalogue);
    const user = userEvent.setup();
    render(<EmbedWidget config={{
      catalogueId: 'official/test',
      theme: 'dark',
      height: '400px',
    }} />);

    await screen.findByText('Test Ontology');
    await user.click(screen.getByText('Generated RDF'));

    expect((await screen.findByRole('note')).textContent).toContain(
      'complete source RDF',
    );
    expect(screen.getByRole('note').textContent).toContain(
      'not fetched or executed',
    );
    expect(document.querySelector('pre')?.textContent).toBe(fakeSource);
    expect(screen.getByText('Copy complete RDF')).toBeTruthy();
  });

  it('keeps the catalogue graph available when complete source loading fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input.toString();
      if (url.endsWith('/catalogue.json')) {
        return new Response(JSON.stringify(fakeCatalogue), { status: 200 });
      }
      if (url.endsWith(fakeCatalogue.entries[0].payloadUrl)) {
        return new Response(fakePayloadContent, { status: 200 });
      }
      if (url.endsWith(fakeCatalogue.entries[0].sourceArtifactUrl!)) {
        return new Response('source unavailable', { status: 503 });
      }
      return new Response('not found', { status: 404 });
    });
    const user = userEvent.setup();
    render(<EmbedWidget config={{
      catalogueId: 'official/test',
      theme: 'dark',
      height: '400px',
    }} />);

    await screen.findByText('Test Ontology');
    await user.click(screen.getByText('Generated RDF'));

    await screen.findByText(/Complete RDF source is unavailable/);
    expect(document.querySelector('pre')?.textContent)
      .toMatch(/owl:Ontology/);
    await user.click(screen.getByText('Graph'));
    expect(screen.getByText('Test Ontology')).toBeTruthy();
  });

  it('renders with light theme', async () => {
    const inline = btoa(JSON.stringify(testOntology));
    const config: EmbedConfig = { ontologyInline: inline, theme: 'light', height: '300px' };
    render(<EmbedWidget config={config} />);

    await waitFor(() => {
      expect(screen.getByText('Test Ontology')).toBeTruthy();
    });
    // The component should render without errors in light theme
  });

  it('shows entity/relationship stats in header', async () => {
    const inline = btoa(JSON.stringify(testOntology));
    const config: EmbedConfig = { ontologyInline: inline, theme: 'dark', height: '400px' };
    render(<EmbedWidget config={config} />);

    await waitFor(() => {
      expect(screen.getByText(/2 entities · 1 relationship/)).toBeTruthy();
    });
  });

  it('uses a bounded semantic overview for a massive embedded ontology', async () => {
    const ontology = createLargeOntology();
    const config: EmbedConfig = {
      ontologyInline: btoa(JSON.stringify(ontology)),
      theme: 'dark',
      height: '400px',
    };

    render(<EmbedWidget config={config} />);

    const controls = await screen.findByRole('region', {
      name: 'Large ontology controls',
    });
    expect(controls).toHaveTextContent('Semantic overview');
    expect(controls).toHaveTextContent(/of 350 entities/);
    expect(controls).toHaveTextContent(/of 349 relationships/);
    const detailSlider = screen.getByRole('slider', { name: 'Detail: 1 hop' });
    const search = screen.getByRole('searchbox', { name: 'Jump to an entity' });
    expect(detailSlider).toHaveValue('1');
    expect(detailSlider).toHaveStyle({ width: '100%', minHeight: '44px' });
    expect(search).toHaveStyle({ minHeight: '44px', fontSize: '16px' });
    expect(screen.getByRole('button', { name: 'Find' })).toHaveStyle({
      minHeight: '44px',
    });
    expect(Number(detailSlider.getAttribute('max'))).toBeGreaterThan(1);
    expect(screen.getByRole('button', { name: 'Reset view' })).toBeDisabled();
    expect(
      screen.getByRole('button', {
        name: 'Select a +N entity to show neighbors',
      }),
    ).toBeDisabled();
    const graphConfig = embedGraphMocks.cytoscape.mock.calls[0][0] as {
      style: Array<{
        selector: string;
        style: Record<string, unknown>;
      }>;
    };
    expect(graphConfig.style).toContainEqual(expect.objectContaining({
      selector: 'edge.selected-node-edge',
      style: expect.objectContaining({
        label: 'data(label)',
        'min-zoomed-font-size': 0,
      }),
    }));
    expect(graphConfig.style).toContainEqual(expect.objectContaining({
      selector: 'edge',
      style: expect.objectContaining({
        label: '',
        color: '#B3B3B3',
        'text-background-color': '#2D2D2D',
        'text-background-opacity': 1,
      }),
    }));
  });

  it('keeps relationship labels occluded for selected dense embed hubs', async () => {
    const ontology = createDenseOntology();
    const config: EmbedConfig = {
      ontologyInline: btoa(JSON.stringify(ontology)),
      theme: 'dark',
      height: '400px',
    };

    render(<EmbedWidget config={config} />);

    await screen.findByText('Dense Embedded Graph');
    const graphConfig = embedGraphMocks.cytoscape.mock.calls[0][0] as {
      style: Array<{
        selector: string;
        style: Record<string, unknown>;
      }>;
    };
    expect(graphConfig.style).toContainEqual(expect.objectContaining({
      selector: 'edge',
      style: expect.objectContaining({ label: '' }),
    }));

    const nodeTapHandlers = embedGraphMocks.handlers['tap:node'];
    act(() => {
      nodeTapHandlers.at(-1)?.({
        target: { id: () => 'dense-0' },
      });
    });
    await screen.findByText('Dense node 0');

    expect(embedGraphMocks.addClass).not.toHaveBeenCalledWith(
      'selected-node-edge',
    );
  });

  it('shows neighbor expansion beside a selected +N entity', async () => {
    const ontology = createLargeOntology();
    const graphView = createGraphView(ontology);
    const boundary = [...graphView.hiddenNeighborCounts.entries()][0];
    expect(boundary).toBeDefined();
    const [boundaryId, hiddenNeighborCount] = boundary!;
    const boundaryEntity = ontology.entityTypes.find(
      ({ id }) => id === boundaryId,
    );
    expect(boundaryEntity).toBeDefined();
    const config: EmbedConfig = {
      ontologyInline: btoa(JSON.stringify(ontology)),
      theme: 'dark',
      height: '400px',
    };
    const user = userEvent.setup();

    render(<EmbedWidget config={config} />);

    await screen.findByRole('region', { name: 'Large ontology controls' });
    const initialConfig = embedGraphMocks.cytoscape.mock.calls[0][0] as {
      elements: unknown[];
    };
    await user.click(screen.getByRole('button', { name: 'Hide' }));
    const nodeTapHandlers = embedGraphMocks.handlers['tap:node'];
    expect(nodeTapHandlers).toBeDefined();
    act(() => {
      nodeTapHandlers.at(-1)?.({
        target: { id: () => boundaryId },
      });
    });

    const expandAction = await screen.findByRole('button', {
      name: `Expand ${boundaryEntity?.name} to show ${hiddenNeighborCount} hidden ${
        hiddenNeighborCount === 1 ? 'neighbor' : 'neighbors'
      }`,
    });
    expect(expandAction).toHaveStyle({
      left: '220px',
      top: '190px',
      minHeight: '44px',
    });
    expect(embedGraphMocks.connectedEdges).toHaveBeenCalled();
    expect(embedGraphMocks.addClass).toHaveBeenCalledWith(
      'selected-node-edge',
    );

    embedGraphMocks.addClass.mockClear();
    await user.click(expandAction);
    await waitFor(() => {
      expect(embedGraphMocks.cytoscape).toHaveBeenCalledTimes(2);
    });
    expect(embedGraphMocks.addClass).toHaveBeenCalledWith(
      'selected-node-edge',
    );
    expect(expandAction).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open' }));
    const collapseButton = screen.getByRole('button', {
      name: `Hide shown neighbors for ${boundaryEntity?.name}`,
    });
    expect(collapseButton).toBeEnabled();
    await user.click(collapseButton);
    await waitFor(() => {
      expect(embedGraphMocks.cytoscape).toHaveBeenCalledTimes(3);
    });
    const explicitlyCollapsedConfig =
      embedGraphMocks.cytoscape.mock.calls[2][0] as {
        elements: unknown[];
      };
    expect(explicitlyCollapsedConfig.elements).toHaveLength(
      initialConfig.elements.length,
    );
    const panelExpandButton = screen.getByRole('button', {
      name: `Show ${hiddenNeighborCount} hidden ${
        hiddenNeighborCount === 1 ? 'neighbor' : 'neighbors'
      } for ${boundaryEntity?.name}`,
    });
    expect(panelExpandButton).toBeEnabled();
    await user.click(panelExpandButton);
    await waitFor(() => {
      expect(embedGraphMocks.cytoscape).toHaveBeenCalledTimes(4);
    });

    fireEvent.change(screen.getByRole('slider', { name: 'Detail: 1 hop' }), {
      target: { value: '2' },
    });
    await waitFor(() => {
      expect(embedGraphMocks.cytoscape).toHaveBeenCalledTimes(5);
    });
    expect(
      screen.queryByText(boundaryEntity!.description),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Select a +N entity to show neighbors',
      }),
    ).toBeDisabled();
    fireEvent.change(screen.getByRole('slider', { name: 'Detail: 2 hops' }), {
      target: { value: '1' },
    });
    await waitFor(() => {
      expect(embedGraphMocks.cytoscape).toHaveBeenCalledTimes(6);
    });

    const collapsedConfig = embedGraphMocks.cytoscape.mock.calls[5][0] as {
      elements: unknown[];
    };
    expect(collapsedConfig.elements).toHaveLength(initialConfig.elements.length);
    expect(
      screen.getByRole('button', {
        name: 'Select a +N entity to show neighbors',
      }),
    ).toBeDisabled();
  });

  it('keeps partial embedded expansions reversible at the view limit', async () => {
    const ontology = createWideOntology();
    const initialHiddenCount = createGraphView(ontology)
      .hiddenNeighborCounts.get('root');
    expect(initialHiddenCount).toBe(290);
    const config: EmbedConfig = {
      ontologyInline: btoa(JSON.stringify(ontology)),
      theme: 'dark',
      height: '500px',
    };

    render(<EmbedWidget config={config} />);

    await screen.findByRole('region', { name: 'Large ontology controls' });
    const nodeTapHandlers = embedGraphMocks.handlers['tap:node'];
    act(() => {
      nodeTapHandlers.at(-1)?.({
        target: { id: () => 'root' },
      });
    });

    fireEvent.click(screen.getByRole('button', {
      name: `Show ${initialHiddenCount} hidden neighbors for Root`,
    }));
    await waitFor(() => {
      expect(embedGraphMocks.cytoscape).toHaveBeenCalledTimes(2);
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

  it('clears a deep embed selection when lowering hierarchy detail', async () => {
    const ontology = createLargeOntology();
    const initialView = createGraphView(ontology, { depth: 1 });
    const detailedView = createGraphView(ontology, { depth: 2 });
    const initialIds = new Set(initialView.entities.map(({ id }) => id));
    const deepEntity = detailedView.entities.find(
      ({ id }) => !initialIds.has(id),
    );
    expect(deepEntity).toBeDefined();
    const config: EmbedConfig = {
      ontologyInline: btoa(JSON.stringify(ontology)),
      theme: 'dark',
      height: '400px',
    };

    render(<EmbedWidget config={config} />);

    await screen.findByRole('region', { name: 'Large ontology controls' });
    const initialConfig = embedGraphMocks.cytoscape.mock.calls[0][0] as {
      elements: unknown[];
    };
    fireEvent.change(screen.getByRole('slider', { name: 'Detail: 1 hop' }), {
      target: { value: '2' },
    });
    await waitFor(() => {
      expect(embedGraphMocks.cytoscape).toHaveBeenCalledTimes(2);
    });

    const nodeTapHandlers = embedGraphMocks.handlers['tap:node'];
    act(() => {
      nodeTapHandlers.at(-1)?.({
        target: { id: () => deepEntity!.id },
      });
    });
    expect(await screen.findByText(deepEntity!.description)).toBeInTheDocument();

    fireEvent.change(screen.getByRole('slider', { name: 'Detail: 2 hops' }), {
      target: { value: '1' },
    });
    await waitFor(() => {
      expect(embedGraphMocks.cytoscape).toHaveBeenCalledTimes(3);
    });

    const collapsedConfig = embedGraphMocks.cytoscape.mock.calls[2][0] as {
      elements: unknown[];
    };
    expect(collapsedConfig.elements).toHaveLength(initialConfig.elements.length);
    expect(screen.queryByText(deepEntity!.description)).not.toBeInTheDocument();
  });

  it('reveals deep entities through embedded overview search', async () => {
    const ontology = createLargeOntology();
    const config: EmbedConfig = {
      ontologyInline: btoa(JSON.stringify(ontology)),
      theme: 'light',
      height: '400px',
    };
    const user = userEvent.setup();

    render(<EmbedWidget config={config} />);

    const search = await screen.findByRole('searchbox', {
      name: 'Jump to an entity',
    });
    await user.type(search, 'Node 349');
    await user.click(screen.getByRole('button', { name: 'Find' }));

    expect(await screen.findByText('1 matching entity.')).toBeInTheDocument();
  });

  it('gives each embedded detail slider a unique labelled ID', async () => {
    const ontologyInline = btoa(JSON.stringify(createLargeOntology()));
    const config: EmbedConfig = {
      ontologyInline,
      theme: 'dark',
      height: '400px',
    };

    render(
      <>
        <EmbedWidget config={config} />
        <EmbedWidget config={config} />
      </>,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('slider')).toHaveLength(2);
    });
    const sliders = screen.getAllByRole('slider');
    const sliderIds = sliders.map((slider) => slider.id);
    const matchingLabels = [...document.querySelectorAll('label')].filter(
      (label) => sliderIds.includes(label.htmlFor),
    );

    expect(new Set(sliderIds).size).toBe(2);
    expect(sliderIds.every(Boolean)).toBe(true);
    expect(matchingLabels.map((label) => label.htmlFor).sort()).toEqual(
      [...sliderIds].sort(),
    );
  });
});
