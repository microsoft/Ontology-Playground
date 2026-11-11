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
    expect(ar.kind ?? 'association').toBe(er.kind ?? 'association');
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
  it('round-trips the Fourth Coffee ontology', () => {
    const rdf = serializeToRDF(cosmicCoffeeOntology);
    const { ontology } = parseRDF(rdf);
    expectOntologiesEqual(ontology, cosmicCoffeeOntology);
  });

  it('round-trips the Fourth Coffee ontology with bindings', () => {
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

  it('round-trips subclass relationships without converting them to object properties', () => {
    const ontology: Ontology = {
      name: 'Hierarchy Test',
      description: 'Tests class hierarchy fidelity',
      entityTypes: [
        { id: 'parent', name: 'Parent', description: '', icon: '📦', color: '#111', properties: [] },
        { id: 'child', name: 'Child', description: '', icon: '📦', color: '#222', properties: [] },
      ],
      relationships: [
        {
          id: 'child-subClassOf-parent',
          name: 'subClassOf',
          from: 'child',
          to: 'parent',
          cardinality: 'many-to-one',
          kind: 'subclass',
        },
      ],
    };
    const rdf = serializeToRDF(ontology);
    expect(rdf).toContain('<rdfs:subClassOf rdf:resource="http://example.org/ontology/hierarchy-test/Parent"/>');
    expect(rdf).not.toContain('<owl:ObjectProperty');

    const { ontology: parsed } = parseRDF(rdf);
    expectOntologiesEqual(parsed, ontology);
  });

  it('round-trips ontology metadata with mixed subclass and object-property semantics', () => {
    const ontology: Ontology = {
      name: 'Semantic Fidelity',
      description: 'Preserves RDF metadata and relationship kinds',
      entityTypes: [
        { id: 'parent', name: 'Parent', description: '', icon: '📦', color: '#111', properties: [] },
        { id: 'child', name: 'Child', description: '', icon: '📦', color: '#222', properties: [] },
      ],
      relationships: [
        {
          id: 'child-related-parent',
          name: 'related',
          from: 'child',
          to: 'parent',
          cardinality: 'many-to-many',
        },
        {
          id: 'child-subClassOf-parent',
          name: 'subClassOf',
          from: 'child',
          to: 'parent',
          cardinality: 'many-to-one',
          kind: 'subclass',
        },
      ],
      rdfMetadata: {
        ontologyIri: 'https://example.org/semantic-fidelity',
        versionIri: 'https://example.org/semantic-fidelity/1.0',
        versionInfo: '1.0',
        license: 'https://example.org/license',
        imports: ['https://example.org/imported'],
        preservedSourceFeatures: ['owlImports', 'shacl'],
      },
    };

    const rdf = serializeToRDF(ontology);
    expect(rdf).toContain(
      '<owl:Ontology rdf:about="http://example.org/ontology/semantic-fidelity/">',
    );
    expect(rdf).toContain(
      '<dcterms:source rdf:resource="https://example.org/semantic-fidelity"/>',
    );
    expect(rdf).toContain(
      '<opmeta:sourceVersionIri rdf:resource="https://example.org/semantic-fidelity/1.0"/>',
    );
    expect(rdf).toContain(
      '<rdfs:subClassOf rdf:resource="http://example.org/ontology/semantic-fidelity/Parent"/>',
    );
    expect(rdf).toContain(
      '<owl:ObjectProperty rdf:about="http://example.org/ontology/semantic-fidelity/child-related-parent">',
    );
    expect(rdf).toContain(
      '<opmeta:sourceImport rdf:resource="https://example.org/imported"/>',
    );
    expect(rdf).not.toContain(
      '<owl:Ontology rdf:about="https://example.org/semantic-fidelity">',
    );
    expect(rdf).not.toContain('<owl:imports');

    const { ontology: parsed } = parseRDF(rdf);
    expectOntologiesEqual(parsed, ontology);
    expect(parsed.rdfMetadata).toEqual({
      ...ontology.rdfMetadata,
      preservedSourceFeatures: ['owlImports'],
    });
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

  it('round-trips standard OWL and SHACL semantics after statement reordering', () => {
    const ontology: Ontology = {
      name: 'Interoperability',
      description: 'Tests the standards-oriented export profile',
      entityTypes: [
        {
          id: 'person',
          name: 'Person',
          description: 'A person',
          icon: '📦',
          color: '#0078D4',
          properties: [
            { name: 'personId', type: 'string', isIdentifier: true },
            { name: 'status', type: 'enum', values: ['Active', 'Inactive'] },
            { name: 'displayName', type: 'string' },
          ],
        },
        {
          id: 'team',
          name: 'Team',
          description: 'A team',
          icon: '📦',
          color: '#0078D4',
          properties: [],
        },
        {
          id: 'office',
          name: 'Office',
          description: 'An office',
          icon: '📦',
          color: '#0078D4',
          properties: [],
        },
      ],
      relationships: [
        {
          id: 'person_member_of_team',
          name: 'related to',
          from: 'person',
          to: 'team',
          cardinality: 'many-to-one',
          attributes: [
            { name: 'role', type: 'string' },
            { name: 'since', type: 'date' },
          ],
        },
        {
          id: 'person_assigned_office',
          name: 'related to',
          from: 'person',
          to: 'office',
          cardinality: 'one-to-one',
        },
        {
          id: 'team_has_person',
          name: 'contains',
          from: 'team',
          to: 'person',
          cardinality: 'one-to-many',
        },
        {
          id: 'team_collaborates_office',
          name: 'collaborates with',
          from: 'team',
          to: 'office',
          cardinality: 'many-to-many',
        },
      ],
    };

    const rdf = serializeToRDF(ontology, [], { profile: 'standards' });
    const document = new DOMParser().parseFromString(rdf, 'application/xml');
    const elements = Array.from(document.querySelectorAll('*'));
    for (const element of elements) {
      const children = Array.from(element.children);
      children.reverse().forEach((child) => element.appendChild(child));
    }
    const reordered = new XMLSerializer().serializeToString(document);

    const { ontology: parsed } = parseRDF(reordered);
    const normalizeResourceOrder = (value: Ontology): Ontology => ({
      ...value,
      entityTypes: [...value.entityTypes].sort((left, right) => (
        left.id.localeCompare(right.id)
      )),
      relationships: [...value.relationships].sort((left, right) => (
        left.id.localeCompare(right.id)
      )),
    });

    expectOntologiesEqual(
      normalizeResourceOrder(parsed),
      normalizeResourceOrder(ontology),
    );
    expect(parsed.relationships.filter((relationship) => (
      relationship.name === 'related to'
    ))).toHaveLength(2);
  });
});
