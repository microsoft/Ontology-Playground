/**
 * Grafeo graph database client — converts playground ontologies to an
 * ISO GQL INSERT statement and pushes them via the Grafeo server's HTTP
 * REST API.
 *
 * Grafeo is an open-source (Apache-2.0) property graph database. Its
 * server is a third-party, non-Microsoft service: pushing sends the
 * ontology (and any token) to the endpoint the user enters.
 *
 * Each push goes into its own database, so it never mixes with other
 * data on the server and can be replaced as a whole on the next push.
 *
 * Default base URL: http://localhost:7474
 *
 * @see https://github.com/GrafeoDB/grafeo-server
 */

import type { Ontology } from '../data/ontology';

// ─── Types ────────────────────────────────────────────────────────────────

/** What a write statement changed, as reported by the server. */
export interface GrafeoWriteCounters {
  nodes_created: number;
  nodes_deleted: number;
  edges_created: number;
  edges_deleted: number;
  properties_set: number;
  labels_added: number;
  labels_removed: number;
}

/** Response body of `POST /query`. */
export interface GrafeoQueryResult {
  columns: string[];
  rows: unknown[][];
  execution_time_ms?: number;
  gql_status?: string;
  /** Omitted when the statement wrote nothing. */
  counters?: GrafeoWriteCounters;
}

/** Response body of `GET /health`. */
export interface GrafeoHealth {
  status: string;
  version: string;
  engine_version: string;
  persistent: boolean;
  read_only: boolean;
  features: {
    languages: string[];
    engine: string[];
    server: string[];
  };
}

export interface GrafeoPushOptions {
  /** Database to create and fill. See {@link isValidDatabaseName}. */
  database: string;
  /** Bearer token, if the server has authentication enabled. */
  token?: string;
  /** Delete an existing database with the same name first. */
  replace?: boolean;
}

export interface GrafeoPushResult {
  database: string;
  counters?: GrafeoWriteCounters;
}

/** The server answered with a non-2xx status. */
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

/**
 * The request never got a response: the server is down, the URL is wrong,
 * or the browser blocked it because the server does not allow this origin
 * (CORS). Browsers report all three the same way.
 */
export class GrafeoNetworkError extends Error {
  readonly url: string;

  constructor(url: string, cause: unknown) {
    super(`Cannot reach Grafeo at ${url}`, { cause });
    this.name = 'GrafeoNetworkError';
    this.url = url;
  }
}

// ─── Names and URLs ───────────────────────────────────────────────────────

const DATABASE_PREFIX = 'playground-';
const MAX_DATABASE_NAME = 64;

/** Strip surrounding whitespace and trailing slashes from a base URL. */
export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/**
 * Whether Grafeo accepts `name` as a database name (a letter, then letters,
 * digits, `_` or `-`, at most 64 characters). The server's `default`
 * database is refused so a push never overwrites it.
 */
export function isValidDatabaseName(name: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name) && name.toLowerCase() !== 'default';
}

/** The database name a push uses by default, e.g. `playground-cosmic-coffee-company`. */
export function databaseNameFor(ontology: Ontology): string {
  const slug = ontology.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return (DATABASE_PREFIX + (slug || 'ontology'))
    .slice(0, MAX_DATABASE_NAME)
    .replace(/-+$/, '');
}

// ─── GQL conversion ───────────────────────────────────────────────────────

const STRING_ESCAPES: Record<string, string> = {
  '\\': '\\\\',
  "'": "\\'",
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
};

/** Quote a value as a GQL string literal. */
function quoteString(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (STRING_ESCAPES[ch]) {
      out += STRING_ESCAPES[ch];
    } else if (code < 0x20 || code === 0x7f) {
      out += '\\u' + code.toString(16).padStart(4, '0');
    } else {
      out += ch;
    }
  }
  return `'${out}'`;
}

/**
 * Quote a name as a delimited GQL identifier, so labels keep the exact
 * entity and relationship names (spaces, punctuation, keywords included).
 */
function quoteIdentifier(name: string): string {
  return '`' + name.replace(/`/g, '``') + '`';
}

/**
 * Convert a Playground ontology to a single GQL INSERT statement.
 *
 * Entity types become labeled nodes; relationships become typed edges.
 * One statement means the server applies it as a whole or not at all.
 * Returns an empty string when the ontology has no entity types.
 */
export function ontologyToGql(ontology: Ontology): string {
  const patterns: string[] = [];
  const entityIndex = new Map<string, number>();

  ontology.entityTypes.forEach((e, i) => {
    entityIndex.set(e.id, i);

    const props = [
      `id: ${quoteString(e.id)}`,
      `name: ${quoteString(e.name)}`,
      `description: ${quoteString(e.description)}`,
      `icon: ${quoteString(e.icon)}`,
      `color: ${quoteString(e.color)}`,
      `properties: ${quoteString(JSON.stringify(e.properties))}`,
    ].join(', ');

    patterns.push(`(n${i}:${quoteIdentifier(e.name.trim() || e.id)} {${props}})`);
  });

  for (const rel of ontology.relationships) {
    const fi = entityIndex.get(rel.from);
    const ti = entityIndex.get(rel.to);
    if (fi == null || ti == null) continue;

    const props = [
      `id: ${quoteString(rel.id)}`,
      `name: ${quoteString(rel.name)}`,
      `cardinality: ${quoteString(rel.cardinality)}`,
      ...(rel.description ? [`description: ${quoteString(rel.description)}`] : []),
    ].join(', ');

    patterns.push(
      `(n${fi})-[:${quoteIdentifier(rel.name.trim() || rel.id)} {${props}}]->(n${ti})`,
    );
  }

  return patterns.length ? `INSERT ${patterns.join(',\n  ')}` : '';
}

// ─── REST API client ──────────────────────────────────────────────────────

async function request(
  baseUrl: string,
  path: string,
  method: 'GET' | 'POST' | 'DELETE',
  body?: unknown,
  token?: string,
): Promise<Response> {
  const url = normalizeBaseUrl(baseUrl) + path;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    return await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    throw new GrafeoNetworkError(url, err);
  }
}

/** Throw a {@link GrafeoApiError} carrying the server's `detail` for a non-2xx response. */
async function ensureOk(res: Response): Promise<void> {
  if (res.ok) return;

  let detail = '';
  try {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text) as { detail?: unknown; error?: unknown };
      detail = String(parsed.detail ?? parsed.error ?? text);
    } catch {
      detail = text;
    }
  } catch { /* ignore */ }

  throw new GrafeoApiError(
    `Grafeo API error: ${res.status} ${res.statusText}`.trim(),
    res.status,
    detail,
  );
}

/**
 * Check that a Grafeo server is reachable and read its version and
 * features. `GET /health` needs no token and starts no transaction.
 */
export async function getGrafeoHealth(baseUrl: string): Promise<GrafeoHealth> {
  const res = await request(baseUrl, '/health', 'GET');
  await ensureOk(res);
  return res.json() as Promise<GrafeoHealth>;
}

/**
 * Push an ontology to a Grafeo server as a property graph in its own
 * database.
 *
 * Creates `options.database` (deleting it first when `options.replace` is
 * set), then inserts the ontology with one GQL statement. If the database
 * already exists and `replace` is not set, throws a {@link GrafeoApiError}
 * with status 409 before writing anything. If the insert fails, the new
 * database is deleted again so no half-filled database is left behind.
 */
export async function pushToGrafeo(
  baseUrl: string,
  ontology: Ontology,
  options: GrafeoPushOptions,
): Promise<GrafeoPushResult> {
  const { database, token, replace } = options;
  if (!isValidDatabaseName(database)) {
    throw new Error(
      `Invalid database name "${database}": use a letter, then letters, digits, "_" or "-" (max 64), and not "default".`,
    );
  }
  const dbPath = `/db/${encodeURIComponent(database)}`;

  if (replace) {
    const res = await request(baseUrl, dbPath, 'DELETE', undefined, token);
    if (res.status !== 404) await ensureOk(res);
  }

  await ensureOk(await request(baseUrl, '/db', 'POST', { name: database }, token));

  const query = ontologyToGql(ontology);
  if (!query) return { database, counters: undefined };

  try {
    const res = await request(baseUrl, '/query', 'POST', { query, language: 'gql', database }, token);
    await ensureOk(res);
    const result = (await res.json()) as GrafeoQueryResult;
    return { database, counters: result.counters };
  } catch (err) {
    await request(baseUrl, dbPath, 'DELETE', undefined, token).catch(() => undefined);
    throw err;
  }
}
