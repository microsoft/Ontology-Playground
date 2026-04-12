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
  const languageMode = useAppStore((state) => state.languageMode);
  const [searchQuery, setSearchQuery] = useState('');

  const copy =
    languageMode === 'ko'
      ? {
          sidebar: '그래프 사이드바',
          pending: '그래프 데이터 대기 중',
          pendingBody: '승인된 그래프를 불러오면 여기서 그래프 전용 세부 정보를 확인할 수 있습니다.',
          overview: '그래프 개요',
          nodes: '노드',
          edges: '엣지',
          facts: '팩트',
          mode: '모드',
          graph: '그래프',
          query: '질의',
          explorer: '그래프 탐색기',
          explorerPlaceholder: '노드, 관계, 속성 검색...',
          nodesTitle: '노드',
          edgesTitle: '엣지',
          selection: '선택 항목',
          selectionEmpty: '그래프 캔버스에서 노드나 엣지를 클릭하면 여기서 세부 정보를 확인할 수 있습니다.',
          approvedFacts: '승인된 팩트',
          approvedFactsEmpty: '아직 승인된 팩트 이력이 로드되지 않았습니다.',
          relationId: 'relation_id',
        }
      : {
          sidebar: 'Graph Sidebar',
          pending: 'Graph Data Pending',
          pendingBody: 'Approve review cards and load the approved graph to inspect graph-specific details here.',
          overview: 'Graph Overview',
          nodes: 'Nodes',
          edges: 'Edges',
          facts: 'Facts',
          mode: 'Mode',
          graph: 'Graph',
          query: 'Query',
          explorer: 'Graph Explorer',
          explorerPlaceholder: 'Search nodes, relations, properties...',
          nodesTitle: 'Nodes',
          edgesTitle: 'Edges',
          selection: 'Selection',
          selectionEmpty: 'Click a node or edge in the graph canvas to inspect graph-specific data here.',
          approvedFacts: 'Approved Facts',
          approvedFactsEmpty: 'Approved fact history has not been loaded yet.',
          relationId: 'relation_id',
        };

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
          <p className="alignment-kicker">{copy.sidebar}</p>
          <h3>{copy.pending}</h3>
          <p>{copy.pendingBody}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="graph-sidebar">
      <section className="graph-sidebar-card">
        <div className="section-title">
          <Network size={14} />
          {copy.overview}
        </div>
        <div className="graph-sidebar-stat-grid">
          <div className="graph-sidebar-stat">
            <span>{copy.nodes}</span>
            <strong>{instanceGraph.nodes.length}</strong>
          </div>
          <div className="graph-sidebar-stat">
            <span>{copy.edges}</span>
            <strong>{instanceGraph.edges.length}</strong>
          </div>
          <div className="graph-sidebar-stat">
            <span>{copy.facts}</span>
            <strong>{instanceGraph.total_facts}</strong>
          </div>
          <div className="graph-sidebar-stat">
            <span>{copy.mode}</span>
            <strong>{graphViewMode === 'query' ? copy.query : copy.graph}</strong>
          </div>
        </div>
      </section>

      <section className="graph-sidebar-card">
        <div className="section-title">
          <Search size={14} />
          {copy.explorer}
        </div>
        <input
          type="text"
          className="query-input graph-sidebar-search"
          placeholder={copy.explorerPlaceholder}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <div className="graph-sidebar-explorer">
          <div>
            <div className="graph-sidebar-subtitle">{copy.nodesTitle}</div>
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
            <div className="graph-sidebar-subtitle">{copy.edgesTitle}</div>
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
          {copy.selection}
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
              <span className="alignment-chip">{copy.relationId}: {selectedEdge.relation_id}</span>
              {Object.entries(selectedEdge.properties).map(([key, value]) => (
                <span key={key} className="alignment-chip">
                  {key}: {String(value)}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="graph-sidebar-empty-copy">
            <p>{copy.selectionEmpty}</p>
          </div>
        )}
      </section>

      <section className="graph-sidebar-card">
        <div className="section-title">
          <FileStack size={14} />
          {copy.approvedFacts}
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
            <p className="graph-sidebar-empty-copy">{copy.approvedFactsEmpty}</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
