import { FilePlus2, FlaskConical, RotateCcw, Upload } from 'lucide-react';
import { useAlignmentStore } from '../store/alignmentStore';
import { useAppStore } from '../store/appStore';

export function ExtractionSidebar() {
  const {
    sourceDocuments,
    loading,
    error,
    addSourceDocument,
    removeSourceDocument,
    resetSourceDocuments,
    updateSourceDocument,
    generateGraphFromCurrentOntology,
  } = useAlignmentStore();
  const { setWorkspaceTab } = useAppStore();

  const handleRunExtraction = async () => {
    setWorkspaceTab('review');
    await generateGraphFromCurrentOntology();
  };

  return (
    <aside className="extraction-sidebar">
      <div className="panel-header">
        <h3 className="panel-title">
          <Upload size={16} style={{ marginRight: 8 }} />
          Extraction
        </h3>
        <p className="extraction-sidebar-copy">
          Add source files or paste extracted text. Running extraction will open the review queue automatically.
        </p>
      </div>

      <div className="extraction-sidebar-actions">
        <button type="button" className="designer-add-btn" onClick={addSourceDocument}>
          <FilePlus2 size={14} />
          Add File
        </button>
        <button type="button" className="designer-toolbar-btn" onClick={resetSourceDocuments}>
          <RotateCcw size={14} />
          Reset
        </button>
      </div>

      <div className="extraction-sidebar-list">
        {sourceDocuments.map((document, index) => (
          <article key={document.source_doc_id ?? `${document.source_doc_name}-${index}`} className="extraction-file-card">
            <div className="extraction-file-header">
              <strong>File {index + 1}</strong>
              <button
                type="button"
                className="alignment-document-remove"
                onClick={() => removeSourceDocument(index)}
                disabled={sourceDocuments.length === 1}
              >
                Remove
              </button>
            </div>

            <label className="extraction-file-field">
              <span>Name</span>
              <input
                type="text"
                value={document.source_doc_name}
                onChange={(event) => updateSourceDocument(index, 'source_doc_name', event.target.value)}
              />
            </label>

            <div className="extraction-file-row">
              <label className="extraction-file-field">
                <span>Type</span>
                <input
                  type="text"
                  value={document.doc_type}
                  onChange={(event) => updateSourceDocument(index, 'doc_type', event.target.value)}
                />
              </label>
              <label className="extraction-file-field">
                <span>Page</span>
                <input
                  type="number"
                  min={1}
                  value={document.page ?? 1}
                  onChange={(event) => updateSourceDocument(index, 'page', Number(event.target.value))}
                />
              </label>
            </div>

            <label className="extraction-file-field">
              <span>Content</span>
              <textarea
                rows={6}
                value={document.text}
                onChange={(event) => updateSourceDocument(index, 'text', event.target.value)}
              />
            </label>
          </article>
        ))}
      </div>

      {error ? <div className="alignment-banner is-error extraction-inline-banner">{error}</div> : null}

      <div className="extraction-sidebar-footer">
        <button
          type="button"
          className="extraction-run-btn"
          onClick={() => {
            void handleRunExtraction();
          }}
          disabled={loading}
        >
          <FlaskConical size={16} />
          {loading ? 'Running Extraction…' : 'Run Extraction'}
        </button>
        <p className="extraction-sidebar-hint">
          Extraction generates review candidates. The instance graph can only be built from approved review cards.
        </p>
      </div>
    </aside>
  );
}
