/**
 * Fabric Workspace API client — list workspaces and their capacities.
 *
 * API Reference:
 *   https://learn.microsoft.com/en-us/rest/api/fabric/core/workspaces/list-workspaces
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

interface ListWorkspacesResponse {
  value: FabricWorkspace[];
  continuationUri?: string;
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

  workspaces.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return workspaces;
}
