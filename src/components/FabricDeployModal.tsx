import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Loader2, CheckCircle, AlertCircle, Rocket,
  Database, BarChart3, Network, FileCode, ChevronRight,
  LogIn, SkipForward, Plus, FolderOpen,
} from 'lucide-react';
import {
  consumeRedirectResult,
  signInWithRedirect,
  clearDeployIntent,
  isMsalConfigured,
  type FabricAuthResult,
} from '../lib/msalAuth';
import { listWorkspaces, createWorkspace, listCapacities, assignCapacity, type FabricWorkspace, type FabricCapacity } from '../lib/fabricWorkspace';
import {
  deployToFabric,
  type DeployConfig,
  type DeployStep,
  type DeployResult,
} from '../lib/fabricDeployPipeline';
import type { Ontology } from '../data/ontology';
import type { Catalogue } from '../types/catalogue';

interface FabricDeployModalProps {
  onClose: () => void;
  currentOntology?: Ontology | null;
}

type WizardStep = 'auth' | 'workspace' | 'select-ontologies' | 'configure' | 'deploying' | 'done';

interface OntologyOption {
  id: string;
  name: string;
  description: string;
  icon: string;
  ontology: Ontology | null;
  selected: boolean;
}

const STEP_ICONS: Record<string, typeof LogIn> = {
  authenticate: LogIn,
  ontology: FileCode,
  lakehouse: Database,
  'populate-tables': Database,
  'semantic-model': BarChart3,
  'graphql-api': Network,
};

function StatusIcon({ status }: { status: DeployStep['status'] }) {
  switch (status) {
    case 'running': return <Loader2 size={16} className="animate-spin text-blue-400" />;
    case 'success': return <CheckCircle size={16} className="text-green-400" />;
    case 'error': return <AlertCircle size={16} className="text-red-400" />;
    case 'skipped': return <SkipForward size={16} className="text-gray-500" />;
    default: return <div className="w-4 h-4 rounded-full border border-gray-600" />;
  }
}

export function FabricDeployModal({ onClose, currentOntology }: FabricDeployModalProps) {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [wizardStep, setWizardStep] = useState<WizardStep>('auth');

  // Auth state
  const [authResult, setAuthResult] = useState<FabricAuthResult | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Workspace state
  const [workspaces, setWorkspaces] = useState<FabricWorkspace[]>([]);
  const [workspacesLoading, setWorkspacesLoading] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState<FabricWorkspace | null>(null);
  const [showCreateWs, setShowCreateWs] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [newWsDesc, setNewWsDesc] = useState('');
  const [creatingWs, setCreatingWs] = useState(false);
  const [wsFilter, setWsFilter] = useState('');
  const [capacities, setCapacities] = useState<FabricCapacity[]>([]);
  const [assigningCapacity, setAssigningCapacity] = useState(false);

  // Deploy state
  const [deploySteps, setDeploySteps] = useState<DeployStep[]>([]);
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null);
  const [error, setError] = useState('');

  // Artifact toggles
  const [createOntologyFlag, setCreateOntologyFlag] = useState(true);
  const [createLakehouseFlag, setCreateLakehouseFlag] = useState(true);
  const [createSemanticModelFlag, setCreateSemanticModelFlag] = useState(true);
  const [createGraphQLFlag, setCreateGraphQLFlag] = useState(true);

  // Ontology selection
  const [ontologyOptions, setOntologyOptions] = useState<OntologyOption[]>([]);

  // Fetch catalogue
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}catalogue.json`)
      .then(res => res.json())
      .then((data: Catalogue) => setCatalogue(data))
      .catch(() => { /* catalogue not available */ });
  }, []);

  // Check for redirect auth result (e.g. after redirect-based login)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await consumeRedirectResult();
        if (result && !cancelled) {
          setAuthResult(result);
          clearDeployIntent();
          setWorkspacesLoading(true);
          setWizardStep('workspace');
          try {
            const [wsList, capList] = await Promise.all([
              listWorkspaces(result.accessToken),
              listCapacities(result.accessToken),
            ]);
            if (!cancelled) {
              setWorkspaces(wsList);
              setCapacities(capList);
            }
          } catch (err) {
            if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load workspaces');
          } finally {
            if (!cancelled) setWorkspacesLoading(false);
          }
        }
      } catch {
        // No redirect result — normal flow
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Build ontology options: current ontology first, then catalogue entries
  useEffect(() => {
    const options: OntologyOption[] = [];

    // Always offer the current playground ontology if it has entities
    if (currentOntology && currentOntology.entityTypes.length > 0) {
      options.push({
        id: '_current', name: currentOntology.name || 'Current Ontology',
        description: currentOntology.description || `${currentOntology.entityTypes.length} entities, ${currentOntology.relationships.length} relationships`,
        icon: '🎯', ontology: currentOntology, selected: true,
      });
    }

    if (catalogue) {
      const windStep3 = catalogue.entries.find(e => e.id === 'official/windpower-step-3');
      if (windStep3) {
        options.push({
          id: 'windpower', name: 'Wind Power Energy System',
          description: 'Wind farms, turbines, production, environmental impact, grid connections',
          icon: '🌬️', ontology: windStep3.ontology, selected: options.length === 0,
        });
      }

      const finance = catalogue.entries.find(e => e.id === 'official/finance' || e.id === 'official/finance-step-3');
      if (finance) {
        options.push({
          id: 'finance', name: 'Finance & Banking',
          description: 'Customers, accounts, transactions, banking relationships',
          icon: '💰', ontology: finance.ontology, selected: false,
        });
      }

      const others = ['official/university', 'official/healthcare', 'official/ecommerce', 'official/manufacturing'];
      for (const id of others) {
        const entry = catalogue.entries.find(e => e.id === id) ??
          catalogue.entries.find(e => e.id === `${id}-step-3`);
        if (entry && !options.some(o => entry.id.includes(o.id))) {
          options.push({
            id: entry.id, name: entry.name, description: entry.description,
            icon: entry.icon ?? '📦', ontology: entry.ontology, selected: false,
          });
        }
      }
    }

    setOntologyOptions(options);
  }, [catalogue, currentOntology]);

  // ─── Auth ────────────────────────────────────────────────────────────────

  const handleSignIn = useCallback(async () => {
    setAuthLoading(true);
    setError('');
    try {
      // Use redirect-based auth (navigates away, returns after login)
      await signInWithRedirect();
      // Page navigates away — this line won't execute
    } catch (err) {
      setAuthLoading(false);
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    }
  }, []);

  const handleTokenPaste = useCallback((token: string) => {
    const cleaned = token.trim();
    if (!cleaned) return;
    setError('');
    setAuthResult({
      accessToken: cleaned,
      account: { name: 'Token (manual)', username: '' },
      expiresOn: null,
    });
    setWizardStep('workspace');
  }, []);

  // ─── Workspace ───────────────────────────────────────────────────────────

  const handleCreateWorkspace = useCallback(async () => {
    if (!authResult || !newWsName.trim()) return;
    setCreatingWs(true);
    setError('');
    try {
      const ws = await createWorkspace(authResult.accessToken, newWsName.trim(), newWsDesc.trim());
      setWorkspaces(prev => [...prev, ws].sort((a, b) => a.displayName.localeCompare(b.displayName)));
      setSelectedWorkspace(ws);
      setShowCreateWs(false);
      setNewWsName('');
      setNewWsDesc('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      setCreatingWs(false);
    }
  }, [authResult, newWsName, newWsDesc]);

  // ─── Deploy ──────────────────────────────────────────────────────────────

  const selectedOntologies = ontologyOptions.filter(o => o.selected && o.ontology);

  const toggleOntology = useCallback((id: string) => {
    setOntologyOptions(prev => prev.map(o =>
      o.id === id ? { ...o, selected: !o.selected } : o,
    ));
  }, []);

  const handleDeploy = useCallback(async () => {
    if (!authResult || !selectedWorkspace) return;
    setError('');
    setWizardStep('deploying');

    const config: DeployConfig = {
      workspaceId: selectedWorkspace.id,
      ontologies: selectedOntologies.map(o => o.ontology!),
      createOntologyItem: createOntologyFlag,
      createLakehouse: createLakehouseFlag,
      createSemanticModel: createSemanticModelFlag,
      createGraphQLApi: createGraphQLFlag,
      accessToken: authResult.accessToken,
      accountName: authResult.account.name,
    };

    try {
      const result = await deployToFabric(config, setDeploySteps);
      setDeployResult(result);
      setWizardStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deployment failed');
      setWizardStep('done');
    }
  }, [authResult, selectedWorkspace, selectedOntologies, createOntologyFlag, createLakehouseFlag, createSemanticModelFlag, createGraphQLFlag]);

  const WIZARD_STEPS: { key: WizardStep; label: string; icon: typeof LogIn }[] = [
    { key: 'auth', label: 'Sign In', icon: LogIn },
    { key: 'workspace', label: 'Workspace', icon: FolderOpen },
    { key: 'select-ontologies', label: 'Ontologies', icon: FileCode },
    { key: 'configure', label: 'Configure', icon: Database },
    { key: 'deploying', label: 'Deploy', icon: Rocket },
    { key: 'done', label: 'Done', icon: CheckCircle },
  ];
  const currentStepIdx = WIZARD_STEPS.findIndex(s => s.key === wizardStep);

  const filteredWorkspaces = wsFilter
    ? workspaces.filter(w => w.displayName.toLowerCase().includes(wsFilter.toLowerCase()))
    : workspaces;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-2xl mx-4 rounded-2xl bg-gray-900 border border-gray-700 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-900/40">
                <Rocket size={18} className="text-white" />
              </div>
              <h2 className="text-lg font-semibold text-white">Deploy to Microsoft Fabric</h2>
            </div>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-1">
            {WIZARD_STEPS.map((step, i) => {
              const isComplete = i < currentStepIdx;
              const isCurrent = i === currentStepIdx;
              const StepIcon = step.icon;
              return (
                <div key={step.key} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1 min-w-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                      isComplete
                        ? 'bg-green-600 text-white shadow-md shadow-green-900/40'
                        : isCurrent
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40 ring-2 ring-blue-400/30'
                          : 'bg-gray-800 text-gray-500 border border-gray-700'
                    }`}>
                      {isComplete ? <CheckCircle size={16} /> : <StepIcon size={14} />}
                    </div>
                    <span className={`text-[10px] mt-1 font-medium truncate max-w-full transition-colors ${
                      isComplete ? 'text-green-400' : isCurrent ? 'text-blue-400' : 'text-gray-600'
                    }`}>{step.label}</span>
                  </div>
                  {i < WIZARD_STEPS.length - 1 && (
                    <div className={`h-0.5 w-full mx-0.5 rounded transition-colors duration-500 ${
                      i < currentStepIdx ? 'bg-green-600' : 'bg-gray-800'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
          <AnimatePresence mode="wait">

            {/* ─── Step 1: Sign In ─── */}
            {wizardStep === 'auth' && (
              <motion.div key="auth" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <div className="text-center py-6">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-600/20 flex items-center justify-center">
                    <LogIn size={32} className="text-blue-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">Sign in with Microsoft</h3>
                  <p className="text-gray-400 text-sm mb-6 max-w-md mx-auto">
                    Sign in with your Microsoft Entra ID account to access your Fabric workspaces and deploy ontology solutions.
                  </p>

                  {isMsalConfigured() ? (
                    <button
                      onClick={handleSignIn}
                      disabled={authLoading}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {authLoading ? (
                        <><Loader2 size={18} className="animate-spin" /> Redirecting to Microsoft…</>
                      ) : (
                        <><LogIn size={18} /> Sign in with Microsoft</>
                      )}
                    </button>
                  ) : (
                    <div className="max-w-md mx-auto text-left">
                      <div className="mb-4 p-3 rounded-lg bg-yellow-900/20 border border-yellow-800 text-xs text-yellow-200">
                        <strong>Popup sign-in is not configured.</strong> Set <code className="font-mono bg-black/30 px-1 rounded">VITE_FABRIC_CLIENT_ID</code> in <code className="font-mono bg-black/30 px-1 rounded">.env</code> to enable single sign-on (see <code className="font-mono bg-black/30 px-1 rounded">DEPLOYMENT.md</code>), or paste a Fabric access token below to continue.
                      </div>
                      <label className="block text-xs font-medium text-gray-300 mb-1">Fabric access token</label>
                      <textarea
                        rows={4}
                        placeholder="eyJ0eXAiOiJKV1Qi…"
                        className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                        onChange={e => {
                          const v = e.target.value;
                          if (v.split('.').length === 3 && v.length > 100) {
                            handleTokenPaste(v);
                          }
                        }}
                      />
                      <p className="mt-2 text-[11px] text-gray-500">
                        Get a token from <code className="font-mono">az account get-access-token --resource https://api.fabric.microsoft.com</code>
                      </p>
                    </div>
                  )}

                  {error && <p className="mt-4 text-sm text-red-400 max-w-md mx-auto">{error}</p>}
                </div>
              </motion.div>
            )}

            {/* ─── Step 2: Pick Workspace ─── */}
            {wizardStep === 'workspace' && (
              <motion.div key="workspace" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                {authResult && (
                  <div className="mb-4 p-3 rounded-lg bg-green-900/20 border border-green-800 flex items-center gap-2">
                    <CheckCircle size={16} className="text-green-400" />
                    <span className="text-sm text-green-300">Signed in as <strong>{authResult.account.name}</strong> ({authResult.account.username})</span>
                  </div>
                )}

                <div className="flex items-center justify-between mb-3">
                  <p className="text-gray-400 text-sm">Select a workspace or create a new one:</p>
                  <button
                    onClick={() => setShowCreateWs(!showCreateWs)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-400 border border-blue-600 rounded-lg hover:bg-blue-900/30"
                  >
                    <Plus size={14} /> New Workspace
                  </button>
                </div>

                {/* Create workspace form */}
                {showCreateWs && (
                  <div className="mb-4 p-4 rounded-lg bg-gray-800 border border-gray-600">
                    <label className="block text-xs font-medium text-gray-400 mb-1">Workspace Name</label>
                    <input
                      type="text"
                      value={newWsName}
                      onChange={e => setNewWsName(e.target.value)}
                      placeholder="My Ontology Workspace"
                      className="w-full px-3 py-2 mb-2 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <label className="block text-xs font-medium text-gray-400 mb-1">Description (optional)</label>
                    <input
                      type="text"
                      value={newWsDesc}
                      onChange={e => setNewWsDesc(e.target.value)}
                      placeholder="Workspace for ontology solutions"
                      className="w-full px-3 py-2 mb-3 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleCreateWorkspace}
                        disabled={!newWsName.trim() || creatingWs}
                        className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 text-xs font-medium disabled:opacity-50"
                      >
                        {creatingWs ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : <><Plus size={14} /> Create</>}
                      </button>
                      <button onClick={() => setShowCreateWs(false)} className="px-3 py-2 text-gray-400 text-xs hover:text-white">Cancel</button>
                    </div>
                  </div>
                )}

                {/* Search filter */}
                {workspaces.length > 5 && (
                  <input
                    type="text"
                    value={wsFilter}
                    onChange={e => setWsFilter(e.target.value)}
                    placeholder="Search workspaces…"
                    className="w-full px-3 py-2 mb-3 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}

                {/* Workspace list */}
                {workspacesLoading ? (
                  <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                    <Loader2 size={18} className="animate-spin" /> Loading workspaces…
                  </div>
                ) : filteredWorkspaces.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    {workspaces.length === 0 ? 'No workspaces found. Create a new one above.' : 'No workspaces match your search.'}
                  </div>
                ) : (
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {filteredWorkspaces.map(ws => (
                      <button
                        key={ws.id}
                        onClick={() => setSelectedWorkspace(ws)}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                          selectedWorkspace?.id === ws.id
                            ? 'bg-blue-900/30 border-blue-600 text-white'
                            : 'bg-gray-800/30 border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white'
                        }`}
                      >
                        <FolderOpen size={18} className={selectedWorkspace?.id === ws.id ? 'text-blue-400' : 'text-gray-500'} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate flex items-center gap-2">
                            {ws.displayName}
                            {ws.capacityId ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-green-900/40 text-green-400 border border-green-800">✓ Capacity</span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-900/40 text-amber-400 border border-amber-800">No capacity</span>
                            )}
                          </div>
                          {ws.description && <div className="text-xs text-gray-500 truncate">{ws.description}</div>}
                        </div>
                        {selectedWorkspace?.id === ws.id && <CheckCircle size={16} className="text-blue-400 flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}

                {/* Warning + assign capacity for workspaces without capacity */}
                {selectedWorkspace && !selectedWorkspace.capacityId && (
                  <div className="mt-3 p-3 rounded-lg bg-amber-900/20 border border-amber-800">
                    <p className="text-sm text-amber-300 mb-2">
                      ⚠️ <strong>{selectedWorkspace.displayName}</strong> has no Fabric capacity assigned. Deploying artifacts requires a capacity.
                    </p>
                    {capacities.length > 0 ? (
                      <div className="flex items-center gap-2">
                        <select
                          id="capacity-select"
                          className="flex-1 px-2 py-1.5 rounded bg-gray-800 border border-gray-600 text-white text-xs"
                          defaultValue={capacities[0]?.id}
                        >
                          {capacities.map(c => (
                            <option key={c.id} value={c.id}>{c.displayName} ({c.sku} — {c.region})</option>
                          ))}
                        </select>
                        <button
                          onClick={async () => {
                            if (!authResult) return;
                            const select = document.getElementById('capacity-select') as HTMLSelectElement;
                            setAssigningCapacity(true);
                            setError('');
                            try {
                              await assignCapacity(authResult.accessToken, selectedWorkspace.id, select.value);
                              setSelectedWorkspace({ ...selectedWorkspace, capacityId: select.value });
                              setWorkspaces(prev => prev.map(w => w.id === selectedWorkspace.id ? { ...w, capacityId: select.value } : w));
                            } catch (err) {
                              setError(err instanceof Error ? err.message : 'Failed to assign capacity');
                            } finally {
                              setAssigningCapacity(false);
                            }
                          }}
                          disabled={assigningCapacity}
                          className="px-3 py-1.5 bg-amber-600 text-white rounded text-xs font-medium hover:bg-amber-500 disabled:opacity-50"
                        >
                          {assigningCapacity ? 'Assigning…' : 'Assign'}
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">No available capacities found. Assign a capacity in the Fabric admin portal.</p>
                    )}
                  </div>
                )}

                {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

                <div className="flex justify-end mt-4">
                  <button
                    onClick={() => { setError(''); setWizardStep('select-ontologies'); }}
                    disabled={!selectedWorkspace || !selectedWorkspace.capacityId}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              </motion.div>
            )}

            {/* ─── Step 3: Select Ontologies ─── */}
            {wizardStep === 'select-ontologies' && (
              <motion.div key="select" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <p className="text-gray-400 text-sm mb-4">
                  Select ontologies to deploy to <strong className="text-white">{selectedWorkspace?.displayName}</strong>:
                </p>
                <div className="space-y-2">
                  {ontologyOptions.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => toggleOntology(opt.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                        opt.selected
                          ? 'bg-blue-900/30 border-blue-600 text-white'
                          : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      <span className="text-2xl">{opt.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{opt.name}</div>
                        <div className="text-xs text-gray-500 truncate">{opt.description}</div>
                      </div>
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        opt.selected ? 'bg-blue-600 border-blue-600' : 'border-gray-600'
                      }`}>
                        {opt.selected && <CheckCircle size={14} className="text-white" />}
                      </div>
                    </button>
                  ))}
                </div>
                {selectedOntologies.length === 0 && (
                  <p className="mt-2 text-sm text-amber-400">Select at least one ontology</p>
                )}
                <div className="flex justify-between mt-6">
                  <button onClick={() => setWizardStep('workspace')} className="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors">← Back</button>
                  <button
                    onClick={() => setWizardStep('configure')}
                    disabled={selectedOntologies.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              </motion.div>
            )}

            {/* ─── Step 4: Configure ─── */}
            {wizardStep === 'configure' && (
              <motion.div key="configure" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <p className="text-gray-400 text-sm mb-4">Choose which Fabric artifacts to create:</p>
                <div className="space-y-3">
                  {[
                    { label: 'Fabric IQ Ontology', desc: 'Ontology definition with entities and relationships', icon: FileCode, checked: createOntologyFlag, onChange: setCreateOntologyFlag },
                    { label: 'Lakehouse + Data Tables', desc: 'Delta tables populated with sample data', icon: Database, checked: createLakehouseFlag, onChange: setCreateLakehouseFlag },
                    { label: 'Power BI Semantic Model', desc: 'Tabular model with relationships (DirectLake)', icon: BarChart3, checked: createSemanticModelFlag, onChange: setCreateSemanticModelFlag },
                    { label: 'GraphQL API', desc: 'GraphQL endpoint backed by Lakehouse tables', icon: Network, checked: createGraphQLFlag, onChange: setCreateGraphQLFlag },
                  ].map(item => (
                    <label key={item.label} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      item.checked
                        ? 'bg-blue-900/20 border-blue-800 hover:border-blue-600'
                        : 'bg-gray-800/50 border-gray-700 hover:border-gray-500 opacity-60'
                    }`}>
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={e => item.onChange(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-600 text-blue-600 focus:ring-blue-500 bg-gray-700"
                      />
                      <item.icon size={18} className={item.checked ? 'text-blue-400' : 'text-gray-500'} />
                      <div>
                        <div className="text-sm font-medium text-white">{item.label}</div>
                        <div className="text-xs text-gray-500">{item.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Deploy summary card */}
                <div className="mt-5 p-4 rounded-xl bg-gradient-to-br from-gray-800 to-gray-800/60 border border-gray-700">
                  <div className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wider">Deploy Summary</div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="text-2xl">{selectedOntologies[0]?.icon ?? '📦'}</div>
                    <div>
                      <div className="text-sm text-white font-medium">
                        {selectedOntologies.length} ontolog{selectedOntologies.length > 1 ? 'ies' : 'y'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {selectedOntologies.map(o => o.name).join(', ')}
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-gray-600 mx-1" />
                    <div className="flex items-center gap-2">
                      <FolderOpen size={16} className="text-blue-400" />
                      <div className="text-sm text-blue-400 font-medium">{selectedWorkspace?.displayName}</div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    {[createOntologyFlag && 'Ontology', createLakehouseFlag && 'Lakehouse', createSemanticModelFlag && 'Semantic Model', createGraphQLFlag && 'GraphQL API'].filter(Boolean).join(' · ')}
                  </div>
                </div>

                {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

                <div className="flex justify-between mt-6">
                  <button onClick={() => setWizardStep('select-ontologies')} className="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors">← Back</button>
                  <button
                    onClick={handleDeploy}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-green-500 text-white rounded-xl hover:from-green-500 hover:to-green-400 text-sm font-semibold shadow-lg shadow-green-900/40 transition-all active:scale-95"
                  >
                    <Rocket size={18} /> Deploy to Fabric
                  </button>
                </div>
              </motion.div>
            )}

            {/* ─── Step 5: Deploying ─── */}
            {wizardStep === 'deploying' && (
              <motion.div key="deploying" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center">
                    <Loader2 size={20} className="animate-spin text-blue-400" />
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">Deploying to <strong>{selectedWorkspace?.displayName}</strong></p>
                    <p className="text-gray-500 text-xs">
                      {deploySteps.filter(s => s.status === 'success').length} of {deploySteps.length} steps complete
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 bg-gray-800 rounded-full mb-4 overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full"
                    initial={{ width: '0%' }}
                    animate={{ width: `${Math.max(5, (deploySteps.filter(s => s.status === 'success').length / deploySteps.length) * 100)}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                </div>

                <div className="space-y-2">
                  {deploySteps.map((step, i) => {
                    const Icon = STEP_ICONS[step.id] ?? FileCode;
                    return (
                      <motion.div
                        key={step.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                          step.status === 'running'
                            ? 'bg-blue-900/20 border-blue-800'
                            : step.status === 'success'
                              ? 'bg-green-900/10 border-green-900/30'
                              : step.status === 'error'
                                ? 'bg-red-900/10 border-red-900/30'
                                : 'bg-gray-800/50 border-gray-700'
                        }`}
                      >
                        <StatusIcon status={step.status} />
                        <Icon size={16} className={step.status === 'success' ? 'text-green-400' : step.status === 'running' ? 'text-blue-400' : 'text-gray-500'} />
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm ${step.status === 'success' ? 'text-green-300' : step.status === 'running' ? 'text-white font-medium' : 'text-gray-400'}`}>{step.label}</div>
                          {step.resultName && <div className="text-xs text-green-400 mt-0.5">✓ {step.resultName}</div>}
                          {step.error && step.status === 'error' && <div className="text-xs text-red-400 mt-0.5">✗ {step.error}</div>}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* ─── Step 6: Done ─── */}
            {wizardStep === 'done' && (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                {deployResult && (
                  <>
                    <div className="text-center py-2 mb-4">
                      {deployResult.steps.every(s => s.status === 'success') ? (
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 10, stiffness: 150 }}>
                          <div className="w-20 h-20 mx-auto mb-3 rounded-full bg-green-600/20 flex items-center justify-center ring-4 ring-green-600/10">
                            <CheckCircle size={40} className="text-green-400" />
                          </div>
                          <h3 className="text-xl font-bold text-white">Deployment Complete! 🎉</h3>
                          <p className="text-sm text-gray-400 mt-1">
                            All artifacts deployed to <strong className="text-green-400">{selectedWorkspace?.displayName}</strong>
                          </p>
                        </motion.div>
                      ) : (
                        <>
                          <div className="w-20 h-20 mx-auto mb-3 rounded-full bg-amber-600/20 flex items-center justify-center">
                            <AlertCircle size={40} className="text-amber-400" />
                          </div>
                          <h3 className="text-xl font-bold text-white">Completed with Issues</h3>
                          <p className="text-sm text-gray-400 mt-1">Some steps failed — check details below</p>
                        </>
                      )}
                    </div>

                    {/* Results summary */}
                    <div className="space-y-2 mb-4">
                      {deployResult.steps.map((step, i) => {
                        const Icon = STEP_ICONS[step.id] ?? FileCode;
                        return (
                          <motion.div
                            key={step.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.08 }}
                            className={`flex items-center gap-3 p-3 rounded-lg border ${
                              step.status === 'success'
                                ? 'bg-green-900/10 border-green-900/30'
                                : step.status === 'error'
                                  ? 'bg-red-900/10 border-red-900/30'
                                  : 'bg-gray-800/30 border-gray-700'
                            }`}
                          >
                            <StatusIcon status={step.status} />
                            <Icon size={16} className={step.status === 'success' ? 'text-green-400' : 'text-gray-500'} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-white">{step.label}</div>
                              {step.resultName && <div className="text-xs text-green-400">✓ {step.resultName}</div>}
                              {step.error && step.status === 'error' && <div className="text-xs text-red-400">✗ {step.error}</div>}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>

                    {selectedWorkspace && (
                      <a
                        href={`https://app.fabric.microsoft.com/groups/${selectedWorkspace.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-blue-600/20 border border-blue-700 text-blue-400 hover:bg-blue-600/30 hover:text-blue-300 text-sm font-medium transition-colors mb-2"
                      >
                        <Rocket size={16} /> Open workspace in Fabric →
                      </a>
                    )}
                  </>
                )}

                {error && !deployResult && (
                  <div className="text-center py-4">
                    <div className="w-20 h-20 mx-auto mb-3 rounded-full bg-red-600/20 flex items-center justify-center">
                      <AlertCircle size={40} className="text-red-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-1">Deployment Failed</h3>
                    <p className="text-sm text-red-400 max-w-md mx-auto">{error}</p>
                  </div>
                )}

                <div className="flex justify-center mt-4">
                  <button
                    onClick={onClose}
                    className="px-8 py-2.5 bg-gray-700 text-white rounded-lg hover:bg-gray-600 text-sm font-medium transition-colors"
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
