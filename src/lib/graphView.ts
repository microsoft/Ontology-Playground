import type {
  EntityType,
  Ontology,
  Relationship,
} from '../data/ontology';

export const DENSE_GRAPH_NODE_THRESHOLD = 80;
export const DENSE_GRAPH_EDGE_THRESHOLD = 200;
export const DENSE_GRAPH_ELEMENT_THRESHOLD = 250;
export const OCCLUDED_GRAPH_NODE_THRESHOLD = 300;
export const OCCLUDED_GRAPH_EDGE_THRESHOLD = 600;
export const OCCLUDED_GRAPH_ELEMENT_THRESHOLD = 1_000;
export const MAX_RENDERED_NODES = 180;
export const MAX_RENDERED_EDGES = 360;
export const DEFAULT_OVERVIEW_NODE_LIMIT = 60;
export const DEFAULT_LARGE_GRAPH_DEPTH = 1;
export const BOUNDED_LABEL_ZOOM_THRESHOLD = 1.8;
export const LARGE_GRAPH_LONG_TASK_BUDGET_MS = 200;
export const LARGE_GRAPH_RETAINED_HEAP_BUDGET_BYTES = 40 * 1024 * 1024;
export const LARGE_GRAPH_INTERACTION_BUDGET_MS = 200;

const MAX_ROOT_SEEDS = 24;
const MAX_SEARCH_SEEDS = 8;

export type GraphViewMode = 'full' | 'dense' | 'bounded';
export type GraphScaleTier = 'standard' | 'dense' | 'massive';

export interface GraphViewOptions {
  search?: string;
  depth?: number;
  expandedNodeIds?: Iterable<string>;
  priorityEntityIds?: Iterable<string>;
  priorityRelationshipIds?: Iterable<string>;
}

export interface GraphView {
  mode: GraphViewMode;
  tier: GraphScaleTier;
  entities: EntityType[];
  relationships: Relationship[];
  rootIds: string[];
  searchMatchCount: number;
  visibleNodeCount: number;
  visibleEdgeCount: number;
  hiddenNodeCount: number;
  hiddenEdgeCount: number;
  hiddenNeighborCounts: ReadonlyMap<string, number>;
  truncated: boolean;
}

export function graphScaleTier(ontology: Ontology): GraphScaleTier {
  const nodeCount = ontology.entityTypes.length;
  const edgeCount = ontology.relationships.length;
  const elementCount = nodeCount + edgeCount;

  if (
    nodeCount >= OCCLUDED_GRAPH_NODE_THRESHOLD
    || edgeCount >= OCCLUDED_GRAPH_EDGE_THRESHOLD
    || elementCount >= OCCLUDED_GRAPH_ELEMENT_THRESHOLD
  ) {
    return 'massive';
  }

  if (
    nodeCount >= DENSE_GRAPH_NODE_THRESHOLD
    || edgeCount >= DENSE_GRAPH_EDGE_THRESHOLD
    || elementCount >= DENSE_GRAPH_ELEMENT_THRESHOLD
  ) {
    return 'dense';
  }

  return 'standard';
}

function isHierarchyRelationship(relationship: Relationship): boolean {
  if (relationship.kind === 'subclass') return true;
  const semanticName = `${relationship.id} ${relationship.name}`
    .toLocaleLowerCase()
    .replace(/[^a-z]/g, '');
  return semanticName.includes('subclassof');
}

function findRootIds(
  entityIds: readonly string[],
  relationships: readonly Relationship[],
  hierarchyDirected = false,
): string[] {
  const incoming = new Map(entityIds.map((id) => [id, 0]));
  const outgoing = new Map(entityIds.map((id) => [id, 0]));

  for (const relationship of relationships) {
    if (!incoming.has(relationship.from) || !incoming.has(relationship.to)) {
      continue;
    }
    outgoing.set(
      relationship.from,
      (outgoing.get(relationship.from) ?? 0) + 1,
    );
    incoming.set(
      relationship.to,
      (incoming.get(relationship.to) ?? 0) + 1,
    );
  }

  const sinks = entityIds.filter(
    (id) => outgoing.get(id) === 0 && (incoming.get(id) ?? 0) > 0,
  );
  const sources = entityIds.filter(
    (id) => incoming.get(id) === 0 && (outgoing.get(id) ?? 0) > 0,
  );
  const isolated = entityIds.filter(
    (id) => incoming.get(id) === 0 && outgoing.get(id) === 0,
  );
  const connectedRoots = hierarchyDirected
    ? sinks
    : sinks.length > 0 && sources.length > 0
      ? (sinks.length <= sources.length ? sinks : sources)
      : (sinks.length > 0 ? sinks : sources);
  const roots = [...connectedRoots, ...isolated];

  return (roots.length > 0 ? roots : entityIds).slice(0, MAX_ROOT_SEEDS);
}

function addNeighbor(
  adjacency: Map<string, Set<string>>,
  from: string,
  to: string,
): void {
  const neighbors = adjacency.get(from);
  if (neighbors) {
    neighbors.add(to);
  } else {
    adjacency.set(from, new Set([to]));
  }
}

function buildUndirectedAdjacency(
  entityIds: ReadonlySet<string>,
  relationships: readonly Relationship[],
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();

  for (const relationship of relationships) {
    if (
      !entityIds.has(relationship.from)
      || !entityIds.has(relationship.to)
    ) {
      continue;
    }
    addNeighbor(adjacency, relationship.from, relationship.to);
    addNeighbor(adjacency, relationship.to, relationship.from);
  }

  return adjacency;
}

function buildHierarchyChildren(
  entityIds: ReadonlySet<string>,
  relationships: readonly Relationship[],
): Map<string, Set<string>> {
  const children = new Map<string, Set<string>>();

  for (const relationship of relationships) {
    if (
      !entityIds.has(relationship.from)
      || !entityIds.has(relationship.to)
    ) {
      continue;
    }
    addNeighbor(children, relationship.to, relationship.from);
  }

  return children;
}

interface GraphTopology {
  entityIds: Set<string>;
  validRelationships: Relationship[];
  rootIds: string[];
  adjacency: Map<string, Set<string>>;
  hierarchyChildren: Map<string, Set<string>>;
}

function buildGraphTopology(ontology: Ontology): GraphTopology {
  const entityIds = new Set(ontology.entityTypes.map((entity) => entity.id));
  const validRelationships = ontology.relationships.filter(
    (relationship) => (
      entityIds.has(relationship.from) && entityIds.has(relationship.to)
    ),
  );
  const hierarchyRelationships = validRelationships.filter(
    isHierarchyRelationship,
  );
  const rootIds = findRootIds(
    [...entityIds],
    hierarchyRelationships.length > 0
      ? hierarchyRelationships
      : validRelationships,
    hierarchyRelationships.length > 0,
  );
  const adjacency = buildUndirectedAdjacency(entityIds, validRelationships);
  const hierarchyChildren = hierarchyRelationships.length > 0
    ? buildHierarchyChildren(entityIds, hierarchyRelationships)
    : adjacency;

  return {
    entityIds,
    validRelationships,
    rootIds,
    adjacency,
    hierarchyChildren,
  };
}

function maxUsefulDepth(
  rootIds: readonly string[],
  hierarchyChildren: ReadonlyMap<string, ReadonlySet<string>>,
): number {
  const seen = new Set(rootIds.slice(0, MAX_RENDERED_NODES));
  let frontier = [...seen];
  let depth = 0;

  while (frontier.length > 0 && seen.size < MAX_RENDERED_NODES) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const childId of hierarchyChildren.get(id) ?? []) {
        if (seen.has(childId)) continue;
        seen.add(childId);
        next.push(childId);
        if (seen.size >= MAX_RENDERED_NODES) break;
      }
      if (seen.size >= MAX_RENDERED_NODES) break;
    }
    if (next.length === 0) break;
    depth += 1;
    frontier = next;
  }

  return Math.max(DEFAULT_LARGE_GRAPH_DEPTH, depth);
}

export function graphViewMaxDepth(ontology: Ontology): number {
  if (graphScaleTier(ontology) !== 'massive') {
    return DEFAULT_LARGE_GRAPH_DEPTH;
  }
  const { rootIds, hierarchyChildren } = buildGraphTopology(ontology);
  return maxUsefulDepth(rootIds, hierarchyChildren);
}

function addNeighborhood(
  selectedIds: Set<string>,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  seeds: Iterable<string>,
  depth: number,
  nodeLimit = MAX_RENDERED_NODES,
): void {
  const queue: Array<{ id: string; depth: number }> = [];
  const visited = new Set<string>();

  for (const id of seeds) {
    if (selectedIds.size >= nodeLimit) break;
    if (visited.has(id)) continue;
    visited.add(id);
    selectedIds.add(id);
    queue.push({ id, depth: 0 });
  }

  for (let index = 0; index < queue.length; index += 1) {
    if (selectedIds.size >= nodeLimit) break;
    const item = queue[index];
    if (item.depth >= depth) continue;

    for (const neighborId of adjacency.get(item.id) ?? []) {
      if (visited.has(neighborId)) continue;
      visited.add(neighborId);
      selectedIds.add(neighborId);
      queue.push({ id: neighborId, depth: item.depth + 1 });
      if (selectedIds.size >= nodeLimit) break;
    }
  }
}

function matchingEntities(
  entities: readonly EntityType[],
  search: string,
): EntityType[] {
  const query = search.trim().toLocaleLowerCase();
  if (!query) return [];

  return entities
    .map((entity, index) => {
      const id = entity.id.toLocaleLowerCase();
      const name = entity.name.toLocaleLowerCase();
      const description = entity.description.toLocaleLowerCase();
      const rank = id === query || name === query
        ? 0
        : id.startsWith(query) || name.startsWith(query)
          ? 1
          : id.includes(query) || name.includes(query)
            ? 2
            : description.includes(query)
              ? 3
              : -1;
      return { entity, index, rank };
    })
    .filter((match) => match.rank >= 0)
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((match) => match.entity);
}

function completeView(
  ontology: Ontology,
  tier: Exclude<GraphScaleTier, 'massive'>,
): GraphView {
  return {
    mode: tier === 'dense' ? 'dense' : 'full',
    tier,
    entities: ontology.entityTypes,
    relationships: ontology.relationships,
    rootIds: [],
    searchMatchCount: 0,
    visibleNodeCount: ontology.entityTypes.length,
    visibleEdgeCount: ontology.relationships.length,
    hiddenNodeCount: 0,
    hiddenEdgeCount: 0,
    hiddenNeighborCounts: new Map(),
    truncated: false,
  };
}

export function createGraphView(
  ontology: Ontology,
  options: GraphViewOptions = {},
): GraphView {
  const tier = graphScaleTier(ontology);
  if (tier !== 'massive') {
    return completeView(ontology, tier);
  }

  const {
    entityIds,
    validRelationships,
    rootIds,
    adjacency,
    hierarchyChildren,
  } = buildGraphTopology(ontology);
  const searchMatches = matchingEntities(
    ontology.entityTypes,
    options.search ?? '',
  );
  const primarySeeds = searchMatches.length > 0
    ? searchMatches.slice(0, MAX_SEARCH_SEEDS).map((entity) => entity.id)
    : rootIds;
  const depth = Math.min(
    maxUsefulDepth(rootIds, hierarchyChildren),
    Math.max(
      DEFAULT_LARGE_GRAPH_DEPTH,
      Math.floor(options.depth ?? DEFAULT_LARGE_GRAPH_DEPTH),
    ),
  );
  const expandedNodeIds = new Set(
    [...(options.expandedNodeIds ?? [])].filter((id) => entityIds.has(id)),
  );
  const priorityEntityIds = new Set(
    [...(options.priorityEntityIds ?? [])].filter((id) => entityIds.has(id)),
  );
  const priorityRelationshipIds = new Set(
    options.priorityRelationshipIds ?? [],
  );
  const priorityRelationships = validRelationships.filter((relationship) => (
    priorityRelationshipIds.has(relationship.id)
  ));
  for (const relationship of priorityRelationships) {
    priorityEntityIds.add(relationship.from);
    priorityEntityIds.add(relationship.to);
  }
  const selectedIds = new Set<string>();
  const baseNodeLimit = (
    searchMatches.length === 0
    && depth === DEFAULT_LARGE_GRAPH_DEPTH
  )
    ? DEFAULT_OVERVIEW_NODE_LIMIT
    : MAX_RENDERED_NODES;

  for (const id of priorityEntityIds) {
    if (selectedIds.size >= MAX_RENDERED_NODES) break;
    selectedIds.add(id);
  }
  const baseIds = new Set<string>();
  addNeighborhood(
    baseIds,
    searchMatches.length > 0 ? adjacency : hierarchyChildren,
    primarySeeds,
    depth,
    baseNodeLimit,
  );
  for (const id of baseIds) {
    if (selectedIds.size >= MAX_RENDERED_NODES) break;
    selectedIds.add(id);
  }
  addNeighborhood(
    selectedIds,
    adjacency,
    priorityEntityIds,
    1,
    MAX_RENDERED_NODES,
  );
  for (const id of expandedNodeIds) {
    addNeighborhood(
      selectedIds,
      adjacency,
      [id],
      1,
      MAX_RENDERED_NODES,
    );
  }

  if (selectedIds.size === 0 && ontology.entityTypes[0]) {
    selectedIds.add(ontology.entityTypes[0].id);
  }

  const entities = ontology.entityTypes.filter(
    (entity) => selectedIds.has(entity.id),
  );
  const visibleRelationships = validRelationships.filter(
    (relationship) => (
      selectedIds.has(relationship.from) && selectedIds.has(relationship.to)
    ),
  );
  const remainingRelationships = visibleRelationships.filter(
    (relationship) => !priorityRelationshipIds.has(relationship.id),
  );
  const foregroundNodeIds = new Set([
    ...priorityEntityIds,
    ...expandedNodeIds,
  ]);
  const relationships = [
    ...visibleRelationships.filter((relationship) => (
      priorityRelationshipIds.has(relationship.id)
    )),
    ...remainingRelationships.filter((relationship) => (
      foregroundNodeIds.has(relationship.from)
      || foregroundNodeIds.has(relationship.to)
    )),
    ...remainingRelationships.filter((relationship) => (
      !foregroundNodeIds.has(relationship.from)
      && !foregroundNodeIds.has(relationship.to)
      && isHierarchyRelationship(relationship)
    )),
    ...remainingRelationships.filter((relationship) => (
      !foregroundNodeIds.has(relationship.from)
      && !foregroundNodeIds.has(relationship.to)
      && !isHierarchyRelationship(relationship)
    )),
  ].slice(0, MAX_RENDERED_EDGES);
  const hiddenNeighborCounts = new Map<string, number>();

  for (const id of selectedIds) {
    let hiddenCount = 0;
    for (const neighborId of adjacency.get(id) ?? []) {
      if (!selectedIds.has(neighborId)) hiddenCount += 1;
    }
    if (hiddenCount > 0) hiddenNeighborCounts.set(id, hiddenCount);
  }

  return {
    mode: 'bounded',
    tier,
    entities,
    relationships,
    rootIds,
    searchMatchCount: searchMatches.length,
    visibleNodeCount: entities.length,
    visibleEdgeCount: relationships.length,
    hiddenNodeCount: ontology.entityTypes.length - entities.length,
    hiddenEdgeCount: ontology.relationships.length - relationships.length,
    hiddenNeighborCounts,
    truncated: (
      entities.length < ontology.entityTypes.length
      || relationships.length < ontology.relationships.length
    ),
  };
}
