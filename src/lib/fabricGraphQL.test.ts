import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGraphQLApi, GraphQLApiResponse } from './fabricGraphQL';

describe('fabricGraphQL', () => {
  const mockWorkspaceId = 'ws-123';
  const mockToken = 'token-abc';
  const mockDisplayName = 'Test GraphQL API';
  const mockDescription = 'Test description';
  const mockLakehouseId = 'lakehouse-xyz';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('should return response body on direct 200 success', async () => {
    const mockResponse: GraphQLApiResponse = {
      id: 'gql-1',
      displayName: mockDisplayName,
      description: mockDescription,
      type: 'GraphQLApi',
      workspaceId: mockWorkspaceId,
    };

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValueOnce(mockResponse),
    });

    const result = await createGraphQLApi(
      mockWorkspaceId,
      mockToken,
      mockDisplayName,
      mockDescription,
      mockLakehouseId,
    );

    expect(result).toEqual(mockResponse);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('should throw on direct non-OK response', async () => {
    const errorBody = 'Unauthorized access';

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 401,
      ok: false,
      text: vi.fn().mockResolvedValueOnce(errorBody),
    });

    await expect(
      createGraphQLApi(
        mockWorkspaceId,
        mockToken,
        mockDisplayName,
        mockDescription,
        mockLakehouseId,
      ),
    ).rejects.toThrow(/Failed to create GraphQL API.*401.*Unauthorized/);
  });

  it('should poll operation and return match on 202 with operation-id', async () => {
    const mockApiResponse: GraphQLApiResponse = {
      id: 'gql-123',
      displayName: mockDisplayName,
      description: mockDescription,
      type: 'GraphQLApi',
      workspaceId: mockWorkspaceId,
    };

    const mockHeaders = new Map([['x-ms-operation-id', 'op-456']]);

    // First call: POST to create (returns 202)
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 202,
      ok: false,
      headers: mockHeaders,
    });

    // Second call: GET operation status (returns Succeeded)
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValueOnce({ status: 'Succeeded' }),
    });

    // Third call: GET list of APIs (returns match)
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValueOnce({
        value: [mockApiResponse],
      }),
    });

    const result = await createGraphQLApi(
      mockWorkspaceId,
      mockToken,
      mockDisplayName,
      mockDescription,
      mockLakehouseId,
    );

    expect(result).toEqual(mockApiResponse);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('should skip polling and list APIs on 202 without operation-id', async () => {
    const mockApiResponse: GraphQLApiResponse = {
      id: 'gql-789',
      displayName: mockDisplayName,
      description: mockDescription,
      type: 'GraphQLApi',
      workspaceId: mockWorkspaceId,
    };

    const mockHeaders = new Map([]);

    // First call: POST to create (returns 202, no operation-id)
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 202,
      ok: false,
      headers: mockHeaders,
    });

    // Second call: GET list of APIs (returns match)
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValueOnce({
        value: [mockApiResponse],
      }),
    });

    const result = await createGraphQLApi(
      mockWorkspaceId,
      mockToken,
      mockDisplayName,
      mockDescription,
      mockLakehouseId,
    );

    expect(result).toEqual(mockApiResponse);
    // Should skip polling, only call create and list
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('should throw when poll returns Failed status', async () => {
    const mockHeaders = new Map([['x-ms-operation-id', 'op-fail']]);

    // First call: POST to create (returns 202)
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 202,
      ok: false,
      headers: mockHeaders,
    });

    // Second call: GET operation status (returns Failed)
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValueOnce({
        status: 'Failed',
        error: { message: 'Lakehouse not found' },
      }),
    });

    await expect(
      createGraphQLApi(
        mockWorkspaceId,
        mockToken,
        mockDisplayName,
        mockDescription,
        mockLakehouseId,
      ),
    ).rejects.toThrow(/Operation failed.*Lakehouse not found/);

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('should include correct request body structure with base64 payloads', async () => {
    const mockResponse: GraphQLApiResponse = {
      id: 'gql-struct',
      displayName: mockDisplayName,
      description: mockDescription,
      type: 'GraphQLApi',
      workspaceId: mockWorkspaceId,
    };

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValueOnce(mockResponse),
    });

    await createGraphQLApi(
      mockWorkspaceId,
      mockToken,
      mockDisplayName,
      mockDescription,
      mockLakehouseId,
    );

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toContain(`/workspaces/${mockWorkspaceId}/graphQLApis`);
    expect(fetchCall[1].method).toBe('POST');
    expect(fetchCall[1].headers['Content-Type']).toBe('application/json');
    expect(fetchCall[1].headers['Authorization']).toBe(`Bearer ${mockToken}`);

    const body = JSON.parse(fetchCall[1].body);
    expect(body.displayName).toBe(mockDisplayName);
    expect(body.description).toBe(mockDescription);

    // Verify definition parts structure
    expect(body.definition.parts).toHaveLength(2);

    const platformPart = body.definition.parts[0];
    expect(platformPart.path).toBe('.platform');
    expect(platformPart.payloadType).toBe('InlineBase64');
    const platformPayload = JSON.parse(atob(platformPart.payload));
    expect(platformPayload.metadata.type).toBe('GraphQLApi');
    expect(platformPayload.metadata.displayName).toBe(mockDisplayName);

    const definitionPart = body.definition.parts[1];
    expect(definitionPart.path).toBe('definition.json');
    expect(definitionPart.payloadType).toBe('InlineBase64');
    const definitionPayload = JSON.parse(atob(definitionPart.payload));
    expect(definitionPayload.dataSourceId).toBe(mockLakehouseId);
    expect(definitionPayload.dataSourceType).toBe('Lakehouse');
  });

  it('should throw when created API not found in list', async () => {
    const mockHeaders = new Map([['x-ms-operation-id', 'op-notfound']]);

    // First call: POST to create (returns 202)
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 202,
      ok: false,
      headers: mockHeaders,
    });

    // Second call: GET operation status (returns Succeeded)
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValueOnce({ status: 'Succeeded' }),
    });

    // Third call: GET list of APIs (returns empty list)
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValueOnce({
        value: [],
      }),
    });

    await expect(
      createGraphQLApi(
        mockWorkspaceId,
        mockToken,
        mockDisplayName,
        mockDescription,
        mockLakehouseId,
      ),
    ).rejects.toThrow('GraphQL API created but not found');
  });

  it('should pass correct authorization headers for all fetch calls', async () => {
    const mockApiResponse: GraphQLApiResponse = {
      id: 'gql-auth',
      displayName: mockDisplayName,
      description: mockDescription,
      type: 'GraphQLApi',
      workspaceId: mockWorkspaceId,
    };

    const mockHeaders = new Map([['x-ms-operation-id', 'op-auth']]);

    // First call: POST to create
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 202,
      ok: false,
      headers: mockHeaders,
    });

    // Second call: GET operation status
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValueOnce({ status: 'Succeeded' }),
    });

    // Third call: GET list of APIs
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValueOnce({
        value: [mockApiResponse],
      }),
    });

    await createGraphQLApi(
      mockWorkspaceId,
      mockToken,
      mockDisplayName,
      mockDescription,
      mockLakehouseId,
    );

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;

    // Verify all calls have correct authorization
    calls.forEach((call) => {
      expect(call[1].headers['Authorization']).toBe(`Bearer ${mockToken}`);
    });

    // Verify operation endpoint
    expect(calls[1][0]).toContain('/operations/op-auth');
  });
});
