import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useAppStore } from '../store/appStore';

interface AboutModalProps {
  onClose: () => void;
}

export function AboutModal({ onClose }: AboutModalProps) {
  const languageMode = useAppStore((state) => state.languageMode);
  const copy =
    languageMode === 'ko'
      ? {
          title: 'About Oh-tology',
          body:
            '이 프로젝트는 공개된 Microsoft Ontology Playground의 아이디어를 참고하면서, 온톨로지 초안 생성, extraction review, instance graph, Neo4j query 흐름까지 확장한 로컬 워크스페이스입니다.',
          reference: '참고',
          close: '닫기',
        }
      : {
          title: 'About Oh-tology',
          body:
            'This project builds on ideas from the public Microsoft Ontology Playground while extending the workflow into ontology draft generation, extraction review, instance graphs, and Neo4j querying.',
          reference: 'Reference',
          close: 'Close',
        };

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="modal-content"
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 20 }}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 720 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 24, fontWeight: 600 }}>{copy.title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={copy.close}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="feature-card" style={{ marginBottom: 0 }}>
            <p className="feature-text" style={{ margin: 0 }}>
              {copy.body}
            </p>
            <p className="feature-text" style={{ margin: '10px 0 0 0' }}>
              {copy.reference}:
              {' '}
              <a
                className="about-link"
                href="https://github.com/microsoft/Ontology-Playground"
                target="_blank"
                rel="noopener noreferrer"
              >
                https://github.com/microsoft/Ontology-Playground
              </a>
            </p>
          </div>
        </div>

        <div style={{ marginTop: 22, textAlign: 'center' }}>
          <button className="btn btn-primary" onClick={onClose}>{copy.close}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
