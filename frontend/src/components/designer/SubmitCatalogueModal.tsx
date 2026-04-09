import { useState } from 'react';
import { X, FolderArchive, Download, Check } from 'lucide-react';
import { useDesignerStore } from '../../store/designerStore';
import { serializeToRDF } from '../../lib/rdf/serializer';
import { saveLocalOntology } from '../../lib/localLibraryApi';

interface SubmitCatalogueModalProps {
  onClose: () => void;
}

export function SubmitCatalogueModal({ onClose }: SubmitCatalogueModalProps) {
  const ontology = useDesignerStore((s) => s.ontology);
  const [downloaded, setDownloaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleDownloadRdf = () => {
    const rdf = serializeToRDF(ontology, []);
    const slug = ontology.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ontology';
    const blob = new Blob([rdf], { type: 'application/rdf+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}.rdf`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
  };

  const handleDownloadMetadata = () => {
    const metadata = {
      name: ontology.name,
      description: ontology.description,
      icon: '📦',
      category: 'other',
      tags: [],
      author: '',
    };
    const blob = new Blob([JSON.stringify(metadata, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'metadata.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveToLocalLibrary = async () => {
    try {
      setSaveError(null);
      await saveLocalOntology({
        name: ontology.name,
        description: ontology.description,
        ontology,
        rdf_content: serializeToRDF(ontology, []),
        metadata: {
          tags: [],
        },
      });
      setSaved(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save the ontology to the local library.';
      setSaveError(message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content submit-catalogue-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><X size={18} /></button>
        <h2 className="modal-title">
          <FolderArchive size={20} /> Save to Local Library
        </h2>

        <div className="submit-step">
          <p className="submit-description">
            Download the ontology files below and place them in your local library folders inside this workspace.
          </p>

          <div className="submit-instructions">
            <h3>How to save</h3>
            <ol>
              <li>Download your ontology RDF and metadata files below.</li>
              <li>Place ontology files under <code>library/ontologies/</code>.</li>
              <li>Use the metadata file to track description, tags, and ownership.</li>
              <li>Store approved graph snapshots separately under <code>library/graphs/</code>.</li>
            </ol>
          </div>

          <div className="submit-download-actions">
            <button className="designer-action-btn primary" onClick={() => { void handleSaveToLocalLibrary(); }}>
              <FolderArchive size={14} /> Save to Local Library
              {saved && <Check size={14} style={{ marginLeft: 4 }} />}
            </button>
            <button className="designer-action-btn primary" onClick={handleDownloadRdf}>
              <Download size={14} /> Download RDF
              {downloaded && <Check size={14} style={{ marginLeft: 4 }} />}
            </button>
            <button className="designer-action-btn secondary" onClick={handleDownloadMetadata}>
              <Download size={14} /> Download metadata.json
            </button>
          </div>

          {saveError ? (
            <div className="designer-validation-errors ontology-copilot-error">{saveError}</div>
          ) : null}

          <div className="submit-form-actions">
            <button className="designer-action-btn secondary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
