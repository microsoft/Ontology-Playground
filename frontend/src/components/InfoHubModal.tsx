import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { HomeSettingsPanel } from './HomeSettingsPanel';

interface InfoHubModalProps {
  onClose: () => void;
}

export function InfoHubModal({ onClose }: InfoHubModalProps) {
  const languageMode = useAppStore((state) => state.languageMode);

  const copy =
    languageMode === 'ko'
      ? {
          title: '설정',
          close: '닫기',
        }
      : {
          title: 'Settings',
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
        className="modal-content info-hub-modal"
        initial={{ scale: 0.96, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 22 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="info-hub-header">
          <div>
            <h2>{copy.title}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={copy.close}>
            <X size={20} />
          </button>
        </div>

        <div className="info-hub-body is-scrollable">
          <HomeSettingsPanel />
        </div>
      </motion.div>
    </motion.div>
  );
}
