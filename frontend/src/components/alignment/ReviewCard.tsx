import type { MappingSelection, QueueCandidate, ReviewAction, SchemaSummary } from '../../types/alignment';
import { EvidencePanel } from './EvidencePanel';

interface ReviewCardProps {
  candidate: QueueCandidate | null;
  schema: SchemaSummary | null;
  mappingSelection: MappingSelection;
  submitting: boolean;
  candidateIndex?: number;
  totalCandidates?: number;
  onSelectPrevious?: () => void;
  onSelectNext?: () => void;
  onApplySuggestions: () => void;
  onSubmit: (action: ReviewAction) => void;
}

function resolveName(schema: SchemaSummary | null, type: 'class' | 'relation', id: string | null): string {
  if (!schema || !id) return 'Unmapped';
  if (type === 'class') {
    return schema.classes.find((item) => item.class_id === id)?.name ?? 'Unknown';
  }
  return schema.relations.find((item) => item.relation_id === id)?.name ?? 'Unknown';
}

function renderProperties(properties: Record<string, string | number | boolean | null> | undefined) {
  const entries = Object.entries(properties ?? {});
  if (entries.length === 0) {
    return <p className="alignment-raw-empty">No extracted properties</p>;
  }

  return (
    <div className="alignment-chip-row">
      {entries.map(([key, value]) => (
        <span key={key} className="alignment-chip">
          {key}: {String(value)}
        </span>
      ))}
    </div>
  );
}

export function ReviewCard({
  candidate,
  schema,
  mappingSelection,
  submitting,
  candidateIndex = 0,
  totalCandidates = 0,
  onSelectPrevious,
  onSelectNext,
  onApplySuggestions,
  onSubmit,
}: ReviewCardProps) {
  if (!candidate) {
    return (
      <section className="alignment-review-card is-empty">
        <h2>Queue Complete</h2>
        <p>No active candidate is selected.</p>
      </section>
    );
  }

  return (
    <section className="alignment-review-card">
      <div className="alignment-card-header">
        <div>
          <p className="alignment-kicker">Extraction Review</p>
          <h2>{candidate.candidate_id}</h2>
          <p>{totalCandidates > 0 ? `${candidateIndex + 1} of ${totalCandidates}` : 'Current candidate'}</p>
        </div>
        <div className="alignment-card-actions">
          <button
            type="button"
            className="alignment-secondary-btn"
            onClick={onSelectPrevious}
            disabled={!onSelectPrevious}
          >
            Previous
          </button>
          <button
            type="button"
            className="alignment-secondary-btn"
            onClick={onSelectNext}
            disabled={!onSelectNext}
          >
            Next
          </button>
          <button type="button" className="alignment-secondary-btn" onClick={onApplySuggestions}>
            Apply Suggestions
          </button>
        </div>
      </div>

      <div className="alignment-triple-grid">
        <div className="alignment-triple-cell">
          <span>Subject</span>
          <strong>{candidate.subject_text}</strong>
          <small>{resolveName(schema, 'class', mappingSelection.subjectClassId)}</small>
        </div>
        <div className="alignment-triple-cell">
          <span>Relation</span>
          <strong>{candidate.relation_text}</strong>
          <small>{resolveName(schema, 'relation', mappingSelection.relationId)}</small>
        </div>
        <div className="alignment-triple-cell">
          <span>Object</span>
          <strong>{candidate.object_text}</strong>
          <small>{resolveName(schema, 'class', mappingSelection.objectClassId)}</small>
        </div>
      </div>

      {candidate.raw_extraction?.relation.properties && Object.keys(candidate.raw_extraction.relation.properties).length > 0 ? (
        <section className="alignment-evidence-panel">
          <div className="alignment-card-header">
            <p className="alignment-kicker">Extracted Properties</p>
            <h3>Relation Attributes Found In Text</h3>
          </div>
          {renderProperties(candidate.raw_extraction.relation.properties)}
        </section>
      ) : null}

      <div className="alignment-suggestion-grid">
        <div>
          <span className="alignment-suggestion-label">Subject hint</span>
          <p>{candidate.suggestions.subject[0]?.target_name ?? 'No suggestion'}</p>
        </div>
        <div>
          <span className="alignment-suggestion-label">Relation hint</span>
          <p>{candidate.suggestions.relation[0]?.target_name ?? 'No suggestion'}</p>
        </div>
        <div>
          <span className="alignment-suggestion-label">Object hint</span>
          <p>{candidate.suggestions.object[0]?.target_name ?? 'No suggestion'}</p>
        </div>
      </div>

      <EvidencePanel candidate={candidate} />

      <section className="alignment-evidence-panel">
        <div className="alignment-card-header">
          <p className="alignment-kicker">Raw Extraction</p>
          <h3>LLM Output Before Mapping</h3>
        </div>

        {candidate.raw_extraction ? (
          <div className="alignment-suggestion-grid">
            <div>
              <span className="alignment-suggestion-label">Subject Label</span>
              <p>{candidate.raw_extraction.subject.label}</p>
              {renderProperties(candidate.raw_extraction.subject.properties)}
            </div>
            <div>
              <span className="alignment-suggestion-label">Relation Type</span>
              <p>{candidate.raw_extraction.relation.type}</p>
              {renderProperties(candidate.raw_extraction.relation.properties)}
            </div>
            <div>
              <span className="alignment-suggestion-label">Object Label</span>
              <p>{candidate.raw_extraction.object.label}</p>
              {renderProperties(candidate.raw_extraction.object.properties)}
            </div>
          </div>
        ) : (
          <p className="alignment-raw-empty">
            Raw extraction is not available for this candidate yet. Run extraction again on the current documents to populate the LLM output preview.
          </p>
        )}
      </section>

      <div className="alignment-action-row">
        <button
          type="button"
          className="alignment-action-btn is-approve"
          onClick={() => onSubmit('APPROVE')}
          disabled={submitting}
        >
          Approve
        </button>
        <button
          type="button"
          className="alignment-action-btn is-defer"
          onClick={() => onSubmit('DEFER')}
          disabled={submitting}
        >
          Defer
        </button>
        <button
          type="button"
          className="alignment-action-btn is-reject"
          onClick={() => onSubmit('REJECT')}
          disabled={submitting}
        >
          Reject
        </button>
      </div>
    </section>
  );
}
