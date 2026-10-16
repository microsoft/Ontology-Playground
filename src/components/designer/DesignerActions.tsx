import { useState, useEffect } from 'react';
import { Download, AlertTriangle, CheckCircle, Upload, Github, FilePlus, Undo2, Redo2 } from 'lucide-react';
import { useDesignerStore } from '../../store/designerStore';
import type { ValidationError } from '../../store/designerStore';
import { useAppStore } from '../../store/appStore';
import {
  serializeToRDF,
  type RdfExportProfile,
} from '../../lib/rdf/serializer';
import { navigate } from '../../lib/router';
import { SubmitCatalogueModal } from './SubmitCatalogueModal';
import type { CatalogueEntry } from '../../types/catalogue';
import type { RdfExportResult } from '../../types/rdfDocument';
import {
  exportRdfDocument,
  isRdfDocumentDirty,
} from '../../lib/rdf/document';

interface DesignerToolbarProps {
  catalogueEntry?: CatalogueEntry | null;
  onNewOntology?: () => void;
}

/**
 * Toolbar buttons — rendered in the designer topbar.
 */
export function DesignerToolbar({
  catalogueEntry,
  onNewOntology,
}: DesignerToolbarProps = {}) {
  const {
    ontology,
    rdfDocument,
    validate,
    resetDraft,
    undo,
    redo,
    _past,
    _future,
  } = useDesignerStore();
  const loadOntology = useAppStore((s) => s.loadOntology);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [rdfExportProfile, setRdfExportProfile] = useState<RdfExportProfile>('playground');
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [includeDerivationMetadata, setIncludeDerivationMetadata] =
    useState(false);
  const [lastRdfExport, setLastRdfExport] =
    useState<RdfExportResult | null>(null);
  const canUndo = _past.length > 0;
  const canRedo = _future.length > 0;

  const handleValidate = () => {
    validate();
  };

  const handleExportRDF = async () => {
    const errors = validate();
    setExportError(null);
    setIsExporting(true);
    try {
      const sourceExport = rdfDocument
        ? await exportRdfDocument(rdfDocument, {
            includeDerivationMetadata,
          })
        : null;
      const content = sourceExport
        ? sourceExport.bytes
        : serializeToRDF(ontology, [], { profile: rdfExportProfile });
      setLastRdfExport(sourceExport);
      const blobPart = typeof content === 'string'
        ? content
        : content.slice().buffer;
      const blob = new Blob([blobPart], { type: 'application/rdf+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const draftSuffix = errors.length > 0 ? '-draft' : '';
      const profileSuffix = rdfExportProfile === 'standards' ? '-owl-shacl' : '';
      const sourceSuffix =
        sourceExport?.kind === 'modified' ? '-derived' : '';
      a.download = `${ontology.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'ontology'}${draftSuffix}${profileSuffix}${sourceSuffix}.rdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : 'RDF export failed',
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleLoadInPlayground = () => {
    const errors = validate();
    if (errors.length > 0) return;
    loadOntology(
      ontology,
      [],
      catalogueEntry ?? null,
      rdfDocument,
    );
    navigate({ page: 'home' });
  };

  const handleNewOntology = () => {
    resetDraft();
    onNewOntology?.();
  };

  const handleSubmitToCatalogue = () => {
    if (rdfDocument) {
      setExportError(
        'Source-backed RDF cannot be submitted as a projection-only catalogue entry.',
      );
      return;
    }
    const errors = validate();
    if (errors.length > 0) return;
    setShowSubmitModal(true);
  };

  return (
    <>
      <div className="designer-toolbar">
        <button className="designer-toolbar-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          <Undo2 size={14} />
        </button>
        <button className="designer-toolbar-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
          <Redo2 size={14} />
        </button>
        <div className="designer-toolbar-sep" />
        <button className="designer-toolbar-btn" onClick={handleNewOntology} title="New ontology">
          <FilePlus size={14} /> New
        </button>
        <button className="designer-toolbar-btn" onClick={handleValidate} title="Validate ontology">
          <CheckCircle size={14} /> Validate
        </button>
        <div className="designer-toolbar-sep" />
        {!rdfDocument && (
          <select
            aria-label="RDF export profile"
            className="designer-toolbar-select"
            title="RDF export profile"
            value={rdfExportProfile}
            onChange={(event) => {
              const profile = event.target.value;
              if (profile === 'playground' || profile === 'standards') {
                setRdfExportProfile(profile);
              }
            }}
          >
            <option value="playground">Playground round-trip</option>
            <option value="standards">Standards-oriented OWL + SHACL</option>
          </select>
        )}
        {rdfDocument && (
          <label
            title="Add explicit PROV derivation metadata to this export"
            style={{ alignItems: 'center', display: 'flex', fontSize: 11, gap: 4 }}
          >
            <input
              type="checkbox"
              checked={includeDerivationMetadata}
              onChange={(event) =>
                setIncludeDerivationMetadata(event.target.checked)}
            />
            Add provenance
          </label>
        )}
        <button
          className="designer-toolbar-btn"
          onClick={() => void handleExportRDF()}
          disabled={isExporting}
          title={rdfDocument
            ? 'Export the complete RDF document'
            : 'Export RDF'}
        >
          <Download size={14} />
          {isExporting
            ? 'Preparing…'
            : rdfDocument
              ? includeDerivationMetadata
                ? 'Export derived RDF'
                : isRdfDocumentDirty(rdfDocument)
                ? 'Export complete modified RDF'
                : 'Export original RDF'
              : 'Export RDF'}
        </button>
        <button className="designer-toolbar-btn" onClick={handleLoadInPlayground} title="Load in Playground">
          <Upload size={14} /> Load in Playground
        </button>
        <button
          className="designer-toolbar-btn submit"
          onClick={handleSubmitToCatalogue}
          disabled={Boolean(rdfDocument)}
          title={rdfDocument
            ? 'Source-backed RDF submission is not supported'
            : 'Submit to community catalogue'}
        >
          <Github size={14} /> Submit to Catalogue
        </button>
      </div>

      {exportError && (
        <div role="alert" className="designer-import-error">
          {exportError}
        </div>
      )}
      {lastRdfExport && (
        <div className="designer-import-error" role="status">
          {lastRdfExport.kind} export: source{' '}
          {lastRdfExport.sourceTripleCount.toLocaleString()} statements;
          exported {lastRdfExport.exportedTripleCount.toLocaleString()};
          patches {lastRdfExport.patchCount.toLocaleString()};
          provenance {lastRdfExport.derivationMetadataIncluded
            ? 'included'
            : 'not included'}.
        </div>
      )}

      {showSubmitModal && (
        <SubmitCatalogueModal onClose={() => setShowSubmitModal(false)} />
      )}
    </>
  );
}

/**
 * Validation feedback — rendered in the sidebar.
 */
export function DesignerValidation() {
  const validationErrors = useDesignerStore((s) => s.validationErrors);
  const lastValidatedAt = useDesignerStore((s) => s._lastValidatedAt);
  const [showSuccess, setShowSuccess] = useState(false);

  // Show success banner for 3 seconds when validation runs with 0 errors
  useEffect(() => {
    if (lastValidatedAt > 0 && validationErrors.length === 0) {
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
    setShowSuccess(false);
  }, [lastValidatedAt, validationErrors.length]);

  if (validationErrors.length === 0) {
    if (!showSuccess) return null;
    return (
      <div className="designer-validation-success">
        <div className="designer-validation-header" style={{ color: 'var(--ms-green, #16c60c)' }}>
          <CheckCircle size={14} /> No issues found
        </div>
      </div>
    );
  }

  return (
    <div className="designer-validation-errors">
      <div className="designer-validation-header">
        <AlertTriangle size={14} /> {validationErrors.length} issue{validationErrors.length > 1 ? 's' : ''} to fix
      </div>
      <ul>
        {validationErrors.map((err, i) => (
          <li key={i}>
            <ErrorItem error={err} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ErrorItem({ error }: { error: ValidationError }) {
  const selectEntity = useDesignerStore((s) => s.selectEntity);
  const selectRelationship = useDesignerStore((s) => s.selectRelationship);

  const handleClick = () => {
    if (error.entityId) {
      selectEntity(error.entityId);
    } else if (error.relationshipId) {
      selectRelationship(error.relationshipId);
    }
  };

  const isClickable = error.entityId || error.relationshipId;

  return (
    <span
      className={isClickable ? 'designer-error-link' : ''}
      onClick={isClickable ? handleClick : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === 'Enter') handleClick(); } : undefined}
    >
      {error.message}
    </span>
  );
}
