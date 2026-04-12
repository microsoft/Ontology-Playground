import { useState, useEffect } from 'react';
import { Download, AlertTriangle, CheckCircle, Upload, FolderArchive, FilePlus, Undo2, Redo2 } from 'lucide-react';
import { useDesignerStore } from '../../store/designerStore';
import type { ValidationError } from '../../store/designerStore';
import { useAppStore } from '../../store/appStore';
import { serializeToRDF } from '../../lib/rdf/serializer';
import { navigate } from '../../lib/router';
import { SubmitCatalogueModal } from './SubmitCatalogueModal';

function translateValidationMessage(message: string, languageMode: 'ko' | 'en'): string {
  if (languageMode !== 'ko') return message;

  const patterns: Array<[RegExp, (...groups: string[]) => string]> = [
    [/^Add at least one entity type to your ontology\.$/, () => '온톨로지에 엔티티 타입을 최소 1개 이상 추가하세요.'],
    [/^"(.+)" is missing an internal ID\.$/, (label) => `"${label}"에 내부 ID가 없습니다.`],
    [/^Two entities share the same ID "(.+)"\. Rename one of them\.$/, (id) => `두 엔티티가 같은 ID "${id}"를 사용하고 있습니다. 하나의 이름을 바꾸세요.`],
    [/^One of your entities has no name\. Give it a name\.$/, () => '이름이 없는 엔티티가 있습니다. 이름을 입력하세요.'],
    [/^"(.+)" has no identifier property\. Click the key icon \(🔑\) on one of its properties to mark it as the unique identifier\.$/, (label) => `"${label}"에는 식별자 속성이 없습니다. 속성 옆의 키 아이콘(🔑)을 눌러 고유 식별자로 지정하세요.`],
    [/^Identifier property "(.+)" on "(.+)" must be string or integer type for Fabric IQ compatibility\.$/, (prop, label) => `"${label}"의 식별자 속성 "${prop}"은 Fabric IQ 호환을 위해 string 또는 integer 타입이어야 합니다.`],
    [/^Property "(.+)" is defined as "(.+)" in "(.+)" but as "(.+)" in "(.+)"\. Fabric IQ requires the same type when property names match across entity types\.$/, (prop, type, label, existingType, existingLabel) => `속성 "${prop}"은 "${label}"에서는 "${type}", "${existingLabel}"에서는 "${existingType}"로 정의되어 있습니다. Fabric IQ에서는 엔티티 타입이 달라도 같은 속성 이름이면 타입이 같아야 합니다.`],
    [/^Two relationships share the same ID "(.+)"\. Rename one of them\.$/, (id) => `두 관계가 같은 ID "${id}"를 사용하고 있습니다. 하나의 이름을 바꾸세요.`],
    [/^"(.+)" points from "(.+)" which doesn't exist\. Pick a valid source entity\.$/, (label, fromLabel) => `"${label}"의 출발 엔티티 "${fromLabel}"가 존재하지 않습니다. 올바른 출발 엔티티를 선택하세요.`],
    [/^"(.+)" points to "(.+)" which doesn't exist\. Pick a valid target entity\.$/, (label, toLabel) => `"${label}"의 도착 엔티티 "${toLabel}"가 존재하지 않습니다. 올바른 도착 엔티티를 선택하세요.`],
    [/^"(.+)" is a self-referencing relationship on "(.+)"\. Fabric IQ requires source and target entity types to be different\.$/, (label, entityLabel) => `"${label}"는 "${entityLabel}"에 대한 자기 참조 관계입니다. Fabric IQ에서는 출발 엔티티와 도착 엔티티가 서로 달라야 합니다.`],
  ];

  for (const [pattern, replacer] of patterns) {
    const match = message.match(pattern);
    if (match) return replacer(...match.slice(1));
  }

  if (message.includes(' name "')) {
    return message
      .replace(' name "', ' 이름 "')
      .replace(' exceeds 26 characters.', '은 26자를 넘을 수 없습니다.')
      .replace(' must start with a letter or digit.', '은 영문자 또는 숫자로 시작해야 합니다.')
      .replace(' must end with a letter or digit.', '은 영문자 또는 숫자로 끝나야 합니다.')
      .replace(' may only contain letters, digits, hyphens, and underscores.', '에는 영문자, 숫자, 하이픈(-), 밑줄(_)만 사용할 수 있습니다.');
  }

  return message;
}

/**
 * Toolbar buttons — rendered in the designer topbar.
 */
export function DesignerToolbar() {
  const { ontology, validate, resetDraft, undo, redo, _past, _future } = useDesignerStore();
  const loadOntology = useAppStore((s) => s.loadOntology);
  const languageMode = useAppStore((s) => s.languageMode);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const canUndo = _past.length > 0;
  const canRedo = _future.length > 0;
  const copy =
    languageMode === 'ko'
      ? {
          undo: '실행 취소',
          redo: '다시 실행',
          newOntology: '새 온톨로지',
          new: '새로 만들기',
          validateOntology: '온톨로지 검증',
          validate: '검증',
          exportRdf: 'RDF 내보내기',
          loadPlayground: '플레이그라운드로 불러오기',
          saveLibrary: '로컬 라이브러리에 저장',
          noIssues: '문제 없음',
          issues: '개의 문제 수정 필요',
        }
      : {
          undo: 'Undo',
          redo: 'Redo',
          newOntology: 'New ontology',
          new: 'New',
          validateOntology: 'Validate ontology',
          validate: 'Validate',
          exportRdf: 'Export RDF',
          loadPlayground: 'Load in Playground',
          saveLibrary: 'Save to Local Library',
          noIssues: 'No issues found',
          issues: 'issue(s) to fix',
        };

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
      const suffix = errors.length > 0 ? '-draft' : '';
      a.download = `${ontology.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'ontology'}${suffix}.rdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // serialization failed — validation errors are shown in sidebar
    }
  };

  const handleLoadInPlayground = () => {
    const errors = validate();
    if (errors.length > 0) return;
    loadOntology(ontology, []);
    navigate({ page: 'home' });
  };

  const handleNewOntology = () => {
    resetDraft();
  };

  const handleSaveToLocalLibrary = () => {
    const errors = validate();
    if (errors.length > 0) return;
    setShowSubmitModal(true);
  };

  return (
    <>
      <div className="designer-toolbar">
        <button className="designer-toolbar-btn" onClick={undo} disabled={!canUndo} title={`${copy.undo} (Ctrl+Z)`}>
          <Undo2 size={14} />
        </button>
        <button className="designer-toolbar-btn" onClick={redo} disabled={!canRedo} title={`${copy.redo} (Ctrl+Shift+Z)`}>
          <Redo2 size={14} />
        </button>
        <div className="designer-toolbar-sep" />
        <button className="designer-toolbar-btn" onClick={handleNewOntology} title={copy.newOntology}>
          <FilePlus size={14} /> {copy.new}
        </button>
        <button className="designer-toolbar-btn" onClick={handleValidate} title={copy.validateOntology}>
          <CheckCircle size={14} /> {copy.validate}
        </button>
        <div className="designer-toolbar-sep" />
        <button className="designer-toolbar-btn" onClick={handleExportRDF} title={copy.exportRdf}>
          <Download size={14} /> {copy.exportRdf}
        </button>
        <button className="designer-toolbar-btn" onClick={handleLoadInPlayground} title={copy.loadPlayground}>
          <Upload size={14} /> {copy.loadPlayground}
        </button>
        <button className="designer-toolbar-btn submit" onClick={handleSaveToLocalLibrary} title={copy.saveLibrary}>
          <FolderArchive size={14} /> {copy.saveLibrary}
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
  const languageMode = useAppStore((s) => s.languageMode);
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
          <CheckCircle size={14} /> {languageMode === 'ko' ? '문제 없음' : 'No issues found'}
        </div>
      </div>
    );
  }

  return (
    <div className="designer-validation-errors">
      <div className="designer-validation-header">
        <AlertTriangle size={14} /> {languageMode === 'ko' ? `${validationErrors.length}개의 문제 수정 필요` : `${validationErrors.length} issue${validationErrors.length > 1 ? 's' : ''} to fix`}
      </div>
      <ul>
        {validationErrors.map((err, i) => (
          <li key={i}>
            <ErrorItem error={err} languageMode={languageMode} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ErrorItem({ error, languageMode }: { error: ValidationError; languageMode: 'ko' | 'en' }) {
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
      {translateValidationMessage(error.message, languageMode)}
    </span>
  );
}
