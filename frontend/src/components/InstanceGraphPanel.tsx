import { useEffect, useMemo, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import type { Core, EventObject, LayoutOptions } from 'cytoscape';
import { FolderArchive, Maximize2, RotateCcw, UploadCloud, ZoomIn, ZoomOut } from 'lucide-react';
import { useAlignmentStore } from '../store/alignmentStore';
import { useAppStore } from '../store/appStore';
import { saveLocalGraph } from '../lib/localLibraryApi';
import { previewNeo4jPublish, publishNeo4j } from '../lib/publishApi';

cytoscape.use(fcose);

export function InstanceGraphPanel({ compact = false }: { compact?: boolean }) {
  const instanceGraph = useAlignmentStore((state) => state.instanceGraph);
  const darkMode = useAppStore((state) => state.darkMode);
  const currentOntology = useAppStore((state) => state.currentOntology);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [ingestRunId, setIngestRunId] = useState(() => `run-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`);
  const [publishPreview, setPublishPreview] = useState<string | null>(null);
  const [publishStatus, setPublishStatus] = useState<string | null>(null);

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

  const formatNodeLabel = (node: { label: string; class_id: string }) => {
    const entity = entityTypeById.get(node.class_id);
    if (!entity) return node.label;
    return `${entity.icon} ${node.label}`;
  };

  const formatEdgeLabel = (edge: { label: string; relation_id: string }) => {
    const relationship = relationshipById.get(edge.relation_id);
    return relationship?.name ?? edge.label;
  };

  useEffect(() => {
    if (!containerRef.current || !instanceGraph) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements: [
        ...instanceGraph.nodes.map((node) => ({
          data: {
            id: node.node_id,
            label: formatNodeLabel(node),
            plainLabel: node.label,
            classId: node.class_id,
            color: entityTypeById.get(node.class_id)?.color ?? '#00A9E0',
          },
        })),
        ...instanceGraph.edges.map((edge) => ({
          data: {
            id: edge.edge_id,
            source: edge.source_node_id,
            target: edge.target_node_id,
            label: formatEdgeLabel(edge),
            relationId: edge.relation_id,
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
          selector: 'node:selected',
          style: {
            'border-width': 5,
            'border-color': '#FFB900',
            width: 84,
            height: 84,
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
        {
          selector: 'edge:selected',
          style: {
            width: 5,
            'line-color': '#FFB900',
            'target-arrow-color': '#FFB900',
            color: '#FFB900',
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

    cy.on('tap', 'node', (evt: EventObject) => {
      setSelectedNodeId(evt.target.id());
      setSelectedEdgeId(null);
    });

    cy.on('tap', 'edge', (evt: EventObject) => {
      setSelectedEdgeId(evt.target.id());
      setSelectedNodeId(null);
    });

    cy.on('tap', (evt: EventObject) => {
      if (evt.target === cy) {
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
      }
    });

    const observer = new ResizeObserver(() => {
      cy.resize();
      cy.fit(undefined, 50);
    });
    observer.observe(containerRef.current);

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
  }, [entityTypeById, instanceGraph, relationshipById, themeColors]);

  const selectedNode = instanceGraph?.nodes.find((node) => node.node_id === selectedNodeId) ?? null;
  const selectedEdge = instanceGraph?.edges.find((edge) => edge.edge_id === selectedEdgeId) ?? null;
  const [saved, setSaved] = useState(false);

  if (!instanceGraph) {
    return (
      <section className={`instance-graph-panel is-empty ${compact ? 'is-compact' : ''}`}>
        <h2>Approved Graph Pending</h2>
        <p>Approve review cards in the Review tab, then generate the graph from those approved facts.</p>
      </section>
    );
  }

  return (
    <section className={`instance-graph-panel ${compact ? 'is-compact' : ''}`}>
      <div className="instance-graph-header">
        <div>
          <p className="alignment-kicker">Approved Graph</p>
          <h2>Instance Graph</h2>
        </div>
        <div className="instance-graph-stats">
          <span>{instanceGraph.nodes.length} nodes</span>
          <span>{instanceGraph.edges.length} edges</span>
          <span>{instanceGraph.total_facts} approved facts</span>
        </div>
      </div>

      <div className="instance-graph-toolbar">
        <input
          className="instance-graph-ingest-input"
          type="text"
          value={ingestRunId}
          onChange={(event) => setIngestRunId(event.target.value)}
          placeholder="ingest_run_id"
        />
        <button type="button" className="alignment-secondary-btn" onClick={() => cyRef.current?.zoom((cyRef.current?.zoom() ?? 1) * 1.2)}>
          <ZoomIn size={14} />
          Zoom In
        </button>
        <button type="button" className="alignment-secondary-btn" onClick={() => cyRef.current?.zoom((cyRef.current?.zoom() ?? 1) / 1.2)}>
          <ZoomOut size={14} />
          Zoom Out
        </button>
        <button type="button" className="alignment-secondary-btn" onClick={() => cyRef.current?.fit(undefined, 50)}>
          <Maximize2 size={14} />
          Fit
        </button>
        <button
          type="button"
          className="alignment-secondary-btn"
          onClick={() => {
            const cy = cyRef.current;
            if (!cy) return;
            cy.layout({
              name: 'fcose',
              quality: 'proof',
              randomize: false,
              animate: false,
              fit: true,
              padding: 60,
            } as LayoutOptions).run();
          }}
        >
          <RotateCcw size={14} />
          Relayout
        </button>
        <button
          type="button"
          className="alignment-secondary-btn"
          onClick={() => {
            void (async () => {
              await saveLocalGraph({
                name: `${currentOntology.name} Graph`,
                description: 'Saved instance graph snapshot',
                source_ontology_name: currentOntology.name,
                graph: instanceGraph,
              });
              setSaved(true);
              window.setTimeout(() => setSaved(false), 2000);
            })();
          }}
        >
          <FolderArchive size={14} />
          {saved ? 'Saved!' : 'Save Graph'}
        </button>
        <button
          type="button"
          className="alignment-secondary-btn is-publish-preview"
          onClick={() => {
            void (async () => {
              const preview = await previewNeo4jPublish(ingestRunId, instanceGraph);
              setPublishPreview(`${preview.node_count} nodes · ${preview.edge_count} edges ready for ${preview.database}`);
            })();
          }}
        >
          Preview Publish
        </button>
        <button
          type="button"
          className="alignment-secondary-btn is-publish"
          onClick={() => {
            void (async () => {
              const result = await publishNeo4j(ingestRunId, instanceGraph);
              setPublishStatus(`Published ${result.node_count} nodes and ${result.edge_count} edges to ${result.database}`);
            })();
          }}
        >
          <UploadCloud size={14} />
          Publish to Neo4j
        </button>
      </div>

      {publishPreview ? <div className="alignment-banner is-info">{publishPreview}</div> : null}
      {publishStatus ? <div className="alignment-banner is-info">{publishStatus}</div> : null}

      <div className={`instance-graph-surface ${compact ? 'is-compact' : ''}`}>
        <div ref={containerRef} className="instance-graph-canvas" />
        {!compact ? (
        <aside className="instance-graph-detail">
          {selectedNode ? (
            <div className="instance-graph-detail-card">
              <p className="alignment-kicker">Node</p>
              <h3>{selectedNode.label}</h3>
              <p>class: {entityTypeById.get(selectedNode.class_id)?.name ?? selectedNode.class_id}</p>
              <div className="alignment-chip-row">
                {Object.entries(selectedNode.properties).map(([key, value]) => (
                  <span key={key} className="alignment-chip">
                    {key}: {String(value)}
                  </span>
                ))}
              </div>
            </div>
          ) : selectedEdge ? (
            <div className="instance-graph-detail-card">
              <p className="alignment-kicker">Edge</p>
              <h3>{selectedEdge.label}</h3>
              <p>relation: {relationshipById.get(selectedEdge.relation_id)?.name ?? selectedEdge.relation_id}</p>
              <div className="alignment-chip-row">
                <span className="alignment-chip">source: {selectedEdge.source_node_id}</span>
                <span className="alignment-chip">target: {selectedEdge.target_node_id}</span>
                {Object.entries(selectedEdge.properties).map(([key, value]) => (
                  <span key={key} className="alignment-chip">
                    {key}: {String(value)}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="instance-graph-detail-card is-empty">
              <h3>Select a node or edge</h3>
              <p>Inspect approved graph facts directly from the canvas.</p>
            </div>
          )}
        </aside>
        ) : null}
      </div>
    </section>
  );
}
