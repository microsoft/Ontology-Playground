import { useState } from 'react';
import { X, Github, ExternalLink, Download, Check } from 'lucide-react';
import { useDesignerStore } from '../../store/designerStore';
import { serializeToRDF } from '../../lib/rdf/serializer';
import { useT } from '../../i18n';

interface SubmitCatalogueModalProps {
  onClose: () => void;
}

const REPO_URL = 'https://github.com/microsoft/Ontology-Playground';

export function SubmitCatalogueModal({ onClose }: SubmitCatalogueModalProps) {
  const t = useT();
  const ontology = useDesignerStore((s) => s.ontology);
  const [downloaded, setDownloaded] = useState(false);

  const handleDownloadRdf = () => {
    const rdf = serializeToRDF(ontology, []);
    const slug = ontology.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'ontology';
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content submit-catalogue-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><X size={18} /></button>
        <h2 className="modal-title">
          <Github size={20} /> {t('submit.title')}
        </h2>

        <div className="submit-step">
          <p className="submit-description">
            {t('submit.description')}{' '}
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
              {t('submit.repoLink')} <ExternalLink size={12} />
            </a>.
          </p>

          <div className="submit-instructions">
            <h3>{t('submit.howTo')}</h3>
            <ol>
              <li>{t('submit.step1')}</li>
              <li>
                <a href={`${REPO_URL}/fork`} target="_blank" rel="noopener noreferrer">
                  {t('submit.step2')} <ExternalLink size={12} />
                </a>
              </li>
              <li>
                {t('submit.step3')}{' '}
                <code>catalogue/community/your-username/</code>
              </li>
              <li>{t('submit.step4')}</li>
              <li>{t('submit.step5')}</li>
            </ol>
          </div>

          <div className="submit-download-actions">
            <button className="designer-action-btn primary" onClick={handleDownloadRdf}>
              <Download size={14} /> {t('submit.downloadRdf')}
              {downloaded && <Check size={14} style={{ marginLeft: 4 }} />}
            </button>
            <button className="designer-action-btn secondary" onClick={handleDownloadMetadata}>
              <Download size={14} /> {t('submit.downloadMetadata')}
            </button>
          </div>

          <div className="submit-form-actions">
            <button className="designer-action-btn secondary" onClick={onClose}>{t('common.close')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
