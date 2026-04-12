import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { AnimatePresence } from 'framer-motion';
import { 
  Header, 
  HomeGraphWorkspace,
  HomeSidebar,
  InfoHubModal,
  QueryPlayground,
  WelcomeModal,
  AboutModal,
  HelpModal,
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
import { getAlignmentApiBaseUrl } from './lib/alignmentApiConfig';
import { fetchLlmConfigurationStatus } from './lib/diagnosticApi';
import type { Catalogue } from './types/catalogue';
import { Search, MessageSquare, Info, Compass, LayoutGrid, PenTool, BookOpen, FileJson, HelpCircle, Sun, Moon, FileText } from 'lucide-react';
import './styles/app.css';

const AI_BUILDER_ENABLED = import.meta.env.VITE_ENABLE_AI_BUILDER === 'true';

const NLBuilderModal = AI_BUILDER_ENABLED
  ? lazy(() => import('./components/NLBuilderModal').then(m => ({ default: m.NLBuilderModal })))
  : null;

function App() {
  const route = useRoute();

  const [showWelcome, setShowWelcome] = useState(false);
  const [showTour, setShowTour] = useState(() => !isTourDismissed());
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showImportExport, setShowImportExport] = useState(false);
  const [showNLBuilder, setShowNLBuilder] = useState(false);
  const [showFabricExport, setShowFabricExport] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const showGallery = route.page === 'catalogue' && !route.ontologyId;
  const [toast] = useState<{ message: string; icon: string } | null>(null);
  const [mobilePanel, setMobilePanel] = useState<'graph' | 'quests' | 'inspector' | 'query'>('graph');
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const { darkMode, loadOntology, toggleDarkMode, languageMode, alignmentApiBaseUrl, setLlmConfigurationStatus } = useAppStore();

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

  useEffect(() => {
    if (!getAlignmentApiBaseUrl()) {
      setLlmConfigurationStatus(null);
      return;
    }

    fetchLlmConfigurationStatus()
      .then((status) => {
        setLlmConfigurationStatus(status);
      })
      .catch(() => {
        setLlmConfigurationStatus(null);
      });
  }, [alignmentApiBaseUrl, setLlmConfigurationStatus]);

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

  const openReviewGraph = useCallback(() => {
    navigate({ page: 'review-graph' });
    useAppStore.getState().setWorkspaceTab('review');
  }, []);

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
    { id: 'library', label: languageMode === 'ko' ? '라이브러리 열기' : 'Open Library', icon: <LayoutGrid size={18} />, action: openGallery },
    { id: 'designer', label: languageMode === 'ko' ? '디자이너 열기' : 'Open Designer', icon: <PenTool size={18} />, action: openDesigner },
    { id: 'review-graph', label: languageMode === 'ko' ? '리뷰 & 그래프 열기' : 'Open Review & Graph', icon: <BookOpen size={18} />, action: openReviewGraph },
    { id: 'import-export', label: languageMode === 'ko' ? '가져오기 / 내보내기' : 'Import / Export', icon: <FileJson size={18} />, action: () => setShowImportExport(true) },
    { id: 'summary', label: languageMode === 'ko' ? '요약 보기' : 'View Summary', icon: <FileText size={18} />, action: () => setShowSummary(true) },
    { id: 'info', label: languageMode === 'ko' ? '안내' : 'Information', icon: <HelpCircle size={18} />, shortcut: '?', action: () => setShowHelp(true) },
    { id: 'settings', label: languageMode === 'ko' ? '설정' : 'Settings', icon: <Info size={18} />, action: () => setShowSettings(true) },
    { id: 'about', label: languageMode === 'ko' ? '소개' : 'About', icon: <Info size={18} />, action: () => setShowAbout(true) },
    { id: 'theme', label: darkMode ? (languageMode === 'ko' ? '라이트 모드로 전환' : 'Switch to Light Mode') : (languageMode === 'ko' ? '다크 모드로 전환' : 'Switch to Dark Mode'), icon: darkMode ? <Sun size={18} /> : <Moon size={18} />, action: toggleDarkMode },
  ], [darkMode, languageMode, openDesigner, openGallery, openReviewGraph, toggleDarkMode]);

  // Full-page views
  if (route.page === 'designer') {
    return <OntologyDesigner route={route} />;
  }
  if (route.page === 'review-graph') {
    return <OntologyDesigner route={{ page: 'designer' }} initialPreviewTab="review" />;
  }
  if (route.page === 'alignment') {
    return <OntologyDesigner route={{ page: 'designer' }} initialPreviewTab="review" />;
  }
  if (route.page === 'learn') {
    return <LearnPage route={route} />;
  }

  return (
    <div className={`app-container ${darkMode ? '' : 'light-theme'}`}>
      <Header 
        onAboutClick={() => setShowAbout(true)}
        onHelpClick={() => setShowHelp(true)} 
        onSettingsClick={() => setShowSettings(true)}
        onImportExportClick={() => setShowImportExport(true)}
        onGalleryClick={openGallery}
        onDesignerClick={openDesigner}
        onReviewGraphClick={openReviewGraph}
        onNLBuilderClick={AI_BUILDER_ENABLED ? () => setShowNLBuilder(true) : undefined}
        onSummaryClick={() => setShowSummary(true)}
      />
      <HomeGraphWorkspace />
      <div className="right-sidebar">
        <HomeSidebar />
      </div>

      {/* Mobile bottom tabs — visible only on small screens via CSS */}
      <div className="mobile-panel-tabs">
        <button className={`mobile-tab ${mobilePanel === 'graph' ? 'active' : ''}`} onClick={() => setMobilePanel('graph')}>
          <Search size={18} /> {languageMode === 'ko' ? '그래프' : 'Graph'}
        </button>
        <button className={`mobile-tab ${mobilePanel === 'quests' ? 'active' : ''}`} onClick={() => setMobilePanel('quests')}>
          <Compass size={18} /> {languageMode === 'ko' ? '스키마' : 'Schema'}
        </button>
        <button className={`mobile-tab ${mobilePanel === 'inspector' ? 'active' : ''}`} onClick={() => setMobilePanel('inspector')}>
          <Info size={18} /> {languageMode === 'ko' ? '인스펙터' : 'Inspector'}
        </button>
        <button className={`mobile-tab ${mobilePanel === 'query' ? 'active' : ''}`} onClick={() => setMobilePanel('query')}>
          <MessageSquare size={18} /> {languageMode === 'ko' ? '질의' : 'Query'}
        </button>
      </div>

      {/* Mobile panel drawer — visible only on small screens when a panel is selected */}
      {mobilePanel !== 'graph' && (
        <div className="mobile-panel-drawer">
          <button className="mobile-panel-close" onClick={() => setMobilePanel('graph')}>✕ {languageMode === 'ko' ? '닫기' : 'Close'}</button>
          {mobilePanel === 'quests' && <HomeGraphWorkspace />}
          {mobilePanel === 'inspector' && (
            <HomeSidebar />
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
        {showSettings && <InfoHubModal onClose={() => setShowSettings(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {showImportExport && <ImportExportModal onClose={() => setShowImportExport(false)} onFabricPush={() => { setShowImportExport(false); setShowFabricExport(true); }} />}
      </AnimatePresence>

      <AnimatePresence>
        {showGallery && <GalleryModal onClose={closeGallery} />}
      </AnimatePresence>

      <AnimatePresence>
        {showFabricExport && <FabricExportModal onClose={() => setShowFabricExport(false)} />}
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
