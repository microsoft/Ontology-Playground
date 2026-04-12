import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { useRoute } from '../hooks/useRoute';
import { routeToHash } from '../lib/router';
import { encodeSharePayload } from '../lib/shareCodec';
import { serializeToRDF } from '../lib/rdf/serializer';
import { Moon, Sun, HelpCircle, FileJson, LayoutGrid, Sparkles, FileText, Share2, PenTool, BookOpen, Menu, X, Download, Info, Settings2 } from 'lucide-react';

interface HeaderProps {
  onAboutClick: () => void;
  onHelpClick: () => void;
  onSettingsClick: () => void;
  onImportExportClick: () => void;
  onGalleryClick: () => void;
  onDesignerClick: () => void;
  onReviewGraphClick: () => void;
  onNLBuilderClick?: () => void;
  onSummaryClick: () => void;
}

export function Header({ onAboutClick, onHelpClick, onSettingsClick, onImportExportClick, onGalleryClick, onDesignerClick, onReviewGraphClick, onNLBuilderClick, onSummaryClick }: HeaderProps) {
  const { darkMode, toggleDarkMode, currentOntology, dataBindings, languageMode } = useAppStore();
  const route = useRoute();
  const [shareStatus, setShareStatus] = useState<'idle' | 'copying' | 'copied' | 'downloaded'>('idle');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const ontologyDisplayName = currentOntology.name || 'Untitled Ontology';
  const copy =
    languageMode === 'ko'
      ? {
          share: '공유',
          summary: '요약',
          aiBuilder: 'AI 빌더',
          library: '라이브러리',
          designer: '디자이너',
          reviewGraph: '리뷰 & 그래프',
          importExport: '가져오기 / 내보내기',
          help: '안내',
          settings: '설정',
          about: '소개',
          lightMode: '라이트 모드',
          darkMode: '다크 모드',
          copied: '복사됨!',
          downloaded: 'RDF 다운로드됨',
          encoding: '인코딩 중…',
        }
      : {
          share: 'Share',
          summary: 'Summary',
          aiBuilder: 'AI Builder',
          library: 'Library',
          designer: 'Designer',
          reviewGraph: 'Review & Graph',
          importExport: 'Import / Export',
          help: 'Information',
          settings: 'Settings',
          about: 'About',
          lightMode: 'Light Mode',
          darkMode: 'Dark Mode',
          copied: 'Copied!',
          downloaded: 'Downloaded RDF',
          encoding: 'Encoding…',
        };

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

  const shareLabel = shareStatus === 'copied' ? copy.copied : shareStatus === 'downloaded' ? copy.downloaded : shareStatus === 'copying' ? copy.encoding : copy.share;

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
          <span>{copy.summary}</span>
        </button>
        {onNLBuilderClick && (
          <button className="icon-btn" onClick={onNLBuilderClick} data-tooltip={copy.aiBuilder} aria-label={copy.aiBuilder}>
            <Sparkles size={20} />
          </button>
        )}
        <button className="icon-btn" onClick={onGalleryClick} data-tooltip={copy.library} aria-label={copy.library}>
          <LayoutGrid size={20} />
        </button>
        <button className="icon-btn" onClick={onDesignerClick} data-tooltip={copy.designer} aria-label={copy.designer}>
          <PenTool size={20} />
        </button>
        <button className="icon-btn" onClick={onReviewGraphClick} data-tooltip={copy.reviewGraph} aria-label={copy.reviewGraph}>
          <BookOpen size={20} />
        </button>
        <button className="icon-btn" onClick={onImportExportClick} data-tooltip={copy.importExport} aria-label={copy.importExport}>
          <FileJson size={20} />
        </button>
        <button className="icon-btn" onClick={onHelpClick} data-tooltip={copy.help} aria-label={copy.help}>
          <HelpCircle size={20} />
        </button>
        <button className="icon-btn" onClick={onSettingsClick} data-tooltip={copy.settings} aria-label={copy.settings}>
          <Settings2 size={20} />
        </button>
        <button className="icon-btn" onClick={onAboutClick} data-tooltip={copy.about} aria-label={copy.about}>
          <Info size={20} />
        </button>
        <button className="icon-btn" onClick={toggleDarkMode} data-tooltip={darkMode ? copy.lightMode : copy.darkMode} aria-label={darkMode ? copy.lightMode : copy.darkMode}>
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
              <FileText size={18} /> {copy.summary}
            </button>
            {onNLBuilderClick && (
              <button className="mobile-menu-item" onClick={menuAction(onNLBuilderClick)}>
                <Sparkles size={18} /> {copy.aiBuilder}
              </button>
            )}
            <button className="mobile-menu-item" onClick={menuAction(onGalleryClick)}>
              <LayoutGrid size={18} /> {copy.library}
            </button>
            <button className="mobile-menu-item" onClick={menuAction(onDesignerClick)}>
              <PenTool size={18} /> {copy.designer}
            </button>
            <button className="mobile-menu-item" onClick={menuAction(onReviewGraphClick)}>
              <BookOpen size={18} /> {copy.reviewGraph}
            </button>
            <button className="mobile-menu-item" onClick={menuAction(onImportExportClick)}>
              <FileJson size={18} /> {copy.importExport}
            </button>
            <button className="mobile-menu-item" onClick={menuAction(onHelpClick)}>
              <HelpCircle size={18} /> {copy.help}
            </button>
            <button className="mobile-menu-item" onClick={menuAction(onSettingsClick)}>
              <Settings2 size={18} /> {copy.settings}
            </button>
            <button className="mobile-menu-item" onClick={menuAction(onAboutClick)}>
              <Info size={18} /> {copy.about}
            </button>
            <button className="mobile-menu-item" onClick={menuAction(toggleDarkMode)}>
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
              {darkMode ? copy.lightMode : copy.darkMode}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
