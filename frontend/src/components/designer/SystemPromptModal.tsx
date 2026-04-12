import { motion } from 'framer-motion';
import { RotateCcw, Save, X } from 'lucide-react';

interface SystemPromptModalProps {
  languageMode?: 'ko' | 'en';
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
  onClose: () => void;
}

export function SystemPromptModal({
  languageMode = 'en',
  value,
  defaultValue,
  onChange,
  onClose,
}: SystemPromptModalProps) {
  const copy =
    languageMode === 'ko'
      ? {
          title: '시스템 프롬프트 편집',
          description: '온톨로지 초안을 생성할 때 사용하는 개발자용 지시문입니다.',
          close: '프롬프트 편집기 닫기',
          reset: '기본값으로 재설정',
          save: '저장',
        }
      : {
          title: 'Edit System Prompt',
          description: 'Developer-facing instructions used when generating ontology drafts.',
          close: 'Close prompt editor',
          reset: 'Reset Default',
          save: 'Save',
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
        className="modal-content ontology-prompt-modal"
        initial={{ scale: 0.96, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 22 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ontology-prompt-modal-header">
          <div>
            <h2>{copy.title}</h2>
            <p>{copy.description}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={copy.close}>
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
            {copy.reset}
          </button>
          <button
            type="button"
            className="ontology-copilot-generate"
            onClick={onClose}
          >
            <Save size={16} />
            {copy.save}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
