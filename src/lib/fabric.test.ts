import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  convertToFabricParts,
  createOntology,
  updateOntologyDefinition,
  listOntologies,
  FabricApiError,
} from './fabric';
import type { Ontology } from '../data/ontology';

function decode(base64: string): unknown {
  const json = atob(base64);
  return JSON.parse(json);
}

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
        { name: 'age', type: 'integer' },
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
        { name: 'timestamp', type: 'datetime' },
        { name: 'paid', type: 'boolean' },
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

describe('convertToFabricParts', () => {
  it('produces .platform and definition.json parts', () => {
    const { definition } = convertToFabricParts(minimalOntology);
    const paths = definition.parts.map(p => p.path);

    expect(paths).toContain('.platform');
    expect(paths).toContain('definition.json');
  });

  it('creates entity type parts for each entity', () => {
    const { definition } = convertToFabricParts(minimalOntology);
    const entityParts = definition.parts.filter(p => p.path.startsWith('EntityTypes/'));

    expect(entityParts).toHaveLength(2);
    entityParts.forEach(part => {
      expect(part.path).toMatch(/^EntityTypes\/\d+\/definition\.json$/);
      expect(part.payloadType).toBe('InlineBase64');
    });
  });

  it('creates relationship type parts', () => {
    const { definition } = convertToFabricParts(minimalOntology);
    const relParts = definition.parts.filter(p => p.path.startsWith('RelationshipTypes/'));

    expect(relParts).toHaveLength(1);
    relParts.forEach(part => {
      expect(part.path).toMatch(/^RelationshipTypes\/\d+\/definition\.json$/);
    });
  });

  it('maps entity properties with correct value types', () => {
    const { definition } = convertToFabricParts(minimalOntology);
    const entityParts = definition.parts.filter(p => p.path.startsWith('EntityTypes/'));

    // Find the Customer entity part
    const customerPart = entityParts.find(p => {
      const decoded = decode(p.payload) as { name: string };
      return decoded.name === 'Customer';
    });

    expect(customerPart).toBeDefined();
    const customer = decode(customerPart!.payload) as {
      namespace: string;
      namespaceType: string;
      visibility: string;
      properties: Array<{ name: string; valueType: string }>;
    };

    expect(customer.namespace).toBe('usertypes');
    expect(customer.namespaceType).toBe('Custom');
    expect(customer.visibility).toBe('Visible');
    expect(customer.properties).toHaveLength(3);

    const propTypes = Object.fromEntries(customer.properties.map(p => [p.name, p.valueType]));
    expect(propTypes['customerId']).toBe('String');
    expect(propTypes['email']).toBe('String');
    expect(propTypes['age']).toBe('BigInt');
  });

  it('maps Order properties with correct types', () => {
    const { definition } = convertToFabricParts(minimalOntology);
    const entityParts = definition.parts.filter(p => p.path.startsWith('EntityTypes/'));

    const orderPart = entityParts.find(p => {
      const decoded = decode(p.payload) as { name: string };
      return decoded.name === 'Order';
    });

    const order = decode(orderPart!.payload) as {
      properties: Array<{ name: string; valueType: string }>;
    };

    const propTypes = Object.fromEntries(order.properties.map(p => [p.name, p.valueType]));
    expect(propTypes['total']).toBe('Double');
    expect(propTypes['timestamp']).toBe('DateTime');
    expect(propTypes['paid']).toBe('Boolean');
  });

  it('sets entityIdParts from isIdentifier property', () => {
    const { definition } = convertToFabricParts(minimalOntology);
    const entityParts = definition.parts.filter(p => p.path.startsWith('EntityTypes/'));

    const customerPart = entityParts.find(p => {
      const decoded = decode(p.payload) as { name: string };
      return decoded.name === 'Customer';
    });

    const customer = decode(customerPart!.payload) as {
      entityIdParts: string[];
      displayNamePropertyId: string;
      properties: Array<{ id: string; name: string }>;
    };

    const customerIdProp = customer.properties.find(p => p.name === 'customerId');
    expect(customer.entityIdParts).toEqual([customerIdProp!.id]);
    expect(customer.displayNamePropertyId).toBe(customerIdProp!.id);
  });

  it('resolves relationship source/target to fabric entity IDs', () => {
    const { definition, entityIdMap } = convertToFabricParts(minimalOntology);
    const relPart = definition.parts.find(p => p.path.startsWith('RelationshipTypes/'));

    const rel = decode(relPart!.payload) as {
      name: string;
      source: { entityTypeId: string };
      target: { entityTypeId: string };
    };

    expect(rel.name).toBe('places');
    expect(rel.source.entityTypeId).toBe(entityIdMap.get('customer'));
    expect(rel.target.entityTypeId).toBe(entityIdMap.get('order'));
  });

  it('skips relationships referencing unknown entities', () => {
    const ontologyWithBadRel: Ontology = {
      ...minimalOntology,
      relationships: [
        ...minimalOntology.relationships,
        {
          id: 'broken',
          name: 'broken_rel',
          from: 'customer',
          to: 'nonexistent',
          cardinality: 'one-to-one',
        },
      ],
    };

    const { definition } = convertToFabricParts(ontologyWithBadRel);
    const relParts = definition.parts.filter(p => p.path.startsWith('RelationshipTypes/'));

    // Only the valid relationship should be included
    expect(relParts).toHaveLength(1);
  });

  it('generates unique numeric IDs', () => {
    const { definition } = convertToFabricParts(minimalOntology);
    const entityParts = definition.parts.filter(p => p.path.startsWith('EntityTypes/'));

    const ids = entityParts.map(p => {
      const match = p.path.match(/EntityTypes\/(\d+)\//);
      return match?.[1];
    });

    // All IDs should be unique
    expect(new Set(ids).size).toBe(ids.length);
    // All IDs should be numeric strings
    ids.forEach(id => expect(id).toMatch(/^\d+$/));
  });

  it('sanitizes names with special characters', () => {
    const ontology: Ontology = {
      name: 'My Fancy Ontology!',
      description: 'test',
      entityTypes: [
        {
          id: 'entity-1',
          name: 'Coffee Shop (NYC)',
          description: 'test',
          icon: '☕',
          color: '#000',
          properties: [
            { name: 'shop id', type: 'string', isIdentifier: true },
          ],
        },
      ],
      relationships: [],
    };

    const { definition } = convertToFabricParts(ontology);
    const entityPart = definition.parts.find(p => p.path.startsWith('EntityTypes/'));
    const entity = decode(entityPart!.payload) as { name: string; properties: Array<{ name: string }> };

    // Names should be sanitized: no spaces, parens, or exclamation marks
    expect(entity.name).toMatch(/^[a-zA-Z][a-zA-Z0-9_-]*$/);
    expect(entity.properties[0].name).toMatch(/^[a-zA-Z][a-zA-Z0-9_-]*$/);
  });

  it('platform part contains correct metadata', () => {
    const { definition } = convertToFabricParts(minimalOntology);
    const platformPart = definition.parts.find(p => p.path === '.platform');

    const platform = decode(platformPart!.payload) as {
      metadata: { type: string; displayName: string };
    };

    expect(platform.metadata.type).toBe('Ontology');
    expect(platform.metadata.displayName).toBe('Test Ontology');
  });

  it('definition.json part is empty object', () => {
    const { definition } = convertToFabricParts(minimalOntology);
    const defPart = definition.parts.find(p => p.path === 'definition.json');

    const defContent = decode(defPart!.payload);
    expect(defContent).toEqual({});
  });

  it('handles ontology with no properties gracefully', () => {
    const ontology: Ontology = {
      name: 'Empty',
      description: '',
      entityTypes: [
        {
          id: 'e1',
          name: 'EmptyEntity',
          description: '',
          icon: '📦',
          color: '#000',
          properties: [],
        },
      ],
      relationships: [],
    };

    const { definition } = convertToFabricParts(ontology);
    const entityPart = definition.parts.find(p => p.path.startsWith('EntityTypes/'));
    const entity = decode(entityPart!.payload) as {
      properties: unknown[];
      entityIdParts: unknown[];
    };

    expect(entity.properties).toHaveLength(0);
    expect(entity.entityIdParts).toHaveLength(0);
  });
});

// ─── Network layer (issue #68) ──────────────────────────────────────────────

interface MockResponseInit {
  status?: number;
  ok?: boolean;
  body?: string;
  headers?: Record<string, string>;
}

/**
 * Build a minimal stand-in for a fetch Response. Mirrors the real Response in
 * the way that matters for #68: json() throws on an empty body, while text()
 * returns the raw string.
 */
function mockResponse({ status = 200, ok, body = '', headers = {} }: MockResponseInit = {}): Response {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    status,
    ok: ok ?? (status >= 200 && status < 300),
    statusText: 'Mock Status',
    headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
    text: async () => body,
    json: async () => JSON.parse(body),
  } as unknown as Response;
}

describe('Fabric REST client (issue #68: empty JSON response)', () => {
  const workspaceId = '11111111-1111-1111-1111-111111111111';
  const token = 'fake-token';
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('updateOntologyDefinition resolves on a 200 with an empty body (regression for #68)', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200, body: '' }));

    await expect(
      updateOntologyDefinition(workspaceId, 'ont-1', token, minimalOntology),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('updateOntologyDefinition resolves on a 200 with a whitespace-only body', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200, body: '   \n  ' }));

    await expect(
      updateOntologyDefinition(workspaceId, 'ont-1', token, minimalOntology),
    ).resolves.toBeUndefined();
  });

  it('updateOntologyDefinition resolves on a 204 No Content', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 204, body: '' }));

    await expect(
      updateOntologyDefinition(workspaceId, 'ont-1', token, minimalOntology),
    ).resolves.toBeUndefined();
  });

  it('surfaces a FabricApiError with the message from a JSON error body', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: 403,
        body: JSON.stringify({ errorCode: 'InsufficientPrivileges', message: 'No access to workspace' }),
      }),
    );

    await expect(
      updateOntologyDefinition(workspaceId, 'ont-1', token, minimalOntology),
    ).rejects.toMatchObject({
      name: 'FabricApiError',
      status: 403,
      errorCode: 'InsufficientPrivileges',
      message: 'No access to workspace',
    });
  });

  it('throws a FabricApiError with a default message when the error body is empty', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 500, body: '' }));

    const error = await updateOntologyDefinition(workspaceId, 'ont-1', token, minimalOntology).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(FabricApiError);
    expect((error as FabricApiError).status).toBe(500);
  });

  it('listOntologies parses the value array from a JSON body', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: 200,
        body: JSON.stringify({
          value: [
            { id: 'o1', displayName: 'Alpha', description: '', type: 'Ontology', workspaceId },
            { id: 'o2', displayName: 'Beta', description: '', type: 'Ontology', workspaceId },
          ],
        }),
      }),
    );

    const list = await listOntologies(workspaceId, token);
    expect(list.map(o => o.id)).toEqual(['o1', 'o2']);
  });

  it('listOntologies returns an empty array when the body is empty', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200, body: '' }));

    await expect(listOntologies(workspaceId, token)).resolves.toEqual([]);
  });

  it('createOntology returns the created ontology from a 201 JSON body', async () => {
    const created = {
      id: 'new-1',
      displayName: 'Test_Ontology',
      description: '',
      type: 'Ontology',
      workspaceId,
    };
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 201, body: JSON.stringify(created) }));

    await expect(createOntology(workspaceId, token, minimalOntology)).resolves.toMatchObject({ id: 'new-1' });
  });

  it('updateOntologyDefinition polls a 202 long-running operation to completion', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(mockResponse({ status: 202, headers: { 'x-ms-operation-id': 'op-1' } }))
      .mockResolvedValueOnce(mockResponse({ status: 200, body: JSON.stringify({ status: 'Succeeded' }) }));

    const promise = updateOntologyDefinition(workspaceId, 'ont-1', token, minimalOntology);
    await vi.advanceTimersByTimeAsync(2000);

    await expect(promise).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('createOntology polls a 202 operation, then resolves the created item from the list', async () => {
    vi.useFakeTimers();
    const created = {
      id: 'made-1',
      displayName: 'Test_Ontology',
      description: '',
      type: 'Ontology',
      workspaceId,
    };
    fetchMock
      .mockResolvedValueOnce(mockResponse({ status: 202, headers: { 'x-ms-operation-id': 'op-2' } }))
      .mockResolvedValueOnce(mockResponse({ status: 200, body: JSON.stringify({ status: 'Succeeded' }) }))
      .mockResolvedValueOnce(mockResponse({ status: 200, body: JSON.stringify({ value: [created] }) }));

    const promise = createOntology(workspaceId, token, minimalOntology);
    await vi.advanceTimersByTimeAsync(2000);

    await expect(promise).resolves.toMatchObject({ id: 'made-1' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('propagates a FabricApiError when the long-running operation fails', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(mockResponse({ status: 202, headers: { 'x-ms-operation-id': 'op-3' } }))
      .mockResolvedValueOnce(
        mockResponse({
          status: 200,
          body: JSON.stringify({ status: 'Failed', error: { message: 'boom', errorCode: 'BadDefinition' } }),
        }),
      );

    const settled = updateOntologyDefinition(workspaceId, 'ont-1', token, minimalOntology).catch(
      (e: unknown) => e,
    );
    await vi.advanceTimersByTimeAsync(2000);

    const error = await settled;
    expect(error).toBeInstanceOf(FabricApiError);
    expect((error as FabricApiError).message).toBe('boom');
  });
});
