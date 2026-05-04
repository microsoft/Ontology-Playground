import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Cloud, Loader2, CheckCircle, AlertCircle, RefreshCw, LogIn, FolderOpen, Database, Bot } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import {
  createOntology,
  createOntologyWithData,
  updateOntologyDefinition,
  listOntologies,
  convertToFabricParts,
  sanitizeItemName,
  FabricApiError,
  FabricValidationError,
  type FabricOntologyResponse,
  type PollProgress,
} from '../lib/fabric';
import { generateSampleData } from '../lib/sampleDataGenerator';
import { consumeRedirectResult, signInWithRedirect, acquireFabricToken, acquireOneLakeToken, getSignedInAccount, type FabricAuthResult } from '../lib/msalAuth';
import { listWorkspaces, type FabricWorkspace } from '../lib/fabricWorkspace';

interface FabricExportModalProps {
  onClose: () => void;
}

type Step = 'auth' | 'workspace' | 'pushing' | 'done' | 'error';

export function FabricExportModal({ onClose }: FabricExportModalProps) {
  const { currentOntology } = useAppStore();

  const [step, setStep] = useState<Step>('auth');
  const [token, setToken] = useState('');
  const [authResult, setAuthResult] = useState<FabricAuthResult | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Workspace state
  const [workspaces, setWorkspaces] = useState<FabricWorkspace[]>([]);
  const [workspacesLoading, setWorkspacesLoading] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState<FabricWorkspace | null>(null);

  const [existingOntologies, setExistingOntologies] = useState<FabricOntologyResponse[]>([]);
  const [selectedOntologyId, setSelectedOntologyId] = useState<string | ''>('');
  const [mode, setMode] = useState<'create' | 'update'>('create');
  const [error, setError] = useState('');
  const [result, setResult] = useState<FabricOntologyResponse | null>(null);
  const [ontologiesLoading, setOntologiesLoading] = useState(false);
  const [pollProgress, setPollProgress] = useState<PollProgress | null>(null);
  const [includeSampleData, setIncludeSampleData] = useState(true);
  const [includeDataAgent, setIncludeDataAgent] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');

  // Try to get token silently on mount (user may already be signed in)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Check for redirect result first
        const redirectResult = await consumeRedirectResult();
        if (redirectResult && !cancelled) {
          setAuthResult(redirectResult);
          setToken(redirectResult.accessToken);
          // Auto-advance to workspace step
          setWorkspacesLoading(true);
          setStep('workspace');
          try {
            const wsList = await listWorkspaces(redirectResult.accessToken);
            if (!cancelled) setWorkspaces(wsList.filter(w => w.capacityId));
          } catch (err) {
            if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load workspaces');
          } finally {
            if (!cancelled) setWorkspacesLoading(false);
          }
          return;
        }

        // Try silent token acquisition
        const existing = await getSignedInAccount();
        if (existing) {
          setAuthLoading(true);
          const tokenResult = await acquireFabricToken();
          if (!cancelled) {
            setAuthResult(tokenResult);
            setToken(tokenResult.accessToken);
            // Auto-advance
            setWorkspacesLoading(true);
            setStep('workspace');
            try {
              const wsList = await listWorkspaces(tokenResult.accessToken);
              if (!cancelled) setWorkspaces(wsList.filter(w => w.capacityId));
            } catch (err) {
              if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load workspaces');
            } finally {
              if (!cancelled) setWorkspacesLoading(false);
            }
          }
        }
      } catch {
        // Silent token failed — user needs to sign in
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSignIn = useCallback(async () => {
    setAuthLoading(true);
    setError('');
    try {
      await signInWithRedirect();
    } catch (err) {
      setAuthLoading(false);
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    }
  }, []);

  const handleSelectWorkspace = useCallback(async (ws: FabricWorkspace) => {
    setSelectedWorkspace(ws);
    setOntologiesLoading(true);
    setError('');
    try {
      const onts = await listOntologies(ws.id, token);
      setExistingOntologies(onts);
    } catch (err) {
      if (err instanceof FabricApiError && err.status === 403) {
        setExistingOntologies([]);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to list ontologies');
      }
    } finally {
      setOntologiesLoading(false);
    }
  }, [token]);

  const handlePush = useCallback(async () => {
    if (!selectedWorkspace) return;
    setStep('pushing');
    setError('');
    setPollProgress(null);
    setStatusMessage('');

    const onProgress = (progress: PollProgress) => setPollProgress(progress);

    try {
      // Refresh token right before push to avoid stale tokens
      let freshToken = token;
      try {
        const refreshed = await acquireFabricToken();
        freshToken = refreshed.accessToken;
        setToken(freshToken);
      } catch (authErr) {
        console.warn('Token refresh failed, using cached token:', authErr);
      }

      if (mode === 'create' && includeSampleData) {
        // Full push with sample data + data bindings
        setStatusMessage('Generating sample data…');
        const sampleData = generateSampleData(currentOntology);

        let oneLakeToken: string;
        try {
          const olResult = await acquireOneLakeToken();
          oneLakeToken = olResult.accessToken;
        } catch (authErr) {
          // OneLake consent not granted — fall back to creating ontology without data
          console.warn('OneLake token acquisition failed:', authErr);
          setStatusMessage('⚠ OneLake permission not granted — creating ontology without sample data. Sign out & sign back in to fix.');
          const created = await createOntology(
            selectedWorkspace.id,
            freshToken,
            currentOntology,
            onProgress,
          );
          setResult(created);
          setStep('done');
          return;
        }

        const created = await createOntologyWithData(
          selectedWorkspace.id,
          freshToken,
          oneLakeToken,
          currentOntology,
          sampleData.tables,
          onProgress,
          (msg) => setStatusMessage(msg),
          { includeDataAgent: includeDataAgent },
        );
        setResult(created);
      } else if (mode === 'create') {
        const created = await createOntology(
          selectedWorkspace.id,
          freshToken,
          currentOntology,
          onProgress,
        );
        setResult(created);
      } else {
        await updateOntologyDefinition(
          selectedWorkspace.id,
          selectedOntologyId,
          freshToken,
          currentOntology,
          onProgress,
        );
        const existing = existingOntologies.find(o => o.id === selectedOntologyId);
        setResult(existing ?? null);
      }
      setStep('done');
    } catch (err) {
      if (err instanceof FabricValidationError) {
        setError(`Validation error: ${err.message}`);
      } else if (err instanceof FabricApiError) {
        setError(`API error (${err.status}): ${err.message}`);
      } else {
        setError(err instanceof Error ? err.message : 'Push failed');
      }
      setStep('error');
    }
  }, [mode, selectedWorkspace, token, currentOntology, selectedOntologyId, existingOntologies, includeSampleData, includeDataAgent]);

  const handleCopyDebug = useCallback(() => {
    // Copy the exact POST body that would be sent to Fabric
    const { definition } = convertToFabricParts(currentOntology);
    const postBody = {
      displayName: sanitizeItemName(currentOntology.name),
      description: (currentOntology.description ?? '').slice(0, 256),
      definition,
    };
    const debugInfo = {
      postBody: JSON.parse(JSON.stringify(postBody)),
      decodedParts: definition.parts.map(p => ({
        path: p.path,
        decoded: JSON.parse(atob(p.payload)),
      })),
      workspace: selectedWorkspace?.id,
      error,
    };
    navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
  }, [currentOntology, selectedWorkspace, error]);

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
              background: 'rgba(0, 102, 179, 0.15)',
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
            <span>{error}</span>
          </div>
        )}

        {/* Step: Auth */}
        {step === 'auth' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            {authLoading ? (
              <>
                <Loader2 size={32} color="var(--ms-blue)" style={{ animation: 'spin 1s linear infinite', margin: '0 auto' }} />
                <p style={{ marginTop: 16, fontSize: 14, color: 'var(--text-secondary)' }}>
                  Connecting to Microsoft…
                </p>
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              </>
            ) : (
              <>
                <div style={{
                  width: 56, height: 56, margin: '0 auto 16px',
                  background: 'rgba(0, 102, 179, 0.15)',
                  borderRadius: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <LogIn size={28} color="var(--ms-blue)" />
                </div>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
                  Sign in with your Microsoft account to push this ontology to Fabric.
                </p>
                <button
                  className="btn btn-primary"
                  onClick={handleSignIn}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 24px' }}
                >
                  <LogIn size={16} /> Sign in with Microsoft
                </button>
              </>
            )}
          </div>
        )}

        {/* Step: Workspace — pick workspace, then create or update */}
        {step === 'workspace' && (
          <div>
            {authResult && (
              <div style={{
                padding: '8px 12px', marginBottom: 16,
                background: 'rgba(16, 124, 16, 0.1)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(16, 124, 16, 0.3)',
                fontSize: 12, color: '#4CAF50',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <CheckCircle size={14} />
                Signed in as <strong>{authResult.account.name}</strong>
              </div>
            )}

            {/* Workspace list */}
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              Select Workspace
            </label>
            {workspacesLoading ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)', fontSize: 13 }}>
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', display: 'inline-block', marginRight: 8 }} />
                Loading workspaces…
              </div>
            ) : (
              <div style={{ maxHeight: 180, overflowY: 'auto', marginBottom: 16 }}>
                {workspaces.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: 12, textAlign: 'center' }}>
                    No workspaces with Fabric capacity found.
                  </p>
                ) : workspaces.map(ws => (
                  <button
                    key={ws.id}
                    onClick={() => handleSelectWorkspace(ws)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', marginBottom: 4,
                      borderRadius: 'var(--radius-sm)',
                      border: selectedWorkspace?.id === ws.id ? '2px solid var(--ms-blue)' : '1px solid var(--border-primary)',
                      background: selectedWorkspace?.id === ws.id ? 'rgba(0, 102, 179, 0.1)' : 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer', fontSize: 13, textAlign: 'left',
                    }}
                  >
                    <FolderOpen size={16} style={{ color: selectedWorkspace?.id === ws.id ? 'var(--ms-blue)' : 'var(--text-tertiary)', flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ws.displayName}</span>
                    {selectedWorkspace?.id === ws.id && <CheckCircle size={14} color="var(--ms-blue)" style={{ flexShrink: 0 }} />}
                  </button>
                ))}
              </div>
            )}

            {/* Action: Create or Update */}
            {selectedWorkspace && (
              <>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                  Action
                </label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <button
                    onClick={() => setMode('create')}
                    style={{
                      flex: 1, padding: '10px 16px',
                      borderRadius: 'var(--radius-sm)',
                      border: mode === 'create' ? '2px solid var(--ms-blue)' : '2px solid var(--border-primary)',
                      background: mode === 'create' ? 'rgba(0, 102, 179, 0.1)' : 'var(--bg-secondary)',
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
                      background: mode === 'update' ? 'rgba(0, 102, 179, 0.1)' : 'var(--bg-secondary)',
                      color: existingOntologies.length === 0 ? 'var(--text-tertiary)' : 'var(--text-primary)',
                      cursor: existingOntologies.length === 0 ? 'not-allowed' : 'pointer',
                      fontSize: 13, fontWeight: 600,
                    }}
                  >
                    {ontologiesLoading ? 'Loading…' : `Update Existing (${existingOntologies.length})`}
                  </button>
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

                {mode === 'create' && (
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    marginBottom: 16, padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: `2px solid ${includeSampleData ? 'var(--ms-blue)' : 'var(--border-primary)'}`,
                    background: includeSampleData ? 'rgba(0, 102, 179, 0.08)' : 'var(--bg-secondary)',
                    cursor: 'pointer', fontSize: 13,
                  }}>
                    <input
                      type="checkbox"
                      checked={includeSampleData}
                      onChange={(e) => setIncludeSampleData(e.target.checked)}
                      style={{ accentColor: 'var(--ms-blue)', width: 16, height: 16 }}
                    />
                    <Database size={16} style={{ color: 'var(--ms-blue)', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 600 }}>Include sample data</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                        Upload realistic data to the Lakehouse and bind to the graph
                      </div>
                    </div>
                  </label>
                )}

                {mode === 'create' && includeSampleData && (
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    marginBottom: 16, padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: `2px solid ${includeDataAgent ? 'var(--ms-blue)' : 'var(--border-primary)'}`,
                    background: includeDataAgent ? 'rgba(0, 102, 179, 0.08)' : 'var(--bg-secondary)',
                    cursor: 'pointer', fontSize: 13,
                  }}>
                    <input
                      type="checkbox"
                      checked={includeDataAgent}
                      onChange={(e) => setIncludeDataAgent(e.target.checked)}
                      style={{ accentColor: 'var(--ms-blue)', width: 16, height: 16 }}
                    />
                    <Bot size={16} style={{ color: 'var(--ms-blue)', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 600 }}>Connect Data Agent</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                        Create an AI agent for natural language queries over the ontology
                      </div>
                    </div>
                  </label>
                )}

                <button
                  className="btn btn-primary"
                  onClick={handlePush}
                  disabled={mode === 'update' && !selectedOntologyId}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <Cloud size={16} />
                  {mode === 'create'
                    ? `Push "${currentOntology.name}" to ${selectedWorkspace.displayName}`
                    : 'Update Definition'}
                </button>
              </>
            )}
          </div>
        )}

        {/* Step: Pushing */}
        {step === 'pushing' && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <Loader2 size={32} color="var(--ms-blue)" style={{ animation: 'spin 1s linear infinite' }} />
            <p style={{ marginTop: 16, fontSize: 14, color: 'var(--text-secondary)' }}>
              {statusMessage || (mode === 'create' ? 'Creating ontology in Fabric…' : 'Updating ontology definition…')}
            </p>
            {pollProgress ? (
              <>
                <div style={{
                  width: '80%', height: 6, margin: '12px auto 0',
                  background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    background: 'var(--ms-blue)',
                    width: pollProgress.percentComplete != null
                      ? `${pollProgress.percentComplete}%`
                      : `${Math.min(90, (pollProgress.attempt / pollProgress.maxAttempts) * 100)}%`,
                    transition: 'width 0.5s ease',
                  }} />
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>
                  {pollProgress.percentComplete != null
                    ? `${pollProgress.percentComplete}% complete`
                    : `Provisioning resources… (${Math.round((pollProgress.attempt * 3))}s)`
                  }
                  {pollProgress.status && pollProgress.status !== 'Succeeded' && (
                    <span> · Status: {pollProgress.status}</span>
                  )}
                </p>
              </>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                Fabric is provisioning Lakehouse, SQL endpoint &amp; GraphModel — this may take up to 2 minutes.
              </p>
            )}

            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <CheckCircle size={40} color="#4CAF50" />
            <p style={{ marginTop: 12, fontSize: 16, fontWeight: 600 }}>
              {mode === 'create'
                ? (includeSampleData ? 'Ontology Created with Sample Data! 🎉' : 'Ontology Created! 🎉')
                : 'Definition Updated! ✅'}
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
            {selectedWorkspace && (
              <a
                href={`https://app.fabric.microsoft.com/groups/${selectedWorkspace.id}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block', marginTop: 16,
                  fontSize: 13, color: 'var(--ms-blue)', textDecoration: 'underline',
                }}
              >
                Open workspace in Fabric →
              </a>
            )}
            <div style={{ marginTop: 20 }}>
              <button className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
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
                onClick={() => { setStep('workspace'); setError(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <RefreshCw size={14} />
                Try Again
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleCopyDebug}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
              >
                📋 Copy Debug Info
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
