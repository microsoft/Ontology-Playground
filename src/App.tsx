import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { AnimatePresence } from 'framer-motion';
import { 
  Header, 
  OntologyGraph, 
  QuestPanel, 
  InspectorPanel, 
  QueryPlayground,
  SearchFilter,
  WelcomeModal,
  HelpModal,
  DataSourcesModal,
  ImportExportModal,
  GalleryModal,
  OntologySummaryModal,
  OntologyDesigner,
  LearnPage,
  Toast
} from './components';
import { useAppStore } from './store/appStore';
import { useDesignerStore } from './store/designerStore';
import { useRoute } from './hooks/useRoute';
import { navigate } from './lib/router';
import type { Catalogue } from './types/catalogue';
import './styles/app.css';

const AI_BUILDER_ENABLED = import.meta.env.VITE_ENABLE_AI_BUILDER === 'true';

const NLBuilderModal = AI_BUILDER_ENABLED
  ? lazy(() => import('./components/NLBuilderModal').then(m => ({ default: m.NLBuilderModal })))
  : null;

function App() {
  const route = useRoute();

  const [showWelcome, setShowWelcome] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [showDataSources, setShowDataSources] = useState(false);
  const [showImportExport, setShowImportExport] = useState(false);
  const [showNLBuilder, setShowNLBuilder] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [toast, setToast] = useState<{ message: string; icon: string } | null>(null);
  const { darkMode, earnedBadges, loadOntology } = useAppStore();

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
  }, [earnedBadges.length]);

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
        onHelpClick={() => setShowHelp(true)} 
        onDataSourcesClick={() => setShowDataSources(true)}
        onImportExportClick={() => setShowImportExport(true)}
        onGalleryClick={openGallery}
        onDesignerClick={openDesigner}
        onLearnClick={() => navigate({ page: 'learn' })}
        onNLBuilderClick={AI_BUILDER_ENABLED ? () => setShowNLBuilder(true) : undefined}
        onSummaryClick={() => setShowSummary(true)}
      />
      <QuestPanel />
      <OntologyGraph />
      <div className="right-sidebar">
        <SearchFilter />
        <InspectorPanel />
        <QueryPlayground />
      </div>

      <AnimatePresence>
        {showWelcome && <WelcomeModal onClose={() => setShowWelcome(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {showDataSources && <DataSourcesModal onClose={() => setShowDataSources(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {showImportExport && <ImportExportModal onClose={() => setShowImportExport(false)} />}
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
    </div>
  );
}

export default App;
