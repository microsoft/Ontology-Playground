import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ApprovedFactsResponse,
  CandidateLockResponse,
  InstanceGraphResponse,
  OntologyGraphBuildResponse,
  QueueCandidate,
  ReviewDecisionResponse,
  SchemaSummary,
  SourceDocumentInput,
} from '../types/alignment';
import { mockQueueCandidates, mockSchemaSummary } from '../data/mockAlignment';

const { buildGraphFromOntologyMock, fetchApprovedFactsMock, fetchInstanceGraphMock, lockCandidateMock, submitReviewMock } = vi.hoisted(() => ({
  buildGraphFromOntologyMock: vi.fn<
    (ontology: unknown, editorId: string, sourceDocuments?: SourceDocumentInput[]) => Promise<OntologyGraphBuildResponse>
  >(),
  fetchApprovedFactsMock: vi.fn<() => Promise<ApprovedFactsResponse>>(),
  fetchInstanceGraphMock: vi.fn<() => Promise<InstanceGraphResponse>>(),
  lockCandidateMock: vi.fn<
    (
      candidateId: string,
      request: { reviewer_id: string; lock_timeout_seconds: number },
    ) => Promise<CandidateLockResponse>
  >(),
  submitReviewMock: vi.fn<
    (request: { candidate_id: string }) => Promise<ReviewDecisionResponse>
  >(),
}));

vi.mock('../lib/alignmentApi', () => ({
  buildGraphFromOntology: buildGraphFromOntologyMock,
  fetchApprovedFacts: fetchApprovedFactsMock,
  fetchInstanceGraph: fetchInstanceGraphMock,
  fetchQueue: vi.fn(),
  fetchSchemaVersion: vi.fn(),
  lockCandidate: lockCandidateMock,
  submitReview: submitReviewMock,
}));

import { useAlignmentStore } from './alignmentStore';

function createQueueCandidate(overrides: Partial<QueueCandidate> = {}): QueueCandidate {
  return {
    ...structuredClone(mockQueueCandidates[0]),
    ...overrides,
  };
}

function createSchema(overrides: Partial<SchemaSummary> = {}): SchemaSummary {
  return {
    ...structuredClone(mockSchemaSummary),
    ...overrides,
  };
}

beforeEach(() => {
  buildGraphFromOntologyMock.mockReset();
  fetchApprovedFactsMock.mockReset();
  fetchInstanceGraphMock.mockReset();
  lockCandidateMock.mockReset();
  submitReviewMock.mockReset();
  useAlignmentStore.setState({
    reviewerId: 'reviewer_demo',
    schema: createSchema(),
    graph: null,
    queue: [],
    sourceDocuments: [
      {
        source_doc_id: 'doc_1',
        source_doc_name: 'note-1.txt',
        doc_type: 'maintenance_log',
        page: 1,
        text: 'Technician Kim inspected pump P-101.',
      },
    ],
    approvedFacts: [],
    instanceGraph: null,
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
  });
});

describe('useAlignmentStore submitActiveReview', () => {
  it('locks the candidate before submitting when no active lock exists', async () => {
    const candidate = createQueueCandidate();
    useAlignmentStore.setState({
      queue: [candidate],
      activeCandidateId: candidate.candidate_id,
      mappingSelection: {
        subjectClassId: candidate.suggestions.subject[0]?.target_id ?? null,
        relationId: candidate.suggestions.relation[0]?.target_id ?? null,
        objectClassId: candidate.suggestions.object[0]?.target_id ?? null,
      },
    });

    lockCandidateMock.mockResolvedValue({
      candidate_id: candidate.candidate_id,
      status: 'IN_REVIEW',
      lock: {
        locked_by: 'reviewer_demo',
        locked_at: '2026-04-08T10:00:00Z',
        expires_at: '2099-04-08T10:05:00Z',
      },
    });
    submitReviewMock.mockResolvedValue({
      review_decision_id: 'review_0001',
      candidate_id: candidate.candidate_id,
      status: 'APPROVED_STAGED',
      staging_fact_id: 'staging_fact_0001',
      schema_version_id: mockSchemaSummary.schema_version_id,
      reviewed_at: '2026-04-08T10:01:00Z',
      next_candidate_id: null,
    });

    await useAlignmentStore.getState().submitActiveReview('APPROVE');

    expect(lockCandidateMock).toHaveBeenCalledWith(candidate.candidate_id, {
      reviewer_id: 'reviewer_demo',
      lock_timeout_seconds: 300,
    });
    expect(submitReviewMock).toHaveBeenCalledOnce();
    expect(useAlignmentStore.getState().queue[0]?.status).toBe('APPROVED_STAGED');
  });

  it('reuses an active lock owned by the current reviewer', async () => {
    const candidate = createQueueCandidate({
      status: 'IN_REVIEW',
      lock: {
        locked_by: 'reviewer_demo',
        locked_at: '2026-04-08T10:00:00Z',
        expires_at: '2099-04-08T10:05:00Z',
      },
    });
    useAlignmentStore.setState({
      queue: [candidate],
      activeCandidateId: candidate.candidate_id,
      mappingSelection: {
        subjectClassId: candidate.suggestions.subject[0]?.target_id ?? null,
        relationId: candidate.suggestions.relation[0]?.target_id ?? null,
        objectClassId: candidate.suggestions.object[0]?.target_id ?? null,
      },
    });

    submitReviewMock.mockResolvedValue({
      review_decision_id: 'review_0002',
      candidate_id: candidate.candidate_id,
      status: 'DEFERRED',
      staging_fact_id: null,
      schema_version_id: mockSchemaSummary.schema_version_id,
      reviewed_at: '2026-04-08T10:02:00Z',
      next_candidate_id: null,
    });

    await useAlignmentStore.getState().submitActiveReview('DEFER');

    expect(lockCandidateMock).not.toHaveBeenCalled();
    expect(submitReviewMock).toHaveBeenCalledOnce();
    expect(useAlignmentStore.getState().queue[0]?.status).toBe('DEFERRED');
  });
});

describe('useAlignmentStore approveAllCandidates', () => {
  it('approves all pending candidates using suggested mappings', async () => {
    const first = createQueueCandidate({
      candidate_id: 'cand_0001',
      status: 'NEW',
    });
    const second = createQueueCandidate({
      candidate_id: 'cand_0002',
      status: 'NEW',
    });

    lockCandidateMock.mockResolvedValue({
      candidate_id: 'cand_0001',
      status: 'IN_REVIEW',
      lock: {
        locked_by: 'reviewer_demo',
        locked_at: '2026-04-08T10:00:00Z',
        expires_at: '2099-04-08T10:05:00Z',
      },
    });
    submitReviewMock
      .mockResolvedValueOnce({
        review_decision_id: 'review_0001',
        candidate_id: 'cand_0001',
        status: 'APPROVED_STAGED',
        staging_fact_id: 'staging_fact_0001',
        schema_version_id: mockSchemaSummary.schema_version_id,
        reviewed_at: '2026-04-08T10:01:00Z',
        next_candidate_id: 'cand_0002',
      })
      .mockResolvedValueOnce({
        review_decision_id: 'review_0002',
        candidate_id: 'cand_0002',
        status: 'APPROVED_STAGED',
        staging_fact_id: 'staging_fact_0002',
        schema_version_id: mockSchemaSummary.schema_version_id,
        reviewed_at: '2026-04-08T10:02:00Z',
        next_candidate_id: null,
      });

    useAlignmentStore.setState({
      queue: [first, second],
      activeCandidateId: first.candidate_id,
    });

    await useAlignmentStore.getState().approveAllCandidates();

    expect(submitReviewMock).toHaveBeenCalledTimes(2);
    expect(useAlignmentStore.getState().queue.every((candidate) => candidate.status === 'APPROVED_STAGED')).toBe(true);
  });
});

describe('useAlignmentStore generateGraphFromCurrentOntology', () => {
  it('passes source documents to the graph generation request', async () => {
    buildGraphFromOntologyMock.mockResolvedValue({
      extraction_run_id: 'extract_run_001',
      generated_at: '2026-04-08T10:00:00Z',
      schema: createSchema(),
      queue: {
        items: [createQueueCandidate()],
        page: 1,
        page_size: 20,
        total_items: 1,
        total_pages: 1,
        active_schema_version_id: mockSchemaSummary.schema_version_id,
      },
      graph: {
        nodes: [],
        relationships: [],
      },
      source_documents_used: 1,
    });

    await useAlignmentStore.getState().generateGraphFromCurrentOntology();

    expect(buildGraphFromOntologyMock).toHaveBeenCalledWith(
      expect.anything(),
      'reviewer_demo',
      [
        expect.objectContaining({
          source_doc_id: 'doc_1',
          source_doc_name: 'note-1.txt',
          text: 'Technician Kim inspected pump P-101.',
        }),
      ],
    );
  });
});

describe('useAlignmentStore loadApprovedGraph', () => {
  it('loads approved facts and instance graph from the backend adapters', async () => {
    fetchApprovedFactsMock.mockResolvedValue({
      items: [
        {
          staging_fact_id: 'staging_fact_0001',
          review_decision_id: 'review_0001',
          candidate_id: 'cand_0001',
          schema_version_id: 'schema_v1',
          subject: { text: 'Technician Kim', class_id: 'technician' },
          relation: { text: 'INSPECTS', relation_id: 'inspects' },
          object: { text: 'Pump P-101', class_id: 'pump' },
          status: 'STAGED',
          created_at: '2026-04-08T10:00:00Z',
        },
      ],
      total_items: 1,
    });
    fetchInstanceGraphMock.mockResolvedValue({
      nodes: [
        {
          node_id: 'technician:Technician Kim',
          label: 'Technician Kim',
          class_id: 'technician',
          properties: {},
        },
        {
          node_id: 'pump:Pump P-101',
          label: 'Pump P-101',
          class_id: 'pump',
          properties: {},
        },
      ],
      edges: [
        {
          edge_id: 'staging_fact_0001',
          source_node_id: 'technician:Technician Kim',
          target_node_id: 'pump:Pump P-101',
          relation_id: 'inspects',
          label: 'INSPECTS',
          properties: {},
        },
      ],
      total_facts: 1,
    });

    await useAlignmentStore.getState().loadApprovedGraph();

    expect(useAlignmentStore.getState().approvedFacts).toHaveLength(1);
    expect(useAlignmentStore.getState().instanceGraph?.total_facts).toBe(1);
  });
});
