import { useEffect, useRef, useCallback, useMemo } from 'react';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import type { Core } from 'cytoscape';

cytoscape.use(fcose);

interface DesignerSchemaGraphProps {
  ontology: {
    entityTypes: { id: string; name: string; icon: string; color: string }[];
    relationships: { id: string; name: string; from: string; to: string; cardinality: string }[];
  };
  darkMode: boolean;
  highlightedEntityIds?: string[];
  highlightedRelationshipIds?: string[];
  onSelectEntity?: (id: string | null) => void;
  onSelectRelationship?: (id: string | null) => void;
}

export function DesignerSchemaGraph({
  ontology,
  darkMode,
  highlightedEntityIds = [],
  highlightedRelationshipIds = [],
  onSelectEntity,
  onSelectRelationship,
}: DesignerSchemaGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  const themeColors = useMemo(
    () =>
      darkMode
        ? { nodeText: '#B3B3B3', edgeColor: '#505050', edgeText: '#808080' }
        : { nodeText: '#2A2A2A', edgeColor: '#888888', edgeText: '#555555' },
    [darkMode],
  );

  const buildElements = useCallback(() => {
    const nodes = ontology.entityTypes.map((entity) => ({
      data: { id: entity.id, label: `${entity.icon} ${entity.name}`, color: entity.color },
    }));
    const edges = ontology.relationships.map((relationship) => ({
      data: { id: relationship.id, source: relationship.from, target: relationship.to, label: relationship.name },
    }));
    return [...nodes, ...edges];
  }, [ontology]);

  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements: buildElements(),
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'font-size': '13px',
            'font-family': 'Segoe UI, sans-serif',
            'font-weight': 600,
            color: themeColors.nodeText,
            'text-margin-y': 8,
            width: 60,
            height: 60,
            'background-color': 'data(color)',
            'border-width': 2,
            'border-color': 'data(color)',
            'border-opacity': 0.5,
          },
        },
        {
          selector: 'node.is-highlighted',
          style: {
            'border-width': 5,
            'border-color': '#00a9e0',
            width: 74,
            height: 74,
          },
        },
        {
          selector: 'edge',
          style: {
            label: 'data(label)',
            'font-size': '11px',
            'font-family': 'Segoe UI, sans-serif',
            color: themeColors.edgeText,
            'text-rotation': 'autorotate',
            'text-margin-y': -8,
            width: 2,
            'line-color': themeColors.edgeColor,
            'target-arrow-color': themeColors.edgeColor,
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
          },
        },
        {
          selector: 'edge.is-highlighted',
          style: {
            width: 4,
            'line-color': '#00a9e0',
            'target-arrow-color': '#00a9e0',
            color: '#00a9e0',
          },
        },
      ],
      layout: {
        name: ontology.entityTypes.length > 0 ? 'fcose' : 'grid',
        animate: false,
        fit: true,
        padding: 40,
        nodeDimensionsIncludeLabels: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      minZoom: 0.3,
      maxZoom: 3,
    });

    cy.on('tap', 'node', (evt) => onSelectEntity?.(evt.target.id()));
    cy.on('tap', 'edge', (evt) => onSelectRelationship?.(evt.target.id()));
    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        onSelectEntity?.(null);
        onSelectRelationship?.(null);
      }
    });

    cyRef.current = cy;

    const observer = new ResizeObserver(() => {
      cy.resize();
      cy.fit(undefined, 40);
    });
    observer.observe(containerRef.current);

    requestAnimationFrame(() => {
      cy.resize();
      cy.fit(undefined, 40);
    });

    return () => {
      observer.disconnect();
      cy.destroy();
      cyRef.current = null;
    };
  }, [buildElements, themeColors, onSelectEntity, onSelectRelationship, ontology.entityTypes.length]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.nodes().removeClass('is-highlighted');
    cy.edges().removeClass('is-highlighted');

    highlightedEntityIds.forEach((id) => cy.getElementById(id).addClass('is-highlighted'));
    highlightedRelationshipIds.forEach((id) => cy.getElementById(id).addClass('is-highlighted'));
    requestAnimationFrame(() => {
      cy.resize();
      cy.fit(undefined, 40);
    });
  }, [highlightedEntityIds, highlightedRelationshipIds]);

  return <div ref={containerRef} className="designer-graph-container" />;
}
