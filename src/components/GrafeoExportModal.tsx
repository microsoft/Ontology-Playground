import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, Database, Loader2, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { pushToGrafeo, pingGrafeo, GrafeoApiError } from '../lib/grafeo';

interface GrafeoExportModalProps {
  onClose: () => void;
}

type Step = 'connect' | 'pushing' | 'done' | 'error';

export function GrafeoExportModal({ onClose }: GrafeoExportModalProps) {
  const { currentOntology } = useAppStore();

  const [step, setStep] = useState<Step>('connect');
  const [baseUrl, setBaseUrl] = useState('http://localhost:7474');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{ nodes: number; edges: number } | null>(null);

  const handlePush = useCallback(async () => {
    if (!baseUrl.trim()) {
      setError('Grafeo endpoint URL is required.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Verify connectivity first
      const reachable = await pingGrafeo(baseUrl.trim(), token.trim() || undefined);
      if (!reachable) {
        setError('Cannot reach Grafeo at the specified URL. Is the server running?');
        setLoading(false);
        return;
      }

      setStep('pushing');

      await pushToGrafeo(
        baseUrl.trim(),
        currentOntology,
        token.trim() || undefined,
      );

      setStats({
        nodes: currentOntology.entityTypes.length,
        edges: currentOntology.relationships.length,
      });
      setStep('done');
    } catch (err) {
      if (err instanceof GrafeoApiError) {
        setError(`API error (${err.status}): ${err.message}`);
      } else {
        setError(err instanceof Error ? err.message : 'Push failed');
      }
      setStep('error');
    } finally {
      setLoading(false);
    }
  }, [baseUrl, token, currentOntology]);

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
        style={{ maxWidth: 500, maxHeight: '85vh', overflow: 'auto' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36,
              background: 'rgba(99, 102, 241, 0.15)',
              borderRadius: 'var(--radius-md)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Database size={20} color="#6366F1" />
            </div>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 600 }}>Push to Grafeo</h2>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                Materialize your ontology as a queryable property graph
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

        {/* Step: Connect & Push */}
        {step === 'connect' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Grafeo Endpoint
              </label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:7474"
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
                Default: <code>http://localhost:7474</code> — Grafeo's HTTP REST port
              </p>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Auth Token <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(optional)</span>
              </label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Bearer token if authentication is enabled"
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
            </div>

            <div style={{
              padding: 12,
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-md)',
              marginBottom: 20,
              fontSize: 12,
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}>
              Entity types become labeled nodes and relationships become typed edges.
              Once pushed, query with GQL, Cypher, SPARQL, Gremlin, GraphQL, or SQL.
            </div>

            <button
              className="btn btn-primary"
              onClick={handlePush}
              disabled={loading}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {loading ? <><Loader2 size={14} className="spin" /> Connecting...</> : 'Push to Grafeo'}
            </button>
          </div>
        )}

        {/* Step: Pushing */}
        {step === 'pushing' && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <Loader2 size={32} color="#6366F1" style={{ animation: 'spin 1s linear infinite' }} />
            <p style={{ marginTop: 16, fontSize: 14, color: 'var(--text-secondary)' }}>
              Creating property graph in Grafeo...
            </p>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <CheckCircle size={40} color="var(--ms-green)" />
            <p style={{ marginTop: 12, fontSize: 16, fontWeight: 600 }}>
              Ontology Pushed!
            </p>
            {stats && (
              <div style={{
                marginTop: 12, padding: 12,
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                fontSize: 13, textAlign: 'left',
              }}>
                <div><strong>Endpoint:</strong> <code style={{ fontSize: 11 }}>{baseUrl}</code></div>
                <div><strong>Nodes created:</strong> {stats.nodes} entity types</div>
                <div><strong>Edges created:</strong> {stats.edges} relationships</div>
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                  Query your ontology with GQL, Cypher, SPARQL, Gremlin, GraphQL, or SQL.
                </div>
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
                onClick={() => { setStep('connect'); setError(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <RefreshCw size={14} />
                Try Again
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
