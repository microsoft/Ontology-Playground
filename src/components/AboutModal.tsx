import { motion } from 'framer-motion';
import { X, Info } from 'lucide-react';

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
          <h2 style={{ fontSize: 24, fontWeight: 600 }}>About Ontology Playground</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close about dialog">
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="feature-card" style={{ marginBottom: 0 }}>
            <p className="feature-text" style={{ margin: 0 }}>
              Ontology Playground is a community learning and design experience for building RDF/OWL ontologies,
              exploring graph relationships, and preparing models compatible with Microsoft Fabric IQ workflows.
            </p>
            <p className="feature-text" style={{ margin: '10px 0 0 0' }}>
              Learn more about Microsoft Fabric IQ:{' '}
              <a
                className="about-link"
                href="https://learn.microsoft.com/fabric/iq/overview"
                target="_blank"
                rel="noopener noreferrer"
              >
                https://learn.microsoft.com/fabric/iq/overview
              </a>
            </p>
          </div>

          <div
            style={{
              padding: 16,
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              background: 'rgba(0, 120, 212, 0.08)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Info size={18} color="var(--ms-blue)" />
              <strong style={{ color: 'var(--text-primary)' }}>Trademark Notice</strong>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)', margin: 0 }}>
              Trademarks This project may contain trademarks or logos for projects, products, or services. Authorized
              use of Microsoft trademarks or logos is subject to and must follow Microsoft’s Trademark &amp; Brand
              Guidelines. Use of Microsoft trademarks or logos in modified versions of this project must not cause
              confusion or imply Microsoft sponsorship. Any use of third-party trademarks or logos are subject to
              those third-party’s policies.
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
