import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { 
  Header, 
  OntologyGraph, 
  QuestPanel, 
  InspectorPanel, 
  QueryPlayground,
  WelcomeModal,
  HelpModal,
  DataSourcesModal,
  ImportExportModal,
  Toast
} from './components';
import { useAppStore } from './store/appStore';
import './styles/app.css';

function App() {
  const [showWelcome, setShowWelcome] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [showDataSources, setShowDataSources] = useState(false);
  const [showImportExport, setShowImportExport] = useState(false);
  const [toast, setToast] = useState<{ message: string; icon: string } | null>(null);
  const { darkMode, earnedBadges } = useAppStore();

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

  return (
    <div className={`app-container ${darkMode ? '' : 'light-theme'}`}>
      <Header 
        onHelpClick={() => setShowHelp(true)} 
        onDataSourcesClick={() => setShowDataSources(true)}
        onImportExportClick={() => setShowImportExport(true)} 
      />
      <QuestPanel />
      <OntologyGraph />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
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
        {toast && <Toast message={toast.message} icon={toast.icon} />}
      </AnimatePresence>
    </div>
  );
}

export default App;
