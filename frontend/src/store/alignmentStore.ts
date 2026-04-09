import { create } from 'zustand';
import { buildGraphFromOntology, fetchApprovedFacts, fetchInstanceGraph, fetchQueue, fetchSchemaVersion, lockCandidate, submitReview } from '../lib/alignmentApi';
import { defaultSourceDocuments } from '../data/mockAlignment';
import { useAppStore } from './appStore';
import { useDesignerStore } from './designerStore';
import type { Ontology } from '../data/ontology';
import type {
  ApprovedFact,
  GraphProjection,
  InstanceGraphResponse,
  MappingSelection,
  QueueCandidate,
  QueueCandidateStatus,
  ReviewAction,
  ReviewDecisionRequest,
  ReviewDecisionResponse,
  SchemaSummary,
  SourceDocumentInput,
} from '../types/alignment';

interface HistoryEntry {
  candidateId: string;
  previousStatus: QueueCandidateStatus;
  previousLock: QueueCandidate['lock'];
  previousActiveCandidateId: string | null;
  previousMappings: MappingSelection;
}

interface AlignmentState {
  reviewerId: string;
  schema: SchemaSummary | null;
  graph: GraphProjection | null;
  queue: QueueCandidate[];
  sourceDocuments: SourceDocumentInput[];
  extractionPromptOverride: string | null;
  approvedFacts: ApprovedFact[];
  instanceGraph: InstanceGraphResponse | null;
  selectedGraphNodeId: string | null;
  selectedGraphEdgeId: string | null;
  activeCandidateId: string | null;
  mappingSelection: MappingSelection;
  lastDecision: ReviewDecisionResponse | null;
  loading: boolean;
  submitting: boolean;
  error: string | null;
  history: HistoryEntry[];
  loadInitialData: () => Promise<void>;
  generateGraphFromCurrentOntology: () => Promise<void>;
  loadApprovedGraph: () => Promise<void>;
  updateSourceDocument: (
    index: number,
    field: keyof SourceDocumentInput,
    value: string | number | null,
  ) => void;
  setSourceDocuments: (documents: SourceDocumentInput[]) => void;
  addSourceDocument: () => void;
  removeSourceDocument: (index: number) => void;
  resetSourceDocuments: () => void;
  clearSourceDocuments: () => void;
  setExtractionPromptOverride: (value: string | null) => void;
  setInstanceGraphSnapshot: (graph: InstanceGraphResponse) => void;
  selectGraphNode: (nodeId: string | null) => void;
  selectGraphEdge: (edgeId: string | null) => void;
  clearGraphSelection: () => void;
  selectCandidate: (candidateId: string) => void;
  updateMapping: (field: keyof MappingSelection, value: string | null) => void;
  applySuggestedMappings: () => Promise<void>;
  submitActiveReview: (action: ReviewAction) => Promise<void>;
  approveAllCandidates: () => Promise<void>;
  undoLastDecision: () => void;
}

function findNextOpenCandidate(queue: QueueCandidate[], currentCandidateId: string): string | null {
  const currentIndex = queue.findIndex((item) => item.candidate_id === currentCandidateId);
  if (currentIndex === -1) {
    return queue.find((item) => item.status === 'NEW')?.candidate_id ?? null;
  }

  const next = queue.slice(currentIndex + 1).find((item) => item.status === 'NEW');
  if (next) return next.candidate_id;

  return queue.find((item) => item.status === 'NEW')?.candidate_id ?? null;
}

function getSuggestedMapping(candidate: QueueCandidate | undefined): MappingSelection {
  return {
    subjectClassId: candidate?.suggestions.subject[0]?.target_id ?? null,
    relationId: candidate?.suggestions.relation[0]?.target_id ?? null,
    objectClassId: candidate?.suggestions.object[0]?.target_id ?? null,
  };
}

function hasActiveLock(candidate: QueueCandidate | undefined, reviewerId: string): boolean {
  if (!candidate?.lock) {
    return false;
  }

  return (
    candidate.lock.locked_by === reviewerId &&
    new Date(candidate.lock.expires_at).getTime() > Date.now()
  );
}

function resolveCurrentOntology(): Ontology {
  const draftOntology = useDesignerStore.getState().ontology;
  if (draftOntology.entityTypes.length > 0 || draftOntology.relationships.length > 0) {
    return draftOntology;
  }
  return useAppStore.getState().currentOntology;
}

export const useAlignmentStore = create<AlignmentState>((set, get) => ({
  reviewerId: 'reviewer_demo',
  schema: null,
  graph: null,
  queue: [],
  sourceDocuments: structuredClone(defaultSourceDocuments),
  extractionPromptOverride: null,
  approvedFacts: [],
  instanceGraph: null,
  selectedGraphNodeId: null,
  selectedGraphEdgeId: null,
  activeCandidateId: null,
  mappingSelection: {
    subjectClassId: null,
    relationId: null,
    objectClassId: null,
  },
  lastDecision: null,
  loading: false,
  submitting: false,
  error: null,
  history: [],

  loadInitialData: async () => {
    set({ loading: true, error: null });
    try {
      const queuePage = await fetchQueue();
      const schema = await fetchSchemaVersion(queuePage.active_schema_version_id);
      const activeCandidateId = queuePage.items[0]?.candidate_id ?? null;
      const activeCandidate = queuePage.items.find((item) => item.candidate_id === activeCandidateId);
      set({
        schema,
        graph: null,
        queue: queuePage.items,
        activeCandidateId,
        mappingSelection: getSuggestedMapping(activeCandidate),
        lastDecision: null,
        loading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load alignment data.';
      set({ loading: false, error: message });
    }
  },

  generateGraphFromCurrentOntology: async () => {
    set({ loading: true, error: null });
    try {
      const graphRun = await buildGraphFromOntology(
        resolveCurrentOntology(),
        get().reviewerId,
        get().sourceDocuments,
        get().extractionPromptOverride,
      );
      const activeCandidateId = graphRun.queue.items[0]?.candidate_id ?? null;
      const activeCandidate = graphRun.queue.items.find((item) => item.candidate_id === activeCandidateId);
      set({
        schema: graphRun.schema,
        graph: graphRun.graph,
        queue: graphRun.queue.items,
        approvedFacts: [],
        instanceGraph: null,
        selectedGraphNodeId: null,
        selectedGraphEdgeId: null,
        activeCandidateId,
        mappingSelection: getSuggestedMapping(activeCandidate),
        lastDecision: null,
        history: [],
        loading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to build graph from the current ontology.';
      set({ loading: false, error: message });
    }
  },

  loadApprovedGraph: async () => {
    set({ loading: true, error: null });
    try {
      const [approvedFacts, instanceGraph] = await Promise.all([
        fetchApprovedFacts(),
        fetchInstanceGraph(),
      ]);
      set({
        approvedFacts: approvedFacts.items,
        instanceGraph,
        selectedGraphNodeId: null,
        selectedGraphEdgeId: null,
        loading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load the approved graph.';
      set({ loading: false, error: message });
    }
  },

  updateSourceDocument: (index, field, value) =>
    set((state) => ({
      sourceDocuments: state.sourceDocuments.map((document, documentIndex) =>
        documentIndex === index
          ? {
              ...document,
              [field]: field === 'page' ? Number(value) || 1 : value,
            }
          : document,
        ),
    })),

  setSourceDocuments: (documents) =>
    set({
      sourceDocuments: documents,
    }),

  addSourceDocument: () =>
    set((state) => ({
      sourceDocuments: [
        ...state.sourceDocuments,
        {
          source_doc_id: `draft_doc_${state.sourceDocuments.length + 1}`,
          source_doc_name: `draft-note-${state.sourceDocuments.length + 1}.txt`,
          doc_type: 'maintenance_log',
          page: 1,
          text: '',
        },
      ],
    })),

  removeSourceDocument: (index) =>
    set((state) => ({
      sourceDocuments:
        state.sourceDocuments.length > 1
          ? state.sourceDocuments.filter((_, documentIndex) => documentIndex !== index)
          : state.sourceDocuments,
    })),

  resetSourceDocuments: () =>
    set({
      sourceDocuments: structuredClone(defaultSourceDocuments),
    }),

  clearSourceDocuments: () =>
    set({
      sourceDocuments: [],
    }),

  setExtractionPromptOverride: (value) =>
    set({
      extractionPromptOverride: value,
    }),

  setInstanceGraphSnapshot: (graph) =>
    set({
      instanceGraph: graph,
      approvedFacts: [],
      selectedGraphNodeId: null,
      selectedGraphEdgeId: null,
    }),

  selectGraphNode: (nodeId) =>
    set({
      selectedGraphNodeId: nodeId,
      selectedGraphEdgeId: null,
    }),

  selectGraphEdge: (edgeId) =>
    set({
      selectedGraphEdgeId: edgeId,
      selectedGraphNodeId: null,
    }),

  clearGraphSelection: () =>
    set({
      selectedGraphNodeId: null,
      selectedGraphEdgeId: null,
    }),

  selectCandidate: (candidateId) => {
    const candidate = get().queue.find((item) => item.candidate_id === candidateId);
    set({
      activeCandidateId: candidateId,
      mappingSelection: getSuggestedMapping(candidate),
      error: null,
    });
  },

  updateMapping: (field, value) =>
    set((state) => ({
      mappingSelection: {
        ...state.mappingSelection,
        [field]: value,
      },
    })),

  applySuggestedMappings: async () => {
    const { activeCandidateId, queue, reviewerId } = get();
    if (!activeCandidateId) return;

    const candidate = queue.find((item) => item.candidate_id === activeCandidateId);
    if (!candidate) return;

    try {
      const lockResponse = await lockCandidate(activeCandidateId, {
        reviewer_id: reviewerId,
        lock_timeout_seconds: 300,
      });
      set((state) => ({
        queue: state.queue.map((item) =>
          item.candidate_id === activeCandidateId
            ? {
                ...item,
                status: lockResponse.status,
                lock: lockResponse.lock,
              }
            : item,
        ),
        mappingSelection: getSuggestedMapping(candidate),
        error: null,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to lock candidate.';
      set({ error: message });
    }
  },

  submitActiveReview: async (action) => {
    const {
      activeCandidateId,
      mappingSelection,
      queue,
      reviewerId,
      schema,
      history,
    } = get();

    if (!activeCandidateId || !schema) return;

    const candidate = queue.find((item) => item.candidate_id === activeCandidateId);
    if (!candidate) return;

    const request: ReviewDecisionRequest = {
      candidate_id: candidate.candidate_id,
      schema_version_id: schema.schema_version_id,
      reviewer_id: reviewerId,
      action,
      mapped_subject_class_id: action === 'REJECT' ? null : mappingSelection.subjectClassId,
      mapped_relation_id: action === 'REJECT' ? null : mappingSelection.relationId,
      mapped_object_class_id: action === 'REJECT' ? null : mappingSelection.objectClassId,
      reason_code:
        action === 'APPROVE'
          ? 'MATCH_CONFIRMED'
          : action === 'REJECT'
            ? 'EXTRACTION_INVALID'
            : 'NEEDS_SCHEMA_CHANGE',
      comment: null,
      idempotency_key: `${reviewerId}-${candidate.candidate_id}-${action.toLowerCase()}-${schema.version}`,
    };

    set({ submitting: true, error: null });

    try {
      if (!hasActiveLock(candidate, reviewerId)) {
        const lockResponse = await lockCandidate(activeCandidateId, {
          reviewer_id: reviewerId,
          lock_timeout_seconds: 300,
        });

        set((state) => ({
          queue: state.queue.map((item) =>
            item.candidate_id === activeCandidateId
              ? {
                  ...item,
                  status: lockResponse.status,
                  lock: lockResponse.lock,
                }
              : item,
          ),
        }));
      }

      const response = await submitReview(request);
      const nextActiveCandidateId =
        response.next_candidate_id ?? findNextOpenCandidate(queue, activeCandidateId);

      set((state) => ({
        queue: state.queue.map((item) =>
          item.candidate_id === activeCandidateId
            ? {
                ...item,
                status: response.status,
                lock: null,
                assigned_reviewer_id: reviewerId,
              }
            : item,
        ),
        history: [
          ...history,
          {
            candidateId: candidate.candidate_id,
            previousStatus: candidate.status,
            previousLock: candidate.lock,
            previousActiveCandidateId: state.activeCandidateId,
            previousMappings: state.mappingSelection,
          },
        ],
        lastDecision: response,
        activeCandidateId: nextActiveCandidateId,
        mappingSelection: getSuggestedMapping(
          state.queue.find((item) => item.candidate_id === nextActiveCandidateId),
        ),
        submitting: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to submit review.';
      set({ submitting: false, error: message });
    }
  },

  approveAllCandidates: async () => {
    const { queue, reviewerId, schema } = get();
    if (!schema) return;

    const pendingCandidates = queue.filter((candidate) =>
      candidate.status === 'NEW' || candidate.status === 'IN_REVIEW',
    );
    if (pendingCandidates.length === 0) return;

    set({ submitting: true, error: null });

    try {
      for (const candidate of pendingCandidates) {
        const mappingSelection = getSuggestedMapping(candidate);
        if (!mappingSelection.subjectClassId || !mappingSelection.relationId || !mappingSelection.objectClassId) {
          continue;
        }

        if (!hasActiveLock(candidate, reviewerId)) {
          const lockResponse = await lockCandidate(candidate.candidate_id, {
            reviewer_id: reviewerId,
            lock_timeout_seconds: 300,
          });

          set((state) => ({
            queue: state.queue.map((item) =>
              item.candidate_id === candidate.candidate_id
                ? {
                    ...item,
                    status: lockResponse.status,
                    lock: lockResponse.lock,
                  }
                : item,
            ),
          }));
        }

        const response = await submitReview({
          candidate_id: candidate.candidate_id,
          schema_version_id: schema.schema_version_id,
          reviewer_id: reviewerId,
          action: 'APPROVE',
          mapped_subject_class_id: mappingSelection.subjectClassId,
          mapped_relation_id: mappingSelection.relationId,
          mapped_object_class_id: mappingSelection.objectClassId,
          reason_code: 'MATCH_CONFIRMED',
          comment: 'Approved in bulk using the top suggested mapping.',
          idempotency_key: `${reviewerId}-${candidate.candidate_id}-approve-bulk-${schema.version}`,
        });

        set((state) => ({
          queue: state.queue.map((item) =>
            item.candidate_id === candidate.candidate_id
              ? {
                  ...item,
                  status: response.status,
                  lock: null,
                  assigned_reviewer_id: reviewerId,
                }
              : item,
          ),
          lastDecision: response,
        }));
      }

      const nextCandidate = get().queue.find((candidate) => candidate.status === 'NEW') ?? null;
      set({
        activeCandidateId: nextCandidate?.candidate_id ?? null,
        mappingSelection: getSuggestedMapping(nextCandidate ?? undefined),
        submitting: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to approve all candidates.';
      set({ submitting: false, error: message });
    }
  },

  undoLastDecision: () => {
    const { history, queue } = get();
    const lastEntry = history[history.length - 1];
    if (!lastEntry) return;

    const restoredCandidate = queue.find((item) => item.candidate_id === lastEntry.candidateId);
    if (!restoredCandidate) return;

      set({
      queue: queue.map((item) =>
        item.candidate_id === lastEntry.candidateId
          ? {
              ...item,
              status: lastEntry.previousStatus,
              lock: lastEntry.previousLock,
            }
          : item,
      ),
      activeCandidateId: lastEntry.previousActiveCandidateId,
      mappingSelection: lastEntry.previousMappings,
      history: history.slice(0, -1),
      lastDecision: null,
      error: null,
    });
  },
}));
