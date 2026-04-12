import type { Ontology } from '../data/ontology';
import type { InstanceGraphResponse } from '../types/alignment';
import { getAlignmentApiBaseUrl } from './alignmentApiConfig';

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
      // Ignore parse failures and use the generic status.
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export interface LibraryOntologyItem {
  slug: string;
  name: string;
  description: string;
  updated_at: string;
  rdf_filename: string;
  json_filename: string;
  metadata_filename: string;
}

export interface LibraryGraphItem {
  slug: string;
  name: string;
  description: string;
  updated_at: string;
  graph_filename: string;
  metadata_filename: string;
  source_ontology_name?: string | null;
  total_facts: number;
}

export async function listLocalOntologies(): Promise<LibraryOntologyItem[]> {
  const response = await requestJson<{ items: LibraryOntologyItem[] }>('/api/library/ontologies');
  return response.items;
}

export async function getLocalOntology(slug: string): Promise<Ontology> {
  return requestJson<Ontology>(`/api/library/ontologies/${slug}`);
}

export async function saveLocalOntology(payload: {
  name: string;
  description: string;
  ontology: Ontology;
  rdf_content: string;
  metadata?: Record<string, unknown>;
}): Promise<LibraryOntologyItem> {
  const response = await requestJson<{ item: LibraryOntologyItem }>('/api/library/ontologies', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response.item;
}

export async function listLocalGraphs(): Promise<LibraryGraphItem[]> {
  const response = await requestJson<{ items: LibraryGraphItem[] }>('/api/library/graphs');
  return response.items;
}

export async function getLocalGraph(slug: string): Promise<InstanceGraphResponse> {
  return requestJson<InstanceGraphResponse>(`/api/library/graphs/${slug}`);
}

export async function saveLocalGraph(payload: {
  name: string;
  description: string;
  source_ontology_name?: string;
  graph: InstanceGraphResponse;
  metadata?: Record<string, unknown>;
}): Promise<LibraryGraphItem> {
  const response = await requestJson<{ item: LibraryGraphItem }>('/api/library/graphs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response.item;
}
