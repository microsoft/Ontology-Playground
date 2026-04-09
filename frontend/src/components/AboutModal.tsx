import { motion } from 'framer-motion';
import { X } from 'lucide-react';

interface AboutModalProps {
  onClose: () => void;
}

export function AboutModal({ onClose }: AboutModalProps) {
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
          <h2 style={{ fontSize: 24, fontWeight: 600 }}>About Oh-tology</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close about dialog">
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="feature-card" style={{ marginBottom: 0 }}>
            <p className="feature-text" style={{ margin: 0 }}>
              This project references and builds on ideas from the public Microsoft Ontology Playground repository.
            </p>
            <p className="feature-text" style={{ margin: '10px 0 0 0' }}>
              Reference:
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
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
