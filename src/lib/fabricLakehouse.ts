/**
 * Fabric Lakehouse API client — creates Lakehouses and uploads table data.
 *
 * API Reference:
 *   https://learn.microsoft.com/en-us/rest/api/fabric/lakehouse/items/create-lakehouse
 *   https://learn.microsoft.com/en-us/rest/api/fabric/lakehouse/tables/load-table
 */

import type { EntityInstance } from '../data/ontology';
import { instancesToCSV } from './sampleDataGenerator';

const FABRIC_API_BASE = 'https://api.fabric.microsoft.com/v1';
const ONELAKE_BASE = 'https://onelake.dfs.fabric.microsoft.com';

export interface LakehouseResponse {
  id: string;
  displayName: string;
  description: string;
  type: 'Lakehouse';
  workspaceId: string;
}

async function fabricFetch<T>(
  url: string,
  token: string,
  options: RequestInit = {},
): Promise<T | null> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (res.status === 202) {
    const operationId = res.headers.get('x-ms-operation-id');
    if (operationId) {
      await pollOperation(operationId, token);
    }
    return null;
  }

  if (res.status === 204) return null;

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Fabric API error ${res.status}: ${body}`);
  }

  // Handle 200 with empty body (e.g., Load Table API)
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text) as T;
}

async function pollOperation(operationId: string, token: string, maxAttempts = 60): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    const res = await fetch(`${FABRIC_API_BASE}/operations/${operationId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (res.ok) {
      const body = await res.json();
      if (body.status === 'Succeeded') return;
      if (body.status === 'Failed') {
        throw new Error(`Operation failed: ${body.error?.message ?? 'Unknown error'}`);
      }
    }
  }
  throw new Error('Operation timed out');
}

/**
 * Create a new Lakehouse in a Fabric workspace.
 */
export async function createLakehouse(
  workspaceId: string,
  token: string,
  displayName: string,
  description = '',
): Promise<LakehouseResponse> {
  // Omitting creationPayload creates a plain Lakehouse (no schemas).
  // Including creationPayload with enableSchemas:true creates a schema-enabled one.
  const result = await fabricFetch<LakehouseResponse>(
    `${FABRIC_API_BASE}/workspaces/${workspaceId}/lakehouses`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ displayName, description }),
    },
  );

  if (!result) {
    // Created via long-running op — fetch it
    const list = await fabricFetch<{ value: LakehouseResponse[] }>(
      `${FABRIC_API_BASE}/workspaces/${workspaceId}/lakehouses`,
      token,
    );
    const found = list?.value.find(l => l.displayName === displayName);
    if (found) return found;
    throw new Error('Lakehouse created but not found');
  }

  return result;
}

/**
 * Upload a CSV file to OneLake Files area for a Lakehouse.
 */
async function uploadFileToOneLake(
  workspaceId: string,
  lakehouseId: string,
  token: string,
  filePath: string,
  content: string,
): Promise<void> {
  const url = `${ONELAKE_BASE}/${workspaceId}/${lakehouseId}/Files/${filePath}?resource=file`;

  // Create the file
  const createRes = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Length': '0',
    },
  });

  if (!createRes.ok && createRes.status !== 201) {
    throw new Error(`Failed to create OneLake file: ${createRes.status}`);
  }

  // Append content
  const blob = new Blob([content], { type: 'text/csv' });
  const appendUrl = `${ONELAKE_BASE}/${workspaceId}/${lakehouseId}/Files/${filePath}?action=append&position=0`;
  const appendRes = await fetch(appendUrl, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
    },
    body: blob,
  });

  if (!appendRes.ok && appendRes.status !== 202) {
    throw new Error(`Failed to append data: ${appendRes.status}`);
  }

  // Flush
  const flushUrl = `${ONELAKE_BASE}/${workspaceId}/${lakehouseId}/Files/${filePath}?action=flush&position=${blob.size}`;
  const flushRes = await fetch(flushUrl, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!flushRes.ok && flushRes.status !== 200) {
    throw new Error(`Failed to flush file: ${flushRes.status}`);
  }
}

/**
 * Load a CSV file from Files into a managed Delta table.
 */
async function loadTable(
  workspaceId: string,
  lakehouseId: string,
  token: string,
  tableName: string,
  csvPath: string,
): Promise<void> {
  await fabricFetch<void>(
    `${FABRIC_API_BASE}/workspaces/${workspaceId}/lakehouses/${lakehouseId}/tables/${tableName}/load`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        relativePath: csvPath,
        pathType: 'File',
        mode: 'Overwrite',
        formatOptions: {
          format: 'Csv',
          header: true,
          delimiter: ',',
        },
      }),
    },
  );
}

/**
 * Upload entity instances as a Delta table in the Lakehouse.
 * Uses oneLakeToken for DFS file upload, fabricToken for Load Table API.
 * When called with a single token, uses it for both (legacy behavior).
 */
export async function uploadEntityTable(
  workspaceId: string,
  lakehouseId: string,
  token: string,
  tableName: string,
  instances: EntityInstance[],
  fabricToken?: string,
): Promise<void> {
  const csv = instancesToCSV(instances);
  if (!csv) return;

  const csvPath = `staging/${tableName}.csv`;

  // Upload CSV to Files area (OneLake DFS token)
  await uploadFileToOneLake(workspaceId, lakehouseId, token, csvPath, csv);

  // Load into managed Delta table (Fabric API token)
  // relativePath must include Files/ prefix — it's relative to the Lakehouse root
  await loadTable(workspaceId, lakehouseId, fabricToken ?? token, tableName, `Files/${csvPath}`);
}

/**
 * Upload a binary file to OneLake via DFS (create → append → flush).
 * Works for Parquet, Delta log JSON, and any other file type.
 */
async function uploadBinaryToOneLake(
  workspaceId: string,
  lakehouseId: string,
  token: string,
  fullPath: string,
  content: ArrayBuffer,
): Promise<void> {
  const base = `${ONELAKE_BASE}/${workspaceId}/${lakehouseId}`;

  // Create the file
  const createRes = await fetch(`${base}/${fullPath}?resource=file`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Length': '0' },
  });
  if (!createRes.ok && createRes.status !== 201) {
    throw new Error(`Failed to create file ${fullPath}: ${createRes.status}`);
  }

  if (content.byteLength === 0) return;

  // Append content
  const appendRes = await fetch(`${base}/${fullPath}?action=append&position=0`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
    body: content,
  });
  if (!appendRes.ok && appendRes.status !== 202) {
    throw new Error(`Failed to append data to ${fullPath}: ${appendRes.status}`);
  }

  // Flush
  const flushRes = await fetch(`${base}/${fullPath}?action=flush&position=${content.byteLength}`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!flushRes.ok && flushRes.status !== 200) {
    throw new Error(`Failed to flush ${fullPath}: ${flushRes.status}`);
  }
}

/**
 * Copy a Delta table from a plain (no-schema) Lakehouse into a
 * schema-enabled Lakehouse's Tables/dbo/ path.
 *
 * The auto-provisioned Ontology Lakehouse has schemas enabled and the
 * Load Table API doesn't work on it. This function copies the already-
 * loaded Parquet + _delta_log files via OneLake DFS, which Fabric then
 * auto-registers in its table catalog.
 *
 * Copy order: data files first, then _delta_log, to minimise the window
 * where the catalog sees partial state.
 */
export async function copyDeltaTable(
  workspaceId: string,
  srcLakehouseId: string,
  dstLakehouseId: string,
  tableName: string,
  oneLakeToken: string,
): Promise<void> {
  const srcBase = `${ONELAKE_BASE}/${workspaceId}/${srcLakehouseId}`;
  const srcTableRoot = `Tables/${tableName}`;
  const dstTableRoot = `Tables/dbo/${tableName}`;

  // List all files recursively under the source table
  const listRes = await fetch(
    `${srcBase}/${srcTableRoot}?resource=filesystem&recursive=true`,
    { headers: { 'Authorization': `Bearer ${oneLakeToken}` } },
  );
  if (!listRes.ok) {
    throw new Error(`Failed to list table files for ${tableName}: ${listRes.status}`);
  }
  const listing: { paths: Array<{ name: string; isDirectory?: string; contentLength?: string }> } =
    await listRes.json();

  // Separate directories and files; sort so data files come before _delta_log
  const dirs: string[] = [];
  const dataFiles: string[] = [];
  const logFiles: string[] = [];

  for (const entry of listing.paths) {
    // entry.name is fully qualified: "{lhId}/Tables/{table}/..."
    const relativePath = entry.name.replace(/^.*?Tables\/[^/]+\//, '');
    if (entry.isDirectory === 'true') {
      dirs.push(relativePath);
    } else if (relativePath.startsWith('_delta_log')) {
      logFiles.push(relativePath);
    } else {
      dataFiles.push(relativePath);
    }
  }

  // Create directories first
  for (const dir of dirs) {
    const dstPath = `${dstTableRoot}/${dir}`;
    const res = await fetch(
      `${ONELAKE_BASE}/${workspaceId}/${dstLakehouseId}/${dstPath}?resource=directory`,
      { method: 'PUT', headers: { 'Authorization': `Bearer ${oneLakeToken}`, 'Content-Length': '0' } },
    );
    if (!res.ok && res.status !== 409) {
      console.warn(`Failed to create directory ${dstPath}: ${res.status}`);
    }
  }

  // Copy data files first, then delta log (minimises partial-table visibility)
  const allFiles = [...dataFiles, ...logFiles];
  for (const file of allFiles) {
    const srcPath = `${srcTableRoot}/${file}`;
    const dstPath = `${dstTableRoot}/${file}`;

    // Download from source
    const downloadRes = await fetch(`${srcBase}/${srcPath}`, {
      headers: { 'Authorization': `Bearer ${oneLakeToken}` },
    });
    if (!downloadRes.ok) {
      throw new Error(`Failed to download ${srcPath}: ${downloadRes.status}`);
    }
    const content = await downloadRes.arrayBuffer();

    // Upload to destination
    await uploadBinaryToOneLake(workspaceId, dstLakehouseId, oneLakeToken, dstPath, content);
  }
}

/**
 * Delete a Lakehouse from a Fabric workspace. Best-effort — does not
 * throw on failure so callers can treat cleanup as optional.
 */
export async function deleteLakehouse(
  workspaceId: string,
  lakehouseId: string,
  fabricToken: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `${FABRIC_API_BASE}/workspaces/${workspaceId}/lakehouses/${lakehouseId}`,
      { method: 'DELETE', headers: { 'Authorization': `Bearer ${fabricToken}` } },
    );
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}
