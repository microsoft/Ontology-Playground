import { Sparkles } from 'lucide-react';

export function AppFooter() {
  return (
    <footer className="app-footer">
      <a href="https://github.com/features/copilot" target="_blank" rel="noopener noreferrer">
        <Sparkles size={14} />
        Built with GitHub Copilot
      </a>
      <span className="app-footer-sep">&middot;</span>
      <a href="https://github.com/videlalvaro" target="_blank" rel="noopener noreferrer">
        Supervised by videlalvaro
      </a>
    </footer>
  );
}
