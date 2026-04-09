import { useMemo, useState } from 'react';
import { Database, FileStack, GitBranch, Network, Search } from 'lucide-react';
import { useAlignmentStore } from '../store/alignmentStore';
import { useAppStore } from '../store/appStore';

export function HomeGraphSidebar() {
  const instanceGraph = useAlignmentStore((state) => state.instanceGraph);
  const approvedFacts = useAlignmentStore((state) => state.approvedFacts);
  const selectedGraphNodeId = useAlignmentStore((state) => state.selectedGraphNodeId);
  const selectedGraphEdgeId = useAlignmentStore((state) => state.selectedGraphEdgeId);
  const selectGraphNode = useAlignmentStore((state) => state.selectGraphNode);
  const selectGraphEdge = useAlignmentStore((state) => state.selectGraphEdge);
  const currentOntology = useAppStore((state) => state.currentOntology);
  const graphViewMode = useAppStore((state) => state.graphViewMode);
  const [searchQuery, setSearchQuery] = useState('');

  const entityById = useMemo(
    () => new Map(currentOntology.entityTypes.map((entity) => [entity.id, entity])),
    [currentOntology.entityTypes],
  );

  const relationshipById = useMemo(
    () => new Map(currentOntology.relationships.map((relationship) => [relationship.id, relationship])),
    [currentOntology.relationships],
  );

  const selectedNode = instanceGraph?.nodes.find((node) => node.node_id === selectedGraphNodeId) ?? null;
  const selectedEdge = instanceGraph?.edges.find((edge) => edge.edge_id === selectedGraphEdgeId) ?? null;

  const filteredNodes = useMemo(() => {
    if (!instanceGraph) {
      return [];
    }

    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return instanceGraph.nodes.slice(0, 8);
    }

    return instanceGraph.nodes.filter((node) => {
      const entity = entityById.get(node.class_id);
      return [
        node.label,
        node.class_id,
        entity?.name,
        ...Object.values(node.properties).map((value) => String(value)),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [entityById, instanceGraph, searchQuery]);

  const filteredEdges = useMemo(() => {
    if (!instanceGraph) {
      return [];
    }

    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return instanceGraph.edges.slice(0, 8);
    }

    return instanceGraph.edges.filter((edge) => {
      const relationship = relationshipById.get(edge.relation_id);
      return [
        edge.label,
        edge.relation_id,
        relationship?.name,
        edge.source_node_id,
        edge.target_node_id,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [instanceGraph, relationshipById, searchQuery]);

  if (!instanceGraph) {
    return (
      <div className="graph-sidebar">
        <section className="graph-sidebar-card graph-sidebar-empty">
          <p className="alignment-kicker">Graph Sidebar</p>
          <h3>Graph Data Pending</h3>
          <p>Approve review cards and load the approved graph to inspect graph-specific details here.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="graph-sidebar">
      <section className="graph-sidebar-card">
        <div className="section-title">
          <Network size={14} />
          Graph Overview
        </div>
        <div className="graph-sidebar-stat-grid">
          <div className="graph-sidebar-stat">
            <span>Nodes</span>
            <strong>{instanceGraph.nodes.length}</strong>
          </div>
          <div className="graph-sidebar-stat">
            <span>Edges</span>
            <strong>{instanceGraph.edges.length}</strong>
          </div>
          <div className="graph-sidebar-stat">
            <span>Facts</span>
            <strong>{instanceGraph.total_facts}</strong>
          </div>
          <div className="graph-sidebar-stat">
            <span>Mode</span>
            <strong>{graphViewMode === 'query' ? 'Query' : 'Graph'}</strong>
          </div>
        </div>
      </section>

      <section className="graph-sidebar-card">
        <div className="section-title">
          <Search size={14} />
          Graph Explorer
        </div>
        <input
          type="text"
          className="query-input graph-sidebar-search"
          placeholder="Search nodes, relations, properties..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <div className="graph-sidebar-explorer">
          <div>
            <div className="graph-sidebar-subtitle">Nodes</div>
            <div className="graph-sidebar-list">
              {filteredNodes.map((node) => (
                <button
                  key={node.node_id}
                  type="button"
                  className={`graph-sidebar-list-item ${selectedGraphNodeId === node.node_id ? 'is-active' : ''}`}
                  onClick={() => selectGraphNode(node.node_id)}
                >
                  <span>{entityById.get(node.class_id)?.icon ?? '•'} {node.label}</span>
                  <small>{entityById.get(node.class_id)?.name ?? node.class_id}</small>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="graph-sidebar-subtitle">Edges</div>
            <div className="graph-sidebar-list">
              {filteredEdges.map((edge) => (
                <button
                  key={edge.edge_id}
                  type="button"
                  className={`graph-sidebar-list-item ${selectedGraphEdgeId === edge.edge_id ? 'is-active' : ''}`}
                  onClick={() => selectGraphEdge(edge.edge_id)}
                >
                  <span>{relationshipById.get(edge.relation_id)?.name ?? edge.label}</span>
                  <small>{edge.source_node_id} → {edge.target_node_id}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="graph-sidebar-card">
        <div className="section-title">
          {selectedNode ? <Database size={14} /> : <GitBranch size={14} />}
          Selection
        </div>
        {selectedNode ? (
          <div className="graph-sidebar-selection">
            <h3>{selectedNode.label}</h3>
            <p>{entityById.get(selectedNode.class_id)?.name ?? selectedNode.class_id}</p>
            <div className="alignment-chip-row">
              {Object.entries(selectedNode.properties).map(([key, value]) => (
                <span key={key} className="alignment-chip">
                  {key}: {String(value)}
                </span>
              ))}
            </div>
          </div>
        ) : selectedEdge ? (
          <div className="graph-sidebar-selection">
            <h3>{relationshipById.get(selectedEdge.relation_id)?.name ?? selectedEdge.label}</h3>
            <p>{selectedEdge.source_node_id} → {selectedEdge.target_node_id}</p>
            <div className="alignment-chip-row">
              <span className="alignment-chip">relation_id: {selectedEdge.relation_id}</span>
              {Object.entries(selectedEdge.properties).map(([key, value]) => (
                <span key={key} className="alignment-chip">
                  {key}: {String(value)}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="graph-sidebar-empty-copy">
            <p>Click a node or edge in the graph canvas to inspect graph-specific data here.</p>
          </div>
        )}
      </section>

      <section className="graph-sidebar-card">
        <div className="section-title">
          <FileStack size={14} />
          Approved Facts
        </div>
        <div className="graph-sidebar-facts">
          {approvedFacts.slice(0, 8).map((fact) => (
            <div key={fact.staging_fact_id} className="graph-sidebar-fact">
              <strong>{fact.subject.text}</strong>
              <span>{fact.relation.text}</span>
              <strong>{fact.object.text}</strong>
            </div>
          ))}
          {approvedFacts.length === 0 ? (
            <p className="graph-sidebar-empty-copy">Approved fact history has not been loaded yet.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
