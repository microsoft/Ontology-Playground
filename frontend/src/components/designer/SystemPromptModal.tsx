import { motion } from 'framer-motion';
import { RotateCcw, Save, X } from 'lucide-react';

interface SystemPromptModalProps {
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
  onClose: () => void;
}

export function SystemPromptModal({
  value,
  defaultValue,
  onChange,
  onClose,
}: SystemPromptModalProps) {
  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="modal-content ontology-prompt-modal"
        initial={{ scale: 0.96, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 22 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ontology-prompt-modal-header">
          <div>
            <h2>Edit System Prompt</h2>
            <p>Developer-facing instructions used when generating ontology drafts.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close prompt editor">
            <X size={20} />
          </button>
        </div>

        <textarea
          className="ontology-prompt-modal-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={16}
        />

        <div className="ontology-prompt-modal-actions">
          <button
            type="button"
            className="designer-toolbar-btn"
            onClick={() => onChange(defaultValue)}
          >
            <RotateCcw size={14} />
            Reset Default
          </button>
          <button
            type="button"
            className="ontology-copilot-generate"
            onClick={onClose}
          >
            <Save size={16} />
            Save
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
