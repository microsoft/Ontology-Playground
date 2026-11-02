import type { Core } from 'cytoscape';
import {
  buildVisualGroupProjection,
  VISUAL_GROUP_NODE_TYPE,
} from '../../lib/visualGroups';

export interface PreviewOntology {
  entityTypes: {
    id: string;
    name: string;
    icon: string;
    color: string;
    visualGroup?: string;
  }[];
  relationships: {
    id: string;
    name: string;
    from: string;
    to: string;
    cardinality: string;
    kind?: 'association' | 'subclass';
  }[];
}

/** Reconcile the live preview without relaying out existing nodes. */
export function syncGraphElements(cy: Core, ontology: PreviewOntology) {
  const visualGroups = buildVisualGroupProjection(
    ontology.entityTypes,
    ontology.relationships.map((relationship) => relationship.id),
  );
  const desiredNodeIds = new Set([
    ...ontology.entityTypes.map((e) => e.id),
    ...visualGroups.nodes.map((node) => node.data.id as string),
  ]);
  const desiredEdgeIds = new Set(ontology.relationships.map((r) => r.id));

  const toRemove = cy.elements().filter((ele) => {
    const id = ele.id();
    return ele.isNode() ? !desiredNodeIds.has(id) : !desiredEdgeIds.has(id);
  });
  if (toRemove.length) toRemove.remove();
  const currentNodeIds = new Set(cy.nodes().map((n) => n.id()));
  // Node removal cascades to incident edges, including relationships still in the model.
  const currentEdgeIds = new Set(cy.edges().map((e) => e.id()));

  const newNodes: { data: Record<string, string>; selectable?: boolean; grabbable?: boolean }[] = [];
  for (const groupNode of visualGroups.nodes) {
    const id = groupNode.data.id as string;
    if (!currentNodeIds.has(id)) {
      newNodes.push({
        data: groupNode.data as Record<string, string>,
        selectable: false,
        grabbable: false,
      });
    }
  }
  for (const entity of ontology.entityTypes) {
    if (!currentNodeIds.has(entity.id)) {
      const parent = visualGroups.parentByEntityId.get(entity.id);
      newNodes.push({
        data: {
          id: entity.id,
          label: `${entity.icon} ${entity.name}`,
          color: entity.color,
          type: 'entity',
          ...(parent ? { parent } : {}),
        },
      });
    }
  }

  const newEdges: { data: Record<string, string> }[] = [];
  for (const rel of ontology.relationships) {
    if (!currentEdgeIds.has(rel.id)) {
      newEdges.push({
        data: {
          id: rel.id,
          source: rel.from,
          target: rel.to,
          label: rel.name,
          kind: rel.kind ?? 'association',
        },
      });
    }
  }

  if (newNodes.length || newEdges.length) {
    cy.add([...newNodes, ...newEdges]);
    const newEntityNodes = newNodes.filter(
      (node) => node.data.type !== VISUAL_GROUP_NODE_TYPE,
    );
    if (newEntityNodes.length) {
      const newEles = cy.collection();
      for (const n of newEntityNodes) {
        newEles.merge(cy.getElementById(n.data.id));
      }
      const { x1, y1, w, h } = cy.extent();
      const cx = x1 + w / 2;
      const cy2 = y1 + h / 2;
      newEles.forEach((ele, i) => {
        ele.position({ x: cx + (i - newEntityNodes.length / 2) * 80, y: cy2 });
      });
    }
    cy.fit(undefined, 40);
  }

  for (const entity of ontology.entityTypes) {
    const node = cy.getElementById(entity.id);
    if (node.length) {
      const parent = visualGroups.parentByEntityId.get(entity.id) ?? null;
      const currentParent = node.parent()[0]?.id() ?? null;
      if (currentParent !== parent) node.move({ parent });
      node.data('label', `${entity.icon} ${entity.name}`);
      node.data('color', entity.color);
      node.data('type', 'entity');
    }
  }
  for (const rel of ontology.relationships) {
    const edge = cy.getElementById(rel.id);
    if (!edge.length) continue;
    // Cytoscape ignores source/target data writes; move updates topology.
    const updatedEdge = edge.data('source') !== rel.from || edge.data('target') !== rel.to
      ? edge.move({ source: rel.from, target: rel.to })
      : edge;
    updatedEdge.data('label', rel.name);
    updatedEdge.data('kind', rel.kind ?? 'association');
  }
}
