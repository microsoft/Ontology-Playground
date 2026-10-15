import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ontologyToGql,
  databaseNameFor,
  isValidDatabaseName,
  normalizeBaseUrl,
  getGrafeoHealth,
  pushToGrafeo,
  GrafeoApiError,
  GrafeoNetworkError,
} from './grafeo';
import type { Ontology } from '../data/ontology';

const minimalOntology: Ontology = {
  name: 'Test Ontology',
  description: 'A test ontology',
  entityTypes: [
    {
      id: 'customer',
      name: 'Customer',
      description: 'A customer entity',
      icon: '👤',
      color: '#0078D4',
      properties: [
        { name: 'customerId', type: 'string', isIdentifier: true },
        { name: 'email', type: 'string' },
      ],
    },
    {
      id: 'order',
      name: 'Order',
      description: 'An order',
      icon: '🧾',
      color: '#107C10',
      properties: [
        { name: 'orderId', type: 'string', isIdentifier: true },
        { name: 'total', type: 'decimal' },
      ],
    },
  ],
  relationships: [
    {
      id: 'customer-order',
      name: 'places',
      from: 'customer',
      to: 'order',
      cardinality: 'one-to-many',
    },
  ],
};

function entityOntology(name: string, description = ''): Ontology {
  return {
    name: 'Test',
    description: '',
    entityTypes: [
      { id: 'item', name, description, icon: '📦', color: '#000', properties: [] },
    ],
    relationships: [],
  };
}

// ─── GQL conversion ───────────────────────────────────────────────────────

describe('ontologyToGql', () => {
  it('emits a single GQL INSERT statement', () => {
    const gql = ontologyToGql(minimalOntology);

    expect(gql.startsWith('INSERT ')).toBe(true);
    expect(gql.match(/\bINSERT\b/g)).toHaveLength(1);
    expect(gql).not.toContain('CREATE');
  });

  it('creates a node pattern for each entity type', () => {
    const gql = ontologyToGql(minimalOntology);

    expect(gql).toContain('(n0:`Customer` {');
    expect(gql).toContain('(n1:`Order` {');
  });

  it('creates an edge pattern for each relationship', () => {
    const gql = ontologyToGql(minimalOntology);
    const edges = gql.split('\n').filter(l => l.includes('->'));

    expect(edges).toHaveLength(1);
    expect(edges[0]).toContain('(n0)-[:`places` {');
    expect(edges[0]).toContain("cardinality: 'one-to-many'");
    expect(edges[0]).toContain('->(n1)');
  });

  it('includes entity metadata and properties as node properties', () => {
    const gql = ontologyToGql(minimalOntology);

    expect(gql).toContain("id: 'customer'");
    expect(gql).toContain("name: 'Customer'");
    expect(gql).toContain('properties: \'[{"name":"customerId"');
  });

  it('skips relationships referencing unknown entities', () => {
    const broken: Ontology = {
      ...minimalOntology,
      relationships: [
        { id: 'bad-rel', name: 'broken', from: 'customer', to: 'nonexistent', cardinality: 'one-to-one' },
      ],
    };

    expect(ontologyToGql(broken)).not.toContain('->');
  });

  it('keeps the original entity name as a delimited label', () => {
    const gql = ontologyToGql(entityOntology('Line Item (2024)'));

    expect(gql).toContain('(n0:`Line Item (2024)` {');
    expect(gql).toContain("name: 'Line Item (2024)'");
  });

  it('doubles backticks inside labels', () => {
    expect(ontologyToGql(entityOntology('a`b'))).toContain('(n0:`a``b` {');
  });

  it('falls back to the entity id when the name is blank', () => {
    expect(ontologyToGql(entityOntology('  '))).toContain('(n0:`item` {');
  });

  it('escapes quotes and backslashes in string values', () => {
    const gql = ontologyToGql(entityOntology("O'Brien's", 'C:\\path'));

    expect(gql).toContain("name: 'O\\'Brien\\'s'");
    expect(gql).toContain("description: 'C:\\\\path'");
  });

  it('escapes line breaks, tabs and other control characters', () => {
    const gql = ontologyToGql(entityOntology('x', 'a\nb\rc\td\u0000e\u001ff\u007fg'));

    expect(gql).toContain("description: 'a\\nb\\rc\\td\\u0000e\\u001ff\\u007fg'");
  });

  it('returns an empty string for an empty ontology', () => {
    const empty: Ontology = { name: 'Empty', description: '', entityTypes: [], relationships: [] };

    expect(ontologyToGql(empty)).toBe('');
  });
});

// ─── Names and URLs ───────────────────────────────────────────────────────

describe('databaseNameFor', () => {
  it('derives a prefixed slug from the ontology name', () => {
    expect(databaseNameFor(minimalOntology)).toBe('playground-test-ontology');
  });

  it('handles names with no usable characters', () => {
    expect(databaseNameFor({ ...minimalOntology, name: '☕☕' })).toBe('playground-ontology');
  });

  it('stays within the 64 character limit', () => {
    const name = databaseNameFor({ ...minimalOntology, name: 'x'.repeat(200) });

    expect(name.length).toBeLessThanOrEqual(64);
    expect(isValidDatabaseName(name)).toBe(true);
  });
});

describe('isValidDatabaseName', () => {
  it('accepts names Grafeo accepts', () => {
    expect(isValidDatabaseName('playground-cosmic_coffee2')).toBe(true);
  });

  it('rejects names Grafeo rejects', () => {
    expect(isValidDatabaseName('')).toBe(false);
    expect(isValidDatabaseName('1abc')).toBe(false);
    expect(isValidDatabaseName('has space')).toBe(false);
    expect(isValidDatabaseName('a'.repeat(65))).toBe(false);
  });

  it('rejects the default database so pushes never touch it', () => {
    expect(isValidDatabaseName('default')).toBe(false);
    expect(isValidDatabaseName('DEFAULT')).toBe(false);
  });
});

describe('normalizeBaseUrl', () => {
  it('trims whitespace and trailing slashes', () => {
    expect(normalizeBaseUrl('  http://localhost:7474///  ')).toBe('http://localhost:7474');
  });

  it('leaves a clean URL unchanged', () => {
    expect(normalizeBaseUrl('https://grafeo.example.com/api')).toBe('https://grafeo.example.com/api');
  });
});

// ─── REST client ──────────────────────────────────────────────────────────

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function calls(): { url: string; method: string; headers: Record<string, string>; body: unknown }[] {
  return (fetch as FetchMock).mock.calls.map(([url, init]: [string, RequestInit]) => ({
    url,
    method: init.method ?? 'GET',
    headers: (init.headers ?? {}) as Record<string, string>,
    body: init.body === undefined ? undefined : JSON.parse(init.body as string),
  }));
}

const health = {
  status: 'ok',
  version: '0.5.44',
  engine_version: '0.5.44',
  persistent: false,
  read_only: false,
  uptime_seconds: 1,
  active_sessions: 0,
  features: { languages: ['gql', 'cypher'], engine: [], server: [] },
};

const counters = {
  nodes_created: 2,
  nodes_deleted: 0,
  edges_created: 1,
  edges_deleted: 0,
  properties_set: 13,
  labels_added: 2,
  labels_removed: 0,
};

beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe('getGrafeoHealth', () => {
  it('calls GET /health on the normalized URL without a body', async () => {
    (fetch as FetchMock).mockResolvedValueOnce(jsonResponse(200, health));

    const result = await getGrafeoHealth('http://localhost:7474/');

    expect(result.version).toBe('0.5.44');
    expect(calls()).toEqual([
      { url: 'http://localhost:7474/health', method: 'GET', headers: {}, body: undefined },
    ]);
  });

  it('throws GrafeoApiError with the server detail on a non-2xx response', async () => {
    (fetch as FetchMock).mockResolvedValueOnce(
      jsonResponse(503, { error: 'unavailable', detail: 'starting up' }),
    );

    const err = await getGrafeoHealth('http://localhost:7474').catch(e => e);

    expect(err).toBeInstanceOf(GrafeoApiError);
    expect(err.status).toBe(503);
    expect(err.detail).toBe('starting up');
  });

  it('throws GrafeoNetworkError when the server cannot be reached', async () => {
    (fetch as FetchMock).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const err = await getGrafeoHealth('http://localhost:7474').catch(e => e);

    expect(err).toBeInstanceOf(GrafeoNetworkError);
    expect(err.url).toBe('http://localhost:7474/health');
  });
});

describe('pushToGrafeo', () => {
  it('creates the database, then sends the GQL to /query with language gql', async () => {
    (fetch as FetchMock)
      .mockResolvedValueOnce(jsonResponse(200, { name: 'playground-test-ontology' }))
      .mockResolvedValueOnce(jsonResponse(200, { columns: [], rows: [], counters }));

    const result = await pushToGrafeo('http://localhost:7474/', minimalOntology, {
      database: 'playground-test-ontology',
    });

    expect(result).toEqual({ database: 'playground-test-ontology', counters });
    expect(calls()).toEqual([
      {
        url: 'http://localhost:7474/db',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { name: 'playground-test-ontology' },
      },
      {
        url: 'http://localhost:7474/query',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          query: ontologyToGql(minimalOntology),
          language: 'gql',
          database: 'playground-test-ontology',
        },
      },
    ]);
  });

  it('sends the bearer token on every request when given', async () => {
    (fetch as FetchMock)
      .mockResolvedValueOnce(jsonResponse(200, {}))
      .mockResolvedValueOnce(jsonResponse(200, {}))
      .mockResolvedValueOnce(jsonResponse(200, { columns: [], rows: [] }));

    await pushToGrafeo('http://localhost:7474', minimalOntology, {
      database: 'db1',
      token: 'secret',
      replace: true,
    });

    for (const call of calls()) {
      expect(call.headers.Authorization).toBe('Bearer secret');
    }
  });

  it('sends no Authorization header without a token', async () => {
    (fetch as FetchMock)
      .mockResolvedValueOnce(jsonResponse(200, {}))
      .mockResolvedValueOnce(jsonResponse(200, { columns: [], rows: [] }));

    await pushToGrafeo('http://localhost:7474', minimalOntology, { database: 'db1' });

    for (const call of calls()) {
      expect(call.headers).not.toHaveProperty('Authorization');
    }
  });

  it('reports an existing database as a 409 GrafeoApiError without writing', async () => {
    (fetch as FetchMock).mockResolvedValueOnce(
      jsonResponse(409, { error: 'conflict', detail: "database 'db1' already exists" }),
    );

    const err = await pushToGrafeo('http://localhost:7474', minimalOntology, { database: 'db1' })
      .catch(e => e);

    expect(err).toBeInstanceOf(GrafeoApiError);
    expect(err.status).toBe(409);
    expect(err.detail).toBe("database 'db1' already exists");
    expect(calls()).toHaveLength(1);
  });

  it('deletes the database first when replacing, and tolerates a 404', async () => {
    (fetch as FetchMock)
      .mockResolvedValueOnce(jsonResponse(404, { error: 'not_found', detail: 'no such database' }))
      .mockResolvedValueOnce(jsonResponse(200, {}))
      .mockResolvedValueOnce(jsonResponse(200, { columns: [], rows: [] }));

    await pushToGrafeo('http://localhost:7474', minimalOntology, { database: 'db_1', replace: true });

    expect(calls().map(c => `${c.method} ${c.url}`)).toEqual([
      'DELETE http://localhost:7474/db/db_1',
      'POST http://localhost:7474/db',
      'POST http://localhost:7474/query',
    ]);
  });

  it('stops when deleting the old database fails', async () => {
    (fetch as FetchMock).mockResolvedValueOnce(jsonResponse(403, { error: 'forbidden', detail: 'nope' }));

    const err = await pushToGrafeo('http://localhost:7474', minimalOntology, {
      database: 'db1',
      replace: true,
    }).catch(e => e);

    expect(err).toBeInstanceOf(GrafeoApiError);
    expect(err.status).toBe(403);
    expect(calls()).toHaveLength(1);
  });

  it('removes the new database again when the insert fails', async () => {
    (fetch as FetchMock)
      .mockResolvedValueOnce(jsonResponse(200, {}))
      .mockResolvedValueOnce(jsonResponse(400, { error: 'bad_request', detail: 'syntax error' }))
      .mockResolvedValueOnce(jsonResponse(200, { deleted: 'db1' }));

    const err = await pushToGrafeo('http://localhost:7474', minimalOntology, { database: 'db1' })
      .catch(e => e);

    expect(err).toBeInstanceOf(GrafeoApiError);
    expect(err.status).toBe(400);
    expect(err.detail).toBe('syntax error');
    expect(calls().map(c => `${c.method} ${c.url}`)).toEqual([
      'POST http://localhost:7474/db',
      'POST http://localhost:7474/query',
      'DELETE http://localhost:7474/db/db1',
    ]);
  });

  it('skips the insert for an empty ontology', async () => {
    (fetch as FetchMock).mockResolvedValueOnce(jsonResponse(200, {}));
    const empty: Ontology = { name: 'Empty', description: '', entityTypes: [], relationships: [] };

    const result = await pushToGrafeo('http://localhost:7474', empty, { database: 'db1' });

    expect(result).toEqual({ database: 'db1', counters: undefined });
    expect(calls()).toHaveLength(1);
  });

  it('keeps a non-JSON error body as the detail', async () => {
    (fetch as FetchMock).mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }));

    const err = await pushToGrafeo('http://localhost:7474', minimalOntology, { database: 'db1' })
      .catch(e => e);

    expect(err.status).toBe(502);
    expect(err.detail).toBe('Bad Gateway');
  });

  it('throws GrafeoNetworkError when the server cannot be reached', async () => {
    (fetch as FetchMock).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const err = await pushToGrafeo('http://localhost:7474', minimalOntology, { database: 'db1' })
      .catch(e => e);

    expect(err).toBeInstanceOf(GrafeoNetworkError);
  });

  it('rejects an invalid database name before sending anything', async () => {
    const err = await pushToGrafeo('http://localhost:7474', minimalOntology, { database: 'default' })
      .catch(e => e);

    expect(err).toBeInstanceOf(Error);
    expect(calls()).toHaveLength(0);
  });
});
