import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomeInstanceGraph } from './HomeInstanceGraph';
import { useAlignmentStore } from '../store/alignmentStore';
import { useAppStore } from '../store/appStore';

vi.mock('cytoscape', () => {
  const mockCy = {
    destroy: vi.fn(),
    on: vi.fn(),
    resize: vi.fn(),
    fit: vi.fn(),
    zoom: vi.fn(() => 1),
    layout: vi.fn(() => ({ run: vi.fn() })),
  };
  const cytoscape = vi.fn(() => mockCy);
  Object.assign(cytoscape, { use: vi.fn() });
  return { default: cytoscape };
});

vi.mock('cytoscape-fcose', () => ({ default: vi.fn() }));

describe('HomeInstanceGraph', () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock);

    useAppStore.setState({
      currentOntology: {
        name: 'Test Ontology',
        description: 'Test graph',
        entityTypes: [
          {
            id: 'customer',
            name: 'Customer',
            description: 'Customer node',
            icon: 'C',
            color: '#0078D4',
            properties: [{ name: 'customerId', type: 'string', isIdentifier: true }],
          },
          {
            id: 'order',
            name: 'Order',
            description: 'Order node',
            icon: 'O',
            color: '#107C10',
            properties: [{ name: 'orderId', type: 'string', isIdentifier: true }],
          },
        ],
        relationships: [
          {
            id: 'customer_places_order',
            name: 'places',
            from: 'customer',
            to: 'order',
            cardinality: 'one-to-many',
            description: 'Customer places order',
          },
        ],
      },
      darkMode: true,
    });

    useAlignmentStore.setState({
      instanceGraph: {
        nodes: [
          {
            node_id: 'customer:CUST-1',
            label: 'Customer Kim',
            class_id: 'customer',
            properties: { customerId: 'CUST-1' },
          },
          {
            node_id: 'order:ORD-1',
            label: 'Order',
            class_id: 'order',
            properties: { orderId: 'ORD-1' },
          },
        ],
        edges: [
          {
            edge_id: 'edge-1',
            source_node_id: 'customer:CUST-1',
            target_node_id: 'order:ORD-1',
            relation_id: 'customer_places_order',
            label: 'places',
            properties: {},
          },
        ],
        total_facts: 1,
      },
    });
  });

  it('renders a dedicated home graph view without review action buttons', () => {
    render(<HomeInstanceGraph />);

    expect(screen.getByText('Instance Graph')).toBeTruthy();
    expect(screen.getByText('2 nodes')).toBeTruthy();
    expect(screen.getByText('1 edges')).toBeTruthy();
    expect(screen.getByText('1 approved facts')).toBeTruthy();
    expect(screen.queryByText('Save Graph')).toBeNull();
    expect(screen.queryByText('Preview Publish')).toBeNull();
    expect(screen.queryByText('Publish to Neo4j')).toBeNull();
  });
});
