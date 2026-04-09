import type { QueueCandidate } from '../../types/alignment';

interface EvidencePanelProps {
  candidate: QueueCandidate | null;
}

export function EvidencePanel({ candidate }: EvidencePanelProps) {
  if (!candidate) return null;

  return (
    <section className="alignment-evidence-panel">
      <div className="alignment-card-header">
        <p className="alignment-kicker">Evidence</p>
        <h3>{candidate.source_doc_name}</h3>
      </div>
      <p className="alignment-evidence-meta">
        {candidate.doc_type} · page {candidate.page} · extraction score {candidate.extraction_confidence}
      </p>
      <blockquote>{candidate.source_snippet}</blockquote>
    </section>
  );
}
