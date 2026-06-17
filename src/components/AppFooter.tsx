import { Sparkles } from 'lucide-react';

export function AppFooter() {
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
        Built with GitHub Copilot
      </a>
      <span className="app-footer-sep">&middot;</span>
      <a href="https://github.com/videlalvaro" target="_blank" rel="noopener noreferrer">
        Supervised by videlalvaro
      </a>
      {shortCommit && (
        <>
          <span className="app-footer-sep">&middot;</span>
          {commitUrl ? (
            <a href={commitUrl} target="_blank" rel="noopener noreferrer" title={deployedCommitSha}>
              Deployed commit {shortCommit}
            </a>
          ) : (
            <span title={deployedCommitSha}>Deployed commit {shortCommit}</span>
          )}
        </>
      )}
    </footer>
  );
}
