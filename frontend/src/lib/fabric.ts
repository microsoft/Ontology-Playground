/**
 * Fabric Ontology API client — converts playground ontologies to Fabric's
 * definition.parts format and pushes them via the REST API.
 *
 * API Reference:
 *   https://learn.microsoft.com/en-us/rest/api/fabric/ontology/items/create-ontology
 *   https://learn.microsoft.com/en-us/rest/api/fabric/articles/item-management/definitions/ontology-definition
 */

import type { Ontology, Property } from '../data/ontology';

// ─── Fabric API types ──────────────────────────────────────────────────────

export interface FabricDefinitionPart {
  path: string;
  payload: string;          // base64-encoded JSON
  payloadType: 'InlineBase64';
}

export interface FabricOntologyDefinition {
  parts: FabricDefinitionPart[];
}

export interface FabricEntityTypeProperty {
  id: string;
  name: string;
  redefines: null;
  baseTypeNamespaceType: null;
  valueType: 'String' | 'Boolean' | 'DateTime' | 'Double' | 'BigInt' | 'Object';
}

export interface FabricEntityType {
  id: string;
  namespace: 'usertypes';
  baseEntityTypeId: null;
  name: string;
  entityIdParts: string[];
  displayNamePropertyId: string;
  namespaceType: 'Custom';
  visibility: 'Visible';
  properties: FabricEntityTypeProperty[];
  timeseriesProperties: FabricEntityTypeProperty[];
}

export interface FabricRelationshipType {
  namespace: 'usertypes';
  id: string;
  name: string;
  namespaceType: 'Custom';
  source: { entityTypeId: string };
  target: { entityTypeId: string };
}

export interface CreateOntologyRequest {
  displayName: string;
  description?: string;
  definition?: FabricOntologyDefinition;
}

export interface FabricOntologyResponse {
  id: string;
  displayName: string;
  description: string;
  type: 'Ontology';
  workspaceId: string;
}

export interface FabricListOntologiesResponse {
  value: FabricOntologyResponse[];
  continuationUri?: string;
}

// ─── ID generation ─────────────────────────────────────────────────────────

/**
 * Generate a positive 64-bit integer ID as a string, matching Fabric's
 * requirement for entity/property/relationship IDs.
 */
function generateFabricId(): string {
  // Use crypto.getRandomValues for a 53-bit positive integer
  // (stays within JS safe integer range)
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  const high = buf[0] & 0x001FFFFF;  // 21 bits
  const low = buf[1];                 // 32 bits
  return String(high * 0x100000000 + low);
}

// ─── Type mapping ──────────────────────────────────────────────────────────

const VALUE_TYPE_MAP: Record<Property['type'], FabricEntityTypeProperty['valueType']> = {
  string: 'String',
  integer: 'BigInt',
  decimal: 'Double',
  double: 'Double',
  date: 'DateTime',
  datetime: 'DateTime',
  boolean: 'Boolean',
  enum: 'String',
};

function mapValueType(type: Property['type']): FabricEntityTypeProperty['valueType'] {
  return VALUE_TYPE_MAP[type] ?? 'String';
}

// ─── Conversion ────────────────────────────────────────────────────────────

function toBase64(obj: unknown): string {
  const json = JSON.stringify(obj, null, 2);
  // TextEncoder → Uint8Array → binary string → btoa
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

export interface ConversionResult {
  definition: FabricOntologyDefinition;
  entityIdMap: Map<string, string>;  // playground id → fabric id
}

/**
 * Convert a Playground ontology to Fabric's definition.parts format.
 * Pure function — no side effects.
 */
export function convertToFabricParts(ontology: Ontology): ConversionResult {
  const parts: FabricDefinitionPart[] = [];
  const entityIdMap = new Map<string, string>();
  const propertyIdMap = new Map<string, Map<string, string>>(); // entityId → (propName → fabricId)

  // Platform part
  const platform = {
    metadata: {
      type: 'Ontology',
      displayName: ontology.name,
    },
  };
  parts.push({
    path: '.platform',
    payload: toBase64(platform),
    payloadType: 'InlineBase64',
  });

  // Empty definition.json (required)
  parts.push({
    path: 'definition.json',
    payload: toBase64({}),
    payloadType: 'InlineBase64',
  });

  // Entity Types
  for (const entity of ontology.entityTypes) {
    const fabricEntityId = generateFabricId();
    entityIdMap.set(entity.id, fabricEntityId);

    const propMap = new Map<string, string>();
    propertyIdMap.set(entity.id, propMap);

    // Build properties
    const fabricProperties: FabricEntityTypeProperty[] = entity.properties.map(prop => {
      const fabricPropId = generateFabricId();
      propMap.set(prop.name, fabricPropId);
      return {
        id: fabricPropId,
        name: sanitizeName(prop.name),
        redefines: null,
        baseTypeNamespaceType: null,
        valueType: mapValueType(prop.type),
      };
    });

    // Pick identifier: first isIdentifier property, or first property
    const identifierProp = entity.properties.find(p => p.isIdentifier) || entity.properties[0];
    const identifierFabricId = identifierProp ? propMap.get(identifierProp.name)! : fabricProperties[0]?.id;

    const fabricEntity: FabricEntityType = {
      id: fabricEntityId,
      namespace: 'usertypes',
      baseEntityTypeId: null,
      name: sanitizeName(entity.name),
      entityIdParts: identifierFabricId ? [identifierFabricId] : [],
      displayNamePropertyId: identifierFabricId ?? '',
      namespaceType: 'Custom',
      visibility: 'Visible',
      properties: fabricProperties,
      timeseriesProperties: [],
    };

    parts.push({
      path: `EntityTypes/${fabricEntityId}/definition.json`,
      payload: toBase64(fabricEntity),
      payloadType: 'InlineBase64',
    });
  }

  // Relationship Types
  for (const rel of ontology.relationships) {
    const fabricRelId = generateFabricId();
    const sourceEntityId = entityIdMap.get(rel.from);
    const targetEntityId = entityIdMap.get(rel.to);

    if (!sourceEntityId || !targetEntityId) {
      // Skip relationships referencing unknown entities
      continue;
    }

    const fabricRel: FabricRelationshipType = {
      namespace: 'usertypes',
      id: fabricRelId,
      name: sanitizeName(rel.name),
      namespaceType: 'Custom',
      source: { entityTypeId: sourceEntityId },
      target: { entityTypeId: targetEntityId },
    };

    parts.push({
      path: `RelationshipTypes/${fabricRelId}/definition.json`,
      payload: toBase64(fabricRel),
      payloadType: 'InlineBase64',
    });
  }

  return {
    definition: { parts },
    entityIdMap,
  };
}

/**
 * Sanitize a name to match Fabric's regex: ^[a-zA-Z][a-zA-Z0-9_-]{0,127}$
 */
function sanitizeName(name: string): string {
  // Replace spaces and invalid chars with underscores
  let sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  // Ensure starts with a letter
  if (sanitized.length === 0 || !/^[a-zA-Z]/.test(sanitized)) {
    sanitized = 'E_' + sanitized;
  }
  // Truncate to 128 characters
  return sanitized.slice(0, 128);
}

// ─── Fabric REST API client ────────────────────────────────────────────────

const FABRIC_API_BASE = 'https://api.fabric.microsoft.com/v1';

export class FabricApiError extends Error {
  readonly status: number;
  readonly errorCode?: string;

  constructor(
    message: string,
    status: number,
    errorCode?: string,
  ) {
    super(message);
    this.name = 'FabricApiError';
    this.status = status;
    this.errorCode = errorCode;
  }
}

async function fabricFetch<T>(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<{ data: T | null; operationId?: string; location?: string }> {
  const res = await fetch(`${FABRIC_API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (res.status === 202) {
    return {
      data: null,
      operationId: res.headers.get('x-ms-operation-id') ?? undefined,
      location: res.headers.get('Location') ?? undefined,
    };
  }

  if (!res.ok) {
    let errorCode: string | undefined;
    let message = `Fabric API error: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body.errorCode) errorCode = body.errorCode;
      if (body.message) message = body.message;
    } catch {
      // Use default message
    }
    throw new FabricApiError(message, res.status, errorCode);
  }

  if (res.status === 204) return { data: null };
  const data = await res.json() as T;
  return { data };
}

/**
 * Poll a long-running operation until completion.
 */
async function pollOperation(
  operationId: string,
  token: string,
  maxAttempts = 20,
  intervalMs = 2000,
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, intervalMs));

    const res = await fetch(`${FABRIC_API_BASE}/operations/${operationId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (res.ok) {
      const body = await res.json();
      if (body.status === 'Succeeded') return;
      if (body.status === 'Failed') {
        throw new FabricApiError(
          body.error?.message ?? 'Operation failed',
          400,
          body.error?.errorCode,
        );
      }
      // Still running — continue polling
    } else if (res.status === 202) {
      // Still in progress
      continue;
    } else {
      throw new FabricApiError(`Failed to poll operation: ${res.status}`, res.status);
    }
  }
  throw new FabricApiError('Operation timed out', 408);
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * List ontologies in a Fabric workspace.
 */
export async function listOntologies(
  workspaceId: string,
  token: string,
): Promise<FabricOntologyResponse[]> {
  const { data } = await fabricFetch<FabricListOntologiesResponse>(
    `/workspaces/${encodeURIComponent(workspaceId)}/ontologies`,
    token,
  );
  return data?.value ?? [];
}

/**
 * Create a new ontology in a Fabric workspace and push its definition.
 */
export async function createOntology(
  workspaceId: string,
  token: string,
  ontology: Ontology,
): Promise<FabricOntologyResponse> {
  const { definition } = convertToFabricParts(ontology);

  const body: CreateOntologyRequest = {
    displayName: sanitizeName(ontology.name),
    description: (ontology.description ?? '').slice(0, 256),
    definition,
  };

  const result = await fabricFetch<FabricOntologyResponse>(
    `/workspaces/${encodeURIComponent(workspaceId)}/ontologies`,
    token,
    { method: 'POST', body: JSON.stringify(body) },
  );

  // If 202 (long-running), poll until complete
  if (result.operationId) {
    await pollOperation(result.operationId, token);
    // Fetch the created ontology — the operation doesn't return it
    const ontologies = await listOntologies(workspaceId, token);
    const created = ontologies.find(o => o.displayName === body.displayName);
    if (created) return created;
    throw new FabricApiError('Ontology created but not found in workspace', 404);
  }

  return result.data!;
}

/**
 * Update an existing ontology's definition.
 */
export async function updateOntologyDefinition(
  workspaceId: string,
  ontologyId: string,
  token: string,
  ontology: Ontology,
): Promise<void> {
  const { definition } = convertToFabricParts(ontology);

  const result = await fabricFetch<void>(
    `/workspaces/${encodeURIComponent(workspaceId)}/ontologies/${encodeURIComponent(ontologyId)}/updateDefinition`,
    token,
    { method: 'POST', body: JSON.stringify({ definition }) },
  );

  if (result.operationId) {
    await pollOperation(result.operationId, token);
  }
}
