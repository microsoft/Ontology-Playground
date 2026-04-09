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
import { useEffect, useRef, useState, useMemo } from 'react';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import type { Core, EventObject } from 'cytoscape';
import type { Ontology, EntityType, Relationship } from '../data/ontology';
import { serializeToRDF } from '../lib/rdf/serializer';
import { parseRDF } from '../lib/rdf/parser';
import { highlightRdf, RDF_HIGHLIGHT_DARK, RDF_HIGHLIGHT_LIGHT } from '../lib/rdf/highlighter';
import type { Catalogue } from '../types/catalogue';

cytoscape.use(fcose);

export interface EmbedConfig {
  catalogueId?: string;
  ontologyUrl?: string;
  ontologyInline?: string;
  theme: 'dark' | 'light';
  height: string;
  catalogueBaseUrl?: string;
}

// ─── Theme tokens ────────────────────────────────────────────────────────────

interface ThemeTokens {
  bg: string; bgSecondary: string; bgTertiary: string;
  text: string; textSecondary: string; textTertiary: string;
  border: string; accent: string;
  nodeText: string; edgeColor: string; edgeText: string;
}

const THEMES: Record<string, ThemeTokens> = {
  dark: {
    bg: '#1B1B1B', bgSecondary: '#2D2D2D', bgTertiary: '#3D3D3D',
    text: '#FFFFFF', textSecondary: '#B3B3B3', textTertiary: '#808080',
    border: '#404040', accent: '#0078D4',
    nodeText: '#B3B3B3', edgeColor: '#505050', edgeText: '#808080',
  },
  light: {
    bg: '#FFFFFF', bgSecondary: '#F5F5F5', bgTertiary: '#EEEEEE',
    text: '#1A1A1A', textSecondary: '#555555', textTertiary: '#888888',
    border: '#DDDDDD', accent: '#0078D4',
    nodeText: '#2A2A2A', edgeColor: '#888888', edgeText: '#555555',
  },
};

// ─── Component ───────────────────────────────────────────────────────────────

type Tab = 'graph' | 'rdf';

interface SelectedItem {
  type: 'entity' | 'relationship';
  entity?: EntityType;
  relationship?: Relationship;
}

export function EmbedWidget({ config }: { config: EmbedConfig }) {
  const [ontology, setOntology] = useState<Ontology | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('graph');
  const [selected, setSelected] = useState<SelectedItem | null>(null);
  const [copied, setCopied] = useState(false);

  const theme = THEMES[config.theme] || THEMES.dark;

  // ─ Load ontology ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        let ont: Ontology | null = null;

        if (config.ontologyInline) {
          // Base64-encoded JSON
          const json = atob(config.ontologyInline);
          ont = JSON.parse(json) as Ontology;
        } else if (config.catalogueId) {
          // Load from catalogue.json
          const base = config.catalogueBaseUrl
            || (document.currentScript as HTMLScriptElement | null)?.src.replace(/\/[^/]+$/, '/')
            || window.location.origin + '/';
          const catalogueUrl = base.endsWith('/') ? `${base}catalogue.json` : `${base}/catalogue.json`;
          const res = await fetch(catalogueUrl);
          if (!res.ok) throw new Error(`Failed to load catalogue (${res.status})`);
          const cat = (await res.json()) as Catalogue;
          const entry = cat.entries.find((e) => e.id === config.catalogueId);
          if (!entry) throw new Error(`Ontology "${config.catalogueId}" not found in catalogue`);
          ont = entry.ontology;
        } else if (config.ontologyUrl) {
          // Fetch from URL
          const res = await fetch(config.ontologyUrl);
          if (!res.ok) throw new Error(`Failed to fetch ontology (${res.status})`);
          const text = await res.text();
          // Detect format: RDF/XML starts with < or has xml prologue
          if (text.trimStart().startsWith('<')) {
            const result = parseRDF(text);
            ont = result.ontology;
          } else {
            ont = JSON.parse(text) as Ontology;
          }
        } else {
          throw new Error('No ontology source specified. Use data-catalogue-id, data-ontology-url, or data-ontology-inline.');
        }

        if (!cancelled) {
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
        onCopyRdf={() => {
          navigator.clipboard.writeText(serializeToRDF(ontology, [])).then(() => {
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
          <EmbedRdfSource ontology={ontology} theme={theme} />
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
  theme: ThemeTokens;
  copied: boolean;
  onCopyRdf: () => void;
}

function EmbedHeader({ ontology, tab, setTab, theme, copied, onCopyRdf }: EmbedHeaderProps) {
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
        <button style={tabStyle(tab === 'rdf')} onClick={() => setTab('rdf')}>RDF Source</button>
        {tab === 'rdf' && (
          <button
            onClick={onCopyRdf}
            style={{
              marginLeft: 8, padding: '4px 10px', fontSize: 11,
              background: copied ? '#107C10' : theme.bgTertiary, color: copied ? '#fff' : theme.text,
              border: `1px solid ${theme.border}`, borderRadius: 4, cursor: 'pointer',
            }}
          >
            {copied ? 'Copied!' : 'Copy RDF'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Graph ───────────────────────────────────────────────────────────────────

interface EmbedGraphProps {
  ontology: Ontology;
  theme: ThemeTokens;
  selected: SelectedItem | null;
  setSelected: (s: SelectedItem | null) => void;
}

function EmbedGraph({ ontology, theme, setSelected }: EmbedGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  const elements = useMemo(() => {
    const nodes = ontology.entityTypes.map((e) => ({
      data: { id: e.id, label: `${e.icon} ${e.name}`, color: e.color },
    }));
    const edges = ontology.relationships.map((r) => ({
      data: { id: r.id, source: r.from, target: r.to, label: r.name },
    }));
    return [...nodes, ...edges];
  }, [ontology]);

  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)', 'text-valign': 'bottom', 'text-halign': 'center',
            'font-size': '13px', 'font-family': 'Segoe UI, sans-serif', 'font-weight': 600,
            color: theme.nodeText, 'text-margin-y': 8,
            width: 60, height: 60, 'background-color': 'data(color)',
            'border-width': 2, 'border-color': 'data(color)', 'border-opacity': 0.5,
          },
        },
        {
          selector: 'node:selected',
          style: { 'border-width': 4, 'border-color': theme.accent, width: 72, height: 72 },
        },
        {
          selector: 'edge',
          style: {
            label: 'data(label)', 'font-size': '11px', 'font-family': 'Segoe UI, sans-serif',
            color: theme.edgeText, 'text-rotation': 'autorotate', 'text-margin-y': -8,
            width: 2, 'line-color': theme.edgeColor, 'target-arrow-color': theme.edgeColor,
            'target-arrow-shape': 'triangle', 'curve-style': 'unbundled-bezier',
            'control-point-step-size': 40,
          },
        },
        {
          selector: 'edge:selected',
          style: { width: 4, 'line-color': theme.accent, 'target-arrow-color': theme.accent, color: theme.accent },
        },
      ],
      layout: {
        name: 'fcose', quality: 'proof', randomize: true, animate: false,
        fit: true, padding: 40, nodeDimensionsIncludeLabels: true,
        nodeRepulsion: () => 12000, idealEdgeLength: () => 180,
        edgeElasticity: () => 0.45, nodeSeparation: 80,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      minZoom: 0.3, maxZoom: 3,
      userPanningEnabled: true,
      userZoomingEnabled: true,
      boxSelectionEnabled: false,
      autoungrabify: true,   // read-only: nodes can't be dragged
    });

    cy.on('tap', 'node', (evt: EventObject) => {
      const id = evt.target.id();
      const entity = ontology.entityTypes.find((e) => e.id === id);
      if (entity) setSelected({ type: 'entity', entity });
    });

    cy.on('tap', 'edge', (evt: EventObject) => {
      const id = evt.target.id();
      const rel = ontology.relationships.find((r) => r.id === id);
      if (rel) setSelected({ type: 'relationship', relationship: rel });
    });

    cy.on('tap', (evt: EventObject) => {
      if (evt.target === cy) setSelected(null);
    });

    cyRef.current = cy;
    return () => { cy.destroy(); cyRef.current = null; };
  }, [elements, theme, ontology, setSelected]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}

// ─── RDF Source ──────────────────────────────────────────────────────────────

function EmbedRdfSource({ ontology, theme }: { ontology: Ontology; theme: ThemeTokens }) {
  const rdf = useMemo(() => serializeToRDF(ontology, []), [ontology]);
  const isDark = theme === THEMES.dark;
  const hlTheme = isDark ? RDF_HIGHLIGHT_DARK : RDF_HIGHLIGHT_LIGHT;
  const highlighted = useMemo(() => highlightRdf(rdf, hlTheme), [rdf, hlTheme]);

  return (
    <pre style={{
      margin: 0, padding: 16, height: '100%', overflow: 'auto',
      background: theme.bg, color: theme.textSecondary,
      fontSize: 12, lineHeight: 1.6, fontFamily: "'Cascadia Code', 'Fira Code', monospace",
      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    }}>
      {highlighted}
    </pre>
  );
}

// ─── Inspector overlay ───────────────────────────────────────────────────────

interface InspectorProps {
  selected: SelectedItem;
  theme: ThemeTokens;
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
