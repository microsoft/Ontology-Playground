import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import type { Ontology, Relationship } from '../data/ontology';
import {
  createGraphView,
  DEFAULT_OVERVIEW_NODE_LIMIT,
  graphScaleTier,
  graphViewMaxDepth,
  MAX_RENDERED_EDGES,
  MAX_RENDERED_NODES,
} from './graphView';

function createTreeOntology(
  nodeCount: number,
  relationshipCount = nodeCount - 1,
): Ontology {
  const entityTypes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `node-${index}`,
    name: `Node ${index}`,
    description: `Taxonomy node ${index}`,
    properties: [],
    icon: 'N',
    color: '#0078D4',
  }));
  const relationships: Relationship[] = [];

  for (let index = 1; index < entityTypes.length; index += 1) {
    relationships.push({
      id: `parent-${index}`,
      name: 'subClassOf',
      from: entityTypes[index].id,
      to: entityTypes[Math.floor((index - 1) / 3)].id,
      cardinality: 'many-to-one',
      kind: 'subclass',
    });
  }
  for (let index = 0; relationships.length < relationshipCount; index += 1) {
    relationships.push({
      id: `related-${index}`,
      name: 'relatedTo',
      from: entityTypes[index % entityTypes.length].id,
      to: entityTypes[(index + 17) % entityTypes.length].id,
      cardinality: 'many-to-many',
    });
  }

  return {
    name: 'Taxonomy fixture',
    description: 'Graph projection fixture',
    entityTypes,
    relationships,
  };
}

describe('adaptive graph views', () => {
  it('keeps small ontologies complete', () => {
    const ontology = createTreeOntology(12);
    const view = createGraphView(ontology);

    expect(view.mode).toBe('full');
    expect(view.tier).toBe('standard');
    expect(view.entities).toBe(ontology.entityTypes);
    expect(view.relationships).toBe(ontology.relationships);
    expect(view.truncated).toBe(false);
  });

  it('keeps dense ontologies complete while selecting the dense visual tier', () => {
    const ontology = createTreeOntology(86, 312);
    const view = createGraphView(ontology);

    expect(graphScaleTier(ontology)).toBe('dense');
    expect(view.mode).toBe('dense');
    expect(view.visibleNodeCount).toBe(86);
    expect(view.visibleEdgeCount).toBe(312);
    expect(view.hiddenNodeCount).toBe(0);
  });

  it('projects Brick-scale graphs into a bounded hierarchy overview', () => {
    const ontology = createTreeOntology(1_518, 1_736);
    const startedAt = performance.now();
    const view = createGraphView(ontology);

    expect(performance.now() - startedAt).toBeLessThan(200);
    expect(view.mode).toBe('bounded');
    expect(view.tier).toBe('massive');
    expect(view.rootIds).toContain('node-0');
    expect(view.visibleNodeCount).toBeGreaterThan(1);
    expect(view.visibleNodeCount).toBeLessThanOrEqual(
      DEFAULT_OVERVIEW_NODE_LIMIT,
    );
    expect(view.visibleEdgeCount).toBeLessThanOrEqual(MAX_RENDERED_EDGES);
    expect(view.hiddenNodeCount).toBeGreaterThan(1_000);
    expect(view.hiddenNeighborCounts.size).toBeGreaterThan(0);
  });

  it('uses hierarchy semantics instead of relationship names when finding roots', () => {
    const ontology = createTreeOntology(1_000, 1_100);
    ontology.relationships.forEach((relationship) => {
      if (relationship.kind === 'subclass') relationship.name = 'inherits';
    });

    const view = createGraphView(ontology);

    expect(view.rootIds).toContain('node-0');
    expect(view.entities.some((entity) => entity.id === 'node-0')).toBe(true);
  });

  it('keeps sink roots when a class inherits from many parents', () => {
    const roots = Array.from({ length: 299 }, (_, index) => ({
      id: `root-${index}`,
      name: `Root ${index}`,
      description: `Hierarchy root ${index}`,
      properties: [],
      icon: 'R',
      color: '#0078D4',
    }));
    const leaf = {
      id: 'shared-leaf',
      name: 'Shared leaf',
      description: 'A class with many parents',
      properties: [],
      icon: 'L',
      color: '#107C10',
    };
    const ontology: Ontology = {
      name: 'Multiple inheritance fixture',
      description: 'Many hierarchy roots with one shared subclass',
      entityTypes: [...roots, leaf],
      relationships: roots.map((root, index) => ({
        id: `parent-${index}`,
        name: 'subClassOf',
        from: leaf.id,
        to: root.id,
        cardinality: 'many-to-one',
        kind: 'subclass',
      })),
    };

    const view = createGraphView(ontology);

    expect(view.rootIds).not.toContain(leaf.id);
    expect(view.rootIds).toHaveLength(24);
    expect(view.rootIds.every((id) => id.startsWith('root-'))).toBe(true);
    expect(view.entities.some(({ id }) => id === leaf.id)).toBe(true);
  });

  it('adapts the useful hop limit to ontology depth and render budget', () => {
    const ontology = createTreeOntology(1_518, 1_736);
    const maxDepth = graphViewMaxDepth(ontology);
    const atMax = createGraphView(ontology, { depth: maxDepth });
    const beyondMax = createGraphView(ontology, { depth: maxDepth + 10 });

    expect(maxDepth).toBeGreaterThan(1);
    expect(atMax.visibleNodeCount).toBe(MAX_RENDERED_NODES);
    expect(beyondMax.visibleNodeCount).toBe(atMax.visibleNodeCount);
    expect(beyondMax.visibleEdgeCount).toBe(atMax.visibleEdgeCount);
  });

  it('ranks exact search matches and opens their neighborhood', () => {
    const ontology = createTreeOntology(1_000, 1_100);
    const view = createGraphView(ontology, {
      search: 'Node 700',
      depth: 1,
    });

    expect(view.searchMatchCount).toBe(1);
    expect(view.entities.some((entity) => entity.id === 'node-700')).toBe(true);
    expect(view.visibleNodeCount).toBeLessThanOrEqual(MAX_RENDERED_NODES);
  });

  it('falls back to roots when search has no matches', () => {
    const ontology = createTreeOntology(1_000, 1_100);
    const view = createGraphView(ontology, { search: 'not-present' });

    expect(view.searchMatchCount).toBe(0);
    expect(view.entities.some((entity) => entity.id === 'node-0')).toBe(true);
  });

  it('prioritizes explicitly expanded hidden neighborhoods', () => {
    const ontology = createTreeOntology(1_000, 1_100);
    const view = createGraphView(ontology, {
      expandedNodeIds: ['node-900'],
    });

    expect(view.entities.some((entity) => entity.id === 'node-900')).toBe(true);
    expect(view.entities.some((entity) => entity.id === 'node-299')).toBe(true);
    expect(view.visibleNodeCount).toBeLessThanOrEqual(MAX_RENDERED_NODES);
  });

  it('retains the base projection around a high-degree priority reveal', () => {
    const visibleRoots = Array.from({ length: 24 }, (_, index) => ({
      id: `visible-root-${index}`,
      name: `Visible root ${index}`,
      description: `Visible hierarchy root ${index}`,
      properties: [],
      icon: 'R',
      color: '#0078D4',
    }));
    const hiddenHub = {
      id: 'hidden-hub',
      name: 'Hidden hub',
      description: 'A high-degree root beyond the root seed budget',
      properties: [],
      icon: 'H',
      color: '#D83B01',
    };
    const visibleChildren = Array.from({ length: 72 }, (_, index) => ({
      id: `visible-child-${index}`,
      name: `Visible child ${index}`,
      description: `Visible hierarchy child ${index}`,
      properties: [],
      icon: 'C',
      color: '#107C10',
    }));
    const hiddenChildren = Array.from({ length: 220 }, (_, index) => ({
      id: `hidden-child-${index}`,
      name: `Hidden child ${index}`,
      description: `Hidden hub child ${index}`,
      properties: [],
      icon: 'C',
      color: '#8764B8',
    }));
    const ontology: Ontology = {
      name: 'High-degree priority fixture',
      description: 'A hidden root with more neighbors than the render budget',
      entityTypes: [
        ...visibleRoots,
        hiddenHub,
        ...visibleChildren,
        ...hiddenChildren,
      ],
      relationships: [
        ...visibleChildren.map((child, index) => ({
          id: `visible-parent-${index}`,
          name: 'subClassOf',
          from: child.id,
          to: visibleRoots[index % visibleRoots.length].id,
          cardinality: 'many-to-one' as const,
          kind: 'subclass' as const,
        })),
        ...hiddenChildren.map((child, index) => ({
          id: `hidden-parent-${index}`,
          name: 'subClassOf',
          from: child.id,
          to: hiddenHub.id,
          cardinality: 'many-to-one' as const,
          kind: 'subclass' as const,
        })),
      ],
    };
    const initial = createGraphView(ontology);
    const initialIds = new Set(initial.entities.map(({ id }) => id));
    expect(initialIds.has(hiddenHub.id)).toBe(false);

    const revealed = createGraphView(ontology, {
      priorityEntityIds: [hiddenHub.id],
    });
    const revealedIds = new Set(revealed.entities.map(({ id }) => id));

    expect(revealed.visibleNodeCount).toBe(MAX_RENDERED_NODES);
    expect(revealedIds.has(hiddenHub.id)).toBe(true);
    expect([...initialIds].every((id) => revealedIds.has(id))).toBe(true);
  });

  it('never evicts visible entities when additional neighborhoods expand', () => {
    const ontology = createTreeOntology(1_518, 1_736);
    const expandedNodeIds: string[] = [];
    let view = createGraphView(ontology);
    let expansionCount = 0;

    while (
      view.visibleNodeCount < MAX_RENDERED_NODES
      && expansionCount < MAX_RENDERED_NODES
    ) {
      const boundaryId = [...view.hiddenNeighborCounts.keys()].find(
        (id) => !expandedNodeIds.includes(id),
      );
      expect(boundaryId).toBeDefined();

      const previousIds = new Set(view.entities.map(({ id }) => id));
      expandedNodeIds.push(boundaryId!);
      const nextView = createGraphView(ontology, { expandedNodeIds });
      const nextIds = new Set(nextView.entities.map(({ id }) => id));

      expect([...previousIds].every((id) => nextIds.has(id))).toBe(true);
      expect(nextView.visibleNodeCount).toBeGreaterThan(
        view.visibleNodeCount,
      );
      view = nextView;
      expansionCount += 1;
    }

    expect(view.visibleNodeCount).toBe(MAX_RENDERED_NODES);
    const blockedBoundaryId = [...view.hiddenNeighborCounts.keys()].find(
      (id) => !expandedNodeIds.includes(id),
    );
    expect(blockedBoundaryId).toBeDefined();
    const atCapacityIds = view.entities.map(({ id }) => id);

    const blockedView = createGraphView(ontology, {
      expandedNodeIds: [...expandedNodeIds, blockedBoundaryId!],
    });

    expect(blockedView.entities.map(({ id }) => id)).toEqual(atCapacityIds);
  });

  it('always includes a selected relationship and its endpoints', () => {
    const ontology = createTreeOntology(20, 700);
    const selectedRelationship = ontology.relationships[
      ontology.relationships.length - 1
    ];
    const view = createGraphView(ontology, {
      priorityRelationshipIds: [selectedRelationship.id],
    });
    const visibleIds = new Set(view.entities.map((entity) => entity.id));

    expect(view.relationships[0]).toBe(selectedRelationship);
    expect(visibleIds.has(selectedRelationship.from)).toBe(true);
    expect(visibleIds.has(selectedRelationship.to)).toBe(true);
    expect(view.visibleEdgeCount).toBeLessThanOrEqual(MAX_RENDERED_EDGES);
  });

  it('never emits relationships with hidden endpoints', () => {
    const ontology = createTreeOntology(1_518, 1_736);
    const view = createGraphView(ontology, { depth: 4 });
    const visibleIds = new Set(view.entities.map((entity) => entity.id));

    expect(view.relationships.every((relationship) => (
      visibleIds.has(relationship.from) && visibleIds.has(relationship.to)
    ))).toBe(true);
  });
});
