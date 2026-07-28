import { Sparkles } from 'lucide-react';
import { useT } from '../i18n';

export function AppFooter() {
  const t = useT();
  const deployedCommitSha = import.meta.env.VITE_DEPLOYED_COMMIT_SHA;
  const deployedRepo = import.meta.env.VITE_REPOSITORY;
  const shortCommit = deployedCommitSha ? deployedCommitSha.slice(0, 7) : null;
  const commitUrl = deployedCommitSha && deployedRepo
    ? `https://github.com/${deployedRepo}/commit/${deployedCommitSha}`
    : null;

  return (
    <footer className="app-footer">
      <a href="https://github.com/features/copilot" target="_blank" rel="noopener noreferrer">
        <Sparkles size={14} />
        {t('footer.builtWith')}
      </a>
      <span className="app-footer-sep">&middot;</span>
      <a href="https://github.com/videlalvaro" target="_blank" rel="noopener noreferrer">
        {t('footer.supervisedBy')}
      </a>
      {shortCommit && (
        <>
          <span className="app-footer-sep">&middot;</span>
          {commitUrl ? (
            <a href={commitUrl} target="_blank" rel="noopener noreferrer" title={deployedCommitSha}>
              {t('footer.deployedCommit', { sha: shortCommit })}
            </a>
          ) : (
            <span title={deployedCommitSha}>{t('footer.deployedCommit', { sha: shortCommit })}</span>
          )}
        </>
      )}
    </footer>
  );
}
