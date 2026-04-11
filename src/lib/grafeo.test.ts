import { describe, it, expect } from 'vitest';
import { ontologyToCypher } from './grafeo';
import type { Ontology } from '../data/ontology';

const minimalOntology: Ontology = {
  name: 'Test Ontology',
  description: 'A test ontology',
  entityTypes: [
    {
      id: 'customer',
      name: 'Customer',
      description: 'A customer entity',
      icon: '👤',
      color: '#0078D4',
      properties: [
        { name: 'customerId', type: 'string', isIdentifier: true },
        { name: 'email', type: 'string' },
      ],
    },
    {
      id: 'order',
      name: 'Order',
      description: 'An order',
      icon: '🧾',
      color: '#107C10',
      properties: [
        { name: 'orderId', type: 'string', isIdentifier: true },
        { name: 'total', type: 'decimal' },
      ],
    },
  ],
  relationships: [
    {
      id: 'customer-order',
      name: 'places',
      from: 'customer',
      to: 'order',
      cardinality: 'one-to-many',
    },
  ],
};

describe('ontologyToCypher', () => {
  it('creates a node statement for each entity type', () => {
    const cypher = ontologyToCypher(minimalOntology);
    const lines = cypher.split('\n');

    // Two entity types → two CREATE node lines
    const nodeLines = lines.filter(l => l.includes(':Customer') || l.includes(':Order'));
    expect(nodeLines).toHaveLength(2);
  });

  it('creates an edge statement for each relationship', () => {
    const cypher = ontologyToCypher(minimalOntology);
    const lines = cypher.split('\n');

    const edgeLines = lines.filter(l => l.includes('->'));
    expect(edgeLines).toHaveLength(1);
    expect(edgeLines[0]).toContain(':places');
    expect(edgeLines[0]).toContain("cardinality: 'one-to-many'");
  });

  it('includes entity properties as a JSON string property', () => {
    const cypher = ontologyToCypher(minimalOntology);

    expect(cypher).toContain("name: 'Customer'");
    expect(cypher).toContain("id: 'customer'");
    expect(cypher).toContain('properties:');
  });

  it('skips relationships referencing unknown entities', () => {
    const broken: Ontology = {
      ...minimalOntology,
      relationships: [
        {
          id: 'bad-rel',
          name: 'broken',
          from: 'customer',
          to: 'nonexistent',
          cardinality: 'one-to-one',
        },
      ],
    };

    const cypher = ontologyToCypher(broken);
    expect(cypher).not.toContain('->');
  });

  it('sanitizes labels with special characters', () => {
    const special: Ontology = {
      name: 'Test',
      description: '',
      entityTypes: [
        {
          id: 'item',
          name: 'Line Item (2024)',
          description: 'An item',
          icon: '📦',
          color: '#000',
          properties: [],
        },
      ],
      relationships: [],
    };

    const cypher = ontologyToCypher(special);
    // Label should have parentheses and spaces replaced with underscores
    expect(cypher).toContain(':Line_Item__2024_');
    // But the name property preserves the original display name
    expect(cypher).toContain("name: 'Line Item (2024)'");
  });

  it('escapes single quotes in string values', () => {
    const withQuotes: Ontology = {
      name: 'Test',
      description: '',
      entityTypes: [
        {
          id: 'item',
          name: "O'Brien's",
          description: "It's a test",
          icon: '📦',
          color: '#000',
          properties: [],
        },
      ],
      relationships: [],
    };

    const cypher = ontologyToCypher(withQuotes);
    expect(cypher).toContain("O\\'Brien\\'s");
    expect(cypher).toContain("It\\'s a test");
  });

  it('returns empty string for empty ontology', () => {
    const empty: Ontology = {
      name: 'Empty',
      description: '',
      entityTypes: [],
      relationships: [],
    };

    const cypher = ontologyToCypher(empty);
    expect(cypher).toBe('');
  });
});
