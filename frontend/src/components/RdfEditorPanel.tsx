import { useEffect, useRef, useState, useCallback, useMemo, type ChangeEvent } from 'react';
import { useAppStore } from '../store/appStore';
import { serializeToRDF } from '../lib/rdf/serializer';
import { parseRDF } from '../lib/rdf/parser';
import { highlightRdf, RDF_HIGHLIGHT_DARK, RDF_HIGHLIGHT_LIGHT } from '../lib/rdf/highlighter';

type ParseStatus = 'synced' | 'pending' | 'error';

export function RdfEditorPanel() {
  const [open, setOpen] = useState(false);
  const currentOntology = useAppStore((s) => s.currentOntology);
  const loadOntology = useAppStore((s) => s.loadOntology);
  const darkMode = useAppStore((s) => s.darkMode);
  const hlTheme = darkMode ? RDF_HIGHLIGHT_DARK : RDF_HIGHLIGHT_LIGHT;

  const serializeOrFallback = useCallback((o: typeof currentOntology) => {
    try { return serializeToRDF(o, []); }
    catch { return ''; }
  }, []);

  const [content, setContent] = useState(() => serializeOrFallback(currentOntology));
  const [status, setStatus] = useState<ParseStatus>('synced');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isEditingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  // When ontology changes from outside, re-serialize into editor (only if not actively typing)
  useEffect(() => {
    if (isEditingRef.current) return;
    const serialized = serializeOrFallback(currentOntology);
    if (serialized) {
      setContent(serialized);
      setStatus('synced');
      setErrorMsg(null);
    }
  }, [currentOntology, serializeOrFallback]);

  const highlighted = useMemo(() => highlightRdf(content, hlTheme), [content, hlTheme]);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    setStatus('pending');
    setErrorMsg(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        const { ontology: parsed, bindings } = parseRDF(val);
        loadOntology(parsed, bindings);
        setStatus('synced');
      } catch (err) {
        setStatus('error');
        setErrorMsg(err instanceof Error ? err.message : 'Invalid RDF');
      }
    }, 500);
  };

  const handleScroll = () => {
    if (preRef.current && textareaRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
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
    <div className="rdf-panel">
      <div className="rdf-panel-header" onClick={() => setOpen(o => !o)}>
        <span className="rdf-panel-title">RDF/XML Editor</span>
        {open && (
          <button className="rdf-panel-copy" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        )}
        <span className="rdf-panel-toggle">{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <>
          <div className={`rdf-editor-status rdf-editor-status--${status}`}>
            {statusLabel}
          </div>
          <div className="rdf-editor-wrapper rdf-panel-editor">
            <pre
              ref={preRef}
              className="rdf-highlight-layer"
              aria-hidden="true"
            >
              {highlighted}
              {'\n'}
            </pre>
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
        </>
      )}
    </div>
  );
}
