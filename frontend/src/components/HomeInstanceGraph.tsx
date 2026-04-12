import { useEffect, useMemo, useRef } from 'react';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import type { Core, LayoutOptions } from 'cytoscape';
import { Maximize2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { useAlignmentStore } from '../store/alignmentStore';
import { useAppStore } from '../store/appStore';

cytoscape.use(fcose);

export function HomeInstanceGraph() {
  const instanceGraph = useAlignmentStore((state) => state.instanceGraph);
  const selectGraphNode = useAlignmentStore((state) => state.selectGraphNode);
  const selectGraphEdge = useAlignmentStore((state) => state.selectGraphEdge);
  const clearGraphSelection = useAlignmentStore((state) => state.clearGraphSelection);
  const currentOntology = useAppStore((state) => state.currentOntology);
  const darkMode = useAppStore((state) => state.darkMode);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);

  const themeColors = useMemo(
    () =>
      darkMode
        ? { nodeText: '#B3B3B3', edgeColor: '#505050', edgeText: '#808080' }
        : { nodeText: '#2A2A2A', edgeColor: '#888888', edgeText: '#555555' },
    [darkMode],
  );

  const entityTypeById = useMemo(
    () => new Map(currentOntology.entityTypes.map((entity) => [entity.id, entity])),
    [currentOntology.entityTypes],
  );

  const relationshipById = useMemo(
    () => new Map(currentOntology.relationships.map((relationship) => [relationship.id, relationship])),
    [currentOntology.relationships],
  );

  const visibleEntityTypes = useMemo(() => {
    if (!instanceGraph) {
      return [];
    }

    return Array.from(new Set(instanceGraph.nodes.map((node) => node.class_id)))
      .map((entityTypeId) => entityTypeById.get(entityTypeId))
      .filter((entity): entity is NonNullable<typeof entity> => Boolean(entity));
  }, [entityTypeById, instanceGraph]);

  useEffect(() => {
    if (!containerRef.current || !instanceGraph) {
      return;
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements: [
        ...instanceGraph.nodes.map((node) => {
          const entity = entityTypeById.get(node.class_id);
          const label = entity ? `${entity.icon} ${node.label}` : node.label;

          return {
            data: {
              id: node.node_id,
              label,
              color: entity?.color ?? '#00A9E0',
            },
          };
        }),
        ...instanceGraph.edges.map((edge) => ({
          data: {
            id: edge.edge_id,
            source: edge.source_node_id,
            target: edge.target_node_id,
            label: relationshipById.get(edge.relation_id)?.name ?? edge.label,
          },
        })),
      ],
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
            'text-margin-y': 10,
            width: 72,
            height: 72,
            'background-color': 'data(color)',
            'border-width': 3,
            'border-color': 'data(color)',
            'border-opacity': 0.45,
          },
        },
        {
          selector: 'edge',
          style: {
            label: 'data(label)',
            'font-size': '12px',
            'font-family': 'Segoe UI, sans-serif',
            color: themeColors.edgeText,
            'text-rotation': 'autorotate',
            'text-margin-y': -10,
            width: 3,
            'line-color': themeColors.edgeColor,
            'target-arrow-color': themeColors.edgeColor,
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
          },
        },
      ],
      layout: {
        name: 'fcose',
        quality: 'proof',
        randomize: false,
        animate: false,
        fit: true,
        padding: 60,
        nodeDimensionsIncludeLabels: true,
        nodeRepulsion: () => 18000,
        idealEdgeLength: () => 200,
        edgeElasticity: () => 0.45,
        gravity: 0.25,
      } as LayoutOptions,
      minZoom: 0.3,
      maxZoom: 3,
    });

    const observer = new ResizeObserver(() => {
      cy.resize();
      cy.fit(undefined, 50);
    });
    observer.observe(containerRef.current);

    cy.on('tap', 'node', (evt) => {
      selectGraphNode(evt.target.id());
    });

    cy.on('tap', 'edge', (evt) => {
      selectGraphEdge(evt.target.id());
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        clearGraphSelection();
      }
    });

    requestAnimationFrame(() => {
      cy.resize();
      cy.fit(undefined, 50);
    });

    cyRef.current = cy;

    return () => {
      observer.disconnect();
      cy.destroy();
      cyRef.current = null;
    };
  }, [
    clearGraphSelection,
    entityTypeById,
    instanceGraph,
    relationshipById,
    selectGraphEdge,
    selectGraphNode,
    themeColors,
  ]);

  if (!instanceGraph) {
    return (
      <section className="home-instance-graph is-empty">
        <p className="alignment-kicker">Graph</p>
        <h2>Approved Graph Pending</h2>
        <p>Review and approve extracted facts before the main graph view can render an instance graph.</p>
      </section>
    );
  }

  return (
    <section className="home-instance-graph">
      <div className="home-instance-graph-header">
        <div>
          <p className="alignment-kicker">Graph</p>
          <h2>Instance Graph</h2>
          <p className="home-instance-graph-copy">A read-only graph view for the current approved facts.</p>
        </div>
        <div className="home-instance-graph-stats">
          <span>{instanceGraph.nodes.length} nodes</span>
          <span>{instanceGraph.edges.length} edges</span>
          <span>{instanceGraph.total_facts} approved facts</span>
        </div>
      </div>

      <div className="graph-container home-instance-graph-stage">
        <div ref={containerRef} className="graph-canvas" />

        <div className="graph-controls">
          <button
            type="button"
            className="graph-control-btn"
            onClick={() => cyRef.current?.zoom((cyRef.current?.zoom() ?? 1) * 1.2)}
            title="Zoom In"
          >
            <ZoomIn size={18} />
          </button>
          <button
            type="button"
            className="graph-control-btn"
            onClick={() => cyRef.current?.zoom((cyRef.current?.zoom() ?? 1) / 1.2)}
            title="Zoom Out"
          >
            <ZoomOut size={18} />
          </button>
          <button
            type="button"
            className="graph-control-btn"
            onClick={() => cyRef.current?.fit(undefined, 50)}
            title="Fit to View"
          >
            <Maximize2 size={18} />
          </button>
          <button
            type="button"
            className="graph-control-btn"
            onClick={() => {
              const cy = cyRef.current;
              if (!cy) {
                return;
              }

              cy.layout({
                name: 'fcose',
                quality: 'proof',
                randomize: false,
                animate: false,
                fit: true,
                padding: 60,
              } as LayoutOptions).run();
            }}
            title="Reset Layout"
          >
            <RotateCcw size={18} />
          </button>
        </div>

        <div className="graph-legend home-instance-graph-legend">
          <div className="legend-title">Visible Types</div>
          {visibleEntityTypes.map((entity) => (
            <div key={entity.id} className="legend-item">
              <div className="legend-dot" style={{ backgroundColor: entity.color }} />
              <span>
                {entity.icon} {entity.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
