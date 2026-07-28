import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, Cloud, Loader2, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useT, translate } from '../i18n';
import {
  createOntology,
  updateOntologyDefinition,
  listOntologies,
  FabricApiError,
  type FabricOntologyResponse,
} from '../lib/fabric';

interface FabricExportModalProps {
  onClose: () => void;
}

type Step = 'credentials' | 'workspace' | 'pushing' | 'done' | 'error';

export function FabricExportModal({ onClose }: FabricExportModalProps) {
  const t = useT();
  const { currentOntology } = useAppStore();

  const [step, setStep] = useState<Step>('credentials');
  const [token, setToken] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [existingOntologies, setExistingOntologies] = useState<FabricOntologyResponse[]>([]);
  const [selectedOntologyId, setSelectedOntologyId] = useState<string | ''>('');
  const [mode, setMode] = useState<'create' | 'update'>('create');
  const [error, setError] = useState('');
  const [result, setResult] = useState<FabricOntologyResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLoadWorkspace = useCallback(async () => {
    if (!token.trim() || !workspaceId.trim()) {
      setError(translate('fabric.bothRequired'));
      return;
    }

    // Basic UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(workspaceId.trim())) {
      setError(translate('fabric.invalidWorkspace'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const ontologies = await listOntologies(workspaceId.trim(), token.trim());
      setExistingOntologies(ontologies);
      setStep('workspace');
    } catch (err) {
      if (err instanceof FabricApiError) {
        setError(`API error (${err.status}): ${err.message}`);
      } else {
        setError(err instanceof Error ? err.message : translate('fabric.connectFailed'));
      }
    } finally {
      setLoading(false);
    }
  }, [token, workspaceId]);

  const handlePush = useCallback(async () => {
    setStep('pushing');
    setError('');

    try {
      if (mode === 'create') {
        const created = await createOntology(
          workspaceId.trim(),
          token.trim(),
          currentOntology,
        );
        setResult(created);
      } else {
        await updateOntologyDefinition(
          workspaceId.trim(),
          selectedOntologyId,
          token.trim(),
          currentOntology,
        );
        const existing = existingOntologies.find(o => o.id === selectedOntologyId);
        setResult(existing ?? null);
      }
      setStep('done');
    } catch (err) {
      if (err instanceof FabricApiError) {
        setError(`API error (${err.status}): ${err.message}`);
      } else {
        setError(err instanceof Error ? err.message : translate('fabric.pushFailed'));
      }
      setStep('error');
    }
  }, [mode, workspaceId, token, currentOntology, selectedOntologyId, existingOntologies]);

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
        style={{ maxWidth: 550, maxHeight: '85vh', overflow: 'auto' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36,
              background: 'rgba(0, 120, 212, 0.15)',
              borderRadius: 'var(--radius-md)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Cloud size={20} color="var(--ms-blue)" />
            </div>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 600 }}>{t('fabric.title')}</h2>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                {t('fabric.subtitle')}
              </p>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Ontology summary */}
        <div style={{
          padding: 12,
          background: 'var(--bg-tertiary)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 20,
          fontSize: 13,
        }}>
          <strong>{currentOntology.name}</strong>
          <span style={{ color: 'var(--text-secondary)', marginLeft: 8 }}>
            {t('fabric.summary', { entities: currentOntology.entityTypes.length, relationships: currentOntology.relationships.length })}
          </span>
        </div>

        {/* Error display */}
        {error && (
          <div style={{
            padding: 12,
            background: 'rgba(209, 52, 56, 0.15)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 16,
            display: 'flex', alignItems: 'flex-start', gap: 10,
            color: '#D13438', fontSize: 13,
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Step: Credentials */}
        {step === 'credentials' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                {t('fabric.workspaceId')}
              </label>
              <input
                type="text"
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
                placeholder={t('fabric.workspacePlaceholder')}
                spellCheck={false}
                style={{
                  width: '100%', padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-primary)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: 13, fontFamily: 'var(--font-mono)',
                  boxSizing: 'border-box',
                }}
              />
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                {t('fabric.workspaceHint')}
              </p>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                {t('fabric.accessToken')}
              </label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={t('fabric.tokenPlaceholder')}
                spellCheck={false}
                style={{
                  width: '100%', padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-primary)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: 13, fontFamily: 'var(--font-mono)',
                  boxSizing: 'border-box',
                }}
              />
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                Bearer token with <code>Item.ReadWrite.All</code> scope.
                Get one from the Fabric REST API &quot;Try It&quot; page or via MSAL.
              </p>
            </div>

            <button
              className="btn btn-primary"
              onClick={handleLoadWorkspace}
              disabled={loading}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {loading ? <><Loader2 size={14} className="spin" /> {t('fabric.connecting')}</> : t('fabric.connect')}
            </button>
          </div>
        )}

        {/* Step: Workspace — choose create or update */}
        {step === 'workspace' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                {t('fabric.action')}
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setMode('create')}
                  style={{
                    flex: 1, padding: '10px 16px',
                    borderRadius: 'var(--radius-sm)',
                    border: mode === 'create' ? '2px solid var(--ms-blue)' : '2px solid var(--border-primary)',
                    background: mode === 'create' ? 'rgba(0, 120, 212, 0.1)' : 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  }}
                >
                  {t('fabric.createNew')}
                </button>
                <button
                  onClick={() => setMode('update')}
                  disabled={existingOntologies.length === 0}
                  style={{
                    flex: 1, padding: '10px 16px',
                    borderRadius: 'var(--radius-sm)',
                    border: mode === 'update' ? '2px solid var(--ms-blue)' : '2px solid var(--border-primary)',
                    background: mode === 'update' ? 'rgba(0, 120, 212, 0.1)' : 'var(--bg-secondary)',
                    color: existingOntologies.length === 0 ? 'var(--text-tertiary)' : 'var(--text-primary)',
                    cursor: existingOntologies.length === 0 ? 'not-allowed' : 'pointer',
                    fontSize: 13, fontWeight: 600,
                  }}
                >
                  Update Existing ({existingOntologies.length})
                </button>
              </div>
            </div>

            {mode === 'update' && existingOntologies.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  {t('fabric.selectOntology')}
                </label>
                <select
                  value={selectedOntologyId}
                  onChange={(e) => setSelectedOntologyId(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-primary)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                  }}
                >
                  <option value="">— Select —</option>
                  {existingOntologies.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.displayName} ({o.id.slice(0, 8)}…)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                className="btn btn-secondary"
                onClick={() => { setStep('credentials'); setError(''); }}
                style={{ flex: 1 }}
              >
                Back
              </button>
              <button
                className="btn btn-primary"
                onClick={handlePush}
                disabled={mode === 'update' && !selectedOntologyId}
                style={{ flex: 2 }}
              >
                {mode === 'create' ? t('fabric.createAndPush') : t('fabric.updateDefinition')}
              </button>
            </div>
          </div>
        )}

        {/* Step: Pushing */}
        {step === 'pushing' && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <Loader2 size={32} color="var(--ms-blue)" style={{ animation: 'spin 1s linear infinite' }} />
            <p style={{ marginTop: 16, fontSize: 14, color: 'var(--text-secondary)' }}>
              {mode === 'create' ? t('fabric.creating') : t('fabric.updating')}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
              {t('fabric.mayTakeAMoment')}
            </p>

            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <CheckCircle size={40} color="var(--ms-green)" />
            <p style={{ marginTop: 12, fontSize: 16, fontWeight: 600 }}>
              {mode === 'create' ? t('fabric.created') : t('fabric.updated')}
            </p>
            {result && (
              <div style={{
                marginTop: 12, padding: 12,
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                fontSize: 13, textAlign: 'left',
              }}>
                <div><strong>{t('fabric.name')}</strong> {result.displayName}</div>
                <div><strong>{t('fabric.id')}</strong> <code style={{ fontSize: 11 }}>{result.id}</code></div>
                <div><strong>{t('fabric.workspace')}</strong> <code style={{ fontSize: 11 }}>{result.workspaceId}</code></div>
              </div>
            )}
            <button
              className="btn btn-primary"
              onClick={onClose}
              style={{ marginTop: 20 }}
            >
              Done
            </button>
          </div>
        )}

        {/* Step: Error */}
        {step === 'error' && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <AlertCircle size={40} color="#D13438" />
            <p style={{ marginTop: 12, fontSize: 14, color: '#D13438' }}>
              {t('fabric.pushFailedRetry')}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20 }}>
              <button
                className="btn btn-secondary"
                onClick={() => { setStep('credentials'); setError(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <RefreshCw size={14} />
                {t('fabric.startOver')}
              </button>
              <button className="btn btn-primary" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
