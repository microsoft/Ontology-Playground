/**
 * Fabric Workspace API client — list workspaces and create new ones.
 *
 * API Reference:
 *   https://learn.microsoft.com/en-us/rest/api/fabric/core/workspaces/list-workspaces
 *   https://learn.microsoft.com/en-us/rest/api/fabric/core/workspaces/create-workspace
 */

const FABRIC_API_BASE = 'https://api.fabric.microsoft.com/v1';

export interface FabricWorkspace {
  id: string;
  displayName: string;
  description: string;
  type: string;
  capacityId?: string;
  capacityRegion?: string;
}

export interface FabricCapacity {
  id: string;
  displayName: string;
  sku: string;
  state: string;
  region: string;
}

interface ListWorkspacesResponse {
  value: FabricWorkspace[];
  continuationUri?: string;
}

interface ListCapacitiesResponse {
  value: FabricCapacity[];
}

/**
 * List all Fabric workspaces the current user has access to.
 */
export async function listWorkspaces(token: string): Promise<FabricWorkspace[]> {
  const workspaces: FabricWorkspace[] = [];
  let url: string | null = `${FABRIC_API_BASE}/workspaces`;

  while (url) {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Failed to list workspaces: ${res.status} ${body}`);
    }

    const data: ListWorkspacesResponse = await res.json();
    workspaces.push(...data.value);
    url = data.continuationUri ?? null;
  }

  // Sort alphabetically
  workspaces.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return workspaces;
}

/**
 * List available Fabric capacities.
 */
export async function listCapacities(token: string): Promise<FabricCapacity[]> {
  const res = await fetch(`${FABRIC_API_BASE}/capacities`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data: ListCapacitiesResponse = await res.json();
  return data.value.filter(c => c.state === 'Active');
}

/**
 * Assign a capacity to a workspace.
 */
export async function assignCapacity(
  token: string,
  workspaceId: string,
  capacityId: string,
): Promise<void> {
  const res = await fetch(`${FABRIC_API_BASE}/workspaces/${workspaceId}/assignToCapacity`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ capacityId }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to assign capacity: ${res.status} ${body}`);
  }
}

/**
 * Create a new Fabric workspace.
 */
export async function createWorkspace(
  token: string,
  displayName: string,
  description = '',
): Promise<FabricWorkspace> {
  const res = await fetch(`${FABRIC_API_BASE}/workspaces`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ displayName, description }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create workspace: ${res.status} ${body}`);
  }

  return await res.json() as FabricWorkspace;
}
