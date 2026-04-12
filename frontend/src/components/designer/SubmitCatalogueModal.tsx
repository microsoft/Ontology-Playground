import { useState } from 'react';
import { X, FolderArchive, Download, Check } from 'lucide-react';
import { useDesignerStore } from '../../store/designerStore';
import { serializeToRDF } from '../../lib/rdf/serializer';
import { saveLocalOntology } from '../../lib/localLibraryApi';
import { useAppStore } from '../../store/appStore';

interface SubmitCatalogueModalProps {
  onClose: () => void;
}

export function SubmitCatalogueModal({ onClose }: SubmitCatalogueModalProps) {
  const ontology = useDesignerStore((s) => s.ontology);
  const languageMode = useAppStore((state) => state.languageMode);
  const [downloaded, setDownloaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const copy =
    languageMode === 'ko'
      ? {
          saveFailed: '온톨로지를 로컬 라이브러리에 저장하지 못했습니다.',
          title: '로컬 라이브러리에 저장',
          description: '아래 파일을 내려받거나 바로 저장해서 이 워크스페이스의 로컬 라이브러리에 보관할 수 있습니다.',
          howToSave: '저장 방법',
          steps: [
            '아래에서 온톨로지 RDF와 메타데이터 파일을 내려받습니다.',
            '`library/ontologies/` 아래에 온톨로지 파일을 둡니다.',
            '메타데이터 파일로 설명, 태그, 소유 정보를 관리합니다.',
            '승인된 그래프 스냅샷은 `library/graphs/` 아래에 따로 저장합니다.',
          ],
          saveLibrary: '로컬 라이브러리에 저장',
          downloadRdf: 'RDF 다운로드',
          downloadMetadata: 'metadata.json 다운로드',
          close: '닫기',
        }
      : {
          saveFailed: 'Failed to save the ontology to the local library.',
          title: 'Save to Local Library',
          description: 'Download the ontology files below and place them in your local library folders inside this workspace.',
          howToSave: 'How to save',
          steps: [
            'Download your ontology RDF and metadata files below.',
            'Place ontology files under `library/ontologies/`.',
            'Use the metadata file to track description, tags, and ownership.',
            'Store approved graph snapshots separately under `library/graphs/`.',
          ],
          saveLibrary: 'Save to Local Library',
          downloadRdf: 'Download RDF',
          downloadMetadata: 'Download metadata.json',
          close: 'Close',
        };

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
      const message = error instanceof Error ? error.message : copy.saveFailed;
      setSaveError(message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content submit-catalogue-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><X size={18} /></button>
        <h2 className="modal-title">
          <FolderArchive size={20} /> {copy.title}
        </h2>

        <div className="submit-step">
          <p className="submit-description">
            {copy.description}
          </p>

          <div className="submit-instructions">
            <h3>{copy.howToSave}</h3>
            <ol>
              {copy.steps.map((step) => {
                const parts = step.split(/(`[^`]+`)/g);
                return (
                  <li key={step}>
                    {parts.map((part) =>
                      part.startsWith('`') && part.endsWith('`') ? (
                        <code key={part}>{part.slice(1, -1)}</code>
                      ) : (
                        <span key={part}>{part}</span>
                      ),
                    )}
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="submit-download-actions">
            <button className="designer-action-btn primary" onClick={() => { void handleSaveToLocalLibrary(); }}>
              <FolderArchive size={14} /> {copy.saveLibrary}
              {saved && <Check size={14} style={{ marginLeft: 4 }} />}
            </button>
            <button className="designer-action-btn primary" onClick={handleDownloadRdf}>
              <Download size={14} /> {copy.downloadRdf}
              {downloaded && <Check size={14} style={{ marginLeft: 4 }} />}
            </button>
            <button className="designer-action-btn secondary" onClick={handleDownloadMetadata}>
              <Download size={14} /> {copy.downloadMetadata}
            </button>
          </div>

          {saveError ? (
            <div className="designer-validation-errors ontology-copilot-error">{saveError}</div>
          ) : null}

          <div className="submit-form-actions">
            <button className="designer-action-btn secondary" onClick={onClose}>{copy.close}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
