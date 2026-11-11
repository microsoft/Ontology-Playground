import { describe, expect, it } from 'vitest';
import { parseOntologyValue } from './ontologySchema';

const colors = ['#0078D4', '#107C10'];

function validOntology(): unknown {
  return {
    name: 'Inventory',
    description: 'Tracks inventory',
    entityTypes: [{
      id: 'product',
      name: 'Product',
      description: 'An item',
      icon: '📦',
      color: '',
      properties: [{
        name: 'productId',
        type: 'string',
        isIdentifier: true,
        values: ['A', 'B'],
      }],
    }],
    relationships: [{
      id: 'related',
      name: 'related_to',
      from: 'product',
      to: 'product',
      cardinality: 'one-to-many',
      kind: 'association',
      attributes: [{ name: 'since', type: 'date' }],
    }],
  };
}

describe('parseOntologyValue', () => {
  it('returns a typed ontology and applies safe presentation defaults', () => {
    const candidate = validOntology() as {
      description?: unknown;
      entityTypes: Array<Record<string, unknown>>;
    };
    delete candidate.description;
    delete candidate.entityTypes[0].icon;

    const result = parseOntologyValue(candidate, {
      defaultEntityColors: colors,
    });

    expect(result.issues).toEqual([]);
    expect(result.ontology).toMatchObject({
      description: '',
      entityTypes: [{
        icon: '📦',
        color: '#0078D4',
      }],
    });
  });

  it('rejects invalid nested primitive types', () => {
    const candidate = validOntology() as {
      entityTypes: Array<Record<string, unknown>>;
    };
    candidate.entityTypes[0].id = 1;
    candidate.entityTypes[0].properties = [{
      name: 'productId',
      type: 'string',
      isIdentifier: 'false',
    }];

    const result = parseOntologyValue(candidate, {
      defaultEntityColors: colors,
    });

    expect(result.ontology).toBeNull();
    expect(result.issues.map((issue) => issue.path)).toEqual([
      'entityTypes[0].properties[0].isIdentifier',
      'entityTypes[0].id',
    ]);
  });

  it('rejects invalid arrays and enum values throughout the graph', () => {
    const candidate = validOntology() as {
      entityTypes: Array<Record<string, unknown>>;
      relationships: Array<Record<string, unknown>>;
    };
    candidate.entityTypes[0].properties = [{
      name: 'status',
      type: 'unsupported',
      values: ['active', 7],
    }];
    candidate.relationships[0].cardinality = 'sometimes';
    candidate.relationships[0].kind = 'invalid';
    candidate.relationships[0].attributes = [{ name: 'since', type: 4 }];

    const result = parseOntologyValue(candidate, {
      defaultEntityColors: colors,
    });

    expect(result.ontology).toBeNull();
    expect(result.issues.map((issue) => issue.path)).toEqual([
      'entityTypes[0].properties[0].type',
      'entityTypes[0].properties[0].values[1]',
      'relationships[0].cardinality',
      'relationships[0].kind',
      'relationships[0].attributes[0].type',
    ]);
  });

  it('rejects missing nested arrays with a field-specific issue', () => {
    const candidate = validOntology() as {
      entityTypes: Array<Record<string, unknown>>;
    };
    delete candidate.entityTypes[0].properties;

    const result = parseOntologyValue(candidate, {
      defaultEntityColors: colors,
    });

    expect(result.ontology).toBeNull();
    expect(result.issues).toEqual([{
      path: 'entityTypes[0].properties',
      message: 'entityTypes[0].properties must be an array.',
    }]);
  });

  it('preserves validated RDF provenance metadata', () => {
    const candidate = validOntology() as Record<string, unknown>;
    candidate.rdfMetadata = {
      ontologyIri: 'https://example.org/inventory',
      versionIri: 'https://example.org/inventory/1.0',
      versionInfo: '1.0',
      license: 'https://example.org/license',
      imports: ['https://example.org/base'],
      preservedSourceFeatures: ['owlImports', 'shacl'],
    };

    const result = parseOntologyValue(candidate, {
      defaultEntityColors: colors,
    });

    expect(result.issues).toEqual([]);
    expect(result.ontology?.rdfMetadata).toEqual(candidate.rdfMetadata);
  });

  it('rejects malformed RDF provenance metadata', () => {
    const candidate = validOntology() as Record<string, unknown>;
    candidate.rdfMetadata = {
      imports: ['https://example.org/base', 7],
      preservedSourceFeatures: ['shacl', 'scripts'],
    };

    const result = parseOntologyValue(candidate, {
      defaultEntityColors: colors,
    });

    expect(result.ontology).toBeNull();
    expect(result.issues.map((issue) => issue.path)).toEqual([
      'rdfMetadata.preservedSourceFeatures',
      'rdfMetadata.imports[1]',
    ]);
  });
});
