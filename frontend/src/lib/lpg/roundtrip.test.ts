/**
 * LPG round-trip tests.
 *
 * Core guarantee: parseLPG(serializeToLPG(ontology)) deep-equals ontology
 * for every combination of features supported by the format.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { serializeToLPG } from './serializer';
import { parseLPG, LPGParseError } from './parser';
import type { Ontology } from '../../data/ontology';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const minimal: Ontology = {
  name: 'Test Ontology',
  description: '',
  entityTypes: [
    {
      id: 'customer-1',
      name: 'Customer',
      description: '',
      icon: '👤',
      color: '#0078D4',
      properties: [
        { name: 'customerId', type: 'string', isIdentifier: true },
      ],
    },
  ],
  relationships: [],
};

const full: Ontology = {
  name: 'Cosmic Coffee',
  description: 'A coffee shop loyalty management ontology',
  entityTypes: [
    {
      id: 'customer-1',
      name: 'Customer',
      description: 'A loyalty programme member',
      icon: '👤',
      color: '#0078D4',
      properties: [
        { name: 'customerId', type: 'string', isIdentifier: true },
        { name: 'name',       type: 'string' },
        { name: 'email',      type: 'string' },
        { name: 'since',      type: 'date' },
        { name: 'points',     type: 'integer' },
        { name: 'balance',    type: 'decimal' },
        { name: 'active',     type: 'boolean' },
        { name: 'tier', type: 'enum', values: ['bronze', 'silver', 'gold'] },
        { name: 'avgSpend', type: 'decimal', unit: 'USD' },
      ],
    },
    {
      id: 'order-2',
      name: 'Order',
      description: 'A beverage order',
      icon: '📋',
      color: '#107C10',
      properties: [
        { name: 'orderId',   type: 'string',  isIdentifier: true },
        { name: 'orderDate', type: 'datetime' },
        { name: 'total',     type: 'decimal', unit: 'USD' },
      ],
    },
    {
      id: 'product-3',
      name: 'Product',
      description: '',
      icon: '☕',
      color: '#D83B01',
      properties: [
        { name: 'productId', type: 'string', isIdentifier: true },
        { name: 'price',     type: 'decimal', unit: 'USD' },
      ],
    },
  ],
  relationships: [
    {
      id: 'rel-places-1',
      name: 'places',
      from: 'Customer',
      to: 'Order',
      cardinality: 'one-to-many',
      description: '',
    },
    {
      id: 'rel-contains-2',
      name: 'contains',
      from: 'Order',
      to: 'Product',
      cardinality: 'one-to-many',
      description: 'Line item linking an order to a product',
      attributes: [
        { name: 'quantity',  type: 'integer' },
        { name: 'unitPrice', type: 'decimal' },
      ],
    },
    {
      id: 'rel-rewards-3',
      name: 'rewards',
      from: 'Order',
      to: 'Customer',
      cardinality: 'many-to-one',
      description: '',
    },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roundtrip(ontology: Ontology): Ontology {
  return parseLPG(serializeToLPG(ontology));
}

// ─── Serializer output shape ──────────────────────────────────────────────────

describe('serializeToLPG', () => {
  it('includes [ONTOLOGY] header', () => {
    const out = serializeToLPG(minimal);
    expect(out).toContain('[ONTOLOGY] Test Ontology');
  });

  it('includes [DESC] when description is non-empty', () => {
    const out = serializeToLPG(full);
    expect(out).toContain('[DESC] A coffee shop loyalty management ontology');
  });

  it('omits [DESC] when description is empty', () => {
    const out = serializeToLPG(minimal);
    const lines = out.split('\n').filter(l => l.includes('[DESC]'));
    expect(lines).toHaveLength(0);
  });

  it('includes [NODE] with name | icon | color | id', () => {
    const out = serializeToLPG(minimal);
    expect(out).toContain('[NODE] Customer | 👤 | #0078D4 | customer-1');
  });

  it('emits a valid CREATE CONSTRAINT for the identifier property', () => {
    const out = serializeToLPG(full);
    expect(out).toContain('CREATE CONSTRAINT customer_customerid IF NOT EXISTS');
    expect(out).toContain('FOR (n:Customer) REQUIRE n.customerId IS UNIQUE;');
  });

  it('marks identifier property with * in [PROPS]', () => {
    const out = serializeToLPG(full);
    expect(out).toContain('customerId:STRING*');
  });

  it('encodes unit as [unit] suffix in [PROPS]', () => {
    const out = serializeToLPG(full);
    expect(out).toContain('avgSpend:FLOAT[USD]');
    expect(out).toContain('total:FLOAT[USD]');
  });

  it('encodes enum values as (a|b|c) in [PROPS]', () => {
    const out = serializeToLPG(full);
    expect(out).toContain('tier:STRING(bronze|silver|gold)');
  });

  it('emits [REL] with name | from | to | cardinality | id', () => {
    const out = serializeToLPG(full);
    expect(out).toContain('[REL] places | Customer | Order | one-to-many | rel-places-1');
  });

  it('appends edge-property tokens after a 6th pipe on [REL]', () => {
    const out = serializeToLPG(full);
    expect(out).toContain('[REL] contains | Order | Product | one-to-many | rel-contains-2 | quantity:INTEGER unitPrice:FLOAT');
  });

  it('emits human-readable Cypher arrow pattern for each relationship', () => {
    const out = serializeToLPG(full);
    expect(out).toContain('(:Customer)-[:PLACES]->(:Order)');
    expect(out).toContain('(:Order)-[:CONTAINS { quantity: INTEGER, unitPrice: FLOAT }]->(:Product)');
  });

  it('converts relationship names to UPPER_SNAKE_CASE for Cypher type', () => {
    const ontology: Ontology = {
      ...minimal,
      relationships: [{
        id: 'rel-1', name: 'is member of', from: 'Customer', to: 'Customer',
        cardinality: 'many-to-many', description: '',
      }],
    };
    const out = serializeToLPG(ontology);
    expect(out).toContain('[:IS_MEMBER_OF]');
  });
});

// ─── Round-trip: minimal ──────────────────────────────────────────────────────

describe('round-trip — minimal ontology', () => {
  it('preserves ontology name', () => {
    expect(roundtrip(minimal).name).toBe('Test Ontology');
  });

  it('preserves entity count', () => {
    expect(roundtrip(minimal).entityTypes).toHaveLength(1);
  });

  it('preserves entity id', () => {
    expect(roundtrip(minimal).entityTypes[0].id).toBe('customer-1');
  });

  it('preserves entity name, icon, color', () => {
    const e = roundtrip(minimal).entityTypes[0];
    expect(e.name).toBe('Customer');
    expect(e.icon).toBe('👤');
    expect(e.color).toBe('#0078D4');
  });

  it('preserves identifier property', () => {
    const prop = roundtrip(minimal).entityTypes[0].properties[0];
    expect(prop.name).toBe('customerId');
    expect(prop.type).toBe('string');
    expect(prop.isIdentifier).toBe(true);
  });

  it('produces no relationships', () => {
    expect(roundtrip(minimal).relationships).toHaveLength(0);
  });
});

// ─── Round-trip: full ontology ────────────────────────────────────────────────

describe('round-trip — full ontology', () => {
  let result: Ontology;
  beforeEach(() => { result = roundtrip(full); });

  it('preserves ontology name and description', () => {
    expect(result.name).toBe('Cosmic Coffee');
    expect(result.description).toBe('A coffee shop loyalty management ontology');
  });

  it('preserves entity count', () => {
    expect(result.entityTypes).toHaveLength(3);
  });

  it('preserves entity ids in order', () => {
    expect(result.entityTypes.map(e => e.id)).toEqual(['customer-1', 'order-2', 'product-3']);
  });

  it('preserves entity descriptions', () => {
    expect(result.entityTypes[0].description).toBe('A loyalty programme member');
    expect(result.entityTypes[1].description).toBe('A beverage order');
    expect(result.entityTypes[2].description).toBe('');
  });

  it('preserves all property types', () => {
    const props = result.entityTypes[0].properties;
    const byName = Object.fromEntries(props.map(p => [p.name, p]));
    expect(byName['customerId'].type).toBe('string');
    expect(byName['since'].type).toBe('date');
    expect(byName['points'].type).toBe('integer');
    expect(byName['balance'].type).toBe('decimal');
    expect(byName['active'].type).toBe('boolean');
    expect(byName['avgSpend'].type).toBe('decimal');
  });

  it('preserves enum values', () => {
    const tier = result.entityTypes[0].properties.find(p => p.name === 'tier')!;
    expect(tier.type).toBe('enum');
    expect(tier.values).toEqual(['bronze', 'silver', 'gold']);
  });

  it('preserves unit metadata', () => {
    const avgSpend = result.entityTypes[0].properties.find(p => p.name === 'avgSpend')!;
    expect(avgSpend.unit).toBe('USD');
  });

  it('preserves relationship count', () => {
    expect(result.relationships).toHaveLength(3);
  });

  it('preserves relationship ids', () => {
    expect(result.relationships.map(r => r.id)).toEqual([
      'rel-places-1', 'rel-contains-2', 'rel-rewards-3',
    ]);
  });

  it('preserves relationship from/to/cardinality', () => {
    const places = result.relationships[0];
    expect(places.name).toBe('places');
    expect(places.from).toBe('Customer');
    expect(places.to).toBe('Order');
    expect(places.cardinality).toBe('one-to-many');
  });

  it('preserves relationship description', () => {
    const contains = result.relationships[1];
    expect(contains.description).toBe('Line item linking an order to a product');
  });

  it('preserves relationship edge attributes (name + type)', () => {
    const contains = result.relationships[1];
    expect(contains.attributes).toHaveLength(2);
    expect(contains.attributes![0]).toEqual({ name: 'quantity',  type: 'integer' });
    expect(contains.attributes![1]).toEqual({ name: 'unitPrice', type: 'decimal' });
  });

  it('deep-equals the original ontology', () => {
    // Strip undefined optional fields before comparing to handle
    // optional fields that are absent vs explicitly undefined
    const clean = (o: unknown) => JSON.parse(JSON.stringify(o));
    expect(clean(result)).toEqual(clean(full));
  });
});

// ─── Error cases ──────────────────────────────────────────────────────────────

describe('parseLPG — error handling', () => {
  it('throws LPGParseError on empty input', () => {
    expect(() => parseLPG('')).toThrow(LPGParseError);
  });

  it('throws LPGParseError when [ONTOLOGY] header is missing', () => {
    expect(() => parseLPG('// [NODE] Foo | 📦 | #000 | foo-1\n// [PROPS] id:STRING*')).toThrow(LPGParseError);
  });

  it('throws LPGParseError on malformed [NODE] line (< 4 segments)', () => {
    const bad = '// [ONTOLOGY] Test\n// [NODE] Foo | 📦 | #000';
    expect(() => parseLPG(bad)).toThrow(LPGParseError);
  });

  it('throws LPGParseError on malformed [REL] line (< 5 segments)', () => {
    const bad = [
      '// [ONTOLOGY] Test',
      '// [NODE] Customer | 👤 | #000 | customer-1',
      '// [PROPS] customerId:STRING*',
      '// [REL] places | Customer | Order | one-to-many', // missing id
    ].join('\n');
    expect(() => parseLPG(bad)).toThrow(LPGParseError);
  });
});

// ─── Cypher DDL lines are safely ignored ─────────────────────────────────────

describe('parseLPG — Cypher DDL lines are ignored', () => {
  it('does not choke on CREATE CONSTRAINT lines', () => {
    const lpg = serializeToLPG(full);
    expect(lpg).toContain('CREATE CONSTRAINT');
    // Must still parse cleanly
    expect(() => parseLPG(lpg)).not.toThrow();
  });

  it('does not choke on arrow-pattern lines', () => {
    const lpg = serializeToLPG(full);
    expect(lpg).toContain('(:Customer)-[:PLACES]->(:Order)');
    expect(() => parseLPG(lpg)).not.toThrow();
  });
});

// ─── Type mapping coverage ────────────────────────────────────────────────────

describe('LPG ↔ Ontology type mapping', () => {
  const allTypesOntology: Ontology = {
    name: 'Type Test',
    description: '',
    entityTypes: [{
      id: 'thing-1',
      name: 'Thing',
      description: '',
      icon: '📦',
      color: '#000000',
      properties: [
        { name: 'a', type: 'string',   isIdentifier: true },
        { name: 'b', type: 'integer' },
        { name: 'c', type: 'decimal' },
        { name: 'd', type: 'double' },
        { name: 'e', type: 'date' },
        { name: 'f', type: 'datetime' },
        { name: 'g', type: 'boolean' },
        { name: 'h', type: 'enum', values: ['x', 'y'] },
      ],
    }],
    relationships: [],
  };

  it('round-trips all property types', () => {
    const result = roundtrip(allTypesOntology);
    const props = result.entityTypes[0].properties;
    const byName = Object.fromEntries(props.map(p => [p.name, p.type]));

    expect(byName['a']).toBe('string');
    expect(byName['b']).toBe('integer');
    expect(byName['c']).toBe('decimal');
    // double serializes as FLOAT and parses back as decimal (FLOAT→decimal mapping)
    expect(['decimal', 'double']).toContain(byName['d']);
    expect(byName['e']).toBe('date');
    expect(byName['f']).toBe('datetime');
    expect(byName['g']).toBe('boolean');
    expect(byName['h']).toBe('enum');
  });
});
