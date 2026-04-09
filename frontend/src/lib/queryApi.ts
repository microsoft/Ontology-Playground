import type { Ontology } from '../data/ontology';

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
      if (error.message) message = error.message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export interface Neo4jQueryResponse {
  columns: string[];
  rows: Record<string, string>[];
  summary: string;
}

export interface NaturalLanguageCypherResponse {
  cypher: string;
  summary: string;
  warnings: string[];
}

export async function runNeo4jQuery(payload: {
  mode: 'cypher' | 'ingest_run';
  query?: string;
  ingest_run_id?: string;
  limit?: number;
}): Promise<Neo4jQueryResponse> {
  return requestJson<Neo4jQueryResponse>('/api/query/neo4j', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function translateNaturalLanguageQuery(payload: {
  prompt: string;
  ontology: Ontology;
  system_prompt_override?: string | null;
}): Promise<NaturalLanguageCypherResponse> {
  return requestJson<NaturalLanguageCypherResponse>('/api/query/translate-cypher', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
