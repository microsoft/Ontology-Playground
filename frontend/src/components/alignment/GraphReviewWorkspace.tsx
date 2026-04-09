import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { AnimatePresence } from 'framer-motion';
import { FilePlus2, Settings2, Trash2, Upload, RefreshCw } from 'lucide-react';
import { useAlignmentStore } from '../../store/alignmentStore';
import { useAppStore } from '../../store/appStore';
import { useDesignerStore } from '../../store/designerStore';
import { DesignerSchemaGraph } from '../designer/DesignerSchemaGraph';
import { SystemPromptModal } from '../designer/SystemPromptModal';
import { QueuePane } from './QueuePane';
import { ReviewCard } from './ReviewCard';
import { VersionBadge } from './VersionBadge';
import type { SourceDocumentInput } from '../../types/alignment';

interface GraphReviewWorkspaceProps {
  onOpenApprovedGraph: () => void;
}

function createSourceDocumentFromTextFile(index: number, file: File, text: string): SourceDocumentInput {
  return {
    source_doc_id: `upload_${index + 1}_${file.name.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`,
    source_doc_name: file.name,
    doc_type: 'text_upload',
    page: 1,
    text,
  };
}

export function GraphReviewWorkspace({ onOpenApprovedGraph }: GraphReviewWorkspaceProps) {
  const darkMode = useAppStore((state) => state.darkMode);
  const ontology = useDesignerStore((state) => state.ontology);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const [generatingGraph, setGeneratingGraph] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const {
    schema,
    queue,
    activeCandidateId,
    mappingSelection,
    sourceDocuments,
    extractionPromptOverride,
    loading,
    submitting,
    error,
    lastDecision,
    generateGraphFromCurrentOntology,
    loadApprovedGraph,
    setSourceDocuments,
    resetSourceDocuments,
    clearSourceDocuments,
    setExtractionPromptOverride,
    selectCandidate,
    applySuggestedMappings,
    approveAllCandidates,
    submitActiveReview,
    undoLastDecision,
  } = useAlignmentStore();

  const activeCandidate = queue.find((item) => item.candidate_id === activeCandidateId) ?? null;
  const activeCandidateIndex = queue.findIndex((item) => item.candidate_id === activeCandidateId);
  const approvedCandidateCount = queue.filter((candidate) => candidate.status === 'APPROVED_STAGED').length;

  const highlightedEntityIds = useMemo(
    () => [mappingSelection.subjectClassId, mappingSelection.objectClassId].filter(Boolean) as string[],
    [mappingSelection.objectClassId, mappingSelection.subjectClassId],
  );
  const highlightedRelationshipIds = useMemo(
    () => [mappingSelection.relationId].filter(Boolean) as string[],
    [mappingSelection.relationId],
  );

  const handleFilePick = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    const unsupported = files.filter((file) => !file.name.toLowerCase().endsWith('.txt'));
    if (unsupported.length > 0) {
      setUploadMessage('Only .txt uploads are wired in this phase. PDF and PPTX ingestion come next.');
    } else {
      setUploadMessage(null);
    }

    const textFiles = files.filter((file) => file.name.toLowerCase().endsWith('.txt'));
    if (textFiles.length === 0) return;

    const documents = await Promise.all(
      textFiles.map(async (file, index) => createSourceDocumentFromTextFile(index, file, await file.text())),
    );
    setSourceDocuments(documents);
    event.target.value = '';
  };

  const handleApproveAll = async () => {
    setApprovingAll(true);
    try {
      await approveAllCandidates();
    } finally {
      setApprovingAll(false);
    }
  };

  const handleGenerateGraph = async () => {
    setGeneratingGraph(true);
    try {
      await loadApprovedGraph();
      onOpenApprovedGraph();
    } finally {
      setGeneratingGraph(false);
    }
  };

  return (
    <div className={`graph-review-workspace ${darkMode ? '' : 'light-theme'}`}>
      <header className="alignment-topbar is-embedded">
        <div>
          <p className="alignment-kicker">Review</p>
          <h1>Extraction Review Workspace</h1>
          <p className="alignment-topbar-copy">
            Upload source notes, run extraction, then validate the mapped instances directly against your ontology graph.
          </p>
        </div>
        <div className="alignment-topbar-actions">
          <VersionBadge schema={schema} />
          <button
            type="button"
            className="alignment-secondary-btn is-upload"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={14} />
            Upload Files
          </button>
          <button
            type="button"
            className="alignment-secondary-btn is-config"
            onClick={() => setShowPromptModal(true)}
          >
            <Settings2 size={14} />
            Edit Extraction Prompt
          </button>
          <button
            type="button"
            className="alignment-secondary-btn is-extract"
            onClick={() => {
              void generateGraphFromCurrentOntology();
            }}
            disabled={loading}
          >
            <FilePlus2 size={14} />
            {loading ? 'Running Extraction…' : 'Run Extraction'}
          </button>
          <button
            type="button"
            className="alignment-secondary-btn is-generate"
            disabled={approvedCandidateCount === 0 || generatingGraph}
            onClick={() => {
              void handleGenerateGraph();
            }}
            title={
              approvedCandidateCount === 0
                ? 'Approve at least one mapped extraction before generating the graph.'
                : 'Generate the approved graph and open the graph tab.'
            }
          >
            {generatingGraph ? 'Generating…' : 'Generate Graph'}
          </button>
          <button type="button" className="alignment-secondary-btn" onClick={undoLastDecision}>
            <RefreshCw size={14} />
            Undo
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.pdf,.pptx"
          multiple
          hidden
          onChange={(event) => {
            void handleFilePick(event);
          }}
        />
      </header>

      {error ? <div className="alignment-banner is-error">{error}</div> : null}
      {uploadMessage ? <div className="alignment-banner is-info">{uploadMessage}</div> : null}
      {generatingGraph ? (
        <div className="alignment-banner is-info">
          Generating approved graph from reviewed candidates…
        </div>
      ) : null}
      {lastDecision ? (
        <div className="alignment-banner is-info">
          Saved {lastDecision.candidate_id} as {lastDecision.status}.
        </div>
      ) : null}

      <div className="graph-review-file-strip">
        {sourceDocuments.map((document) => (
          <article key={document.source_doc_id ?? document.source_doc_name} className="graph-review-file-chip">
            <strong>{document.source_doc_name}</strong>
            <small>{document.doc_type}</small>
          </article>
        ))}
        <button type="button" className="alignment-secondary-btn is-clear" onClick={clearSourceDocuments}>
          <Trash2 size={14} />
          Clear Samples
        </button>
        <button type="button" className="alignment-secondary-btn is-reset" onClick={resetSourceDocuments}>
          Reset Samples
        </button>
      </div>

      <div className="graph-review-layout">
        <section className="graph-review-canvas">
          <DesignerSchemaGraph
            ontology={ontology}
            darkMode={darkMode}
            highlightedEntityIds={highlightedEntityIds}
            highlightedRelationshipIds={highlightedRelationshipIds}
          />
        </section>

        <aside className="graph-review-sidebar">
          <QueuePane
            queue={queue}
            activeCandidateId={activeCandidateId}
            approvingAll={approvingAll}
            onApproveAll={() => {
              void handleApproveAll();
            }}
            onSelectCandidate={selectCandidate}
          />
          <ReviewCard
            candidate={activeCandidate}
            schema={schema}
            mappingSelection={mappingSelection}
            submitting={submitting}
            candidateIndex={activeCandidateIndex}
            totalCandidates={queue.length}
            onSelectPrevious={
              activeCandidateIndex > 0
                ? () => selectCandidate(queue[activeCandidateIndex - 1].candidate_id)
                : undefined
            }
            onSelectNext={
              activeCandidateIndex >= 0 && activeCandidateIndex < queue.length - 1
                ? () => selectCandidate(queue[activeCandidateIndex + 1].candidate_id)
                : undefined
            }
            onApplySuggestions={() => {
              void applySuggestedMappings();
            }}
            onSubmit={(action) => {
              void submitActiveReview(action);
            }}
          />
        </aside>
      </div>

      <AnimatePresence>
        {showPromptModal ? (
          <SystemPromptModal
            value={
              extractionPromptOverride ??
              `You are extracting graph facts from text using a user-authored ontology schema.

Extract nodes and relationships from the input text, but normalize them to the ontology labels provided in the schema.
If the text uses synonyms or paraphrases, map them to the closest ontology node label or relationship label instead of inventing a new label.
Preserve concrete identifiers and values inside node properties and relationship properties whenever the schema suggests them.
Relationship properties such as quantity, options, payment method, amount, status, dispatch dates, arrival dates, and shipment weights are important and should be captured when present.`
            }
            defaultValue={`You are extracting graph facts from text using a user-authored ontology schema.

Extract nodes and relationships from the input text, but normalize them to the ontology labels provided in the schema.
If the text uses synonyms or paraphrases, map them to the closest ontology node label or relationship label instead of inventing a new label.
Preserve concrete identifiers and values inside node properties and relationship properties whenever the schema suggests them.
Relationship properties such as quantity, options, payment method, amount, status, dispatch dates, arrival dates, and shipment weights are important and should be captured when present.`}
            onChange={(value) => setExtractionPromptOverride(value)}
            onClose={() => setShowPromptModal(false)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
