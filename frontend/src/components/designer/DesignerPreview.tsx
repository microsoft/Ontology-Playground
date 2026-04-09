import { useEffect, useRef, useState, useCallback, useMemo, type ChangeEvent } from 'react';
import { useDesignerStore } from '../../store/designerStore';
import { useAppStore } from '../../store/appStore';
import { serializeToRDF } from '../../lib/rdf/serializer';
import { parseRDF } from '../../lib/rdf/parser';
import { highlightRdf, RDF_HIGHLIGHT_DARK, RDF_HIGHLIGHT_LIGHT } from '../../lib/rdf/highlighter';
import { GraphReviewWorkspace } from '../alignment/GraphReviewWorkspace';
import { InstanceGraphPanel } from '../InstanceGraphPanel';
import { DesignerSchemaGraph } from './DesignerSchemaGraph';

interface DesignerPreviewProps {
  initialTab?: 'graph' | 'rdf' | 'review' | 'approved-graph';
}

export function DesignerPreview({ initialTab = 'graph' }: DesignerPreviewProps) {
  const [activeTab, setActiveTab] = useState<'graph' | 'rdf' | 'review' | 'approved-graph'>(initialTab);
  const { ontology, selectEntity, selectRelationship } = useDesignerStore();
  const darkMode = useAppStore((s) => s.darkMode);

  return (
    <div className="designer-preview">
      <div className="designer-preview-tabs">
        <button
          className={`designer-tab ${activeTab === 'graph' ? 'active' : ''}`}
          onClick={() => setActiveTab('graph')}
        >
          Schema
        </button>
        <button
          className={`designer-tab ${activeTab === 'rdf' ? 'active' : ''}`}
          onClick={() => setActiveTab('rdf')}
        >
          RDF
        </button>
        <button
          className={`designer-tab ${activeTab === 'review' ? 'active' : ''}`}
          onClick={() => setActiveTab('review')}
        >
          Review
        </button>
        <button
          className={`designer-tab ${activeTab === 'approved-graph' ? 'active' : ''}`}
          onClick={() => setActiveTab('approved-graph')}
        >
          Graph
        </button>
      </div>

      {activeTab === 'graph' ? (
        <DesignerSchemaGraph
          ontology={ontology}
          darkMode={darkMode}
          onSelectEntity={selectEntity}
          onSelectRelationship={selectRelationship}
        />
      ) : activeTab === 'rdf' ? (
        <RdfEditor />
      ) : activeTab === 'review' ? (
        <GraphReviewWorkspace onOpenApprovedGraph={() => setActiveTab('approved-graph')} />
      ) : (
        <InstanceGraphPanel />
      )}
    </div>
  );
}

// ─── RDF Editor tab ──────────────────────────────────────────────────────────

type ParseStatus = 'synced' | 'pending' | 'error';

function RdfEditor() {
  const ontology = useDesignerStore((s) => s.ontology);
  const loadDraft = useDesignerStore((s) => s.loadDraft);
  const darkMode = useAppStore((s) => s.darkMode);
  const hlTheme = darkMode ? RDF_HIGHLIGHT_DARK : RDF_HIGHLIGHT_LIGHT;

  const serializeOrFallback = useCallback((o: typeof ontology) => {
    try { return serializeToRDF(o, []); }
    catch { return ''; }
  }, []);

  const [content, setContent] = useState(() => serializeOrFallback(ontology));
  const [status, setStatus] = useState<ParseStatus>('synced');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Prevent feedback loop: true while user has focus on the textarea
  const isEditingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  // When ontology changes from the form side, re-serialize into editor
  // (only if the user isn't actively typing)
  useEffect(() => {
    if (isEditingRef.current) return;
    const serialized = serializeOrFallback(ontology);
    if (serialized) {
      setContent(serialized);
      setStatus('synced');
      setErrorMsg(null);
    }
  }, [ontology, serializeOrFallback]);

  const highlighted = useMemo(() => highlightRdf(content, hlTheme), [content, hlTheme]);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    setStatus('pending');
    setErrorMsg(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        const { ontology: parsed } = parseRDF(val);
        loadDraft(parsed);
        setStatus('synced');
      } catch (err) {
        setStatus('error');
        setErrorMsg(err instanceof Error ? err.message : 'Invalid RDF');
      }
    }, 500);
  };

  // Mirror textarea scroll position to the highlight layer
  const handleScroll = () => {
    if (preRef.current && textareaRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const statusLabel =
    status === 'synced' ? '✓ Valid — graph synced' :
    status === 'pending' ? '● Parsing…' :
    `✗ ${errorMsg ?? 'Invalid RDF'}`;

  return (
    <div className="designer-rdf-container">
      <div className="designer-rdf-toolbar">
        <button className="designer-add-btn small" onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy RDF'}
        </button>
      </div>

      <div className={`rdf-editor-status rdf-editor-status--${status}`}>
        {statusLabel}
      </div>

      <div className="rdf-editor-wrapper">
        {/* Highlighted layer — visual only, not interactive */}
        <pre
          ref={preRef}
          className="rdf-highlight-layer"
          aria-hidden="true"
        >
          {highlighted}
          {/* trailing newline prevents last line clipping */}
          {'\n'}
        </pre>

        {/* Input layer — transparent text so highlight shows through */}
        <textarea
          ref={textareaRef}
          className="rdf-input-layer"
          value={content}
          onChange={handleChange}
          onFocus={() => { isEditingRef.current = true; }}
          onBlur={() => { isEditingRef.current = false; }}
          onScroll={handleScroll}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          aria-label="RDF/XML editor"
        />
      </div>
    </div>
  );
}
