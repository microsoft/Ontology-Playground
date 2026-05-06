/**
 * Fabric GraphQL API client — creates GraphQL API items backed by a Lakehouse.
 *
 * API Reference:
 *   https://learn.microsoft.com/en-us/rest/api/fabric/graphqlapi/items/create-graphql-api
 */

const FABRIC_API_BASE = 'https://api.fabric.microsoft.com/v1';

export interface GraphQLApiResponse {
  id: string;
  displayName: string;
  description: string;
  type: 'GraphQLApi';
  workspaceId: string;
}

async function pollOperation(operationId: string, token: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    const res = await fetch(`${FABRIC_API_BASE}/operations/${operationId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (res.ok) {
      const body = await res.json();
      if (body.status === 'Succeeded') return;
      if (body.status === 'Failed') {
        throw new Error(`Operation failed: ${body.error?.message ?? 'Unknown'}`);
      }
    }
  }
  throw new Error('GraphQL API creation timed out');
}

/**
 * Create a GraphQL API item in a Fabric workspace backed by a Lakehouse.
 */
export async function createGraphQLApi(
  workspaceId: string,
  token: string,
  displayName: string,
  description: string,
  lakehouseId: string,
): Promise<GraphQLApiResponse> {
  const res = await fetch(
    `${FABRIC_API_BASE}/workspaces/${workspaceId}/graphQLApis`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        displayName,
        description,
        definition: {
          parts: [
            {
              path: '.platform',
              payload: btoa(JSON.stringify({
                metadata: {
                  type: 'GraphQLApi',
                  displayName,
                },
              })),
              payloadType: 'InlineBase64',
            },
            {
              path: 'definition.json',
              payload: btoa(JSON.stringify({
                dataSourceId: lakehouseId,
                dataSourceType: 'Lakehouse',
              })),
              payloadType: 'InlineBase64',
            },
          ],
        },
      }),
    },
  );

  if (res.status === 202) {
    const opId = res.headers.get('x-ms-operation-id');
    if (opId) await pollOperation(opId, token);

    // Fetch created API
    const listRes = await fetch(
      `${FABRIC_API_BASE}/workspaces/${workspaceId}/graphQLApis`,
      { headers: { 'Authorization': `Bearer ${token}` } },
    );
    if (listRes.ok) {
      const list = await listRes.json();
      const found = list.value?.find(
        (a: GraphQLApiResponse) => a.displayName === displayName,
      );
      if (found) return found;
    }
    throw new Error('GraphQL API created but not found');
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create GraphQL API: ${res.status} ${body}`);
  }

  return await res.json() as GraphQLApiResponse;
}
