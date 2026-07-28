import { motion } from 'framer-motion';
import { X, MousePointer, Target, MessageSquare, Link2, Lightbulb, Command } from 'lucide-react';
import { useT } from '../i18n';

interface HelpModalProps {
  onClose: () => void;
}

export function HelpModal({ onClose }: HelpModalProps) {
  const t = useT();
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
          <h2 style={{ fontSize: 24, fontWeight: 600 }}>{t('help.title')}</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="feature-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <MousePointer size={20} color="var(--ms-blue)" />
              <span className="feature-title" style={{ marginBottom: 0 }}>{t('help.exploreTitle')}</span>
            </div>
            <p className="feature-text">
              {t('help.exploreText')}
            </p>
          </div>

          <div className="feature-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <Target size={20} color="var(--ms-purple)" />
              <span className="feature-title" style={{ marginBottom: 0 }}>{t('help.questsTitle')}</span>
            </div>
            <p className="feature-text">
              {t('help.questsText')}
            </p>
          </div>

          <div className="feature-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <MessageSquare size={20} color="var(--ms-yellow)" />
              <span className="feature-title" style={{ marginBottom: 0 }}>{t('help.nlTitle')}</span>
            </div>
            <p className="feature-text">
              {t('help.nlText')}
            </p>
          </div>

          <div className="feature-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <Link2 size={20} color="var(--ms-green)" />
              <span className="feature-title" style={{ marginBottom: 0 }}>{t('help.bindingsTitle')}</span>
            </div>
            <p className="feature-text">
              {t('help.bindingsText')}
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
              <strong style={{ color: 'var(--ms-blue)' }}>{t('help.aboutFabricTitle')}</strong>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                {t('help.aboutFabricText')}
              </p>
            </div>
          </div>

          <div className="feature-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <Command size={20} color="var(--ms-blue)" />
              <span className="feature-title" style={{ marginBottom: 0 }}>{t('help.shortcutsTitle')}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
              <kbd className="help-kbd">⌘K</kbd><span>{t('help.shortcutPalette')}</span>
              <kbd className="help-kbd">?</kbd><span>{t('help.shortcutHelp')}</span>
              <kbd className="help-kbd">Esc</kbd><span>{t('help.shortcutEsc')}</span>
              <kbd className="help-kbd">↑ ↓</kbd><span>{t('help.shortcutNavigate')}</span>
              <kbd className="help-kbd">↵</kbd><span>{t('help.shortcutSelect')}</span>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <button className="btn btn-primary" onClick={onClose}>
            {t('help.gotIt')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
