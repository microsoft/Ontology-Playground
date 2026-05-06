import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSemanticModel } from './fabricSemanticModel';
import type { Ontology } from '../data/ontology';

// ─── Test Ontology Fixture ──────────────────────────────────────────────────

const testOntology: Ontology = {
  name: 'TestOntology',
  description: 'Test ontology for semantic model creation',
  entityTypes: [
    {
      id: 'customer',
      name: 'Customer',
      description: 'Customer entity',
      icon: '👤',
      color: '#fff',
      properties: [
        { name: 'customerId', type: 'string', isIdentifier: true },
        { name: 'name', type: 'string' },
        { name: 'age', type: 'integer' },
        { name: 'balance', type: 'decimal' },
        { name: 'active', type: 'boolean' },
        { name: 'created', type: 'datetime' },
      ],
    },
    {
      id: 'order',
      name: 'Order',
      description: 'Order entity',
      icon: '📦',
      color: '#fff',
      properties: [
        { name: 'orderId', type: 'string', isIdentifier: true },
        { name: 'total', type: 'double' },
      ],
    },
  ],
  relationships: [
    { id: 'r1', name: 'places', from: 'customer', to: 'order', cardinality: '1:n' },
  ],
};

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Decode base64 TMSL model from semantic model definition payload
 */
function decodeBase64ToJson(base64: string): unknown {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text);
}

/**
 * Extract model.bim payload from semantic model definition
 */
function extractModelPayload(definitionParts: Array<{ path: string; payload: string }>): unknown {
  const modelPart = definitionParts.find(p => p.path === 'definition/model.bim');
  if (!modelPart) throw new Error('No model.bim part found in definition');
  return decodeBase64ToJson(modelPart.payload);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('createSemanticModel', () => {
  const workspaceId = 'ws-123';
  const token = 'test-token';
  const lakehouseId = 'lh-456';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('setTimeout', vi.fn((cb: () => void) => cb()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ─── Test 1: Direct 200/201 success ─────────────────────────────────────

  it('returns response body on direct 200/201 success', async () => {
    const mockResponse = {
      id: 'model-123',
      displayName: 'TestOntology - Semantic Model',
      description: 'Auto-generated semantic model for TestOntology ontology',
      type: 'SemanticModel',
      workspaceId,
    };

    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValueOnce(mockResponse),
    } as any);

    const result = await createSemanticModel(workspaceId, token, testOntology, lakehouseId);

    expect(result).toEqual(mockResponse);
    expect(fetch).toHaveBeenCalledWith(
      `https://api.fabric.microsoft.com/v1/workspaces/${workspaceId}/semanticModels`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  // ─── Test 2: Non-OK response throws error ───────────────────────────────

  it('throws error on non-OK response with status and body', async () => {
    const errorBody = 'Unauthorized access';

    vi.mocked(fetch).mockResolvedValueOnce({
      status: 401,
      ok: false,
      text: vi.fn().mockResolvedValueOnce(errorBody),
    } as any);

    await expect(createSemanticModel(workspaceId, token, testOntology, lakehouseId)).rejects.toThrow(
      'Failed to create semantic model: 401 Unauthorized access',
    );
  });

  // ─── Test 3: 202 + poll → Succeeded → list fallback ─────────────────────

  it('polls operation and returns found model on 202 success', async () => {
    const mockModel = {
      id: 'model-202',
      displayName: 'TestOntology - Semantic Model',
      description: 'Auto-generated semantic model for TestOntology ontology',
      type: 'SemanticModel',
      workspaceId,
    };

    // First call: 202 Accepted with operation ID
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 202,
      ok: true,
      headers: { get: vi.fn((header: string) => (header === 'x-ms-operation-id' ? 'op-789' : null)) },
    } as any);

    // Poll call: operation status
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValueOnce({ status: 'Succeeded' }),
    } as any);

    // List call: fetch created model
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValueOnce({ value: [mockModel] }),
    } as any);

    const result = await createSemanticModel(workspaceId, token, testOntology, lakehouseId);

    expect(result).toEqual(mockModel);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  // ─── Test 4: 202 → not found throws error ──────────────────────────────

  it('throws error when model created but not found after 202', async () => {
    // First call: 202 Accepted with operation ID
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 202,
      ok: true,
      headers: { get: vi.fn((header: string) => (header === 'x-ms-operation-id' ? 'op-789' : null)) },
    } as any);

    // Poll call: operation status
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValueOnce({ status: 'Succeeded' }),
    } as any);

    // List call: empty list
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValueOnce({ value: [] }),
    } as any);

    await expect(createSemanticModel(workspaceId, token, testOntology, lakehouseId)).rejects.toThrow(
      'Semantic model created but not found',
    );
  });

  // ─── Test 5: TMSL type mapping ──────────────────────────────────────────

  it('verifies correct TMSL column types in model.bim payload', async () => {
    const mockResponse = {
      id: 'model-123',
      displayName: 'TestOntology - Semantic Model',
      description: 'Auto-generated semantic model for TestOntology ontology',
      type: 'SemanticModel',
      workspaceId,
    };

    let capturedDefinition: any;

    vi.mocked(fetch).mockImplementationOnce(async (url, options) => {
      if (typeof url === 'string' && url.includes('semanticModels')) {
        capturedDefinition = JSON.parse((options as any).body);
      }
      return {
        status: 200,
        ok: true,
        json: vi.fn().mockResolvedValueOnce(mockResponse),
      } as any;
    });

    await createSemanticModel(workspaceId, token, testOntology, lakehouseId);

    const modelPayload = extractModelPayload(capturedDefinition.definition.parts);
    const model = (modelPayload as any).model;
    const customerTable = model.tables.find((t: any) => t.name === 'Customer');

    expect(customerTable).toBeDefined();
    expect(customerTable.columns).toContainEqual(expect.objectContaining({ name: 'customerId', dataType: 'String' }));
    expect(customerTable.columns).toContainEqual(expect.objectContaining({ name: 'age', dataType: 'Int64' }));
    expect(customerTable.columns).toContainEqual(expect.objectContaining({ name: 'balance', dataType: 'Double' }));
    expect(customerTable.columns).toContainEqual(expect.objectContaining({ name: 'active', dataType: 'Boolean' }));
    expect(customerTable.columns).toContainEqual(expect.objectContaining({ name: 'created', dataType: 'DateTime' }));
  });

  // ─── Test 6: Identifier properties get isKey ────────────────────────────

  it('sets isKey: true on identifier columns in model.bim', async () => {
    const mockResponse = {
      id: 'model-123',
      displayName: 'TestOntology - Semantic Model',
      description: 'Auto-generated semantic model for TestOntology ontology',
      type: 'SemanticModel',
      workspaceId,
    };

    let capturedDefinition: any;

    vi.mocked(fetch).mockImplementationOnce(async (url, options) => {
      if (typeof url === 'string' && url.includes('semanticModels')) {
        capturedDefinition = JSON.parse((options as any).body);
      }
      return {
        status: 200,
        ok: true,
        json: vi.fn().mockResolvedValueOnce(mockResponse),
      } as any;
    });

    await createSemanticModel(workspaceId, token, testOntology, lakehouseId);

    const modelPayload = extractModelPayload(capturedDefinition.definition.parts);
    const model = (modelPayload as any).model;
    const customerTable = model.tables.find((t: any) => t.name === 'Customer');
    const customerIdColumn = customerTable.columns.find((c: any) => c.name === 'customerId');
    const nameColumn = customerTable.columns.find((c: any) => c.name === 'name');

    expect(customerIdColumn).toEqual(expect.objectContaining({ isKey: true }));
    expect(nameColumn).not.toHaveProperty('isKey');
  });

  // ─── Test 7: Relationships built correctly ──────────────────────────────

  it('builds relationships with correct fromTable, toTable, and join columns', async () => {
    const mockResponse = {
      id: 'model-123',
      displayName: 'TestOntology - Semantic Model',
      description: 'Auto-generated semantic model for TestOntology ontology',
      type: 'SemanticModel',
      workspaceId,
    };

    let capturedDefinition: any;

    vi.mocked(fetch).mockImplementationOnce(async (url, options) => {
      if (typeof url === 'string' && url.includes('semanticModels')) {
        capturedDefinition = JSON.parse((options as any).body);
      }
      return {
        status: 200,
        ok: true,
        json: vi.fn().mockResolvedValueOnce(mockResponse),
      } as any;
    });

    await createSemanticModel(workspaceId, token, testOntology, lakehouseId);

    const modelPayload = extractModelPayload(capturedDefinition.definition.parts);
    const model = (modelPayload as any).model;

    expect(model.relationships).toHaveLength(1);
    const rel = model.relationships[0];
    expect(rel).toEqual(expect.objectContaining({
      fromTable: 'Customer',
      fromColumn: 'customerId',
      toTable: 'Order',
      toColumn: 'orderId',
      crossFilteringBehavior: 'OneDirection',
    }));
  });

  // ─── Test 8: Missing entities in relationships skipped ──────────────────

  it('skips relationships referencing non-existent entity IDs', async () => {
    const invalidOntology: Ontology = {
      name: 'InvalidOntology',
      description: 'Ontology with invalid relationship',
      entityTypes: [
        {
          id: 'customer',
          name: 'Customer',
          description: 'Customer entity',
          icon: '👤',
          color: '#fff',
          properties: [
            { name: 'customerId', type: 'string', isIdentifier: true },
          ],
        },
      ],
      relationships: [
        // Reference to non-existent 'order' entity ID
        { id: 'r1', name: 'places', from: 'customer', to: 'order', cardinality: '1:n' },
      ],
    };

    const mockResponse = {
      id: 'model-123',
      displayName: 'InvalidOntology - Semantic Model',
      description: 'Auto-generated semantic model for InvalidOntology ontology',
      type: 'SemanticModel',
      workspaceId,
    };

    let capturedDefinition: any;

    vi.mocked(fetch).mockImplementationOnce(async (url, options) => {
      if (typeof url === 'string' && url.includes('semanticModels')) {
        capturedDefinition = JSON.parse((options as any).body);
      }
      return {
        status: 200,
        ok: true,
        json: vi.fn().mockResolvedValueOnce(mockResponse),
      } as any;
    });

    await createSemanticModel(workspaceId, token, invalidOntology, lakehouseId);

    const modelPayload = extractModelPayload(capturedDefinition.definition.parts);
    const model = (modelPayload as any).model;

    // Relationship should not be included since 'order' entity doesn't exist
    expect(model.relationships).toHaveLength(0);
  });
});
