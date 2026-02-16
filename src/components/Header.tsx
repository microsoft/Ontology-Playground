import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useRoute } from '../hooks/useRoute';
import { Moon, Sun, Database, Trophy, HelpCircle, FileJson, LayoutGrid, Sparkles, FileText, Share2, PenTool, BookOpen } from 'lucide-react';

interface HeaderProps {
  onHelpClick: () => void;
  onDataSourcesClick: () => void;
  onImportExportClick: () => void;
  onGalleryClick: () => void;
  onDesignerClick: () => void;
  onLearnClick: () => void;
  onNLBuilderClick?: () => void;
  onSummaryClick: () => void;
}

export function Header({ onHelpClick, onDataSourcesClick, onImportExportClick, onGalleryClick, onDesignerClick, onLearnClick, onNLBuilderClick, onSummaryClick }: HeaderProps) {
  const { darkMode, toggleDarkMode, totalPoints, earnedBadges, currentOntology } = useAppStore();
  const route = useRoute();
  const [copied, setCopied] = useState(false);

  const ontologyDisplayName = currentOntology.name || 'Untitled Ontology';

  const shareableId = route.page === 'catalogue' && route.ontologyId ? route.ontologyId : null;

  const handleShare = () => {
    if (!shareableId) return;
    const url = `${window.location.origin}${window.location.pathname}#/catalogue/${shareableId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <header className="header">
      <div className="header-logo">
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="32" height="32" rx="4" fill="#0078D4"/>
          <path d="M8 8H15V15H8V8Z" fill="white"/>
          <path d="M17 8H24V15H17V8Z" fill="white" opacity="0.7"/>
          <path d="M8 17H15V24H8V17Z" fill="white" opacity="0.7"/>
          <path d="M17 17H24V24H17V17Z" fill="white" opacity="0.5"/>
        </svg>
        <div>
          <span className="header-title">{ontologyDisplayName}</span>
          <span className="header-subtitle">Ontology Playground (Preview) · Microsoft Fabric IQ</span>
        </div>
      </div>

      <div className="header-stats">
        <div className="stat-item">
          <Trophy size={18} />
          <span className="stat-value">{totalPoints}</span>
          <span>points</span>
        </div>
        <div className="stat-item">
          <span style={{ fontSize: 18 }}>🏆</span>
          <span className="stat-value">{earnedBadges.length}</span>
          <span>badges</span>
        </div>
      </div>

      <div className="header-actions">
        {shareableId && (
          <button
            className="header-text-btn"
            onClick={handleShare}
            title="Copy shareable link to this ontology"
            style={copied ? { color: 'var(--ms-green, #107C10)' } : undefined}
          >
            <Share2 size={16} />
            <span>{copied ? 'Copied!' : 'Share'}</span>
          </button>
        )}
        <button className="header-text-btn" onClick={onSummaryClick} title="View Ontology Summary">
          <FileText size={16} />
          <span>Summary</span>
        </button>
        {onNLBuilderClick && (
          <button className="icon-btn" onClick={onNLBuilderClick} data-tooltip="AI Builder">
            <Sparkles size={20} />
          </button>
        )}
        <button className="icon-btn" onClick={onGalleryClick} data-tooltip="Catalogue">
          <LayoutGrid size={20} />
        </button>
        <button className="icon-btn" onClick={onDesignerClick} data-tooltip="Designer">
          <PenTool size={20} />
        </button>
        <button className="icon-btn" onClick={onLearnClick} data-tooltip="Learn">
          <BookOpen size={20} />
        </button>
        <button className="icon-btn" onClick={onImportExportClick} data-tooltip="Import / Export">
          <FileJson size={20} />
        </button>
        <button className="icon-btn" onClick={onHelpClick} data-tooltip="Help">
          <HelpCircle size={20} />
        </button>
        <button className="icon-btn" onClick={onDataSourcesClick} data-tooltip="Data Sources">
          <Database size={20} />
        </button>
        <button className="icon-btn" onClick={toggleDarkMode} data-tooltip={darkMode ? 'Light Mode' : 'Dark Mode'}>
          {darkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>
    </header>
  );
}
