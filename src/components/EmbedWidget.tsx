/**
 * Self-contained embeddable ontology viewer.
 *
 * Features:
 *  - Cytoscape graph (read-only, pan/zoom)
 *  - Click a node/edge → mini inspector
 *  - "Graph" / "RDF Source" tabs
 *  - Copy RDF button
 *  - Dark/light theme
 *  - Loads ontology from catalogue, URL, or inline base64 JSON
 */
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useMemo,
  type FormEvent,
} from 'react';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import type {
  Core,
  ElementDefinition,
  EventObject,
  LayoutOptions,
} from 'cytoscape';
import type { Ontology, EntityType, Relationship } from '../data/ontology';
import { serializeToRDF } from '../lib/rdf/serializer';
import { parseRDF } from '../lib/rdf/parser';
import { decodeRdfBytes } from '../lib/rdf/dataset';
import { highlightRdf, RDF_HIGHLIGHT_DARK, RDF_HIGHLIGHT_LIGHT } from '../lib/rdf/highlighter';
import {
  loadCatalogueEntry,
  loadCatalogueSource,
} from '../lib/catalogue';
import {
  BOUNDED_LABEL_ZOOM_THRESHOLD,
  createGraphView,
  DEFAULT_LARGE_GRAPH_DEPTH,
  graphViewMaxDepth,
  MAX_RENDERED_NODES,
  type GraphView,
} from '../lib/graphView';
import {
  captureGraphPositionSnapshot,
  preserveGraphElementPositions,
  restoreGraphViewport,
  type GraphPositionSnapshot,
} from '../lib/graphPositionPersistence';
import {
  EMBED_THEMES,
  type EmbedThemeTokens,
} from './embedTheme';
import { SemanticDepthSlider } from './SemanticDepthSlider';
import { useGraphNodeActionPosition } from './useGraphNodeActionPosition';

cytoscape.use(fcose);

export interface EmbedConfig {
  catalogueId?: string;
  ontologyUrl?: string;
  ontologyInline?: string;
  theme: 'dark' | 'light';
  height: string;
  catalogueBaseUrl?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

type Tab = 'graph' | 'rdf';

interface SelectedItem {
  type: 'entity' | 'relationship';
  entity?: EntityType;
  relationship?: Relationship;
}

export function EmbedWidget({ config }: { config: EmbedConfig }) {
  const [ontology, setOntology] = useState<Ontology | null>(null);
  const [rdfSource, setRdfSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('graph');
  const [selected, setSelected] = useState<SelectedItem | null>(null);
  const [copied, setCopied] = useState(false);

  const theme = EMBED_THEMES[config.theme] || EMBED_THEMES.dark;

  // ─ Load ontology ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setRdfSource(null);
      try {
        let ont: Ontology | null = null;

        if (config.ontologyInline) {
          // Base64-encoded JSON
          const json = atob(config.ontologyInline);
          ont = JSON.parse(json) as Ontology;
        } else if (config.catalogueId) {
          // Load the index and only this entry's versioned payload.
          const base = config.catalogueBaseUrl
            || (document.currentScript as HTMLScriptElement | null)?.src.replace(/\/[^/]+$/, '/')
            || window.location.origin + '/';
          const entry = await loadCatalogueEntry(config.catalogueId, base);
          ont = entry.ontology;
          const source = await loadCatalogueSource(entry.id, base);
          if (!cancelled) {
            setRdfSource(source.text);
          }
        } else if (config.ontologyUrl) {
          // Fetch from URL
          const res = await fetch(config.ontologyUrl);
          if (!res.ok) throw new Error(`Failed to fetch ontology (${res.status})`);
          const text = decodeRdfBytes(
            new Uint8Array(await res.arrayBuffer()),
          );
          // Detect format: RDF/XML starts with < or has xml prologue
          if (text.trimStart().startsWith('<')) {
            const result = parseRDF(text, {
              baseIri: config.ontologyUrl,
              allowEmptyProjection: true,
            });
            ont = result.ontology;
            if (!cancelled) setRdfSource(text);
          } else {
            ont = JSON.parse(text) as Ontology;
            if (!cancelled) setRdfSource(null);
          }
        } else {
          throw new Error('No ontology source specified. Use data-catalogue-id, data-ontology-url, or data-ontology-inline.');
        }

        if (!cancelled) {
          if (config.ontologyInline) setRdfSource(null);
          setOntology(ont);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [config.catalogueId, config.ontologyUrl, config.ontologyInline, config.catalogueBaseUrl]);

  // ─ Render ───────────────────────────────────────────────────────────────
  const containerStyle: React.CSSProperties = {
    height: config.height,
    fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
    background: theme.bg,
    color: theme.text,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    position: 'relative',
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: theme.textSecondary, fontSize: 14 }}>
          Loading ontology…
        </div>
      </div>
    );
  }

  if (error || !ontology) {
    return (
      <div style={containerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#E81123', fontSize: 13, padding: 20, textAlign: 'center' }}>
          {error || 'Unknown error'}
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Header with tabs */}
      <EmbedHeader
        ontology={ontology}
        tab={tab}
        setTab={setTab}
        theme={theme}
        copied={copied}
        hasCompleteSource={rdfSource !== null}
        onCopyRdf={() => {
          navigator.clipboard.writeText(
            rdfSource ?? serializeToRDF(ontology, []),
          ).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
      />

      {/* Body */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {tab === 'graph' ? (
          <EmbedGraph ontology={ontology} theme={theme} selected={selected} setSelected={setSelected} />
        ) : (
          <EmbedRdfSource
            rdf={rdfSource ?? serializeToRDF(ontology, [])}
            theme={theme}
            hasCompleteSource={rdfSource !== null}
          />
        )}
      </div>

      {/* Inspector overlay */}
      {tab === 'graph' && selected && (
        <EmbedInspector selected={selected} theme={theme} ontology={ontology} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

interface EmbedHeaderProps {
  ontology: Ontology;
  tab: Tab;
  setTab: (t: Tab) => void;
  theme: EmbedThemeTokens;
  copied: boolean;
  hasCompleteSource: boolean;
  onCopyRdf: () => void;
}

function EmbedHeader({
  ontology,
  tab,
  setTab,
  theme,
  copied,
  hasCompleteSource,
  onCopyRdf,
}: EmbedHeaderProps) {
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    background: active ? theme.accent : 'transparent',
    color: active ? '#fff' : theme.textSecondary,
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
  });

  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 12px', borderBottom: `1px solid ${theme.border}`, background: theme.bgSecondary,
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{ontology.name}</span>
        <span style={{ fontSize: 11, color: theme.textTertiary }}>
          {ontology.entityTypes.length} entities · {ontology.relationships.length} relationships
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button style={tabStyle(tab === 'graph')} onClick={() => setTab('graph')}>Graph</button>
        <button style={tabStyle(tab === 'rdf')} onClick={() => setTab('rdf')}>
          {hasCompleteSource ? 'Complete RDF source' : 'Generated RDF'}
        </button>
        {tab === 'rdf' && (
          <button
            onClick={onCopyRdf}
            style={{
              marginLeft: 8, padding: '4px 10px', fontSize: 11,
              background: copied ? '#107C10' : theme.bgTertiary, color: copied ? '#fff' : theme.text,
              border: `1px solid ${theme.border}`, borderRadius: 4, cursor: 'pointer',
            }}
          >
            {copied
              ? 'Copied!'
              : hasCompleteSource
                ? 'Copy complete RDF'
                : 'Copy generated RDF'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Graph ───────────────────────────────────────────────────────────────────

interface EmbedGraphProps {
  ontology: Ontology;
  theme: EmbedThemeTokens;
  selected: SelectedItem | null;
  setSelected: (s: SelectedItem | null) => void;
}

function EmbedGraph({ ontology, theme, selected, setSelected }: EmbedGraphProps) {
  const depthSliderId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [graphInstance, setGraphInstance] = useState<Core | null>(null);
  const pendingPositionSnapshotRef = useRef<GraphPositionSnapshot | null>(null);
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  const applySelectionState = useCallback((
    cy: Core,
    revealConnectedLabels: boolean,
  ) => {
    const selectedItem = selectedRef.current;
    cy.elements().unselect();
    cy.edges().removeClass('selected-node-edge');

    if (selectedItem?.entity) {
      const node = cy.getElementById(selectedItem.entity.id);
      node.select();
      if (revealConnectedLabels) {
        node.connectedEdges().addClass('selected-node-edge');
      }
    } else if (selectedItem?.relationship) {
      cy.getElementById(selectedItem.relationship.id).select();
    }
  }, []);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [depth, setDepth] = useState(DEFAULT_LARGE_GRAPH_DEPTH);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const graphView = useMemo(
    () => createGraphView(ontology, { search, depth, expandedNodeIds }),
    [depth, expandedNodeIds, ontology, search],
  );
  const maxDepth = useMemo(() => graphViewMaxDepth(ontology), [ontology]);
  const selectedOverviewEntity = useMemo(() => {
    const entity = selected?.type === 'entity' ? selected.entity : undefined;
    if (!entity || !graphView.entities.some(({ id }) => id === entity.id)) {
      return null;
    }
    return {
      id: entity.id,
      name: entity.name,
      hiddenNeighborCount:
        graphView.hiddenNeighborCounts.get(entity.id) ?? 0,
      isExpanded: expandedNodeIds.has(entity.id),
      canExpand: graphView.visibleNodeCount < MAX_RENDERED_NODES,
    };
  }, [
    expandedNodeIds,
    graphView.entities,
    graphView.hiddenNeighborCounts,
    graphView.visibleNodeCount,
    selected,
  ]);
  const neighborActionPosition = useGraphNodeActionPosition(
    graphInstance,
    selectedOverviewEntity?.id ?? null,
    graphView.mode === 'bounded'
      && (selectedOverviewEntity?.hiddenNeighborCount ?? 0) > 0
      && !selectedOverviewEntity?.isExpanded
      && selectedOverviewEntity?.canExpand === true,
  );
  const graphOntologyRef = useRef(ontology);

  useEffect(() => {
    if (graphOntologyRef.current === ontology) return;
    graphOntologyRef.current = ontology;
    setSearchInput('');
    setSearch('');
    setDepth(DEFAULT_LARGE_GRAPH_DEPTH);
    setExpandedNodeIds(new Set());
    pendingPositionSnapshotRef.current = null;
  }, [ontology]);

  const elements = useMemo<ElementDefinition[]>(() => {
    const rootIds = new Set(graphView.rootIds);
    const nodes = graphView.entities.map((entity) => {
      const hiddenNeighborCount = graphView.hiddenNeighborCounts.get(entity.id) ?? 0;
      return {
        data: {
          id: entity.id,
          label: `${entity.icon} ${entity.name}${hiddenNeighborCount > 0 ? ` · +${hiddenNeighborCount}` : ''}`,
          color: entity.color,
          hiddenNeighborCount,
          isRoot: rootIds.has(entity.id) ? 1 : 0,
        },
      };
    });
    const nodeIds = new Set(nodes.map((node) => node.data.id));
    const edges = graphView.relationships
      .filter((relationship) => (
        nodeIds.has(relationship.from) && nodeIds.has(relationship.to)
      ))
      .map((relationship) => ({
        data: {
          id: relationship.id,
          source: relationship.from,
          target: relationship.to,
          label: relationship.name,
          kind: relationship.kind ?? 'association',
        },
      }));
    return [...nodes, ...edges];
  }, [graphView]);

  const layout = useMemo<LayoutOptions>(() => {
    if (graphView.mode === 'bounded') {
      const visibleIds = new Set(
        graphView.entities.map((entity) => entity.id),
      );
      const visibleRootIds = graphView.rootIds.filter(
        (id) => visibleIds.has(id),
      );
      const roots = visibleRootIds.length > 0
        ? visibleRootIds
        : graphView.entities.slice(0, 1).map((entity) => entity.id);
      return {
          name: 'breadthfirst',
          directed: false,
          circle: true,
          roots,
          animate: false,
          fit: true,
          padding: 40,
          spacingFactor: 1.6,
        } as LayoutOptions;
    }

    return {
      name: 'fcose',
      quality: graphView.mode === 'dense' ? 'default' : 'proof',
      randomize: true,
      animate: false,
      fit: true,
      padding: 40,
      nodeDimensionsIncludeLabels: true,
      nodeRepulsion: () => graphView.mode === 'dense' ? 9_000 : 12_000,
      idealEdgeLength: () => graphView.mode === 'dense' ? 140 : 180,
      edgeElasticity: () => 0.45,
      nodeSeparation: graphView.mode === 'dense' ? 60 : 80,
    } as LayoutOptions;
  }, [graphView.entities, graphView.mode, graphView.rootIds]);

  useEffect(() => {
    if (!containerRef.current) return;

    const positionSnapshot = graphView.mode === 'bounded'
      ? pendingPositionSnapshotRef.current
      : null;
    const positionedElements = positionSnapshot
      ? preserveGraphElementPositions(elements, positionSnapshot)
      : null;
    const cy = cytoscape({
      container: containerRef.current,
      elements: positionedElements ?? elements,
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)', 'text-valign': 'bottom', 'text-halign': 'center',
            'font-size': '13px', 'font-family': 'Segoe UI, sans-serif', 'font-weight': 600,
            'min-zoomed-font-size': 9,
            color: theme.nodeText, 'text-margin-y': 8,
            width: graphView.mode === 'bounded' ? 30 : 60,
            height: graphView.mode === 'bounded' ? 30 : 60,
            'background-color': 'data(color)',
            'border-width': 2, 'border-color': 'data(color)', 'border-opacity': 0.5,
          },
        },
        {
          selector: 'node[hiddenNeighborCount > 0]',
          style: {
            'border-style': 'dashed',
            'border-width': 4,
            width: 38,
            height: 38,
            'min-zoomed-font-size': 8,
          },
        },
        {
          selector: 'node[isRoot = 1]',
          style: {
            'border-style': 'solid',
            'border-width': 4,
            width: 52,
            height: 52,
            'font-size': '14px',
            'min-zoomed-font-size': 8,
          },
        },
        {
          selector: 'node.overview-label-hidden',
          style: { label: '' },
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 4,
            'border-color': theme.accent,
            width: graphView.mode === 'bounded' ? 52 : 72,
            height: graphView.mode === 'bounded' ? 52 : 72,
            label: 'data(label)',
            'min-zoomed-font-size': 0,
          },
        },
        {
          selector: 'edge',
          style: {
            label: graphView.mode === 'full' ? 'data(label)' : '',
            'font-size': '11px', 'font-family': 'Segoe UI, sans-serif',
            'min-zoomed-font-size': 9,
            color: theme.edgeText, 'text-rotation': 'autorotate', 'text-margin-y': -8,
            'text-background-color': theme.edgeLabelBg,
            'text-background-opacity': 1,
            'text-background-padding': '2px',
            'text-background-shape': 'roundrectangle',
            width: 2, 'line-color': theme.edgeColor, 'target-arrow-color': theme.edgeColor,
            'target-arrow-shape': 'triangle', 'curve-style': 'unbundled-bezier',
            'control-point-step-size': 40,
          },
        },
        {
          selector: 'edge[kind = "subclass"]',
          style: { 'line-style': 'dashed' },
        },
        {
          selector: 'edge.selected-node-edge',
          style: {
            label: 'data(label)',
            'min-zoomed-font-size': 0,
          },
        },
        {
          selector: 'edge.hovered',
          style: {
            label: 'data(label)',
            width: 3,
            color: theme.text,
            'line-color': theme.accent,
            'target-arrow-color': theme.accent,
          },
        },
        {
          selector: 'edge:selected',
          style: {
            width: 4,
            'line-color': theme.accent,
            'target-arrow-color': theme.accent,
            color: theme.text,
            label: 'data(label)',
          },
        },
      ],
      layout: positionedElements
        ? { name: 'preset', fit: false }
        : layout,
      minZoom: 0.3, maxZoom: 3,
      userPanningEnabled: true,
      userZoomingEnabled: true,
      boxSelectionEnabled: false,
      autoungrabify: true,
    });

    if (positionSnapshot && positionedElements) {
      restoreGraphViewport(cy, positionSnapshot);
    }
    pendingPositionSnapshotRef.current = null;

    let boundedLabelsHidden: boolean | null = null;
    const syncBoundedLabels = () => {
      if (graphView.mode !== 'bounded') return;
      const shouldHide = cy.zoom() < BOUNDED_LABEL_ZOOM_THRESHOLD;
      if (shouldHide === boundedLabelsHidden) return;
      boundedLabelsHidden = shouldHide;
      cy.nodes('[isRoot = 0][hiddenNeighborCount = 0]')
        .toggleClass('overview-label-hidden', shouldHide);
    };
    cy.on('zoom', syncBoundedLabels);
    syncBoundedLabels();

    cy.on('tap', 'node', (evt: EventObject) => {
      const id = evt.target.id();
      const entity = ontology.entityTypes.find((candidate) => candidate.id === id);
      if (entity) setSelected({ type: 'entity', entity });
    });

    cy.on('tap', 'edge', (evt: EventObject) => {
      const id = evt.target.id();
      const relationship = ontology.relationships.find(
        (candidate) => candidate.id === id,
      );
      if (relationship) {
        setSelected({ type: 'relationship', relationship });
      }
    });

    cy.on('mouseover', 'edge', (evt: EventObject) => {
      evt.target.addClass('hovered');
    });

    cy.on('mouseout', 'edge', (evt: EventObject) => {
      evt.target.removeClass('hovered');
    });

    cy.on('tap', (evt: EventObject) => {
      if (evt.target === cy) setSelected(null);
    });

    cyRef.current = cy;
    setGraphInstance(cy);
    applySelectionState(cy, graphView.mode === 'bounded');
    return () => { cy.destroy(); cyRef.current = null; };
  }, [
    applySelectionState,
    elements,
    graphView.mode,
    layout,
    ontology,
    setSelected,
    theme,
  ]);

  useEffect(() => {
    const cy = cyRef.current;
    if (cy) {
      applySelectionState(cy, graphView.mode === 'bounded');
    }
  }, [applySelectionState, graphView.mode, selected]);

  const handleSearch = () => {
    pendingPositionSnapshotRef.current = null;
    setSearch(searchInput.trim());
    setExpandedNodeIds(new Set());
    setSelected(null);
  };

  const handleOverview = () => {
    pendingPositionSnapshotRef.current = null;
    setSearchInput('');
    setSearch('');
    setDepth(DEFAULT_LARGE_GRAPH_DEPTH);
    setExpandedNodeIds(new Set());
    setSelected(null);
  };

  const clearSelectionOutsideView = (
    nextView: ReturnType<typeof createGraphView>,
  ) => {
    if (
      (
        selected?.entity
        && !nextView.entities.some(({ id }) => id === selected.entity?.id)
      )
      || (
        selected?.relationship
        && !nextView.relationships.some(
          ({ id }) => id === selected.relationship?.id,
        )
      )
    ) {
      setSelected(null);
    }
  };

  const handleDepthChange = (nextDepth: number) => {
    if (nextDepth === depth) return;
    pendingPositionSnapshotRef.current = cyRef.current
      ? captureGraphPositionSnapshot(cyRef.current)
      : null;

    setExpandedNodeIds(new Set());
    selectedRef.current = null;
    setSelected(null);
    setDepth(nextDepth);
  };

  const handleExpandSelectedEntity = () => {
    if (
      !selectedOverviewEntity
      || selectedOverviewEntity.hiddenNeighborCount === 0
      || selectedOverviewEntity.isExpanded
      || !selectedOverviewEntity.canExpand
    ) {
      return;
    }

    pendingPositionSnapshotRef.current = cyRef.current
      ? captureGraphPositionSnapshot(
          cyRef.current,
          selectedOverviewEntity.id,
        )
      : null;
    setExpandedNodeIds((current) => {
      if (current.has(selectedOverviewEntity.id)) return current;
      return new Set(current).add(selectedOverviewEntity.id);
    });
  };

  const handleCollapseSelectedEntity = () => {
    if (!selectedOverviewEntity?.isExpanded) return;

    pendingPositionSnapshotRef.current = cyRef.current
      ? captureGraphPositionSnapshot(
          cyRef.current,
          selectedOverviewEntity.id,
        )
      : null;
    const nextExpandedNodeIds = new Set(expandedNodeIds);
    nextExpandedNodeIds.delete(selectedOverviewEntity.id);
    const nextView = createGraphView(ontology, {
      search,
      depth,
      expandedNodeIds: nextExpandedNodeIds,
    });

    setExpandedNodeIds(nextExpandedNodeIds);
    clearSelectionOutsideView(nextView);
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div
        ref={containerRef}
        data-testid="embed-graph-canvas"
        style={{ width: '100%', height: '100%' }}
      />
      {neighborActionPosition && selectedOverviewEntity && (
        <button
          type="button"
          aria-label={`Expand ${selectedOverviewEntity.name} to show ${
            selectedOverviewEntity.hiddenNeighborCount
          } hidden ${
            selectedOverviewEntity.hiddenNeighborCount === 1
              ? 'neighbor'
              : 'neighbors'
          }`}
          onClick={handleExpandSelectedEntity}
          style={{
            position: 'absolute',
            zIndex: 3,
            left: neighborActionPosition.left,
            top: neighborActionPosition.top,
            transform: neighborActionPosition.placement === 'above'
              ? 'translate(-50%, -100%)'
              : 'translate(-50%, 0)',
            minHeight: 44,
            maxWidth: 'calc(100% - 24px)',
            padding: '9px 14px',
            color: '#fff',
            background: theme.accent,
            border: '1px solid #fff',
            borderRadius: 18,
            boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          Show {selectedOverviewEntity.hiddenNeighborCount.toLocaleString()}{' '}
          {selectedOverviewEntity.hiddenNeighborCount === 1
            ? 'neighbor'
            : 'neighbors'}
        </button>
      )}
      {graphView.mode === 'bounded' && (
        <EmbedLargeGraphControls
          graphView={graphView}
          totalNodes={ontology.entityTypes.length}
          totalEdges={ontology.relationships.length}
          searchInput={searchInput}
          appliedSearch={search}
          depth={depth}
          maxDepth={maxDepth}
          canReset={(
            search !== ''
            || depth !== DEFAULT_LARGE_GRAPH_DEPTH
            || expandedNodeIds.size > 0
            || selected !== null
          )}
          selectedEntity={selectedOverviewEntity}
          depthSliderId={depthSliderId}
          theme={theme}
          onSearchInputChange={setSearchInput}
          onSearch={handleSearch}
          onDepthChange={handleDepthChange}
          onExpandSelectedEntity={handleExpandSelectedEntity}
          onCollapseSelectedEntity={handleCollapseSelectedEntity}
          onOverview={handleOverview}
        />
      )}
    </div>
  );
}

interface EmbedLargeGraphControlsProps {
  graphView: GraphView;
  totalNodes: number;
  totalEdges: number;
  searchInput: string;
  appliedSearch: string;
  depth: number;
  maxDepth: number;
  canReset: boolean;
  selectedEntity: {
    name: string;
    hiddenNeighborCount: number;
    isExpanded: boolean;
    canExpand: boolean;
  } | null;
  depthSliderId: string;
  theme: EmbedThemeTokens;
  onSearchInputChange: (value: string) => void;
  onSearch: () => void;
  onDepthChange: (depth: number) => void;
  onExpandSelectedEntity: () => void;
  onCollapseSelectedEntity: () => void;
  onOverview: () => void;
}

function EmbedLargeGraphControls({
  graphView,
  totalNodes,
  totalEdges,
  searchInput,
  appliedSearch,
  depth,
  maxDepth,
  canReset,
  selectedEntity,
  depthSliderId,
  theme,
  onSearchInputChange,
  onSearch,
  onDepthChange,
  onExpandSelectedEntity,
  onCollapseSelectedEntity,
  onOverview,
}: EmbedLargeGraphControlsProps) {
  const [collapsed, setCollapsed] = useState(false);
  const buttonStyle: React.CSSProperties = {
    minWidth: 44,
    minHeight: 44,
    padding: '8px 10px',
    background: theme.bgTertiary,
    color: theme.text,
    border: `1px solid ${theme.border}`,
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 14,
  };
  const inputStyle: React.CSSProperties = {
    minWidth: 0,
    minHeight: 44,
    padding: '8px 10px',
    background: theme.bg,
    color: theme.text,
    border: `1px solid ${theme.border}`,
    borderRadius: 4,
    fontSize: 16,
  };
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSearch();
  };

  return (
    <section
      aria-label="Large ontology controls"
      style={{
        position: 'absolute',
        zIndex: 2,
        top: 8,
        left: 8,
        width: collapsed ? 'auto' : 'min(330px, calc(100% - 16px))',
        maxHeight: collapsed ? undefined : 'calc(100% - 16px)',
        boxSizing: 'border-box',
        padding: collapsed ? '8px 10px' : 12,
        overflowY: collapsed ? undefined : 'auto',
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch',
        background: theme.bgSecondary,
        color: theme.text,
        border: `1px solid ${theme.border}`,
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <strong style={{ fontSize: 14 }}>Semantic overview</strong>
          {!collapsed && (
            <div style={{
              marginTop: 2,
              minHeight: 30,
              color: theme.textTertiary,
              lineHeight: 1.35,
            }}>
              {graphView.visibleNodeCount} of {totalNodes} entities ·{' '}
              {graphView.visibleEdgeCount} of {totalEdges} relationships
            </div>
          )}
        </div>
        <button
          type="button"
          style={buttonStyle}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? 'Open' : 'Hide'}
        </button>
      </div>
      {!collapsed && (
        <>
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <input
              type="search"
              aria-label="Jump to an entity"
              value={searchInput}
              onChange={(event) => onSearchInputChange(event.target.value)}
              placeholder="Name, ID, or keyword"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button type="submit" style={buttonStyle}>Find</button>
          </form>
          <div style={{ marginTop: 8 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              minHeight: 44,
            }}>
              <label
                htmlFor={depthSliderId}
                style={{ color: theme.textSecondary, whiteSpace: 'nowrap' }}
              >
                Detail: <strong>{depth} {depth === 1 ? 'hop' : 'hops'}</strong>
                <span style={{ color: theme.textTertiary }}>
                  {' '}· max {maxDepth}
                </span>
              </label>
              <button
                type="button"
                disabled={!canReset}
                style={{
                  ...buttonStyle,
                  ...(!canReset ? { cursor: 'not-allowed', opacity: 0.5 } : {}),
                }}
                onClick={onOverview}
              >
                Reset view
              </button>
            </div>
            <SemanticDepthSlider
              id={depthSliderId}
              max={maxDepth}
              value={depth}
              disabled={maxDepth <= 1}
              onDepthChange={onDepthChange}
              aria-label={`Detail: ${depth} ${depth === 1 ? 'hop' : 'hops'}`}
              aria-valuetext={`${depth} ${depth === 1 ? 'hop' : 'hops'}`}
              style={{
                display: 'block',
                width: '100%',
                minHeight: 44,
                margin: '6px 0 0',
                accentColor: theme.accent,
                color: theme.accent,
              }}
            />
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            minHeight: 44,
            marginTop: 8,
          }}>
            {selectedEntity?.isExpanded ? (
              <button
                type="button"
                aria-label={`Hide shown neighbors for ${selectedEntity.name}`}
                style={{ ...buttonStyle, width: '100%' }}
                onClick={onCollapseSelectedEntity}
              >
                Hide shown neighbors
              </button>
            ) : selectedEntity
              && selectedEntity.hiddenNeighborCount > 0
              ? (
                <button
                  type="button"
                  disabled={!selectedEntity.canExpand}
                  aria-label={`Show ${selectedEntity.hiddenNeighborCount} hidden ${
                    selectedEntity.hiddenNeighborCount === 1
                      ? 'neighbor'
                      : 'neighbors'
                  } for ${selectedEntity.name}`}
                  style={{
                    ...buttonStyle,
                    width: '100%',
                    ...(!selectedEntity.canExpand
                      ? { cursor: 'not-allowed', opacity: 0.5 }
                      : {}),
                  }}
                  onClick={onExpandSelectedEntity}
                >
                  Show {selectedEntity.hiddenNeighborCount.toLocaleString()}{' '}
                  hidden {selectedEntity.hiddenNeighborCount === 1
                    ? 'neighbor'
                    : 'neighbors'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  style={{
                    ...buttonStyle,
                    width: '100%',
                    cursor: 'not-allowed',
                    opacity: 0.65,
                  }}
                >
                  {!selectedEntity
                    ? 'Select a +N entity to show neighbors'
                    : 'No hidden neighbors for this entity'}
                </button>
              )}
          </div>
          <div
            role={appliedSearch && graphView.searchMatchCount === 0
              ? 'alert'
              : 'status'}
            style={{
              height: 52,
              marginTop: 8,
              overflowY: 'auto',
              color: (
                appliedSearch && graphView.searchMatchCount === 0
                  ? '#D83B01'
                  : theme.textSecondary
              ),
              lineHeight: 1.35,
            }}
          >
            {selectedEntity
              && selectedEntity.hiddenNeighborCount > 0
              && !selectedEntity.canExpand
              ? `${selectedEntity.hiddenNeighborCount.toLocaleString()} ${
                selectedEntity.hiddenNeighborCount === 1
                  ? 'neighbor remains'
                  : 'neighbors remain'
              } hidden because the ${
                graphView.visibleNodeCount.toLocaleString()
              }-entity view limit is full. Hide a shown neighborhood to make room.`
              : appliedSearch
                ? graphView.searchMatchCount === 0
                  ? 'No match. Showing hierarchy roots.'
                  : `${graphView.searchMatchCount} matching ${
                    graphView.searchMatchCount === 1 ? 'entity' : 'entities'
                  }.`
                : null}
          </div>
          <div style={{ marginTop: 8, color: theme.textTertiary, lineHeight: 1.35 }}>
            Select a dashed “+N” entity to show its neighbor action beside the
            {' '}node. Hide a shown neighborhood here, or select another “+N”
            {' '}entity to continue. Selecting any entity also labels its visible
            {' '}relationships.
          </div>
        </>
      )}
    </section>
  );
}

// ─── RDF Source ──────────────────────────────────────────────────────────────

function EmbedRdfSource({
  rdf,
  theme,
  hasCompleteSource,
}: {
  rdf: string;
  theme: EmbedThemeTokens;
  hasCompleteSource: boolean;
}) {
  const isDark = theme === EMBED_THEMES.dark;
  const hlTheme = isDark ? RDF_HIGHLIGHT_DARK : RDF_HIGHLIGHT_LIGHT;
  const highlighted = useMemo(() => highlightRdf(rdf, hlTheme), [rdf, hlTheme]);

  return (
    <div style={{ height: '100%', overflow: 'auto', background: theme.bg }}>
      {hasCompleteSource && (
        <div
          role="note"
          style={{
            background: theme.bgSecondary,
            borderBottom: `1px solid ${theme.border}`,
            color: theme.textSecondary,
            fontSize: 11,
            lineHeight: 1.4,
            padding: '8px 16px',
          }}
        >
          This is the complete source RDF. Imports and referenced resources are
          preserved as statements but are not fetched or executed.
        </div>
      )}
      <pre style={{
        margin: 0, padding: 16, overflow: 'visible',
        background: theme.bg, color: theme.textSecondary,
        fontSize: 12, lineHeight: 1.6, fontFamily: "'Cascadia Code', 'Fira Code', monospace",
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {highlighted}
      </pre>
    </div>
  );
}

// ─── Inspector overlay ───────────────────────────────────────────────────────

interface InspectorProps {
  selected: SelectedItem;
  theme: EmbedThemeTokens;
  ontology: Ontology;
  onClose: () => void;
}

function EmbedInspector({ selected, theme, ontology, onClose }: InspectorProps) {
  const panelStyle: React.CSSProperties = {
    position: 'absolute', bottom: 8, left: 8, right: 8,
    background: theme.bgSecondary, border: `1px solid ${theme.border}`,
    borderRadius: 8, padding: '12px 16px', fontSize: 12,
    maxHeight: '40%', overflowY: 'auto',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  };

  if (selected.type === 'entity' && selected.entity) {
    const e = selected.entity;
    return (
      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{e.icon} {e.name}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: theme.textTertiary, cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        {e.description && <p style={{ color: theme.textSecondary, margin: '0 0 8px' }}>{e.description}</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {e.properties.map((p) => (
            <span key={p.name} style={{
              padding: '2px 8px', background: theme.bgTertiary, borderRadius: 4,
              color: p.isIdentifier ? theme.accent : theme.textSecondary, fontSize: 11,
              fontWeight: p.isIdentifier ? 600 : 400,
            }}>
              {p.isIdentifier ? '🔑 ' : ''}{p.name}: {p.type}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (selected.type === 'relationship' && selected.relationship) {
    const r = selected.relationship;
    const fromEntity = ontology.entityTypes.find((e) => e.id === r.from);
    const toEntity = ontology.entityTypes.find((e) => e.id === r.to);
    return (
      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: theme.textTertiary, cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        <p style={{ color: theme.textSecondary, margin: '0 0 6px' }}>
          {fromEntity?.icon} {fromEntity?.name || r.from} → {toEntity?.icon} {toEntity?.name || r.to}
        </p>
        <span style={{ padding: '2px 8px', background: theme.bgTertiary, borderRadius: 4, color: theme.textTertiary, fontSize: 11 }}>
          {r.cardinality}
        </span>
        {r.description && <p style={{ color: theme.textSecondary, margin: '6px 0 0', fontSize: 11 }}>{r.description}</p>}
      </div>
    );
  }

  return null;
}
