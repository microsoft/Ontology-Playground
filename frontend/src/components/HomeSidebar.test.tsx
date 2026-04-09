import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomeSidebar } from './HomeSidebar';
import { useAlignmentStore } from '../store/alignmentStore';
import { useAppStore } from '../store/appStore';

describe('HomeSidebar', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAppStore.setState({
      currentOntology: {
        name: 'Sidebar Ontology',
        description: 'Test ontology',
        entityTypes: [
          {
            id: 'customer',
            name: 'Customer',
            description: 'Customer node',
            icon: 'C',
            color: '#0078D4',
            properties: [{ name: 'customerId', type: 'string', isIdentifier: true }],
          },
        ],
        relationships: [],
      },
      graphViewMode: 'instance',
    });
    useAlignmentStore.setState({
      approvedFacts: [],
      instanceGraph: {
        nodes: [
          {
            node_id: 'customer:CUST-1',
            label: 'Customer Kim',
            class_id: 'customer',
            properties: { customerId: 'CUST-1' },
          },
        ],
        edges: [],
        total_facts: 1,
      },
      selectedGraphNodeId: null,
      selectedGraphEdgeId: null,
    });
  });

  it('shows graph-specific sidebar panels outside schema mode', () => {
    render(<HomeSidebar />);

    expect(screen.getByText('Graph Overview')).toBeTruthy();
    expect(screen.getByText('Graph Explorer')).toBeTruthy();
    expect(screen.getByText('Approved Facts')).toBeTruthy();
    expect(screen.queryByText('Search & Filter')).toBeNull();
    expect(screen.queryByText('Natural Language Query (NL2Ontology)')).toBeNull();
    expect(screen.queryByText('RDF/XML Editor')).toBeNull();
  });
});
