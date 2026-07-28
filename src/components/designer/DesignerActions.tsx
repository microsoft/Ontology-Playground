import { useState, useEffect } from 'react';
import { Download, AlertTriangle, CheckCircle, Upload, Github, FilePlus, Undo2, Redo2, Globe } from 'lucide-react';
import { useDesignerStore, blockingErrors } from '../../store/designerStore';
import type { ValidationError } from '../../store/designerStore';
import { useAppStore } from '../../store/appStore';
import { serializeToRDF } from '../../lib/rdf/serializer';
import { navigate } from '../../lib/router';
import { SubmitCatalogueModal } from './SubmitCatalogueModal';
import { useT } from '../../i18n';

/**
 * Filename slug for a downloaded ontology.
 * Keeps letters and digits from any script, so "서울형 개인예산제" downloads as
 * "서울형-개인예산제.rdf" rather than collapsing to "-.rdf".
 */
function fileSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-|-$/g, '') || 'ontology'
  );
}

/**
 * Toolbar buttons — rendered in the designer topbar.
 */
export function DesignerToolbar() {
  const t = useT();
  const { ontology, validate, resetDraft, undo, redo, _past, _future, namingMode, setNamingMode } = useDesignerStore();
  const loadOntology = useAppStore((s) => s.loadOntology);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const canUndo = _past.length > 0;
  const canRedo = _future.length > 0;
  const strictMode = namingMode === 'fabric';

  const handleValidate = () => {
    validate();
  };

  const handleExportRDF = () => {
    const errors = validate();
    // Allow download even with validation errors (user sees warnings in sidebar)
    try {
      const rdf = serializeToRDF(ontology, []);
      const blob = new Blob([rdf], { type: 'application/rdf+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const suffix = blockingErrors(errors).length > 0 ? '-draft' : '';
      a.download = `${fileSlug(ontology.name)}${suffix}.rdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // serialization failed — validation errors are shown in sidebar
    }
  };

  const handleLoadInPlayground = () => {
    // Warnings (e.g. a Korean name that Fabric IQ wouldn't accept) must not
    // stop the ontology from loading — only real errors do.
    if (blockingErrors(validate()).length > 0) return;
    loadOntology(ontology, []);
    navigate({ page: 'home' });
  };

  const handleNewOntology = () => {
    resetDraft();
  };

  const handleSubmitToCatalogue = () => {
    // The catalogue does require Fabric IQ names, so warnings block here.
    if (validate().length > 0) return;
    setShowSubmitModal(true);
  };

  return (
    <>
      <div className="designer-toolbar">
        <button className="designer-toolbar-btn" onClick={undo} disabled={!canUndo} title={t('designer.undo')}>
          <Undo2 size={14} />
        </button>
        <button className="designer-toolbar-btn" onClick={redo} disabled={!canRedo} title={t('designer.redo')}>
          <Redo2 size={14} />
        </button>
        <div className="designer-toolbar-sep" />
        <button className="designer-toolbar-btn" onClick={handleNewOntology} title={t('designer.newTitle')}>
          <FilePlus size={14} /> {t('designer.new')}
        </button>
        <button className="designer-toolbar-btn" onClick={handleValidate} title={t('designer.validateTitle')}>
          <CheckCircle size={14} /> {t('designer.validate')}
        </button>
        <button
          className={`designer-toolbar-btn${strictMode ? ' active' : ''}`}
          onClick={() => setNamingMode(strictMode ? 'unicode' : 'fabric')}
          aria-pressed={strictMode}
          title={strictMode ? t('designer.namingFabricTitle') : t('designer.namingAnyScriptTitle')}
        >
          <Globe size={14} /> {strictMode ? t('designer.namingFabric') : t('designer.namingAnyScript')}
        </button>
        <div className="designer-toolbar-sep" />
        <button className="designer-toolbar-btn" onClick={handleExportRDF} title={t('designer.exportRdf')}>
          <Download size={14} /> {t('designer.exportRdf')}
        </button>
        <button className="designer-toolbar-btn" onClick={handleLoadInPlayground} title={t('designer.loadInPlayground')}>
          <Upload size={14} /> {t('designer.loadInPlayground')}
        </button>
        <button className="designer-toolbar-btn submit" onClick={handleSubmitToCatalogue} title={t('designer.submitToCatalogueTitle')}>
          <Github size={14} /> {t('designer.submitToCatalogue')}
        </button>
      </div>

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
  const t = useT();
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

  const errors = validationErrors.filter((e) => e.severity === 'error');
  const warnings = validationErrors.filter((e) => e.severity === 'warning');

  if (validationErrors.length === 0) {
    if (!showSuccess) return null;
    return (
      <div className="designer-validation-success">
        <div className="designer-validation-header" style={{ color: 'var(--ms-green, #16c60c)' }}>
          <CheckCircle size={14} /> {t('designer.noIssues')}
        </div>
      </div>
    );
  }

  return (
    <>
      {errors.length > 0 && (
        <div className="designer-validation-errors">
          <div className="designer-validation-header">
            <AlertTriangle size={14} />{' '}
            {t(errors.length > 1 ? 'designer.issuesToFix_plural' : 'designer.issuesToFix', {
              count: errors.length,
            })}
          </div>
          <ul>
            {errors.map((err, i) => (
              <li key={i}>
                <ErrorItem error={err} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="designer-validation-errors warnings">
          <div className="designer-validation-header">
            <AlertTriangle size={14} />{' '}
            {t(warnings.length > 1 ? 'designer.fabricWarnings_plural' : 'designer.fabricWarnings', {
              count: warnings.length,
            })}
          </div>
          <ul>
            {warnings.map((err, i) => (
              <li key={i}>
                <ErrorItem error={err} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
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
