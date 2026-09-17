/**
 * Grafeo graph database client — converts playground ontologies to
 * property-graph CREATE statements and pushes them via Grafeo's HTTP
 * REST API.
 *
 * Grafeo is a lightweight, high-performance property graph database that
 * supports GQL (ISO), Cypher, SPARQL, Gremlin, GraphQL, and SQL/PGQ.
 *
 * Default base URL: http://localhost:7474
 *
 * @see https://github.com/GrafeoDB/grafeo
 */

import type { Ontology } from '../data/ontology';

// ─── Types ────────────────────────────────────────────────────────────────

export interface GrafeoResult {
  columns?: string[];
  rows?: unknown[][];
  stats?: Record<string, number>;
}

export class GrafeoApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(message: string, status: number, detail = '') {
    super(message);
    this.name = 'GrafeoApiError';
    this.status = status;
    this.detail = detail;
  }
}

// ─── Cypher conversion ────────────────────────────────────────────────────

/** Escape a string for use in a Cypher string literal. */
function quote(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n');
  return `'${escaped}'`;
}

/** Sanitize a name for use as a Cypher label or relationship type. */
function sanitizeLabel(name: string): string {
  // Replace non-alphanumeric (except _) with underscore, ensure starts with letter
  let label = name.replace(/[^a-zA-Z0-9_]/g, '_');
  if (!/^[a-zA-Z]/.test(label)) label = 'E_' + label;
  return label;
}

/**
 * Convert a Playground ontology to a Cypher CREATE script.
 *
 * Entity types become labeled nodes; relationships become typed edges.
 * The resulting graph is a queryable schema that can be explored with
 * any of Grafeo's six supported query languages.
 */
export function ontologyToCypher(ontology: Ontology): string {
  const lines: string[] = [];
  const entityIndex = new Map<string, number>();

  for (let i = 0; i < ontology.entityTypes.length; i++) {
    const e = ontology.entityTypes[i];
    entityIndex.set(e.id, i);

    const props = [
      `id: ${quote(e.id)}`,
      `name: ${quote(e.name)}`,
      `description: ${quote(e.description)}`,
      `icon: ${quote(e.icon)}`,
      `color: ${quote(e.color)}`,
      `properties: ${quote(JSON.stringify(e.properties))}`,
    ].join(', ');

    lines.push(`CREATE (n${i}:${sanitizeLabel(e.name)} {${props}})`);
  }

  for (const rel of ontology.relationships) {
    const fi = entityIndex.get(rel.from);
    const ti = entityIndex.get(rel.to);
    if (fi == null || ti == null) continue;

    const props = [
      `name: ${quote(rel.name)}`,
      `cardinality: ${quote(rel.cardinality)}`,
      ...(rel.description ? [`description: ${quote(rel.description)}`] : []),
    ].join(', ');

    lines.push(
      `CREATE (n${fi})-[:${sanitizeLabel(rel.name)} {${props}}]->(n${ti})`,
    );
  }

  return lines.join('\n');
}

// ─── REST API client ──────────────────────────────────────────────────────

/**
 * Push an ontology to a Grafeo instance as a property graph.
 *
 * Posts the generated Cypher to the `/query` endpoint. The ontology's
 * entity types become labeled nodes and its relationships become typed
 * edges, immediately queryable via GQL, Cypher, SPARQL, and more.
 */
export async function pushToGrafeo(
  baseUrl: string,
  ontology: Ontology,
  token?: string,
): Promise<GrafeoResult> {
  const cypher = ontologyToCypher(ontology);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/query`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: cypher }),
  });

  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch { /* ignore */ }
    throw new GrafeoApiError(
      `Grafeo API error: ${res.status} ${res.statusText}`,
      res.status,
      detail,
    );
  }

  return res.json() as Promise<GrafeoResult>;
}

/**
 * Ping a Grafeo instance to verify connectivity.
 */
export async function pingGrafeo(
  baseUrl: string,
  token?: string,
): Promise<boolean> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: 'RETURN 1' }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
