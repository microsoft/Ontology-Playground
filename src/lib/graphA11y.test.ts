import { describe, expect, it } from 'vitest';
import { describeOntologyGraph } from './graphA11y';
import type { EntityType, Ontology, Relationship } from '../data/ontology';

function entityTypes(count: number): EntityType[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `entity-${index}`,
    name: `Entity ${index}`,
    description: '',
    properties: [],
    icon: '📦',
    color: '#0078D4',
  }));
}

function relationships(count: number): Relationship[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `rel-${index}`,
    name: `relates${index}`,
    from: 'entity-0',
    to: 'entity-0',
    cardinality: 'one-to-many' as const,
  }));
}

function ontology(name: string, entities: number, rels: number): Ontology {
  return {
    name,
    description: '',
    entityTypes: entityTypes(entities),
    relationships: relationships(rels),
  };
}

describe('describeOntologyGraph', () => {
  it('names the ontology and counts its full model', () => {
    expect(describeOntologyGraph(ontology('Fourth Coffee', 6, 7))).toBe(
      'Fourth Coffee ontology graph: 6 entity types, 7 relationships. Interactive diagram.',
    );
  });

  it('uses singular nouns for a count of one', () => {
    expect(describeOntologyGraph(ontology('Tiny', 1, 1))).toContain('1 entity type, 1 relationship.');
  });

  it('describes an empty ontology without crashing', () => {
    expect(describeOntologyGraph(ontology('Blank', 0, 0))).toBe(
      'Blank ontology graph: 0 entity types, 0 relationships. Interactive diagram.',
    );
  });

  it('falls back to a generic subject when the ontology is unnamed', () => {
    expect(describeOntologyGraph(ontology('', 2, 1))).toBe(
      'Ontology graph: 2 entity types, 1 relationship. Interactive diagram.',
    );
  });

  it('ignores a whitespace-only ontology name', () => {
    expect(describeOntologyGraph(ontology('   ', 2, 1))).toBe(
      'Ontology graph: 2 entity types, 1 relationship. Interactive diagram.',
    );
  });

  it('distinguishes the visible semantic overview from ontology totals', () => {
    expect(describeOntologyGraph(ontology('Taxonomy', 350, 349), {
      mode: 'bounded',
      visibleNodeCount: 4,
      visibleEdgeCount: 3,
    })).toBe(
      'Taxonomy ontology graph: 350 entity types, 349 relationships. Semantic overview showing 4 entity types and 3 relationships. Interactive diagram.',
    );
  });

  it('uses singular nouns and zero counts in a bounded view', () => {
    expect(describeOntologyGraph(ontology('Taxonomy', 350, 349), {
      mode: 'bounded',
      visibleNodeCount: 1,
      visibleEdgeCount: 0,
    })).toContain('Semantic overview showing 1 entity type and 0 relationships.');
  });

  it('does not describe dense complete graphs as semantic overviews', () => {
    expect(describeOntologyGraph(ontology('Dense', 90, 89), {
      mode: 'dense',
      visibleNodeCount: 90,
      visibleEdgeCount: 89,
    })).toBe(
      'Dense ontology graph: 90 entity types, 89 relationships. Interactive diagram.',
    );
  });
});
