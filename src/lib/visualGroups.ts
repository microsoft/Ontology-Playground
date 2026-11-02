import type { ElementDefinition } from 'cytoscape';

export const VISUAL_GROUP_NODE_TYPE = 'visual-group';
const VISUAL_GROUP_NODE_PREFIX = '__visual_group__:';

export interface VisualGroupEntity {
  id: string;
  visualGroup?: string;
}

export interface VisualGroupProjection {
  nodes: ElementDefinition[];
  parentByEntityId: ReadonlyMap<string, string>;
}

function groupNodeId(label: string, usedIds: Set<string>): string {
  const base = `${VISUAL_GROUP_NODE_PREFIX}${encodeURIComponent(label)}`;
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}:${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

/**
 * Builds visual-only Cytoscape compound parents. A group needs at least two
 * visible members so bounded views do not draw empty-looking singleton boxes.
 */
export function buildVisualGroupProjection(
  entities: readonly VisualGroupEntity[],
  reservedIds: Iterable<string> = [],
): VisualGroupProjection {
  const membersByLabel = new Map<string, string[]>();
  for (const entity of entities) {
    const label = entity.visualGroup?.trim();
    if (!label) continue;
    const members = membersByLabel.get(label);
    if (members) members.push(entity.id);
    else membersByLabel.set(label, [entity.id]);
  }

  const usedIds = new Set([
    ...entities.map((entity) => entity.id),
    ...reservedIds,
  ]);
  const nodes: ElementDefinition[] = [];
  const parentByEntityId = new Map<string, string>();
  const labels = [...membersByLabel.keys()].sort((left, right) =>
    left.localeCompare(right),
  );

  for (const label of labels) {
    const members = membersByLabel.get(label) ?? [];
    if (members.length < 2) continue;
    const id = groupNodeId(label, usedIds);
    nodes.push({
      data: {
        id,
        label,
        type: VISUAL_GROUP_NODE_TYPE,
      },
      selectable: false,
      grabbable: false,
    });
    for (const entityId of members) parentByEntityId.set(entityId, id);
  }

  return { nodes, parentByEntityId };
}

export function isVisualGroupElement(element: ElementDefinition): boolean {
  return element.data.type === VISUAL_GROUP_NODE_TYPE;
}
