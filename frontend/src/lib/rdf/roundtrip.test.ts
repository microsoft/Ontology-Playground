import { describe, it, expect } from 'vitest';
import { serializeToRDF } from './serializer';
import { parseRDF } from './parser';
import { cosmicCoffeeOntology, sampleBindings } from '../../data/ontology';
import { sampleOntologies } from '../../data/sampleOntologies';
import type { Ontology, DataBinding } from '../../data/ontology';

/**
 * Deep-compare two ontologies for structural equivalence.
 * We compare the meaningful fields, not exact object identity.
 */
function expectOntologiesEqual(actual: Ontology, expected: Ontology) {
  expect(actual.name).toBe(expected.name);
  expect(actual.description).toBe(expected.description);
  expect(actual.entityTypes).toHaveLength(expected.entityTypes.length);

  for (let i = 0; i < expected.entityTypes.length; i++) {
    const ae = actual.entityTypes[i];
    const ee = expected.entityTypes[i];
    expect(ae.id).toBe(ee.id);
    expect(ae.name).toBe(ee.name);
    expect(ae.description).toBe(ee.description);
    expect(ae.icon).toBe(ee.icon);
    expect(ae.color).toBe(ee.color);
    expect(ae.properties).toHaveLength(ee.properties.length);

    for (let j = 0; j < ee.properties.length; j++) {
      const ap = ae.properties[j];
      const ep = ee.properties[j];
      expect(ap.name).toBe(ep.name);
      expect(ap.type).toBe(ep.type);
      expect(!!ap.isIdentifier).toBe(!!ep.isIdentifier);
      expect(ap.unit || undefined).toBe(ep.unit || undefined);
      if (ep.values) {
        expect(ap.values).toEqual(ep.values);
      }
      if (ep.description) {
        expect(ap.description).toBe(ep.description);
      }
    }
  }

  expect(actual.relationships).toHaveLength(expected.relationships.length);
  for (let i = 0; i < expected.relationships.length; i++) {
    const ar = actual.relationships[i];
    const er = expected.relationships[i];
    expect(ar.id).toBe(er.id);
    expect(ar.name).toBe(er.name);
    expect(ar.from).toBe(er.from);
    expect(ar.to).toBe(er.to);
    expect(ar.cardinality).toBe(er.cardinality);
    if (er.description) {
      expect(ar.description).toBe(er.description);
    }
    if (er.attributes && er.attributes.length > 0) {
      expect(ar.attributes).toHaveLength(er.attributes.length);
      for (let j = 0; j < er.attributes.length; j++) {
        expect(ar.attributes![j].name).toBe(er.attributes[j].name);
        expect(ar.attributes![j].type).toBe(er.attributes[j].type);
      }
    }
  }
}

function expectBindingsEqual(actual: DataBinding[], expected: DataBinding[]) {
  expect(actual).toHaveLength(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(actual[i].entityTypeId).toBe(expected[i].entityTypeId);
    expect(actual[i].source).toBe(expected[i].source);
    expect(actual[i].table).toBe(expected[i].table);
    expect(actual[i].columnMappings).toEqual(expected[i].columnMappings);
  }
}

describe('RDF round-trip tests', () => {
  it('round-trips the Cosmic Coffee Company ontology', () => {
    const rdf = serializeToRDF(cosmicCoffeeOntology);
    const { ontology } = parseRDF(rdf);
    expectOntologiesEqual(ontology, cosmicCoffeeOntology);
  });

  it('round-trips the Cosmic Coffee Company ontology with bindings', () => {
    const rdf = serializeToRDF(cosmicCoffeeOntology, sampleBindings);
    const { ontology, bindings } = parseRDF(rdf);
    expectOntologiesEqual(ontology, cosmicCoffeeOntology);
    expectBindingsEqual(bindings, sampleBindings);
  });

  for (const entry of sampleOntologies) {
    it(`round-trips the "${entry.name}" sample ontology`, () => {
      const rdf = serializeToRDF(entry.ontology);
      const { ontology } = parseRDF(rdf);
      expectOntologiesEqual(ontology, entry.ontology);
    });
  }

  it('round-trips an ontology with all property types', () => {
    const ontology: Ontology = {
      name: 'All Types Test',
      description: 'Tests every property type',
      entityTypes: [
        {
          id: 'test',
          name: 'Test Entity',
          description: 'Entity with all types',
          icon: '🧪',
          color: '#FF0000',
          properties: [
            { name: 'strProp', type: 'string', isIdentifier: true, description: 'A string' },
            { name: 'intProp', type: 'integer', description: 'An integer' },
            { name: 'decProp', type: 'decimal', unit: 'USD', description: 'A decimal' },
            { name: 'dblProp', type: 'double', description: 'A double' },
            { name: 'dateProp', type: 'date', description: 'A date' },
            { name: 'dtProp', type: 'datetime', description: 'A datetime' },
            { name: 'boolProp', type: 'boolean', description: 'A boolean' },
            { name: 'enumProp', type: 'enum', values: ['Alpha', 'Beta', 'Gamma'], description: 'An enum' },
          ],
        },
      ],
      relationships: [],
    };
    const rdf = serializeToRDF(ontology);
    const { ontology: parsed } = parseRDF(rdf);
    expectOntologiesEqual(parsed, ontology);
  });

  it('round-trips an ontology with relationship attributes', () => {
    const ontology: Ontology = {
      name: 'Rel Attrs Test',
      description: 'Tests relationship attributes',
      entityTypes: [
        { id: 'a', name: 'A', description: 'Entity A', icon: '🅰️', color: '#111', properties: [] },
        { id: 'b', name: 'B', description: 'Entity B', icon: '🅱️', color: '#222', properties: [] },
      ],
      relationships: [
        {
          id: 'a_to_b',
          name: 'connects',
          from: 'a',
          to: 'b',
          cardinality: 'many-to-many',
          description: 'A connects to B',
          attributes: [
            { name: 'weight', type: 'decimal' },
            { name: 'label', type: 'string' },
          ],
        },
      ],
    };
    const rdf = serializeToRDF(ontology);
    const { ontology: parsed } = parseRDF(rdf);
    expectOntologiesEqual(parsed, ontology);
  });

  it('round-trips an empty ontology', () => {
    const ontology: Ontology = {
      name: 'Empty',
      description: '',
      entityTypes: [],
      relationships: [],
    };
    const rdf = serializeToRDF(ontology);
    const { ontology: parsed } = parseRDF(rdf);
    expect(parsed.name).toBe('Empty');
    expect(parsed.entityTypes).toHaveLength(0);
    expect(parsed.relationships).toHaveLength(0);
  });

  it('round-trips special characters in names and descriptions', () => {
    const ontology: Ontology = {
      name: 'R&D "Test" <Ontology>',
      description: "It's a 'test' with <special> & characters",
      entityTypes: [
        {
          id: 'item',
          name: 'Item & "Thing"',
          description: "A <special> 'entity'",
          icon: '📦',
          color: '#000',
          properties: [
            { name: 'desc', type: 'string', description: 'Contains "quotes" & <brackets>' },
          ],
        },
      ],
      relationships: [],
    };
    const rdf = serializeToRDF(ontology);
    const { ontology: parsed } = parseRDF(rdf);
    expect(parsed.name).toBe(ontology.name);
    expect(parsed.description).toBe(ontology.description);
    expect(parsed.entityTypes[0].name).toBe(ontology.entityTypes[0].name);
    expect(parsed.entityTypes[0].description).toBe(ontology.entityTypes[0].description);
    expect(parsed.entityTypes[0].properties[0].description).toBe(
      ontology.entityTypes[0].properties[0].description,
    );
  });
});
