import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Neo4jQueryPanel } from './Neo4jQueryPanel';
import { useAppStore } from '../store/appStore';

vi.mock('../lib/queryApi', () => ({
  runNeo4jQuery: vi.fn(),
  translateNaturalLanguageQuery: vi.fn(),
}));

describe('Neo4jQueryPanel', () => {
  beforeEach(() => {
    useAppStore.setState({
      currentOntology: {
        name: 'Retail Ontology',
        description: 'Retail graph',
        entityTypes: [
          {
            id: 'customer',
            name: 'Customer',
            description: 'A customer',
            icon: 'C',
            color: '#0078D4',
            properties: [{ name: 'customerId', type: 'string', isIdentifier: true }],
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
    });
  });

  it('renders natural language translation controls by default', () => {
    render(<Neo4jQueryPanel />);

    expect(screen.getByText('Natural Language')).toBeTruthy();
    expect(screen.getByText('Schema Context')).toBeTruthy();
    expect(screen.getByText('Edit Prompt')).toBeTruthy();
    expect(screen.getByText('Expand Schema Context')).toBeTruthy();
    expect(screen.getByText('Translate to Cypher')).toBeTruthy();
    expect(screen.getByText('Review Before Running')).toBeTruthy();
  });
});
