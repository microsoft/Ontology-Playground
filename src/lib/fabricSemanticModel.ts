/**
 * Fabric Semantic Model API client — creates Power BI semantic models
 * from ontology definitions with Lakehouse bindings.
 *
 * API Reference:
 *   https://learn.microsoft.com/en-us/rest/api/fabric/semanticmodel/items/create-semantic-model
 */

import type { Ontology, Property } from '../data/ontology';

const FABRIC_API_BASE = 'https://api.fabric.microsoft.com/v1';

export interface SemanticModelResponse {
  id: string;
  displayName: string;
  description: string;
  type: 'SemanticModel';
  workspaceId: string;
}

// ─── TMSL Types ────────────────────────────────────────────────────────────

interface TMSLColumn {
  name: string;
  dataType: string;
  sourceColumn: string;
  isKey?: boolean;
}

interface TMSLTable {
  name: string;
  columns: TMSLColumn[];
  partitions: TMSLPartition[];
}

interface TMSLPartition {
  name: string;
  mode: string;
  source: {
    type: string;
    expression: string[];
  };
}

interface TMSLRelationship {
  name: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  crossFilteringBehavior: string;
}

interface TMSLModel {
  defaultMode: string;
  tables: TMSLTable[];
  relationships: TMSLRelationship[];
}

// ─── Type Mapping ──────────────────────────────────────────────────────────

function mapToTMSLType(propType: Property['type']): string {
  switch (propType) {
    case 'string': return 'String';
    case 'integer': return 'Int64';
    case 'decimal':
    case 'double': return 'Double';
    case 'boolean': return 'Boolean';
    case 'date':
    case 'datetime': return 'DateTime';
    case 'enum': return 'String';
    default: return 'String';
  }
}

// ─── Conversion ────────────────────────────────────────────────────────────

function toBase64(obj: unknown): string {
  const json = JSON.stringify(obj, null, 2);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

/**
 * Build TMSL model definition from an ontology.
 */
function buildTMSLModel(
  ontology: Ontology,
  lakehouseWorkspaceId: string,
  lakehouseId: string,
): TMSLModel {
  const tables: TMSLTable[] = ontology.entityTypes.map(entity => {
    const columns: TMSLColumn[] = entity.properties.map(prop => ({
      name: prop.name,
      dataType: mapToTMSLType(prop.type),
      sourceColumn: prop.name,
      ...(prop.isIdentifier ? { isKey: true } : {}),
    }));

    return {
      name: entity.name,
      columns,
      partitions: [{
        name: `${entity.name}-partition`,
        mode: 'DirectLake',
        source: {
          type: 'Entity',
          expression: [
            `DatabaseQuery`,
            `FROM [${lakehouseWorkspaceId}].[${lakehouseId}].[dbo].[${entity.name}]`,
          ],
        },
      }],
    };
  });

  // Build relationships from ontology
  const relationships: TMSLRelationship[] = [];
  for (const rel of ontology.relationships) {
    const fromEntity = ontology.entityTypes.find(e => e.id === rel.from);
    const toEntity = ontology.entityTypes.find(e => e.id === rel.to);
    if (!fromEntity || !toEntity) continue;

    // Use identifier properties as join columns
    const fromIdProp = fromEntity.properties.find(p => p.isIdentifier) ?? fromEntity.properties[0];
    const toIdProp = toEntity.properties.find(p => p.isIdentifier) ?? toEntity.properties[0];
    if (!fromIdProp || !toIdProp) continue;

    relationships.push({
      name: `${fromEntity.name}_${rel.name}_${toEntity.name}`,
      fromTable: fromEntity.name,
      fromColumn: fromIdProp.name,
      toTable: toEntity.name,
      toColumn: toIdProp.name,
      crossFilteringBehavior: 'OneDirection',
    });
  }

  return {
    defaultMode: 'DirectLake',
    tables,
    relationships,
  };
}

// ─── Fabric API helpers ────────────────────────────────────────────────────

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
  throw new Error('Semantic model creation timed out');
}

/**
 * Create a Power BI Semantic Model from an ontology, bound to a Lakehouse.
 */
export async function createSemanticModel(
  workspaceId: string,
  token: string,
  ontology: Ontology,
  lakehouseId: string,
): Promise<SemanticModelResponse> {
  const model = buildTMSLModel(ontology, workspaceId, lakehouseId);

  const definition = {
    parts: [
      {
        path: '.platform',
        payload: toBase64({
          metadata: {
            type: 'SemanticModel',
            displayName: `${ontology.name} - Semantic Model`,
          },
        }),
        payloadType: 'InlineBase64',
      },
      {
        path: 'definition/model.bim',
        payload: toBase64({ model }),
        payloadType: 'InlineBase64',
      },
    ],
  };

  const res = await fetch(
    `${FABRIC_API_BASE}/workspaces/${workspaceId}/semanticModels`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        displayName: `${ontology.name} - Semantic Model`,
        description: `Auto-generated semantic model for ${ontology.name} ontology`,
        definition,
      }),
    },
  );

  if (res.status === 202) {
    const opId = res.headers.get('x-ms-operation-id');
    if (opId) await pollOperation(opId, token);

    // Fetch created model
    const listRes = await fetch(
      `${FABRIC_API_BASE}/workspaces/${workspaceId}/semanticModels`,
      { headers: { 'Authorization': `Bearer ${token}` } },
    );
    if (listRes.ok) {
      const list = await listRes.json();
      const found = list.value?.find(
        (m: SemanticModelResponse) => m.displayName === `${ontology.name} - Semantic Model`,
      );
      if (found) return found;
    }
    throw new Error('Semantic model created but not found');
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create semantic model: ${res.status} ${body}`);
  }

  return await res.json() as SemanticModelResponse;
}
