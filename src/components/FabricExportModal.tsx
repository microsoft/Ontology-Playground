import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Cloud, Loader2, CheckCircle, AlertCircle, RefreshCw, LogIn, LogOut } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import {
  createOntology,
  updateOntologyDefinition,
  listOntologies,
  FabricApiError,
  FabricValidationError,
  validateForFabric,
  type FabricOntologyResponse,
} from '../lib/fabric';
import {
  isMsalConfigured,
  consumeRedirectResult,
  acquireFabricToken,
  signInWithRedirect,
  signOut,
  hasPendingDeployIntent,
  clearDeployIntent,
  type FabricAuthResult,
} from '../lib/msalAuth';
import { listWorkspaces, type FabricWorkspace } from '../lib/fabricWorkspace';

interface FabricExportModalProps {
  onClose: () => void;
}

type Step = 'credentials' | 'workspace' | 'pushing' | 'done' | 'error';

export function FabricExportModal({ onClose }: FabricExportModalProps) {
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
  const [statusMessage, setStatusMessage] = useState('');

  // MSAL state
  const [authAccount, setAuthAccount] = useState<FabricAuthResult['account'] | null>(null);
  const [workspaces, setWorkspaces] = useState<FabricWorkspace[]>([]);
  const useMsal = isMsalConfigured();

  // Auto-authenticate via MSAL on mount (handles redirect return)
  useEffect(() => {
    if (!useMsal) return;
    let cancelled = false;

    (async () => {
      try {
        const redirectResult = await consumeRedirectResult();
        if (redirectResult?.account && !cancelled) {
          setAuthAccount(redirectResult.account);
          setToken(redirectResult.accessToken);
          // Load workspaces automatically
          try {
            const ws = await listWorkspaces(redirectResult.accessToken);
            if (!cancelled) {
              setWorkspaces(ws.filter(w => w.capacityId));
            }
          } catch {
            // Workspace listing failed — user can still pick manually
          }
          // If returning from a redirect login, auto-advance past credentials
          if (hasPendingDeployIntent()) {
            clearDeployIntent();
            if (!cancelled) setStep('workspace');
          }
        }
      } catch {
        // MSAL init failed — fall back to manual
      }
    })();

    return () => { cancelled = true; };
  }, [useMsal]);

  const handleMsalSignIn = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Try silent token first
      const result = await acquireFabricToken();
      setAuthAccount(result.account);
      setToken(result.accessToken);
      // Load workspaces
      try {
        const ws = await listWorkspaces(result.accessToken);
        setWorkspaces(ws.filter(w => w.capacityId));
      } catch {
        // Workspace listing failed
      }
      setStep('workspace');
    } catch {
      // acquireFabricToken will redirect if needed — this catch handles the
      // "Redirecting..." error thrown before navigation
    } finally {
      setLoading(false);
    }
  }, []);

  const handleMsalSignOut = useCallback(async () => {
    try {
      await signOut();
    } catch {
      // Best-effort sign out
    }
    setAuthAccount(null);
    setToken('');
    setWorkspaces([]);
    setStep('credentials');
  }, []);

  const handleLoadWorkspace = useCallback(async () => {
    if (!token.trim() || !workspaceId.trim()) {
      setError('Both token and workspace ID are required.');
      return;
    }

    // Basic UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(workspaceId.trim())) {
      setError('Workspace ID must be a valid UUID (e.g., cfafbeb1-8037-4d0c-896e-a46fb27ff229).');
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
        setError(err instanceof Error ? err.message : 'Failed to connect to workspace');
      }
    } finally {
      setLoading(false);
    }
  }, [token, workspaceId]);

  const handlePush = useCallback(async () => {
    setStep('pushing');
    setError('');
    setStatusMessage('');

    // Validate ontology before pushing
    try {
      validateForFabric(currentOntology);
    } catch (err) {
      if (err instanceof FabricValidationError) {
        setError(`Validation failed:\n${err.errors.join('\n')}`);
        setStep('error');
        return;
      }
    }

    // Refresh token if using MSAL
    let activeToken = token;
    if (useMsal && authAccount) {
      try {
        const fresh = await acquireFabricToken();
        activeToken = fresh.accessToken;
        setToken(fresh.accessToken);
      } catch {
        // Use existing token
      }
    }

    try {
      if (mode === 'create') {
        setStatusMessage('Creating ontology in Fabric...');
        const created = await createOntology(
          workspaceId.trim(),
          activeToken.trim(),
          currentOntology,
        );
        setResult(created);
      } else {
        setStatusMessage('Updating ontology definition...');
        await updateOntologyDefinition(
          workspaceId.trim(),
          selectedOntologyId,
          activeToken.trim(),
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
        setError(err instanceof Error ? err.message : 'Push failed');
      }
      setStep('error');
    }
  }, [mode, workspaceId, token, currentOntology, selectedOntologyId, existingOntologies, useMsal, authAccount]);

  // When MSAL workspace is selected from the picker, load its ontologies
  const handleWorkspaceSelect = useCallback(async (wsId: string) => {
    setWorkspaceId(wsId);
    if (!wsId) return;
    setLoading(true);
    setError('');
    try {
      const ontologies = await listOntologies(wsId, token);
      setExistingOntologies(ontologies);
    } catch {
      setExistingOntologies([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

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
              <h2 style={{ fontSize: 20, fontWeight: 600 }}>Push to Microsoft Fabric</h2>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                Create or update an ontology in your Fabric workspace
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {useMsal && authAccount && (
              <button
                className="icon-btn"
                onClick={handleMsalSignOut}
                title={`Sign out ${authAccount.username}`}
              >
                <LogOut size={16} />
              </button>
            )}
            <button className="icon-btn" onClick={onClose}><X size={20} /></button>
          </div>
        </div>

        {/* Signed-in user badge */}
        {useMsal && authAccount && (
          <div style={{
            padding: '8px 12px',
            background: 'rgba(0, 120, 212, 0.08)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: 12,
            fontSize: 12,
            color: 'var(--text-secondary)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <CheckCircle size={14} color="var(--ms-green)" />
            Signed in as <strong style={{ color: 'var(--text-primary)' }}>{authAccount.name}</strong>
            <span style={{ color: 'var(--text-tertiary)' }}>({authAccount.username})</span>
          </div>
        )}

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
            {currentOntology.entityTypes.length} entity types, {currentOntology.relationships.length} relationships
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
            <span style={{ whiteSpace: 'pre-wrap' }}>{error}</span>
          </div>
        )}

        {/* Step: Credentials */}
        {step === 'credentials' && (
          <div>
            {/* MSAL sign-in button (when configured but not yet signed in) */}
            {useMsal && !authAccount && (
              <div style={{ marginBottom: 20 }}>
                <button
                  className="btn btn-primary"
                  onClick={handleMsalSignIn}
                  disabled={loading}
                  style={{
                    width: '100%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  {loading
                    ? <><Loader2 size={14} className="spin" /> Signing in...</>
                    : <><LogIn size={16} /> Sign in with Microsoft</>
                  }
                </button>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  margin: '16px 0',
                  color: 'var(--text-tertiary)', fontSize: 12,
                }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--border-primary)' }} />
                  <span>or use manual credentials</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border-primary)' }} />
                </div>
              </div>
            )}

            {/* Manual credential fields (always shown as fallback) */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Workspace ID
              </label>
              <input
                type="text"
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
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
                Find this in Fabric portal → Workspace settings → Overview
              </p>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Access Token
              </label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste your bearer token here"
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
              {loading ? <><Loader2 size={14} className="spin" /> Connecting...</> : 'Connect to Workspace'}
            </button>
          </div>
        )}

        {/* Step: Workspace — choose create or update */}
        {step === 'workspace' && (
          <div>
            {/* Workspace picker (MSAL mode with workspace list) */}
            {workspaces.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Workspace
                </label>
                <select
                  value={workspaceId}
                  onChange={(e) => handleWorkspaceSelect(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-primary)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                  }}
                >
                  <option value="">— Select a workspace —</option>
                  {workspaces.map(ws => (
                    <option key={ws.id} value={ws.id}>
                      {ws.displayName}
                    </option>
                  ))}
                </select>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  Only workspaces with Fabric capacity are shown.
                </p>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                Action
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
                  Create New
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
                  Select Ontology
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
                disabled={(mode === 'update' && !selectedOntologyId) || !workspaceId}
                style={{ flex: 2 }}
              >
                {mode === 'create' ? 'Create & Push' : 'Update Definition'}
              </button>
            </div>
          </div>
        )}

        {/* Step: Pushing */}
        {step === 'pushing' && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <Loader2 size={32} color="var(--ms-blue)" style={{ animation: 'spin 1s linear infinite' }} />
            <p style={{ marginTop: 16, fontSize: 14, color: 'var(--text-secondary)' }}>
              {statusMessage || (mode === 'create' ? 'Creating ontology in Fabric...' : 'Updating ontology definition...')}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
              This may take a moment while Fabric provisions the resource.
            </p>

            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <CheckCircle size={40} color="var(--ms-green)" />
            <p style={{ marginTop: 12, fontSize: 16, fontWeight: 600 }}>
              {mode === 'create' ? 'Ontology Created!' : 'Definition Updated!'}
            </p>
            {result && (
              <div style={{
                marginTop: 12, padding: 12,
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                fontSize: 13, textAlign: 'left',
              }}>
                <div><strong>Name:</strong> {result.displayName}</div>
                <div><strong>ID:</strong> <code style={{ fontSize: 11 }}>{result.id}</code></div>
                <div><strong>Workspace:</strong> <code style={{ fontSize: 11 }}>{result.workspaceId}</code></div>
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
              Push failed. Check the error above and try again.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20 }}>
              <button
                className="btn btn-secondary"
                onClick={() => { setStep('credentials'); setError(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <RefreshCw size={14} />
                Start Over
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
