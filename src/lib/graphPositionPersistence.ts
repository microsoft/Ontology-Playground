import type {
  Core,
  ElementDefinition,
  Position,
} from 'cytoscape';

export interface GraphPositionSnapshot {
  positions: ReadonlyMap<string, Position>;
  zoom: number;
  pan: Position;
  anchorId?: string;
}

interface EdgeEndpoints {
  source: string;
  target: string;
  kind?: string;
}

function elementId(element: ElementDefinition): string | null {
  return typeof element.data.id === 'string' ? element.data.id : null;
}

function edgeEndpoints(element: ElementDefinition): EdgeEndpoints | null {
  const source = element.data.source;
  const target = element.data.target;
  return typeof source === 'string' && typeof target === 'string'
    ? {
        source,
        target,
        kind: typeof element.data.kind === 'string'
          ? element.data.kind
          : undefined,
      }
    : null;
}

function averagePosition(positions: readonly Position[]): Position {
  const total = positions.reduce(
    (sum, position) => ({
      x: sum.x + position.x,
      y: sum.y + position.y,
    }),
    { x: 0, y: 0 },
  );
  return {
    x: total.x / positions.length,
    y: total.y / positions.length,
  };
}

function radialOffset(index: number): Position {
  let ring = 1;
  let slot = index;
  let capacity = 8;

  while (slot >= capacity) {
    slot -= capacity;
    ring += 1;
    capacity = ring * 8;
  }

  const angle = (slot / capacity) * Math.PI * 2;
  const radius = ring * 90;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function properIntersection(
  a: Position,
  b: Position,
  c: Position,
  d: Position,
): boolean {
  const cross = (p: Position, q: Position, r: Position) => (
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  );
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return (
    ((abC > 0 && abD < 0) || (abC < 0 && abD > 0))
    && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))
  );
}

function angleDistance(left: number, right: number): number {
  const difference = Math.abs(left - right) % (Math.PI * 2);
  return Math.min(difference, Math.PI * 2 - difference);
}

function fallbackAngle(id: string): number {
  const degrees = [...id].reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0,
  ) % 360;
  return degrees * (Math.PI / 180);
}

export function captureGraphPositionSnapshot(
  cy: Core,
  anchorId?: string,
): GraphPositionSnapshot | null {
  const positions = new Map<string, Position>();
  cy.nodes().forEach((node) => {
    const position = node.position();
    positions.set(node.id(), { x: position.x, y: position.y });
  });

  if (positions.size === 0) return null;

  const pan = cy.pan();
  return {
    positions,
    zoom: cy.zoom(),
    pan: { x: pan.x, y: pan.y },
    anchorId,
  };
}

export function preserveGraphElementPositions(
  elements: readonly ElementDefinition[],
  snapshot: GraphPositionSnapshot,
): ElementDefinition[] | null {
  const visibleNodeIds = new Set(
    elements
      .filter((element) => edgeEndpoints(element) === null)
      .map(elementId)
      .filter((id): id is string => id !== null),
  );
  const assignedPositions = new Map<string, Position>();

  for (const [id, position] of snapshot.positions) {
    if (visibleNodeIds.has(id)) assignedPositions.set(id, position);
  }
  if (assignedPositions.size === 0) return null;

  const edges: EdgeEndpoints[] = [];
  const neighbors = new Map<string, Map<string, boolean>>();
  const addNeighbor = (
    id: string,
    neighborId: string,
    isHierarchyParent: boolean,
  ) => {
    if (!neighbors.has(id)) neighbors.set(id, new Map());
    const current = neighbors.get(id)?.get(neighborId) ?? false;
    neighbors.get(id)?.set(neighborId, current || isHierarchyParent);
  };

  for (const element of elements) {
    const endpoints = edgeEndpoints(element);
    if (!endpoints) continue;
    edges.push(endpoints);
    addNeighbor(
      endpoints.source,
      endpoints.target,
      endpoints.kind === 'subclass',
    );
    addNeighbor(endpoints.target, endpoints.source, false);
  }

  const retainedPositions = [...assignedPositions.values()];
  const centroid = averagePosition(retainedPositions);
  const anchorPosition = snapshot.anchorId
    ? assignedPositions.get(snapshot.anchorId)
    : undefined;
  const fallbackPosition = anchorPosition ?? centroid;
  const unassignedNodeIds = new Set(
    [...visibleNodeIds].filter((id) => !assignedPositions.has(id)),
  );
  const positionedEdgeIndexes = new Set<number>();
  const positionedSegments: Array<{ from: Position; to: Position }> = [];
  const addPositionedSegments = (nodeId?: string) => {
    edges.forEach((edge, index) => {
      if (positionedEdgeIndexes.has(index)) return;
      if (
        nodeId
        && edge.source !== nodeId
        && edge.target !== nodeId
      ) {
        return;
      }
      const from = assignedPositions.get(edge.source);
      const to = assignedPositions.get(edge.target);
      if (!from || !to) return;
      positionedEdgeIndexes.add(index);
      positionedSegments.push({ from, to });
    });
  };
  addPositionedSegments();

  const angleOffsets = [
    0,
    Math.PI / 12,
    -Math.PI / 12,
    Math.PI / 6,
    -Math.PI / 6,
    Math.PI / 4,
    -Math.PI / 4,
    Math.PI / 3,
    -Math.PI / 3,
    (Math.PI * 5) / 12,
    (-Math.PI * 5) / 12,
    Math.PI / 2,
    -Math.PI / 2,
  ];
  const radii = [110, 160, 220, 290, 370];

  while (unassignedNodeIds.size > 0) {
    const placeableNodes = [...unassignedNodeIds]
      .map((id) => ({
        id,
        assignedNeighbors: [...(neighbors.get(id) ?? [])]
          .filter(([neighborId]) => assignedPositions.has(neighborId)),
      }))
      .filter(({ assignedNeighbors }) => assignedNeighbors.length > 0)
      .sort((left, right) => (
        right.assignedNeighbors.length - left.assignedNeighbors.length
        || left.id.localeCompare(right.id)
      ));
    if (placeableNodes.length === 0) break;

    for (const { id, assignedNeighbors } of placeableNodes) {
      if (!unassignedNodeIds.has(id)) continue;
      const [anchorId] = (
        assignedNeighbors.find(([, isHierarchyParent]) => isHierarchyParent)
        ?? assignedNeighbors[0]
      );
      const anchor = assignedPositions.get(anchorId);
      if (!anchor) continue;
      const hierarchyParentId = [...(neighbors.get(anchorId) ?? [])]
        .find(([, isHierarchyParent]) => isHierarchyParent)?.[0];
      const hierarchyParent = hierarchyParentId
        ? assignedPositions.get(hierarchyParentId)
        : undefined;
      const directionOrigin = hierarchyParent ?? centroid;
      let baseAngle = Math.atan2(
        anchor.y - directionOrigin.y,
        anchor.x - directionOrigin.x,
      );
      if (
        Math.abs(anchor.x - directionOrigin.x) < 1
        && Math.abs(anchor.y - directionOrigin.y) < 1
      ) {
        baseAngle = fallbackAngle(id);
      }

      const connectionPositions = assignedNeighbors
        .map(([neighborId]) => assignedPositions.get(neighborId))
        .filter((position): position is Position => position !== undefined);
      let bestPosition: Position | null = null;
      let bestScore = Number.POSITIVE_INFINITY;

      for (const radius of radii) {
        for (const offset of angleOffsets) {
          const angle = baseAngle + offset;
          const position = {
            x: anchor.x + Math.cos(angle) * radius,
            y: anchor.y + Math.sin(angle) * radius,
          };
          let crossings = 0;
          for (const connection of connectionPositions) {
            for (const segment of positionedSegments) {
              if (
                properIntersection(
                  connection,
                  position,
                  segment.from,
                  segment.to,
                )
              ) {
                crossings += 1;
              }
            }
          }

          let overlapPenalty = 0;
          for (const existingPosition of assignedPositions.values()) {
            const deltaX = position.x - existingPosition.x;
            const deltaY = position.y - existingPosition.y;
            const distanceSquared = deltaX * deltaX + deltaY * deltaY;
            if (distanceSquared < 80 ** 2) {
              const distance = Math.sqrt(distanceSquared);
              overlapPenalty += (80 - distance) ** 2;
            }
          }
          const edgeLength = connectionPositions.reduce(
            (sum, connection) => sum + Math.hypot(
              position.x - connection.x,
              position.y - connection.y,
            ),
            0,
          );
          const score = (
            crossings * 1_000_000
            + overlapPenalty * 1_000
            + angleDistance(angle, baseAngle) * 100
            + edgeLength
          );
          if (score < bestScore) {
            bestPosition = position;
            bestScore = score;
          }
        }
      }

      if (!bestPosition) continue;
      assignedPositions.set(id, bestPosition);
      unassignedNodeIds.delete(id);
      addPositionedSegments(id);
    }
  }

  let disconnectedNodeIndex = 0;
  for (const id of unassignedNodeIds) {
    const offset = radialOffset(disconnectedNodeIndex);
    disconnectedNodeIndex += 1;
    assignedPositions.set(id, {
      x: fallbackPosition.x + offset.x,
      y: fallbackPosition.y + offset.y,
    });
  }

  return elements.map((element) => {
    if (edgeEndpoints(element)) return element;

    const id = elementId(element);
    if (!id) return element;

    const position = assignedPositions.get(id);
    return position ? { ...element, position } : element;
  });
}

export function restoreGraphViewport(
  cy: Core,
  snapshot: GraphPositionSnapshot,
): void {
  cy.zoom(snapshot.zoom);
  cy.pan(snapshot.pan);
}
