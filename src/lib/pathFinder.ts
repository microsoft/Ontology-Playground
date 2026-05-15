import type { Relationship } from '../data/ontology';

export interface PathNode {
  entityId: string;
  via?: { rel: Relationship };
}

/**
 * Finds the shortest directed path by hop count using BFS.
 */
export function findShortestPath(
  fromId: string,
  toId: string,
  relationships: Relationship[]
): PathNode[] | null {
  if (fromId === toId) return null;

  const adjacency: Record<string, { neighbourId: string; rel: Relationship }[]> = {};
  for (const rel of relationships) {
    if (!adjacency[rel.from]) adjacency[rel.from] = [];
    adjacency[rel.from].push({ neighbourId: rel.to, rel });
  }

  const visited = new Set<string>([fromId]);
  const queue: { entityId: string; path: PathNode[] }[] = [
    { entityId: fromId, path: [{ entityId: fromId }] },
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    for (const { neighbourId, rel } of adjacency[current.entityId] ?? []) {
      if (visited.has(neighbourId)) continue;

      visited.add(neighbourId);
      const nextPath = [...current.path, { entityId: neighbourId, via: { rel } }];

      if (neighbourId === toId) {
        return nextPath;
      }

      queue.push({ entityId: neighbourId, path: nextPath });
    }
  }

  return null;
}