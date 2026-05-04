import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { AnimatePresence } from 'framer-motion';
import { 
  Header, 
  OntologyGraph, 
  QuestPanel, 
  InspectorPanel, 
  QueryPlayground,
  SearchFilter,
  WelcomeModal,
  AboutModal,
  HelpModal,
  DataSourcesModal,
  ImportExportModal,
  FabricExportModal,
  GalleryModal,
  OntologySummaryModal,
  OntologyDesigner,
  LearnPage,
  Toast,
  CommandPalette,
  GuidedTour,
  isTourDismissed,
  AppFooter
} from './components';
import type { CommandItem } from './components';
import { useAppStore } from './store/appStore';
import { useDesignerStore } from './store/designerStore';
import { useRoute } from './hooks/useRoute';
import { navigate } from './lib/router';
import { decodeSharePayload } from './lib/shareCodec';
import { hasPendingDeployIntent, clearDeployIntent } from './lib/msalAuth';
import type { Catalogue } from './types/catalogue';
import { Search, MessageSquare, Info, Compass, LayoutGrid, PenTool, BookOpen, FileJson, HelpCircle, Database, Sun, Moon, FileText, Rocket } from 'lucide-react';
import './styles/app.css';

const AI_BUILDER_ENABLED = import.meta.env.VITE_ENABLE_AI_BUILDER === 'true';

const NLBuilderModal = AI_BUILDER_ENABLED
  ? lazy(() => import('./components/NLBuilderModal').then(m => ({ default: m.NLBuilderModal })))
  : null;

function App() {
  const route = useRoute();

  const [showWelcome, setShowWelcome] = useState(false);
  const [showTour, setShowTour] = useState(() => !isTourDismissed());
  const [showAbout, setShowAbout] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showDataSources, setShowDataSources] = useState(false);
  const [showImportExport, setShowImportExport] = useState(false);
  const [showNLBuilder, setShowNLBuilder] = useState(false);
  const [showFabricExport, setShowFabricExport] = useState(false);

  // Auto-open push modal if returning from redirect-based auth
  useEffect(() => {
    if (hasPendingDeployIntent()) {
      setShowFabricExport(true);
    }
  }, []);
  const [showSummary, setShowSummary] = useState(false);
  const [toast, setToast] = useState<{ message: string; icon: string } | null>(null);
  const [mobilePanel, setMobilePanel] = useState<'graph' | 'quests' | 'inspector' | 'query'>('graph');
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const { darkMode, earnedBadges, loadOntology, toggleDarkMode } = useAppStore();

  // Show toast when a new badge is earned
  useEffect(() => {
    if (earnedBadges.length > 0) {
      const latestBadge = earnedBadges[earnedBadges.length - 1];
      setToast({
        message: `Quest Complete! Earned: ${latestBadge.badge}`,
        icon: latestBadge.icon
      });
      
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [earnedBadges]);

  // Deep-link: /#/catalogue/<id> — load a specific ontology from the catalogue
  useEffect(() => {
    if (route.page === 'catalogue' && route.ontologyId) {
      const id = route.ontologyId;
      fetch(`${import.meta.env.BASE_URL}catalogue.json`)
        .then((res) => {
          if (!res.ok) throw new Error(`Failed to load catalogue (${res.status})`);
          return res.json() as Promise<Catalogue>;
        })
        .then((data) => {
          const entry = data.entries.find((e) => e.id === id);
          if (entry) {
            loadOntology(entry.ontology, entry.bindings);
            // URL stays at /#/catalogue/<id> so it's shareable
          } else {
            // Unknown ontology id — open gallery so the user can pick
            navigate({ page: 'catalogue' });
          }
        })
        .catch(() => {
          // On error, open gallery
          navigate({ page: 'catalogue' });
        });
    }
  }, [route, loadOntology]);

  // Deep-link: /#/share/<data> — decode an inline-shared ontology
  useEffect(() => {
    if (route.page === 'share' && route.data) {
      decodeSharePayload(route.data)
        .then(({ ontology, bindings }) => {
          loadOntology(ontology, bindings);
        })
        .catch(() => {
          // Corrupt or invalid share link — go home
          navigate({ page: 'home' });
        });
    }
  }, [route, loadOntology]);

  // Show gallery only when at /#/catalogue (no specific ontology ID)
  const showGallery = route.page === 'catalogue' && !route.ontologyId;

  const closeGallery = useCallback(() => {
    navigate({ page: 'home' });
  }, []);

  const openGallery = useCallback(() => {
    navigate({ page: 'catalogue' });
  }, []);

  const openDesigner = useCallback(() => {
    // Load the current playground ontology into the designer
    const { currentOntology } = useAppStore.getState();
    useDesignerStore.getState().loadDraft(currentOntology);
    setShowWelcome(false);
    navigate({ page: 'designer' });
  }, []);

  const openLearn = useCallback(() => navigate({ page: 'learn' }), []);

  // ── Global keyboard shortcuts ──────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't fire when typing in inputs/textareas (except for Cmd+K)
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable;

      // Cmd+K / Ctrl+K — open command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
        return;
      }

      if (isInput) return;

      switch (e.key) {
        case '?':
          e.preventDefault();
          setShowHelp(true);
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Command palette items ──────────────────────────────
  const commands = useMemo<CommandItem[]>(() => [
    { id: 'catalogue', label: 'Open Catalogue', icon: <LayoutGrid size={18} />, action: openGallery },
    { id: 'designer', label: 'Open Designer', icon: <PenTool size={18} />, action: openDesigner },
    { id: 'learn', label: 'Open Ontology School', icon: <BookOpen size={18} />, action: openLearn },
    { id: 'import-export', label: 'Import / Export', icon: <FileJson size={18} />, action: () => setShowImportExport(true) },
    { id: 'deploy-fabric', label: 'Push to Fabric', icon: <Rocket size={18} />, action: () => setShowFabricExport(true) },
    { id: 'summary', label: 'View Summary', icon: <FileText size={18} />, action: () => setShowSummary(true) },
    { id: 'about', label: 'About & Trademark Notice', icon: <Info size={18} />, action: () => setShowAbout(true) },
    { id: 'help', label: 'Help', icon: <HelpCircle size={18} />, shortcut: '?', action: () => setShowHelp(true) },
    { id: 'data-sources', label: 'Data Sources', icon: <Database size={18} />, action: () => setShowDataSources(true) },
    { id: 'theme', label: darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode', icon: darkMode ? <Sun size={18} /> : <Moon size={18} />, action: toggleDarkMode },
  ], [darkMode, openGallery, openDesigner, openLearn, toggleDarkMode]);

  // Full-page views
  if (route.page === 'designer') {
    return <OntologyDesigner route={route} />;
  }
  if (route.page === 'learn') {
    return <LearnPage route={route} />;
  }

  return (
    <div className={`app-container ${darkMode ? '' : 'light-theme'}`}>
      <Header 
        onAboutClick={() => setShowAbout(true)}
        onHelpClick={() => setShowHelp(true)} 
        onDataSourcesClick={() => setShowDataSources(true)}
        onImportExportClick={() => setShowImportExport(true)}
        onGalleryClick={openGallery}
        onDesignerClick={openDesigner}
        onLearnClick={openLearn}
        onNLBuilderClick={AI_BUILDER_ENABLED ? () => setShowNLBuilder(true) : undefined}
        onSummaryClick={() => setShowSummary(true)}
        onDeployClick={() => setShowFabricExport(true)}
      />
      <QuestPanel />
      <OntologyGraph />
      <div className="right-sidebar">
        <SearchFilter />
        <InspectorPanel />
        <QueryPlayground />
      </div>

      {/* Mobile bottom tabs — visible only on small screens via CSS */}
      <div className="mobile-panel-tabs">
        <button className={`mobile-tab ${mobilePanel === 'graph' ? 'active' : ''}`} onClick={() => setMobilePanel('graph')}>
          <Search size={18} /> Graph
        </button>
        <button className={`mobile-tab ${mobilePanel === 'quests' ? 'active' : ''}`} onClick={() => setMobilePanel('quests')}>
          <Compass size={18} /> Quests
        </button>
        <button className={`mobile-tab ${mobilePanel === 'inspector' ? 'active' : ''}`} onClick={() => setMobilePanel('inspector')}>
          <Info size={18} /> Inspector
        </button>
        <button className={`mobile-tab ${mobilePanel === 'query' ? 'active' : ''}`} onClick={() => setMobilePanel('query')}>
          <MessageSquare size={18} /> Query
        </button>
      </div>

      {/* Mobile panel drawer — visible only on small screens when a panel is selected */}
      {mobilePanel !== 'graph' && (
        <div className="mobile-panel-drawer">
          <button className="mobile-panel-close" onClick={() => setMobilePanel('graph')}>✕ Close</button>
          {mobilePanel === 'quests' && <QuestPanel />}
          {mobilePanel === 'inspector' && (
            <>
              <SearchFilter />
              <InspectorPanel />
            </>
          )}
          {mobilePanel === 'query' && <QueryPlayground />}
        </div>
      )}

      {showTour && (
        <GuidedTour onComplete={() => { setShowTour(false); }} />
      )}

      <AnimatePresence>
        {showWelcome && !showTour && <WelcomeModal onClose={() => setShowWelcome(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {showDataSources && <DataSourcesModal onClose={() => setShowDataSources(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {showImportExport && <ImportExportModal onClose={() => setShowImportExport(false)} onFabricPush={() => { setShowImportExport(false); setShowFabricExport(true); }} />}
      </AnimatePresence>

      <AnimatePresence>
        {showFabricExport && <FabricExportModal onClose={() => { clearDeployIntent(); setShowFabricExport(false); }} />}
      </AnimatePresence>

      <AnimatePresence>
        {showGallery && <GalleryModal onClose={closeGallery} />}
      </AnimatePresence>

      {AI_BUILDER_ENABLED && NLBuilderModal && (
        <AnimatePresence>
          {showNLBuilder && (
            <Suspense fallback={null}>
              <NLBuilderModal onClose={() => setShowNLBuilder(false)} />
            </Suspense>
          )}
        </AnimatePresence>
      )}

      <AnimatePresence>
        {showSummary && <OntologySummaryModal onClose={() => setShowSummary(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {toast && <Toast message={toast.message} icon={toast.icon} />}
      </AnimatePresence>

      <AnimatePresence>
        <CommandPalette
          open={showCommandPalette}
          onClose={() => setShowCommandPalette(false)}
          commands={commands}
        />
      </AnimatePresence>

      <AppFooter />
    </div>
  );
}

export default App;
