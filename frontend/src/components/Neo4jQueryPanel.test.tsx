import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Neo4jQueryPanel } from './Neo4jQueryPanel';
import { useAppStore } from '../store/appStore';
import { useDesignerStore } from '../store/designerStore';
import { translateNaturalLanguageQuery } from '../lib/queryApi';

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
    useDesignerStore.setState({
      ontology: {
        name: 'Draft Ontology',
        description: 'Draft graph',
        entityTypes: [
          {
            id: 'draft_customer',
            name: 'DraftCustomer',
            description: 'A draft customer',
            icon: 'D',
            color: '#ff6600',
            properties: [{ name: 'draftCustomerId', type: 'string', isIdentifier: true }],
          },
        ],
        relationships: [],
      },
    });
    vi.mocked(translateNaturalLanguageQuery).mockReset();
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

  it('uses the current designer draft ontology for translation when available', async () => {
    vi.mocked(translateNaturalLanguageQuery).mockResolvedValue({
      cypher: 'MATCH (n:OntologyInstance) RETURN n.nodeId AS nodeId LIMIT 25',
      summary: 'Draft query',
      warnings: [],
    });

    const user = userEvent.setup();
    render(<Neo4jQueryPanel />);

    await user.type(
      screen.getByPlaceholderText('Ask a question about the graph in natural language. Example: Show the top 10 customers with the most orders.'),
      'Show all draft customers',
    );
    await user.click(screen.getByText('Translate to Cypher'));

    expect(translateNaturalLanguageQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Show all draft customers',
        ontology: expect.objectContaining({
          name: 'Draft Ontology',
          entityTypes: [expect.objectContaining({ id: 'draft_customer' })],
        }),
      }),
    );
  });
});
