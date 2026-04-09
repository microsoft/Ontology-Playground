const alignmentApiBaseUrl = import.meta.env.VITE_ALIGNMENT_API_BASE_URL?.trim();

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
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
      // ignore
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export interface Neo4jPublishPreviewResponse {
  ingest_run_id: string;
  node_count: number;
  edge_count: number;
  database: string;
  source_schema_version_id?: string | null;
}

export interface Neo4jPublishResponse {
  ingest_run_id: string;
  node_count: number;
  edge_count: number;
  database: string;
  published_at: string;
}

export async function previewNeo4jPublish(
  ingestRunId: string,
  graph?: InstanceGraphResponse | null,
): Promise<Neo4jPublishPreviewResponse> {
  return requestJson<Neo4jPublishPreviewResponse>('/api/publish/neo4j/preview', {
    method: 'POST',
    body: JSON.stringify({ ingest_run_id: ingestRunId, graph }),
  });
}

export async function publishNeo4j(
  ingestRunId: string,
  graph?: InstanceGraphResponse | null,
): Promise<Neo4jPublishResponse> {
  return requestJson<Neo4jPublishResponse>('/api/publish/neo4j', {
    method: 'POST',
    body: JSON.stringify({ ingest_run_id: ingestRunId, graph }),
  });
}
import type { InstanceGraphResponse } from '../types/alignment';
