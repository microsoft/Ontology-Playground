import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { useRoute } from '../hooks/useRoute';
import { routeToHash } from '../lib/router';
import { encodeSharePayload } from '../lib/shareCodec';
import { serializeToRDF } from '../lib/rdf/serializer';
import { Moon, Sun, HelpCircle, FileJson, LayoutGrid, Sparkles, FileText, Share2, PenTool, BookOpen, Menu, X, Download, Info } from 'lucide-react';

interface HeaderProps {
  onAboutClick: () => void;
  onHelpClick: () => void;
  onImportExportClick: () => void;
  onGalleryClick: () => void;
  onDesignerClick: () => void;
  onReviewGraphClick: () => void;
  onNLBuilderClick?: () => void;
  onSummaryClick: () => void;
}

export function Header({ onAboutClick, onHelpClick, onImportExportClick, onGalleryClick, onDesignerClick, onReviewGraphClick, onNLBuilderClick, onSummaryClick }: HeaderProps) {
  const { darkMode, toggleDarkMode, currentOntology, dataBindings } = useAppStore();
  const route = useRoute();
  const [shareStatus, setShareStatus] = useState<'idle' | 'copying' | 'copied' | 'downloaded'>('idle');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const ontologyDisplayName = currentOntology.name || 'Untitled Ontology';

  const shareableId = route.page === 'catalogue' && route.ontologyId ? route.ontologyId : null;

  const handleShare = async () => {
    if (shareStatus === 'copying') return;

    if (shareableId) {
      // Catalogue ontology — use the short deep link
      const url = `${window.location.origin}${window.location.pathname}#/catalogue/${shareableId}`;
      await navigator.clipboard.writeText(url);
      setShareStatus('copied');
      setTimeout(() => setShareStatus('idle'), 2000);
      return;
    }

    // Custom ontology — compress and encode into a share URL
    setShareStatus('copying');
    const encoded = await encodeSharePayload(currentOntology, dataBindings);
    if (encoded) {
      const url = `${window.location.origin}${window.location.pathname}#/share/${encoded}`;
      await navigator.clipboard.writeText(url);
      history.replaceState(null, '', routeToHash({ page: 'share', data: encoded }));
      setShareStatus('copied');
      setTimeout(() => setShareStatus('idle'), 2000);
    } else {
      // Too large for URL — download the RDF file instead
      const content = serializeToRDF(currentOntology, dataBindings);
      const blob = new Blob([content], { type: 'application/rdf+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${currentOntology.name.toLowerCase().replace(/\s+/g, '-')}-ontology.rdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setShareStatus('downloaded');
      setTimeout(() => setShareStatus('idle'), 3000);
    }
  };

  const shareLabel = shareStatus === 'copied' ? 'Copied!' : shareStatus === 'downloaded' ? 'Downloaded RDF' : shareStatus === 'copying' ? 'Encoding…' : 'Share';

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const menuAction = (fn: () => void) => () => { setMenuOpen(false); fn(); };

  return (
    <header className="header">
      <div className="header-logo">
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="32" height="32" rx="10" fill="#00A9E0"/>
          <circle cx="11" cy="13" r="2.2" fill="white"/>
          <circle cx="21" cy="13" r="2.2" fill="white"/>
          <path d="M10 21C11.7 23.4 14 24.6 16 24.6C18 24.6 20.3 23.4 22 21" stroke="white" strokeWidth="2.4" strokeLinecap="round"/>
          <path d="M8.5 9.5L12 6.5" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          <path d="M23.5 9.5L20 6.5" stroke="white" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <div>
          <span className="header-title">
            Oh-tology
          </span>
          <span className="header-context">{ontologyDisplayName}</span>
        </div>
      </div>

      <div className="header-actions">
        <button
          className="header-text-btn"
          onClick={handleShare}
          title={shareableId ? 'Copy shareable link to this ontology' : 'Share this ontology via link'}
          style={shareStatus === 'copied' ? { color: 'var(--ms-green, #107C10)' } : shareStatus === 'downloaded' ? { color: 'var(--ms-blue, #0078D4)' } : undefined}
        >
          {shareStatus === 'downloaded' ? <Download size={16} /> : <Share2 size={16} />}
          <span>{shareLabel}</span>
        </button>
        <button className="header-text-btn" onClick={onSummaryClick} title="View Ontology Summary">
          <FileText size={16} />
          <span>Summary</span>
        </button>
        {onNLBuilderClick && (
          <button className="icon-btn" onClick={onNLBuilderClick} data-tooltip="AI Builder" aria-label="AI Builder">
            <Sparkles size={20} />
          </button>
        )}
        <button className="icon-btn" onClick={onGalleryClick} data-tooltip="Library" aria-label="Library">
          <LayoutGrid size={20} />
        </button>
        <button className="icon-btn" onClick={onDesignerClick} data-tooltip="Designer" aria-label="Designer">
          <PenTool size={20} />
        </button>
        <button className="icon-btn" onClick={onReviewGraphClick} data-tooltip="Review & Graph" aria-label="Review & Graph">
          <BookOpen size={20} />
        </button>
        <button className="icon-btn" onClick={onImportExportClick} data-tooltip="Import / Export" aria-label="Import / Export">
          <FileJson size={20} />
        </button>
        <button className="icon-btn" onClick={onHelpClick} data-tooltip="Help" aria-label="Help">
          <HelpCircle size={20} />
        </button>
        <button className="icon-btn" onClick={onAboutClick} data-tooltip="About" aria-label="About">
          <Info size={20} />
        </button>
        <button className="icon-btn" onClick={toggleDarkMode} data-tooltip={darkMode ? 'Light Mode' : 'Dark Mode'} aria-label={darkMode ? 'Light Mode' : 'Dark Mode'}>
          {darkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>

      {/* Mobile hamburger menu */}
      <div className="header-mobile-menu" ref={menuRef}>
        <button className="icon-btn header-hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        {menuOpen && (
          <div className="mobile-menu-dropdown">
            <button className="mobile-menu-item" onClick={menuAction(handleShare)}>
              <Share2 size={18} /> {shareLabel}
            </button>
            <button className="mobile-menu-item" onClick={menuAction(onSummaryClick)}>
              <FileText size={18} /> Summary
            </button>
            {onNLBuilderClick && (
              <button className="mobile-menu-item" onClick={menuAction(onNLBuilderClick)}>
                <Sparkles size={18} /> AI Builder
              </button>
            )}
            <button className="mobile-menu-item" onClick={menuAction(onGalleryClick)}>
              <LayoutGrid size={18} /> Library
            </button>
            <button className="mobile-menu-item" onClick={menuAction(onDesignerClick)}>
              <PenTool size={18} /> Designer
            </button>
            <button className="mobile-menu-item" onClick={menuAction(onReviewGraphClick)}>
              <BookOpen size={18} /> Review & Graph
            </button>
            <button className="mobile-menu-item" onClick={menuAction(onImportExportClick)}>
              <FileJson size={18} /> Import / Export
            </button>
            <button className="mobile-menu-item" onClick={menuAction(onHelpClick)}>
              <HelpCircle size={18} /> Help
            </button>
            <button className="mobile-menu-item" onClick={menuAction(onAboutClick)}>
              <Info size={18} /> About
            </button>
            <button className="mobile-menu-item" onClick={menuAction(toggleDarkMode)}>
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
              {darkMode ? 'Light Mode' : 'Dark Mode'}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
