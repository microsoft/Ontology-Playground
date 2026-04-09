import type { QueueCandidate } from '../../types/alignment';

interface QueuePaneProps {
  queue: QueueCandidate[];
  activeCandidateId: string | null;
  approvingAll?: boolean;
  onApproveAll?: () => void;
  onSelectCandidate: (candidateId: string) => void;
}

export function QueuePane({
  queue,
  activeCandidateId,
  approvingAll = false,
  onApproveAll,
  onSelectCandidate,
}: QueuePaneProps) {
  return (
    <aside className="alignment-pane alignment-queue-pane">
      <div className="alignment-pane-header">
        <p className="alignment-kicker">Extraction Queue</p>
        <h2>Review Inbox</h2>
        <p>{queue.length} extracted candidates. Select one to inspect its mapping details.</p>
        <div className="alignment-card-actions">
          <button
            type="button"
            className="alignment-secondary-btn is-approve-all"
            onClick={onApproveAll}
            disabled={!onApproveAll || queue.length === 0 || approvingAll}
          >
            {approvingAll ? 'Approving…' : 'Approve All'}
          </button>
        </div>
      </div>

      <div className="alignment-queue-list">
        {queue.map((candidate) => (
          <button
            key={candidate.candidate_id}
            type="button"
            className={`alignment-queue-item ${candidate.candidate_id === activeCandidateId ? 'is-active' : ''}`}
            onClick={() => onSelectCandidate(candidate.candidate_id)}
          >
            <div className="alignment-queue-item-header">
              <strong>{candidate.subject_text}</strong>
              <span className={`alignment-status-pill is-${candidate.status.toLowerCase()}`}>
                {candidate.status}
              </span>
            </div>
            <div className="alignment-chip-row">
              <span className="alignment-chip is-relation">{candidate.relation_text}</span>
              <span className="alignment-chip">{candidate.object_text}</span>
            </div>
            <p>{candidate.source_doc_name}</p>
            <small>
              candidate {candidate.candidate_id} · page {candidate.page}
            </small>
            {candidate.raw_extraction?.relation.properties && Object.keys(candidate.raw_extraction.relation.properties).length > 0 ? (
              <div className="alignment-chip-row">
                {Object.entries(candidate.raw_extraction.relation.properties).map(([key, value]) => (
                  <span key={key} className="alignment-chip is-raw">
                    {key}: {String(value)}
                  </span>
                ))}
              </div>
            ) : null}
          </button>
        ))}
      </div>
    </aside>
  );
}
