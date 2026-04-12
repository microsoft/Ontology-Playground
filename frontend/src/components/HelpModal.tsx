import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { HomeInformationPanel } from './HomeInformationPanel';

interface HelpModalProps {
  onClose: () => void;
}

export function HelpModal({ onClose }: HelpModalProps) {
  const languageMode = useAppStore((state) => state.languageMode);
  const title = languageMode === 'ko' ? '안내' : 'Information';

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
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="info-hub-header">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={title}>
            <X size={20} />
          </button>
        </div>

        <div className="info-hub-body is-scrollable">
          <HomeInformationPanel />
        </div>
      </motion.div>
    </motion.div>
  );
}
