import { useEffect } from 'react';
import { useAlignmentStore } from '../../store/alignmentStore';
import { useAppStore } from '../../store/appStore';
import { SchemaPane } from './SchemaPane';
import { QueuePane } from './QueuePane';
import { ReviewCard } from './ReviewCard';
import { VersionBadge } from './VersionBadge';

interface AlignmentWorkspaceProps {
  embedded?: boolean;
}

export function AlignmentWorkspace({ embedded = false }: AlignmentWorkspaceProps) {
  const { setWorkspaceTab } = useAppStore();
  const {
    schema,
    graph,
    queue,
    approvedFacts,
    activeCandidateId,
    mappingSelection,
    loading,
    submitting,
    error,
    lastDecision,
    loadInitialData,
    loadApprovedGraph,
    selectCandidate,
    updateMapping,
    applySuggestedMappings,
    submitActiveReview,
    undoLastDecision,
  } = useAlignmentStore();

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  const activeCandidate = queue.find((item) => item.candidate_id === activeCandidateId) ?? null;
  const approvedCount = approvedFacts.length;

  return (
    <div className={`alignment-workspace ${embedded ? 'is-embedded' : ''}`}>
      <header className={`alignment-topbar ${embedded ? 'is-embedded' : ''}`}>
        <div>
          <p className="alignment-kicker">Phase 1</p>
          <h1>{embedded ? 'Designer Review Workspace' : 'Ontology Alignment Review'}</h1>
          {embedded ? (
            <p className="alignment-topbar-copy">
              Generate queue candidates directly from the current ontology draft, then review them without leaving the designer.
            </p>
          ) : null}
        </div>
        <div className="alignment-topbar-actions">
          <VersionBadge schema={schema} />
          <button
            type="button"
            className="alignment-secondary-btn"
            disabled={approvedCount === 0}
            onClick={() => {
              void (async () => {
                await loadApprovedGraph();
                setWorkspaceTab('approved-graph');
              })();
            }}
            title={
              approvedCount === 0
                ? 'Approve at least one review candidate before building the instance graph.'
                : 'Open the graph built from approved review cards.'
            }
          >
            Build Graph from Approved Reviews
          </button>
          <button type="button" className="alignment-secondary-btn" onClick={undoLastDecision}>
            Undo Last
          </button>
        </div>
      </header>

      {error ? <div className="alignment-banner is-error">{error}</div> : null}
      {lastDecision ? (
        <div className="alignment-banner is-info">
          Saved {lastDecision.candidate_id} as {lastDecision.status}.
        </div>
      ) : null}

      <div className={`alignment-layout ${embedded ? 'is-embedded' : ''}`}>
        <SchemaPane
          schema={schema}
          graph={graph}
          mappingSelection={mappingSelection}
          onSelectMapping={updateMapping}
        />
        <main className="alignment-main-pane">
          {loading ? (
            <section className="alignment-review-card is-empty">
              <h2>Loading review workspace…</h2>
            </section>
          ) : (
            <ReviewCard
              candidate={activeCandidate}
              schema={schema}
              mappingSelection={mappingSelection}
              submitting={submitting}
              onApplySuggestions={() => {
                void applySuggestedMappings();
              }}
              onSubmit={(action) => {
                void submitActiveReview(action);
              }}
            />
          )}
        </main>
        <QueuePane
          queue={queue}
          activeCandidateId={activeCandidateId}
          onSelectCandidate={selectCandidate}
        />
      </div>
    </div>
  );
}
