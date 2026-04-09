import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import type { Core } from 'cytoscape';
import { useDesignerStore } from '../../store/designerStore';
import { useAppStore } from '../../store/appStore';
import { serializeToRDF } from '../../lib/rdf/serializer';
import { parseRDF } from '../../lib/rdf/parser';
import { highlightRdf, RDF_HIGHLIGHT_DARK, RDF_HIGHLIGHT_LIGHT } from '../../lib/rdf/highlighter';

cytoscape.use(fcose);

export function DesignerPreview() {
  const [activeTab, setActiveTab] = useState<'graph' | 'rdf'>('graph');
  const { ontology, selectEntity, selectRelationship } = useDesignerStore();
  const darkMode = useAppStore((s) => s.darkMode);

  return (
    <div className="designer-preview">
      <div className="designer-preview-tabs">
        <button
          className={`designer-tab ${activeTab === 'graph' ? 'active' : ''}`}
          onClick={() => setActiveTab('graph')}
        >
          Graph
        </button>
        <button
          className={`designer-tab ${activeTab === 'rdf' ? 'active' : ''}`}
          onClick={() => setActiveTab('rdf')}
        >
          RDF
        </button>
      </div>

      {activeTab === 'graph' ? (
        <GraphPreview
          ontology={ontology}
          darkMode={darkMode}
          onSelectEntity={selectEntity}
          onSelectRelationship={selectRelationship}
        />
      ) : (
        <RdfPreview ontology={ontology} onImported={() => setActiveTab('graph')} />
      )}
    </div>
  );
}

// ─── Graph tab ───────────────────────────────────────────────────────────────

interface GraphPreviewProps {
  ontology: { entityTypes: { id: string; name: string; icon: string; color: string }[]; relationships: { id: string; name: string; from: string; to: string; cardinality: string }[] };
  darkMode: boolean;
  onSelectEntity: (id: string | null) => void;
  onSelectRelationship: (id: string | null) => void;
}

function GraphPreview({ ontology, darkMode, onSelectEntity, onSelectRelationship }: GraphPreviewProps) {
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
    const nodes = ontology.entityTypes.map((e) => ({
      data: { id: e.id, label: `${e.icon} ${e.name}`, color: e.color },
    }));
    const edges = ontology.relationships.map((r) => ({
      data: { id: r.id, source: r.from, target: r.to, label: r.name },
    }));
    return [...nodes, ...edges];
  }, [ontology]);

  // Create graph once; update elements incrementally
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

    cy.on('tap', 'node', (evt) => onSelectEntity(evt.target.id()));
    cy.on('tap', 'edge', (evt) => onSelectRelationship(evt.target.id()));
    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        onSelectEntity(null);
        onSelectRelationship(null);
      }
    });

    cyRef.current = cy;
    return () => { cy.destroy(); cyRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeColors]); // Only recreate on theme change

  // Incrementally sync nodes & edges without full relayout
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const currentNodeIds = new Set(cy.nodes().map((n) => n.id()));
    const currentEdgeIds = new Set(cy.edges().map((e) => e.id()));
    const desiredNodeIds = new Set(ontology.entityTypes.map((e) => e.id));
    const desiredEdgeIds = new Set(ontology.relationships.map((r) => r.id));

    // Remove deleted elements
    const toRemove = cy.elements().filter((ele) => {
      const id = ele.id();
      return ele.isNode() ? !desiredNodeIds.has(id) : !desiredEdgeIds.has(id);
    });
    if (toRemove.length) toRemove.remove();

    // Add new nodes
    const newNodes: { data: Record<string, string> }[] = [];
    for (const entity of ontology.entityTypes) {
      if (!currentNodeIds.has(entity.id)) {
        newNodes.push({ data: { id: entity.id, label: `${entity.icon} ${entity.name}`, color: entity.color } });
      }
    }

    // Add new edges
    const newEdges: { data: Record<string, string> }[] = [];
    for (const rel of ontology.relationships) {
      if (!currentEdgeIds.has(rel.id)) {
        newEdges.push({ data: { id: rel.id, source: rel.from, target: rel.to, label: rel.name } });
      }
    }

    if (newNodes.length || newEdges.length) {
      cy.add([...newNodes, ...newEdges]);
      // Only lay out NEW nodes near existing ones, keeping existing positions
      if (newNodes.length) {
        const newEles = cy.collection();
        for (const n of newNodes) {
          newEles.merge(cy.getElementById(n.data.id));
        }
        // Position new nodes near the center of the viewport
        const { x1, y1, w, h } = cy.extent();
        const cx = x1 + w / 2;
        const cy2 = y1 + h / 2;
        newEles.forEach((ele, i) => {
          ele.position({ x: cx + (i - newNodes.length / 2) * 80, y: cy2 });
        });
      }
      cy.fit(undefined, 40);
    }

    // Update cosmetic data on existing elements
    for (const entity of ontology.entityTypes) {
      const node = cy.getElementById(entity.id);
      if (node.length) {
        node.data('label', `${entity.icon} ${entity.name}`);
        node.data('color', entity.color);
      }
    }
    for (const rel of ontology.relationships) {
      const edge = cy.getElementById(rel.id);
      if (edge.length) {
        edge.data('label', rel.name);
      }
    }
  }, [ontology]);

  return <div ref={containerRef} className="designer-graph-container" />;
}

// ─── RDF tab ─────────────────────────────────────────────────────────────────

interface RdfPreviewProps {
  ontology: GraphPreviewProps['ontology'] & { name: string; description: string };
  onImported: () => void;
}

function RdfPreview({ ontology, onImported }: RdfPreviewProps) {
  const [copied, setCopied] = useState(false);
  const [importMode, setImportMode] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const loadDraft = useDesignerStore((s) => s.loadDraft);

  let rdfOutput: string;
  try {
    rdfOutput = serializeToRDF(ontology as Parameters<typeof serializeToRDF>[0], []);
  } catch {
    rdfOutput = '<!-- Ontology is incomplete or invalid; fix errors to see RDF output -->';
  }

  const darkMode = useAppStore((s) => s.darkMode);
  const hlTheme = darkMode ? RDF_HIGHLIGHT_DARK : RDF_HIGHLIGHT_LIGHT;
  const highlightedRdf = useMemo(() => highlightRdf(rdfOutput, hlTheme), [rdfOutput, hlTheme]);

  const handleCopy = () => {
    navigator.clipboard.writeText(rdfOutput).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleImport = () => {
    const trimmed = importText.trim();
    if (!trimmed) {
      setImportError('Paste RDF/XML content first');
      return;
    }
    try {
      const { ontology: parsed } = parseRDF(trimmed);
      loadDraft(parsed);
      setImportMode(false);
      setImportText('');
      setImportError(null);
      onImported();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to parse RDF');
    }
  };

  const handleCancel = () => {
    setImportMode(false);
    setImportText('');
    setImportError(null);
  };

  return (
    <div className="designer-rdf-container">
      <div className="designer-rdf-toolbar">
        {importMode ? (
          <>
            <button className="designer-add-btn small" onClick={handleImport}>
              Load into Designer
            </button>
            <button className="designer-add-btn small secondary" onClick={handleCancel}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button className="designer-add-btn small" onClick={() => { setImportMode(true); setImportText(rdfOutput); }}>
              Edit RDF
            </button>
            <button className="designer-add-btn small" onClick={handleCopy}>
              {copied ? 'Copied!' : 'Copy RDF'}
            </button>
          </>
        )}
      </div>
      {importError && (
        <div className="designer-import-error">{importError}</div>
      )}
      {importMode ? (
        <textarea
          className="designer-rdf-source designer-rdf-textarea"
          value={importText}
          onChange={(e) => { setImportText(e.target.value); setImportError(null); }}
          placeholder="Paste or edit RDF/XML content here…"
          autoFocus
          spellCheck={false}
        />
      ) : (
        <pre className="designer-rdf-source">{highlightedRdf}</pre>
      )}
    </div>
  );
}
