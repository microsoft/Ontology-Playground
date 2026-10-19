import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import type { Core } from 'cytoscape';
import { syncGraphElements, type PreviewOntology } from './syncGraphElements';
import { useDesignerStore } from '../../store/designerStore';
import { useAppStore, type ThemeId } from '../../store/appStore';
import { serializeToRDF } from '../../lib/rdf/serializer';
import {
  createImportedRdfDocument,
  exportRdfDocument,
} from '../../lib/rdf/document';
import { decodeRdfBytes } from '../../lib/rdf/dataset';
import { highlightRdf, RDF_HIGHLIGHT_DARK, RDF_HIGHLIGHT_LIGHT } from '../../lib/rdf/highlighter';
import type { ReadyRdfDocument } from '../../types/rdfDocument';
import {
  isLargeOntologyGraph,
  ontologyGraphElementCount,
} from '../../lib/ontologyScale';

cytoscape.use(fcose);

interface DesignerPreviewProps {
  onOntologyReplaced?: () => void;
}

function normalizeLeadingXmlDeclarationEncoding(value: string): string {
  const start = value.startsWith('\uFEFF') ? 1 : 0;
  const content = value.slice(start);
  const declaration = /^<\?xml(?=\s)[\s\S]*?\?>/i.exec(content)?.[0];
  if (!declaration) return value;
  const normalized = declaration.replace(
    /(\bencoding\s*=\s*["'])[^"']+(["'])/i,
    '$1UTF-8$2',
  );
  return value.slice(0, start)
    + normalized
    + content.slice(declaration.length);
}

export function DesignerPreview({
  onOntologyReplaced,
}: DesignerPreviewProps = {}) {
  const [activeTab, setActiveTab] = useState<'graph' | 'rdf'>('graph');
  const {
    ontology,
    rdfDocument,
    selectEntity,
    selectRelationship,
  } = useDesignerStore();
  const theme = useAppStore((s) => s.theme);

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
          theme={theme}
          onSelectEntity={selectEntity}
          onSelectRelationship={selectRelationship}
        />
      ) : (
        <RdfPreview
          ontology={ontology}
          rdfDocument={rdfDocument}
          onImported={(replaced) => {
            if (replaced) onOntologyReplaced?.();
            setActiveTab('graph');
          }}
        />
      )}
    </div>
  );
}

// ─── Graph tab ───────────────────────────────────────────────────────────────

interface GraphPreviewProps {
  ontology: PreviewOntology;
  theme: ThemeId;
  onSelectEntity: (id: string | null) => void;
  onSelectRelationship: (id: string | null) => void;
}

function GraphPreview({ ontology, theme, onSelectEntity, onSelectRelationship }: GraphPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const largeGraph = isLargeOntologyGraph(ontology);

  const buildElements = useCallback(() => {
    const nodes = ontology.entityTypes.map((e) => ({
      data: { id: e.id, label: `${e.icon} ${e.name}`, color: e.color },
    }));
    const edges = ontology.relationships.map((r) => ({
      data: {
        id: r.id,
        source: r.from,
        target: r.to,
        label: r.name,
        kind: r.kind ?? 'association',
      },
    }));
    return [...nodes, ...edges];
  }, [ontology]);

  // Create graph; recreate on theme change. Graph colors are read from the
  // active theme's CSS custom properties so each theme uses its own palette.
  useEffect(() => {
    if (!containerRef.current) return;
    const cssVars = getComputedStyle(containerRef.current);
    const themeColors = {
      nodeText: cssVars.getPropertyValue('--graph-node-text').trim() || '#B3B3B3',
      edgeColor: cssVars.getPropertyValue('--graph-edge-color').trim() || '#6E6E6E',
      edgeText: cssVars.getPropertyValue('--graph-edge-text').trim() || '#9CA0A8',
      edgeLabelBg: cssVars.getPropertyValue('--graph-edge-label-bg').trim() || '#15161D',
    };
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
            label: largeGraph ? '' : 'data(label)',
            'font-size': '11px',
            'font-family': 'Segoe UI, sans-serif',
            color: themeColors.edgeText,
            'text-rotation': 'autorotate',
            'text-margin-y': -8,
            'text-background-color': themeColors.edgeLabelBg,
            'text-background-opacity': 1,
            'text-background-padding': '2px',
            'text-background-shape': 'roundrectangle',
            width: 2,
            'line-color': themeColors.edgeColor,
            'target-arrow-color': themeColors.edgeColor,
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
          },
        },
        {
          selector: 'edge[kind = "subclass"]',
          style: {
            'line-style': 'dashed',
          },
        },
      ],
      layout: (largeGraph
        ? {
            name: 'grid',
            animate: false,
            fit: true,
            padding: 30,
          }
        : {
            name: ontology.entityTypes.length > 0 ? 'fcose' : 'grid',
            animate: false,
            fit: true,
            padding: 40,
            nodeDimensionsIncludeLabels: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any,
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
  }, [theme, largeGraph]); // Recreate on theme or scale strategy change

  // Incrementally sync nodes & edges without full relayout
  useEffect(() => {
    if (cyRef.current) syncGraphElements(cyRef.current, ontology);
  }, [ontology]);

  return <div ref={containerRef} className="designer-graph-container" />;
}

// ─── RDF tab ─────────────────────────────────────────────────────────────────

interface RdfPreviewProps {
  ontology: GraphPreviewProps['ontology'] & { name: string; description: string };
  rdfDocument: ReadyRdfDocument | null;
  onImported: (replaced: boolean) => void;
}

export function RdfPreview({
  ontology,
  rdfDocument,
  onImported,
}: RdfPreviewProps) {
  const [copied, setCopied] = useState(false);
  const [importMode, setImportMode] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [rdfOutput, setRdfOutput] = useState('');
  const [previewPreparationError, setPreviewPreparationError] =
    useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [isLoadingRdf, setIsLoadingRdf] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const importRequestId = useRef(0);
  const importTextRevision = useRef(0);
  const copyRequestId = useRef(0);
  const editBaseline = useRef<{
    ontology: RdfPreviewProps['ontology'];
    rdfDocument: ReadyRdfDocument | null;
  } | null>(null);
  const loadDraft = useDesignerStore((s) => s.loadDraft);

  useEffect(() => () => {
    importRequestId.current += 1;
    copyRequestId.current += 1;
  }, []);

  useEffect(() => {
    importRequestId.current += 1;
    copyRequestId.current += 1;
    setIsImporting(false);
    setCopied(false);
    setCopyError(null);
    if (
      importMode
      && editBaseline.current
      && (
        editBaseline.current.ontology !== ontology
        || editBaseline.current.rdfDocument !== rdfDocument
      )
    ) {
      setImportError(
        'The Designer draft changed after this RDF editor was opened. Close and reopen it before loading RDF.',
      );
    }
  }, [
    importMode,
    ontology,
    rdfDocument,
    rdfDocument?.id,
    rdfDocument?.revision,
  ]);

  useEffect(() => {
    let cancelled = false;
    setPreviewPreparationError(null);
    if (!rdfDocument) {
      try {
        setRdfOutput(
          serializeToRDF(
            ontology as Parameters<typeof serializeToRDF>[0],
            [],
          ),
        );
      } catch {
        setRdfOutput(
          '<!-- Ontology is incomplete or invalid; fix errors to see RDF output -->',
        );
      }
      setIsLoadingRdf(false);
      return () => {
        cancelled = true;
      };
    }

    setRdfOutput('');
    setIsLoadingRdf(true);
    void exportRdfDocument(rdfDocument)
      .then((result) => {
        if (!cancelled) setRdfOutput(decodeRdfBytes(result.bytes));
      })
      .catch((error) => {
        if (!cancelled) {
          setPreviewPreparationError(
            error instanceof Error
              ? error.message
              : 'Failed to prepare complete RDF',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingRdf(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ontology, rdfDocument]);

  const darkMode = useAppStore((s) => s.darkMode);
  const hlTheme = darkMode ? RDF_HIGHLIGHT_DARK : RDF_HIGHLIGHT_LIGHT;
  const highlightedRdf = useMemo(() => highlightRdf(rdfOutput, hlTheme), [rdfOutput, hlTheme]);

  const handleCopy = async () => {
    if (
      isLoadingRdf
      || previewPreparationError
      || !rdfOutput
    ) {
      return;
    }
    const requestId = ++copyRequestId.current;
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(rdfOutput);
      if (requestId !== copyRequestId.current) return;
      setCopied(true);
      setTimeout(() => {
        if (requestId === copyRequestId.current) setCopied(false);
      }, 2000);
    } catch (error) {
      if (requestId !== copyRequestId.current) return;
      setCopyError(
        error instanceof Error ? error.message : 'Failed to copy RDF',
      );
    }
  };

  const handleImport = async () => {
    const submittedText = importText;
    const submittedTextRevision = importTextRevision.current;
    const trimmed = submittedText.trim();
    if (!trimmed) {
      setImportError('Paste RDF/XML content first');
      return;
    }
    const requestId = ++importRequestId.current;
    const startingDraft = useDesignerStore.getState();
    const baseline = editBaseline.current;
    if (
      !baseline
      || baseline.ontology !== startingDraft.ontology
      || baseline.rdfDocument !== startingDraft.rdfDocument
    ) {
      setImportError(
        'The Designer draft changed after this RDF editor was opened. Close and reopen it before loading RDF.',
      );
      setIsImporting(false);
      return;
    }
    setIsImporting(true);
    try {
      if (rdfDocument && submittedText === rdfOutput) {
        editBaseline.current = null;
        setImportMode(false);
        setImportText('');
        setImportError(null);
        onImported(false);
        return;
      }
      const normalizedText =
        normalizeLeadingXmlDeclarationEncoding(submittedText);
      const parsed = await createImportedRdfDocument(
        new TextEncoder().encode(normalizedText),
        {
          name: rdfDocument?.source.name ?? 'designer-import.rdf',
          baseIri: rdfDocument?.source.baseIri,
        },
      );
      if (requestId !== importRequestId.current) return;
      if (submittedTextRevision !== importTextRevision.current) {
        setImportError(
          'The RDF text changed while it was loading. Review the current text and load it again.',
        );
        return;
      }
      const activeDraft = useDesignerStore.getState();
      if (
        activeDraft.ontology !== startingDraft.ontology
        || activeDraft.rdfDocument !== startingDraft.rdfDocument
      ) {
        return;
      }
      if (isLargeOntologyGraph(parsed.ontology)) {
        setImportError(
          `This ontology contains ${ontologyGraphElementCount(parsed.ontology).toLocaleString()} graph elements, ` +
          'which is too large for safe all-at-once editing. Import it in the main viewer instead.'
        );
        return;
      }
      loadDraft(parsed.ontology, parsed.document);
      editBaseline.current = null;
      setImportMode(false);
      setImportText('');
      setImportError(null);
      onImported(true);
    } catch (err) {
      if (requestId === importRequestId.current) {
        setImportError(
          err instanceof Error ? err.message : 'Failed to parse RDF',
        );
      }
    } finally {
      if (requestId === importRequestId.current) {
        setIsImporting(false);
      }
    }
  };

  const handleCancel = () => {
    importRequestId.current += 1;
    editBaseline.current = null;
    setIsImporting(false);
    setImportMode(false);
    setImportText('');
    setImportError(null);
  };

  return (
    <div className="designer-rdf-container">
      <div className="designer-rdf-toolbar">
        {importMode ? (
          <>
            <button
              className="designer-add-btn small"
              onClick={() => void handleImport()}
              disabled={
                isImporting
                || isLoadingRdf
                || Boolean(previewPreparationError)
                || (
                  Boolean(editBaseline.current)
                  && (
                    editBaseline.current?.ontology !== ontology
                    || editBaseline.current?.rdfDocument !== rdfDocument
                  )
                )
              }
            >
              {isImporting ? 'Loading…' : 'Load into Designer'}
            </button>
            <button className="designer-add-btn small secondary" onClick={handleCancel}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              className="designer-add-btn small"
              disabled={
                isLoadingRdf
                || Boolean(previewPreparationError)
                || !rdfOutput
              }
              onClick={() => {
                editBaseline.current = { ontology, rdfDocument };
                importTextRevision.current += 1;
                setImportMode(true);
                setImportText(rdfOutput);
                setImportError(null);
                setCopyError(null);
              }}
            >
              Edit RDF
            </button>
            <button
              className="designer-add-btn small"
              onClick={() => void handleCopy()}
              disabled={
                isLoadingRdf
                || Boolean(previewPreparationError)
                || !rdfOutput
              }
            >
              {copied ? 'Copied!' : 'Copy RDF'}
            </button>
          </>
        )}
      </div>
      {(importError || previewPreparationError || copyError) && (
        <div role="alert" className="designer-import-error">
          {importError ?? previewPreparationError ?? copyError}
        </div>
      )}
      {importMode ? (
        <textarea
          className="designer-rdf-source designer-rdf-textarea"
          value={importText}
          onChange={(e) => {
            importTextRevision.current += 1;
            setImportText(e.target.value);
            setImportError(null);
          }}
          placeholder="Paste or edit RDF/XML content here…"
          disabled={isImporting}
          aria-busy={isImporting}
          autoFocus
          spellCheck={false}
        />
      ) : (
        <pre className="designer-rdf-source">
          {isLoadingRdf ? 'Loading complete RDF…' : highlightedRdf}
        </pre>
      )}
    </div>
  );
}
