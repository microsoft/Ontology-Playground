/**
 * Fabric Data Agent — creates a Data Agent connected to a pushed ontology
 * so users can query their data with natural language immediately.
 *
 * API Reference:
 *   https://learn.microsoft.com/en-us/rest/api/fabric/dataagent/items/create-data-agent
 *   https://learn.microsoft.com/en-us/rest/api/fabric/articles/item-management/definitions/data-agent-definition
 */

import type { Ontology, Relationship } from '../data/ontology';

// ─── Schema constants ────────────────────────────────────────────────────────

const DATA_AGENT_SCHEMA = '2.1.0';
const STAGE_CONFIG_SCHEMA = '1.0.0';
const DATASOURCE_SCHEMA = '1.0.0';
const FEWSHOTS_SCHEMA = '1.0.0';
const PUBLISH_INFO_SCHEMA = '1.0.0';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DefinitionPart {
  path: string;
  payload: string;          // base64-encoded JSON
  payloadType: 'InlineBase64';
}

// ─── AI Instructions Generation ──────────────────────────────────────────────

function describeCardinality(c: Relationship['cardinality']): string {
  switch (c) {
    case 'one-to-one': return '1:1';
    case 'one-to-many': return '1:N';
    case 'many-to-one': return 'N:1';
    case 'many-to-many': return 'N:N';
    default: return c;
  }
}

/**
 * Generate rich AI instructions from the ontology metadata.
 * These teach the Data Agent about the domain, entity types, relationships,
 * and how to write correct GQL queries.
 */
export function generateAIInstructions(ontology: Ontology): string {
  const lines: string[] = [];

  lines.push(`You are an expert data assistant for the "${ontology.name}" ontology.`);
  lines.push('');

  // Domain overview
  if (ontology.description) {
    lines.push('DOMAIN OVERVIEW:');
    lines.push(ontology.description);
    lines.push('');
  }

  // Entity types with properties
  lines.push(`ENTITY TYPES (${ontology.entityTypes.length} total):`);
  for (const entity of ontology.entityTypes) {
    const props = entity.properties.map(p => {
      const suffix = p.isIdentifier ? ' [PK]' : '';
      return `${p.name} (${p.type}${suffix})`;
    }).join(', ');

    const desc = entity.description ? ` — ${entity.description}` : '';
    lines.push(`- ${entity.name}${desc}`);
    if (props) {
      lines.push(`  Properties: ${props}`);
    }
  }
  lines.push('');

  // Relationships
  if (ontology.relationships.length > 0) {
    lines.push(`RELATIONSHIPS (${ontology.relationships.length} total):`);
    for (const rel of ontology.relationships) {
      const card = describeCardinality(rel.cardinality);
      const desc = rel.description ? ` — ${rel.description}` : '';
      lines.push(`- ${rel.name}: ${rel.from} → ${rel.to} (${card})${desc}`);
    }
    lines.push('');
  }

  // Query guidelines
  lines.push('QUERY GUIDELINES:');
  lines.push('- Use MATCH patterns to traverse the graph');
  lines.push('- Node labels match entity type names exactly');
  lines.push('- Edge labels match relationship names exactly');
  lines.push('- Always return meaningful properties, not just IDs');
  lines.push('- Support group by in GQL');
  lines.push('- When counting or aggregating, use COUNT(), SUM(), AVG() etc.');
  lines.push('- For filtering, use WHERE clauses with property comparisons');

  return lines.join('\n');
}

// ─── Few-Shot Generation ─────────────────────────────────────────────────────

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/**
 * Generate few-shot NL→GQL examples from the ontology schema.
 * These help the Data Agent understand the expected query patterns.
 */
export function generateFewShots(ontology: Ontology): Array<{ id: string; question: string; query: string }> {
  const shots: Array<{ id: string; question: string; query: string }> = [];

  // For each entity type, add a "list" and "count" example
  for (const entity of ontology.entityTypes.slice(0, 5)) {
    const label = entity.name;
    const pk = entity.properties.find(p => p.isIdentifier)?.name ?? entity.properties[0]?.name;

    // List example
    shots.push({
      id: uuid(),
      question: `List all ${label} records`,
      query: `MATCH (n:${label}) RETURN n LIMIT 10`,
    });

    // Count example
    shots.push({
      id: uuid(),
      question: `How many ${label} entries are there?`,
      query: `MATCH (n:${label}) RETURN COUNT(n) AS total`,
    });

    // Property filter example (if there's a meaningful property beyond PK)
    const filterProp = entity.properties.find(p => !p.isIdentifier && p.type === 'string');
    if (filterProp && pk) {
      shots.push({
        id: uuid(),
        question: `Show ${label} with their ${filterProp.name}`,
        query: `MATCH (n:${label}) RETURN n.${pk}, n.${filterProp.name} LIMIT 20`,
      });
    }
  }

  // For relationships, add traversal examples
  for (const rel of ontology.relationships.slice(0, 3)) {
    shots.push({
      id: uuid(),
      question: `Which ${rel.from} is connected to ${rel.to}?`,
      query: `MATCH (a:${rel.from})-[r:${rel.name}]->(b:${rel.to}) RETURN a, r, b LIMIT 10`,
    });
  }

  return shots;
}

// ─── Definition Parts Builder ────────────────────────────────────────────────

function toBase64(obj: unknown): string {
  const json = JSON.stringify(obj, null, 2);
  // TextEncoder → Uint8Array → binary string → btoa (handles non-ASCII)
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

/**
 * Build all definition parts for a Data Agent that connects to an ontology.
 */
export function buildDataAgentParts(
  ontologyId: string,
  workspaceId: string,
  ontology: Ontology,
): DefinitionPart[] {
  const agentInstructions = generateAIInstructions(ontology);
  const fewShots = generateFewShots(ontology);
  const safeName = ontology.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);

  // data_agent.json — top-level config
  const dataAgentConfig = {
    $schema: DATA_AGENT_SCHEMA,
  };

  // stage_config.json — AI instructions
  const stageConfig = {
    $schema: STAGE_CONFIG_SCHEMA,
    aiInstructions: agentInstructions,
  };

  // datasource.json — reference the ontology
  const datasource = {
    $schema: DATASOURCE_SCHEMA,
    artifactId: ontologyId,
    workspaceId,
    displayName: ontology.name,
    type: 'ontology',
    dataSourceInstructions: `This ontology models ${ontology.description || ontology.name}. Use it to answer questions about ${ontology.entityTypes.map(e => e.name).join(', ')}.`,
  };

  // fewshots.json — pre-seeded NL→GQL examples
  const fewshotsConfig = {
    $schema: FEWSHOTS_SCHEMA,
    fewShots,
  };

  // publish_info.json — marks agent as published
  const publishInfo = {
    $schema: PUBLISH_INFO_SCHEMA,
    description: `Data Agent for ${ontology.name} ontology — auto-generated`,
  };

  const dsFolder = `ontology-${safeName}`;
  const parts: DefinitionPart[] = [
    // Required top-level config
    { path: 'Files/Config/data_agent.json', payload: toBase64(dataAgentConfig), payloadType: 'InlineBase64' },

    // Draft stage config + data source
    { path: 'Files/Config/draft/stage_config.json', payload: toBase64(stageConfig), payloadType: 'InlineBase64' },
    { path: `Files/Config/draft/${dsFolder}/datasource.json`, payload: toBase64(datasource), payloadType: 'InlineBase64' },
    { path: `Files/Config/draft/${dsFolder}/fewshots.json`, payload: toBase64(fewshotsConfig), payloadType: 'InlineBase64' },

    // Published copies (same content — makes agent immediately queryable)
    { path: 'Files/Config/published/stage_config.json', payload: toBase64(stageConfig), payloadType: 'InlineBase64' },
    { path: `Files/Config/published/${dsFolder}/datasource.json`, payload: toBase64(datasource), payloadType: 'InlineBase64' },
    { path: `Files/Config/published/${dsFolder}/fewshots.json`, payload: toBase64(fewshotsConfig), payloadType: 'InlineBase64' },

    // Publish info
    { path: 'Files/Config/publish_info.json', payload: toBase64(publishInfo), payloadType: 'InlineBase64' },
  ];

  return parts;
}

// ─── Data Agent Creation ─────────────────────────────────────────────────────

const FABRIC_API_BASE = 'https://api.fabric.microsoft.com/v1';

interface DataAgentResponse {
  id: string;
  displayName: string;
  workspaceId: string;
  type: string;
  description?: string;
}

/**
 * Create a Fabric Data Agent connected to the given ontology.
 * Returns the agent ID or null if creation fails.
 */
export async function createDataAgent(
  workspaceId: string,
  token: string,
  ontologyName: string,
  ontologyId: string,
  ontology: Ontology,
  onStatus?: (message: string) => void,
): Promise<string | null> {
  const parts = buildDataAgentParts(ontologyId, workspaceId, ontology);

  const safeName = ontologyName.replace(/[^a-zA-Z0-9_ -]/g, '').slice(0, 80);
  const displayName = `${safeName} Agent`;
  const description = `Natural language data agent for ${ontologyName} — auto-generated by Ontology Playground`;

  onStatus?.('Creating Data Agent…');

  const res = await fetch(`${FABRIC_API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/dataAgents`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      displayName,
      description: description.slice(0, 256),
      definition: { parts },
    }),
  });

  // 201 = created, 202 = async provisioning
  if (res.status === 201) {
    const data = await res.json() as DataAgentResponse;
    onStatus?.(`✓ Data Agent "${displayName}" created`);
    return data.id;
  }

  if (res.status === 202) {
    const opId = res.headers.get('x-ms-operation-id');
    if (opId) {
      onStatus?.('Data Agent provisioning…');
      // Poll for completion
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const pollRes = await fetch(`${FABRIC_API_BASE}/operations/${opId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (pollRes.ok) {
          const pollData = await pollRes.json();
          if (pollData.status === 'Succeeded') {
            onStatus?.(`✓ Data Agent "${displayName}" created`);
            // Try to find the agent by listing
            try {
              const listRes = await fetch(`${FABRIC_API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/dataAgents`, {
                headers: { 'Authorization': `Bearer ${token}` },
              });
              if (listRes.ok) {
                const listData = await listRes.json();
                const agents = listData.value ?? [];
                const found = agents.find((a: DataAgentResponse) => a.displayName === displayName);
                if (found) return found.id;
              }
            } catch { /* ok */ }
            return null;
          }
          if (pollData.status === 'Failed') {
            const errMsg = pollData.error?.message ?? 'Unknown error';
            onStatus?.(`⚠ Data Agent creation failed: ${errMsg}`);
            return null;
          }
        }
      }
      onStatus?.('⚠ Data Agent creation timed out');
    }
    return null;
  }

  // Error handling
  let errMsg = `${res.status} ${res.statusText}`;
  try {
    const body = await res.json();
    if (body.message) errMsg = body.message;
  } catch { /* use default */ }
  onStatus?.(`⚠ Data Agent creation failed: ${errMsg}`);
  return null;
}
