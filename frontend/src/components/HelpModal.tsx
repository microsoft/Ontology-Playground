import { motion } from 'framer-motion';
import { X, MousePointer, Target, MessageSquare, Link2, Lightbulb, Command } from 'lucide-react';

interface HelpModalProps {
  onClose: () => void;
}

export function HelpModal({ onClose }: HelpModalProps) {
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
        style={{ maxWidth: 700 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 24, fontWeight: 600 }}>How to Use Ontology Playground (Preview)</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="feature-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <MousePointer size={20} color="var(--ms-blue)" />
              <span className="feature-title" style={{ marginBottom: 0 }}>Explore the Graph</span>
            </div>
            <p className="feature-text">
              Click on any <strong>entity type</strong> (colored node) to see its properties, relationships, and data bindings. 
              Click on <strong>relationship lines</strong> to see how entities connect. Use the controls in the bottom-left to zoom and reset the layout.
            </p>
          </div>

          <div className="feature-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <Target size={20} color="var(--ms-purple)" />
              <span className="feature-title" style={{ marginBottom: 0 }}>Complete Quests</span>
            </div>
            <p className="feature-text">
              Select a quest from the left panel to start a guided journey. Follow the instructions to click on specific entities 
              or relationships. Complete all steps to earn <strong>badges</strong> and <strong>points</strong>!
            </p>
          </div>

          <div className="feature-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <MessageSquare size={20} color="var(--ms-yellow)" />
              <span className="feature-title" style={{ marginBottom: 0 }}>Ask Natural Language Questions</span>
            </div>
            <p className="feature-text">
              Use the query playground in the bottom-right to ask questions like "Show me Gold tier customers" or 
              "Which products come from Ethiopia?". The graph will highlight relevant entities and relationships.
            </p>
          </div>

          <div className="feature-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <Link2 size={20} color="var(--ms-green)" />
              <span className="feature-title" style={{ marginBottom: 0 }}>View Data Bindings</span>
            </div>
            <p className="feature-text">
              When you select an entity type, the inspector shows how ontology properties map to real data sources in OneLake, 
              including lakehouse tables and Power BI semantic models.
            </p>
          </div>

          <div style={{ 
            padding: 16, 
            background: 'rgba(0, 120, 212, 0.1)', 
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12
          }}>
            <Lightbulb size={20} color="var(--ms-blue)" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong style={{ color: 'var(--ms-blue)' }}>About Microsoft Fabric IQ Ontology</strong>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                An ontology is a shared, machine-understandable vocabulary of your business. It defines entity types (like Customer, Product), 
                their properties, and relationships. This demo uses a fictional "Cosmic Coffee Company" to illustrate these concepts.
              </p>
            </div>
          </div>

          <div className="feature-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <Command size={20} color="var(--ms-blue)" />
              <span className="feature-title" style={{ marginBottom: 0 }}>Keyboard Shortcuts</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
              <kbd className="help-kbd">⌘K</kbd><span>Open command palette</span>
              <kbd className="help-kbd">?</kbd><span>Open this help dialog</span>
              <kbd className="help-kbd">Esc</kbd><span>Close any dialog</span>
              <kbd className="help-kbd">↑ ↓</kbd><span>Navigate palette results</span>
              <kbd className="help-kbd">↵</kbd><span>Select palette command</span>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <button className="btn btn-primary" onClick={onClose}>
            Got it!
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
