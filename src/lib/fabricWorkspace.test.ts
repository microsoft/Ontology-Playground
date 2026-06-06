import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  listWorkspaces,
  listCapacities,
  assignCapacity,
  createWorkspace,
  FabricWorkspace,
  FabricCapacity,
} from './fabricWorkspace';

// ─── Helpers ────────────────────────────────────────────────────────────────

const mockResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body),
  text: () => Promise.resolve(JSON.stringify(body)),
});

// ─── listWorkspaces ─────────────────────────────────────────────────────────

describe('listWorkspaces', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns workspaces sorted alphabetically by displayName', async () => {
    const workspaces = [
      { id: '1', displayName: 'Zebra', description: '', type: 'Workspace' },
      { id: '2', displayName: 'Alpha', description: '', type: 'Workspace' },
      { id: '3', displayName: 'Beta', description: '', type: 'Workspace' },
    ];

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse({ value: workspaces }),
    );

    const result = await listWorkspaces('test-token');

    expect(result).toHaveLength(3);
    expect(result[0].displayName).toBe('Alpha');
    expect(result[1].displayName).toBe('Beta');
    expect(result[2].displayName).toBe('Zebra');
  });

  it('handles multi-page pagination (continuationUri)', async () => {
    const page1 = [
      { id: '1', displayName: 'Workspace A', description: '', type: 'Workspace' },
    ];
    const page2 = [
      { id: '2', displayName: 'Workspace B', description: '', type: 'Workspace' },
    ];

    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(
        mockResponse({
          value: page1,
          continuationUri: 'https://api.fabric.microsoft.com/v1/workspaces?page=2',
        }),
      )
      .mockResolvedValueOnce(
        mockResponse({
          value: page2,
        }),
      );

    const result = await listWorkspaces('test-token');

    expect(result).toHaveLength(2);
    expect(result[0].displayName).toBe('Workspace A');
    expect(result[1].displayName).toBe('Workspace B');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('throws on non-OK response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse({ error: 'Unauthorized' }, 401),
    );

    await expect(listWorkspaces('bad-token')).rejects.toThrow(
      'Failed to list workspaces',
    );
  });
});

// ─── listCapacities ─────────────────────────────────────────────────────────

describe('listCapacities', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns only Active capacities', async () => {
    const capacities = [
      { id: '1', displayName: 'Capacity A', sku: 'F2', state: 'Active', region: 'US' },
      { id: '2', displayName: 'Capacity B', sku: 'F4', state: 'Deleted', region: 'US' },
      { id: '3', displayName: 'Capacity C', sku: 'P1', state: 'Active', region: 'EU' },
    ];

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse({ value: capacities }),
    );

    const result = await listCapacities('test-token');

    expect(result).toHaveLength(2);
    expect(result[0].displayName).toBe('Capacity A');
    expect(result[1].displayName).toBe('Capacity C');
    expect(result.every(c => c.state === 'Active')).toBe(true);
  });

  it('returns empty array on non-OK response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse({ error: 'Forbidden' }, 403),
    );

    const result = await listCapacities('test-token');

    expect(result).toEqual([]);
  });
});

// ─── assignCapacity ─────────────────────────────────────────────────────────

describe('assignCapacity', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.restoreAllMocks());

  it('sends correct POST body', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse({}),
    );

    await assignCapacity('test-token', 'workspace-123', 'capacity-456');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/workspaces/workspace-123/assignToCapacity'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ capacityId: 'capacity-456' }),
      }),
    );
  });

  it('throws on failure', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse({ error: 'Bad Request' }, 400),
    );

    await expect(
      assignCapacity('test-token', 'workspace-123', 'capacity-456'),
    ).rejects.toThrow('Failed to assign capacity');
  });
});

// ─── createWorkspace ────────────────────────────────────────────────────────

describe('createWorkspace', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns created workspace', async () => {
    const createdWorkspace: FabricWorkspace = {
      id: 'new-ws-123',
      displayName: 'My New Workspace',
      description: 'A test workspace',
      type: 'Workspace',
    };

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse(createdWorkspace),
    );

    const result = await createWorkspace(
      'test-token',
      'My New Workspace',
      'A test workspace',
    );

    expect(result.id).toBe('new-ws-123');
    expect(result.displayName).toBe('My New Workspace');
    expect(result.description).toBe('A test workspace');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/workspaces'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          displayName: 'My New Workspace',
          description: 'A test workspace',
        }),
      }),
    );
  });

  it('throws on failure', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse({ error: 'Internal Server Error' }, 500),
    );

    await expect(
      createWorkspace('test-token', 'My Workspace'),
    ).rejects.toThrow('Failed to create workspace');
  });
});
