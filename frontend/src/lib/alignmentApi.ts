import type { Ontology } from '../data/ontology';
import { buildMockQueuePage, buildMockReviewResponse, defaultSourceDocuments, mockQueueCandidates, mockSchemaSummary } from '../data/mockAlignment';
import type {
  ApprovedFactsResponse,
  CandidateLockRequest,
  CandidateLockResponse,
  GraphProjection,
  InstanceGraphResponse,
  OntologyGraphBuildRequest,
  OntologyGraphBuildResponse,
  QueueCandidate,
  QueuePageResponse,
  ReviewDecisionRequest,
  ReviewDecisionResponse,
  SchemaSummary,
  SourceDocumentInput,
} from '../types/alignment';
import type { LlmCredentialInputs, LlmMode } from '../types/llm';
import { getAlignmentApiBaseUrl } from './alignmentApiConfig';

let fallbackRuntime: OntologyGraphBuildResponse | null = null;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const alignmentApiBaseUrl = getAlignmentApiBaseUrl();
  if (!alignmentApiBaseUrl) {
    throw new Error('Alignment API base URL is not configured.');
  }

  const response = await fetch(`${alignmentApiBaseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const error = (await response.json()) as { message?: string };
      if (error.message) {
        message = error.message;
      }
    } catch {
      // Fall back to the generic status message when the payload isn't JSON.
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

function buildFallbackGraph(ontology: Ontology): GraphProjection {
  return {
    nodes: ontology.entityTypes.map((entity) => ({
      node_id: entity.id,
      label: entity.name,
      entity_type_id: entity.id,
      properties: {
        description: entity.description,
        identifier_property: entity.properties.find((property) => property.isIdentifier)?.name ?? null,
        property_count: entity.properties.length,
      },
      color: entity.color,
    })),
    relationships: ontology.relationships.map((relationship) => ({
      relationship_id: relationship.id,
      source_node_id: relationship.from,
      target_node_id: relationship.to,
      type: relationship.name.toUpperCase(),
      cardinality: relationship.cardinality,
      properties: {
        description: relationship.description ?? null,
      },
    })),
  };
}

function buildFallbackGraphRun(
  ontology: Ontology,
  sourceDocuments: SourceDocumentInput[] = [],
): OntologyGraphBuildResponse {
  const now = Date.now();
  const schemaVersionId = `mock_${now}`;
  const extractionRunId = `mock-run-${now}`;
  const effectiveDocuments = sourceDocuments.length > 0 ? sourceDocuments : defaultSourceDocuments;
  const queueItems: QueueCandidate[] = effectiveDocuments.map((document, index) => {
    const relationship = ontology.relationships[index % Math.max(ontology.relationships.length, 1)];
    const source = ontology.entityTypes.find((entity) => entity.id === relationship?.from);
    const target = ontology.entityTypes.find((entity) => entity.id === relationship?.to);
    return {
      candidate_id: `cand_${String(index + 1).padStart(4, '0')}`,
      status: 'NEW',
      schema_version_id: schemaVersionId,
      source_doc_id: document.source_doc_id ?? `doc_${index + 1}`,
      source_doc_name: document.source_doc_name,
      doc_type: document.doc_type,
      page: document.page ?? 1,
      source_snippet: document.text,
      subject_text: source?.name ?? relationship?.from ?? ontology.name,
      relation_text: relationship?.name ?? 'RELATED_TO',
      object_text: target?.name ?? relationship?.to ?? ontology.name,
      extraction_run_id: extractionRunId,
      extraction_confidence: sourceDocuments.length > 0 ? 0.72 : 1,
      review_priority: 'NORMAL',
      assigned_reviewer_id: null,
      lock: null,
      suggestions: {
        subject: source ? [{ target_id: source.id, target_name: source.name, score: 1, reasons: ['schema_projection'] }] : [],
        relation: relationship ? [{ target_id: relationship.id, target_name: relationship.name, score: 1, reasons: ['schema_projection'] }] : [],
        object: target ? [{ target_id: target.id, target_name: target.name, score: 1, reasons: ['schema_projection'] }] : [],
      },
    };
  });
  return {
    extraction_run_id: extractionRunId,
    generated_at: new Date().toISOString(),
    schema: {
      ...mockSchemaSummary,
      schema_version_id: schemaVersionId,
      name: ontology.name,
      description: ontology.description || 'Generated from the current ontology draft',
      classes: ontology.entityTypes.map((entity) => ({
        class_id: entity.id,
        name: entity.name,
        aliases: [entity.name],
        description: entity.description,
        property_names: entity.properties.map((property) => property.name),
      })),
      relations: ontology.relationships.map((relationship) => ({
        relation_id: relationship.id,
        name: relationship.name,
        aliases: [relationship.name],
        domain_class_id: relationship.from,
        range_class_id: relationship.to,
      })),
    },
    queue: {
      ...buildMockQueuePage(1, Math.max(queueItems.length, 1)),
      items: queueItems,
      total_items: queueItems.length,
      total_pages: 1,
      active_schema_version_id: schemaVersionId,
    },
    graph: buildFallbackGraph(ontology),
    source_documents_used: effectiveDocuments.length,
  };
}

export async function fetchSchemaVersion(schemaVersionId: string): Promise<SchemaSummary> {
  if (getAlignmentApiBaseUrl()) {
    return requestJson<SchemaSummary>(`/api/schema/versions/${schemaVersionId}`);
  }
  await wait(120);
  if (fallbackRuntime && schemaVersionId === fallbackRuntime.schema.schema_version_id) {
    return structuredClone(fallbackRuntime.schema);
  }
  if (schemaVersionId !== mockSchemaSummary.schema_version_id) {
    throw new Error(`Unknown schema version: ${schemaVersionId}`);
  }
  return structuredClone(mockSchemaSummary);
}

export async function fetchQueue(page = 1, pageSize = 20): Promise<QueuePageResponse> {
  if (getAlignmentApiBaseUrl()) {
    return requestJson<QueuePageResponse>(`/api/queue?page=${page}&page_size=${pageSize}`);
  }
  await wait(160);
  if (fallbackRuntime) {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return {
      ...structuredClone(fallbackRuntime.queue),
      items: structuredClone(fallbackRuntime.queue.items.slice(start, end)),
      page,
      page_size: pageSize,
      total_items: fallbackRuntime.queue.items.length,
      total_pages: Math.max(1, Math.ceil(fallbackRuntime.queue.items.length / pageSize)),
    };
  }
  return structuredClone(buildMockQueuePage(page, pageSize));
}

export async function buildGraphFromOntology(
  ontology: Ontology,
  editorId: string,
  sourceDocuments: SourceDocumentInput[] = [],
  extractionPromptOverride?: string | null,
  llmProviderOverride?: LlmMode,
  llmCredentials?: Partial<LlmCredentialInputs> | null,
): Promise<OntologyGraphBuildResponse> {
  const payload: OntologyGraphBuildRequest = {
    editor_id: editorId,
    ontology,
    source_documents: sourceDocuments,
    extraction_prompt_override: extractionPromptOverride ?? null,
    llm_provider_override: llmProviderOverride ?? null,
    llm_credentials: llmCredentials ?? null,
  };

  if (getAlignmentApiBaseUrl()) {
    return requestJson<OntologyGraphBuildResponse>('/api/graph/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  await wait(120);
  const response = buildFallbackGraphRun(ontology, sourceDocuments);
  fallbackRuntime = structuredClone(response);
  return response;
}

export async function lockCandidate(
  candidateId: string,
  request: CandidateLockRequest,
): Promise<CandidateLockResponse> {
  if (getAlignmentApiBaseUrl()) {
    return requestJson<CandidateLockResponse>(`/api/queue/${candidateId}/lock`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }
  await wait(100);
  const fallbackQueue = fallbackRuntime?.queue.items ?? mockQueueCandidates;
  const candidate = fallbackQueue.find((item) => item.candidate_id === candidateId);
  if (!candidate) {
    throw new Error(`Unknown candidate: ${candidateId}`);
  }

  const lockedAt = new Date();
  const expiresAt = new Date(lockedAt.getTime() + request.lock_timeout_seconds * 1000);
  const response: CandidateLockResponse = {
    candidate_id: candidateId,
    status: 'IN_REVIEW',
    lock: {
      locked_by: request.reviewer_id,
      locked_at: lockedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    },
  };

  if (fallbackRuntime) {
    fallbackRuntime.queue.items = fallbackRuntime.queue.items.map((item) =>
      item.candidate_id === candidateId
        ? {
            ...item,
            status: response.status,
            lock: response.lock,
          }
        : item,
    );
  }

  return response;
}

export async function submitReview(
  request: ReviewDecisionRequest,
): Promise<ReviewDecisionResponse> {
  if (getAlignmentApiBaseUrl()) {
    return requestJson<ReviewDecisionResponse>('/api/reviews', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }
  await wait(180);
  if (fallbackRuntime) {
    const index = fallbackRuntime.queue.items.findIndex((item) => item.candidate_id === request.candidate_id);
    const nextCandidate = fallbackRuntime.queue.items
      .slice(index + 1)
      .find((item) => item.status === 'NEW') ?? null;
    const response = buildMockReviewResponse(request, nextCandidate?.candidate_id ?? null);
    fallbackRuntime.queue.items = fallbackRuntime.queue.items.map((item) =>
      item.candidate_id === request.candidate_id
        ? {
            ...item,
            status: response.status,
            lock: null,
            assigned_reviewer_id: request.reviewer_id,
          }
        : item,
    );
    return response;
  }
  const index = mockQueueCandidates.findIndex((item) => item.candidate_id === request.candidate_id);
  const nextCandidate = mockQueueCandidates.slice(index + 1).find((item) => item.status === 'NEW') ?? null;
  return buildMockReviewResponse(request, nextCandidate?.candidate_id ?? null);
}

export async function fetchApprovedFacts(): Promise<ApprovedFactsResponse> {
  if (getAlignmentApiBaseUrl()) {
    return requestJson<ApprovedFactsResponse>('/api/reviews/approved-facts');
  }

  const items = (fallbackRuntime?.queue.items ?? mockQueueCandidates)
    .filter((item) => item.status === 'APPROVED_STAGED')
    .map((item, index) => ({
      staging_fact_id: `mock_fact_${index + 1}`,
      review_decision_id: `mock_review_${index + 1}`,
      candidate_id: item.candidate_id,
      schema_version_id: item.schema_version_id,
      subject: {
        text: item.subject_text,
        class_id: item.suggestions.subject[0]?.target_id ?? '',
      },
      relation: {
        text: item.relation_text,
        relation_id: item.suggestions.relation[0]?.target_id ?? '',
      },
      object: {
        text: item.object_text,
        class_id: item.suggestions.object[0]?.target_id ?? '',
      },
      status: 'STAGED',
      created_at: new Date().toISOString(),
    }));

  return {
    items,
    total_items: items.length,
  };
}

export async function fetchInstanceGraph(): Promise<InstanceGraphResponse> {
  if (getAlignmentApiBaseUrl()) {
    return requestJson<InstanceGraphResponse>('/api/reviews/instance-graph');
  }

  const approved = await fetchApprovedFacts();
  const nodes = new Map<string, InstanceGraphResponse['nodes'][number]>();
  const edges: InstanceGraphResponse['edges'] = [];

  approved.items.forEach((fact) => {
    const sourceNodeId = `${fact.subject.class_id}:${fact.subject.text}`;
    const targetNodeId = `${fact.object.class_id}:${fact.object.text}`;

    if (!nodes.has(sourceNodeId)) {
      nodes.set(sourceNodeId, {
        node_id: sourceNodeId,
        label: fact.subject.text,
        class_id: fact.subject.class_id,
        properties: { source: 'mock_review' },
      });
    }

    if (!nodes.has(targetNodeId)) {
      nodes.set(targetNodeId, {
        node_id: targetNodeId,
        label: fact.object.text,
        class_id: fact.object.class_id,
        properties: { source: 'mock_review' },
      });
    }

    edges.push({
      edge_id: fact.staging_fact_id,
      source_node_id: sourceNodeId,
      target_node_id: targetNodeId,
      relation_id: fact.relation.relation_id,
      label: fact.relation.text,
      properties: { schema_version_id: fact.schema_version_id },
    });
  });

  return {
    nodes: Array.from(nodes.values()),
    edges,
    total_facts: approved.total_items,
  };
}
