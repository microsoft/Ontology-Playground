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
  displayNamePropertyId: string | null;
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
 * Pass a Set to guarantee uniqueness within a conversion run.
 */
function generateFabricId(usedIds?: Set<string>): string {
  for (let attempt = 0; attempt < 10; attempt++) {
    const buf = new Uint32Array(2);
    crypto.getRandomValues(buf);
    const high = buf[0] & 0x001FFFFF;  // 21 bits
    const low = buf[1];                 // 32 bits
    const val = high * 0x100000000 + low;
    if (val === 0) continue;
    const id = String(val);
    if (usedIds && usedIds.has(id)) continue;
    usedIds?.add(id);
    return id;
  }
  return String(Date.now()); // last-resort fallback
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
  entityIdMap: Map<string, string>;     // playground id → fabric id
  propertyIdMap: Map<string, Map<string, string>>;  // playground entity id → (propName → fabric prop id)
  entityNameMap: Map<string, string>;   // playground entity id → sanitized fabric name
}

export class FabricValidationError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(`Ontology validation failed:\n• ${errors.join('\n• ')}`);
    this.name = 'FabricValidationError';
    this.errors = errors;
  }
}

/**
 * Preflight validation — checks the ontology for issues that would cause
 * Fabric import failures. Throws with a human-readable message on failure.
 */
export function validateForFabric(ontology: Ontology): void {
  const errors: string[] = [];

  // Check for duplicate entity IDs
  const seenEntityIds = new Set<string>();
  for (const entity of ontology.entityTypes) {
    if (seenEntityIds.has(entity.id)) {
      errors.push(`Duplicate entity ID: "${entity.id}" appears more than once`);
    }
    seenEntityIds.add(entity.id);
  }

  const entityIds = new Set(ontology.entityTypes.map(e => e.id));

  // Check for duplicate entity names after sanitization
  const sanitizedEntityNames = new Map<string, string>();
  for (const entity of ontology.entityTypes) {
    const sName = sanitizeName(entity.name);
    if (sanitizedEntityNames.has(sName)) {
      errors.push(`Entity name collision: "${entity.name}" and "${sanitizedEntityNames.get(sName)}" both become "${sName}" after sanitization`);
    }
    sanitizedEntityNames.set(sName, entity.name);

    // Check for duplicate property names within an entity after sanitization
    const sanitizedPropNames = new Map<string, string>();
    for (const prop of entity.properties) {
      const sProp = sanitizeName(prop.name);
      if (sanitizedPropNames.has(sProp)) {
        errors.push(`Property collision in "${entity.name}": "${prop.name}" and "${sanitizedPropNames.get(sProp)}" both become "${sProp}"`);
      }
      sanitizedPropNames.set(sProp, prop.name);
    }
  }

  // Check relationship references (duplicate names are OK — Fabric uses unique IDs)
  for (const rel of ontology.relationships) {
    // Check for unresolved entity references
    if (!entityIds.has(rel.from)) {
      errors.push(`Relationship "${rel.name}" references unknown source entity "${rel.from}"`);
    }
    if (!entityIds.has(rel.to)) {
      errors.push(`Relationship "${rel.name}" references unknown target entity "${rel.to}"`);
    }
  }

  if (errors.length > 0) {
    throw new FabricValidationError(errors);
  }
}

/**
 * Convert a Playground ontology to Fabric's definition.parts format.
 * Pure function — no side effects.
 */
export function convertToFabricParts(ontology: Ontology): ConversionResult {
  const parts: FabricDefinitionPart[] = [];
  const entityIdMap = new Map<string, string>();
  const propertyIdMap = new Map<string, Map<string, string>>();
  const entityNameMap = new Map<string, string>();
  const usedIds = new Set<string>(); // guarantees unique Fabric IDs

  // Platform part — required by Fabric definition schema
  const platform = {
    $schema: 'https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json',
    metadata: {
      type: 'Ontology',
      displayName: sanitizeItemName(ontology.name),
    },
    config: {
      version: '2.0',
      logicalId: '00000000-0000-0000-0000-000000000000',
    },
  };
  parts.push({
    path: '.platform',
    payload: toBase64(platform),
    payloadType: 'InlineBase64',
  });

  // definition.json — empty root (required by Fabric)
  parts.push({
    path: 'definition.json',
    payload: toBase64({}),
    payloadType: 'InlineBase64',
  });

  // Build global property name → valueType map to detect cross-entity conflicts.
  // Fabric requires that properties with the same name have the same type globally.
  const globalPropTypes = new Map<string, string>(); // sanitizedName → valueType
  const conflictingProps = new Set<string>(); // sanitizedNames that have type conflicts
  for (const entity of ontology.entityTypes) {
    const props = entity.properties.length > 0
      ? entity.properties
      : [{ name: 'Id', type: 'string' as const }];
    for (const prop of props) {
      const sName = sanitizeName(prop.name);
      const vType = mapValueType(prop.type);
      const existing = globalPropTypes.get(sName);
      if (existing && existing !== vType) {
        conflictingProps.add(sName);
      }
      if (!existing) globalPropTypes.set(sName, vType);
    }
  }

  // Entity Types
  for (const entity of ontology.entityTypes) {
    const fabricEntityId = generateFabricId(usedIds);
    entityIdMap.set(entity.id, fabricEntityId);
    entityNameMap.set(entity.id, sanitizeName(entity.name));

    const propMap = new Map<string, string>();
    propertyIdMap.set(entity.id, propMap);

    // Inject synthetic "Id" if entity has no properties
    const sourceProps = entity.properties.length > 0
      ? entity.properties
      : [{ name: 'Id', type: 'string' as const, isIdentifier: true }];

    const fabricProperties: FabricEntityTypeProperty[] = sourceProps.map(prop => {
      const fabricPropId = generateFabricId(usedIds);
      propMap.set(prop.name, fabricPropId);
      let propName = sanitizeName(prop.name);
      // Disambiguate cross-entity property name conflicts by suffixing entity name
      if (conflictingProps.has(propName)) {
        propName = `${propName}_${sanitizeName(entity.name)}`.slice(0, 128);
      }
      return {
        id: fabricPropId,
        name: propName,
        redefines: null,
        baseTypeNamespaceType: null,
        valueType: mapValueType(prop.type),
      };
    });

    const identifierProp = sourceProps.find(p => 'isIdentifier' in p && p.isIdentifier) || sourceProps[0];
    const identifierFabricId = propMap.get(identifierProp.name)!;

    const fabricEntity: FabricEntityType = {
      id: fabricEntityId,
      namespace: 'usertypes',
      baseEntityTypeId: null,
      name: sanitizeName(entity.name),
      entityIdParts: [identifierFabricId],
      displayNamePropertyId: identifierFabricId,
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

  // Detect duplicate relationship names so we can auto-disambiguate.
  // Fabric enforces globally unique relationship names.
  const relNameCounts = new Map<string, number>();
  for (const rel of ontology.relationships) {
    const sName = sanitizeName(rel.name);
    relNameCounts.set(sName, (relNameCounts.get(sName) || 0) + 1);
  }
  const duplicateRelNames = new Set(
    [...relNameCounts.entries()].filter(([, c]) => c > 1).map(([n]) => n),
  );

  // Relationship Types
  const usedRelNames = new Set<string>();
  for (const rel of ontology.relationships) {
    const fabricRelId = generateFabricId(usedIds);
    const sourceEntityId = entityIdMap.get(rel.from);
    const targetEntityId = entityIdMap.get(rel.to);

    if (!sourceEntityId || !targetEntityId) {
      const missing = !sourceEntityId ? rel.from : rel.to;
      throw new FabricApiError(
        `Relationship "${rel.name}" references entity "${missing}" which does not exist in the ontology`,
        422,
        'InvalidRelationship',
      );
    }

    // Disambiguate duplicate relationship names by appending source entity name
    let relName = sanitizeName(rel.name);
    if (duplicateRelNames.has(relName)) {
      const sourceEntity = ontology.entityTypes.find(e => e.id === rel.from);
      const suffix = sourceEntity ? sanitizeName(sourceEntity.name) : rel.from;
      relName = `${relName}_${suffix}`.slice(0, 128);
    }
    // Final dedup: if still collides (e.g., same source), append numeric suffix
    const baseRelName = relName;
    let counter = 2;
    while (usedRelNames.has(relName)) {
      relName = `${baseRelName}_${counter++}`.slice(0, 128);
    }
    usedRelNames.add(relName);

    const fabricRel = {
      namespace: 'usertypes' as const,
      id: fabricRelId,
      name: relName,
      namespaceType: 'Custom' as const,
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
    propertyIdMap,
    entityNameMap,
  };
}

/**
 * Sanitize an internal name (entity types, properties, relationships).
 * Fabric allows only: letters, numbers, underscores; must start with a letter.
 */
function sanitizeName(name: string): string {
  let sanitized = name.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (sanitized.length === 0 || !/^[a-zA-Z]/.test(sanitized)) {
    sanitized = 'E_' + sanitized;
  }
  return sanitized.slice(0, 128);
}

/**
 * Sanitize an item display name for Fabric's stricter item-level rules:
 * must start with a letter, < 90 chars, only letters, numbers, underscores.
 */
export function sanitizeItemName(name: string): string {
  // Collapse spaces/dashes/special chars to single underscores, strip leading/trailing _
  let sanitized = name.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (sanitized.length === 0 || !/^[a-zA-Z]/.test(sanitized)) {
    sanitized = 'Ontology_' + sanitized;
  }
  return sanitized.slice(0, 89);
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
    // Add context for common 500 errors
    if (res.status === 500 && !errorCode) {
      message += ' — this often means an ontology with the same name already exists in the workspace. Try updating instead of creating.';
    }
    // Capacity not active is returned as 404 with errorCode "CapacityNotActive"
    if (errorCode === 'CapacityNotActive') {
      message = 'The Fabric capacity assigned to this workspace is paused or inactive. Please resume it in the Azure portal and try again.';
    }
    throw new FabricApiError(message, res.status, errorCode);
  }

  if (res.status === 204) return { data: null };
  const data = await res.json() as T;
  return { data };
}

export interface PollProgress {
  attempt: number;
  maxAttempts: number;
  status?: string;
  percentComplete?: number;
}

/**
 * Poll a long-running operation until completion.
 * Default timeout: 60 attempts × 3s = ~3 minutes (Fabric ontology creation
 * provisions Lakehouse + SQL endpoint + GraphModel and can take 60-90s).
 */
async function pollOperation(
  operationId: string,
  token: string,
  maxAttempts = 60,
  intervalMs = 3000,
  onProgress?: (progress: PollProgress) => void,
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, intervalMs));

    const res = await fetch(`${FABRIC_API_BASE}/operations/${operationId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (res.ok) {
      const body = await res.json();
      onProgress?.({
        attempt: i + 1,
        maxAttempts,
        status: body.status,
        percentComplete: body.percentComplete,
      });

      if (body.status === 'Succeeded') return;
      if (body.status === 'Failed') {
        // Log full error for debugging
        console.error('🔧 Fabric operation failed:', JSON.stringify(body, null, 2));

        // Try to get more details from the operation result
        try {
          const resultRes = await fetch(`${FABRIC_API_BASE}/operations/${operationId}/result`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          if (!resultRes.ok) {
            const resultBody = await resultRes.text();
            console.error('🔧 Operation result details:', resultBody);
          }
        } catch { /* ignore */ }

        const errorMsg = body.error?.message ?? 'Operation failed';
        const errorCode = body.error?.errorCode;
        throw new FabricApiError(
          errorMsg,
          body.error?.statusCode ?? 400,
          errorCode,
        );
      }

      // Respect Retry-After header if present
      const retryAfter = res.headers.get('Retry-After');
      if (retryAfter) {
        const delaySec = parseInt(retryAfter, 10);
        if (!isNaN(delaySec) && delaySec > 0) {
          await new Promise(resolve => setTimeout(resolve, delaySec * 1000));
        }
      }
      // Still running — continue polling
    } else if (res.status === 202) {
      onProgress?.({ attempt: i + 1, maxAttempts, status: 'Running' });
      continue;
    } else {
      throw new FabricApiError(`Failed to poll operation: ${res.status}`, res.status);
    }
  }
  throw new FabricApiError(
    'Operation timed out after 3 minutes. The ontology may still be provisioning — check your Fabric workspace.',
    408,
  );
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Fetch the current definition of an ontology from Fabric.
 * Returns the parts array, or null if the operation fails.
 * getDefinition is async (202) — we poll the operation then fetch the result.
 */
async function getDefinition(
  workspaceId: string,
  ontologyId: string,
  token: string,
): Promise<FabricDefinitionPart[] | null> {
  try {
    const result = await fabricFetch<{ definition: FabricOntologyDefinition } | null>(
      `/workspaces/${encodeURIComponent(workspaceId)}/ontologies/${encodeURIComponent(ontologyId)}/getDefinition`,
      token,
      { method: 'POST' },
    );
    // If 202, poll the operation and get the result
    if (!result.data && result.operationId) {
      await pollOperation(result.operationId, token, 20, 3000);
      // Fetch the result from the operation
      const opResult = await fabricFetch<{ definition: FabricOntologyDefinition }>(
        `/operations/${result.operationId}/result`,
        token,
      );
      return opResult.data?.definition?.parts ?? null;
    }
    return result.data?.definition?.parts ?? null;
  } catch {
    return null;
  }
}

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
 * If an ontology with the same name already exists, appends a numeric suffix.
 */
export async function createOntology(
  workspaceId: string,
  token: string,
  ontology: Ontology,
  onProgress?: (progress: PollProgress) => void,
): Promise<FabricOntologyResponse> {
  // Preflight validation — catch data issues before hitting Fabric
  validateForFabric(ontology);

  const { definition } = convertToFabricParts(ontology);

  // Deduplicate display name to avoid 500 from Fabric on name collision
  let displayName = sanitizeItemName(ontology.name);
  try {
    const existing = await listOntologies(workspaceId, token);
    const existingNames = new Set(existing.map(o => o.displayName));
    if (existingNames.has(displayName)) {
      let suffix = 2;
      while (existingNames.has(`${displayName}_${suffix}`)) suffix++;
      displayName = `${displayName}_${suffix}`.slice(0, 89);
    }
  } catch {
    // If listing fails, proceed with the original name
  }

  const body: CreateOntologyRequest = {
    displayName,
    description: (ontology.description ?? '').slice(0, 256),
    definition,
  };

  // Debug: log the payload for troubleshooting
  console.group('🔧 Fabric CREATE ontology payload');
  console.log('displayName:', body.displayName);
  console.log('parts count:', definition.parts.length);
  for (const part of definition.parts) {
    try {
      const decoded = JSON.parse(atob(part.payload));
      console.log(`  📄 ${part.path}:`, decoded);
    } catch { console.log(`  📄 ${part.path}: [binary]`); }
  }
  console.groupEnd();

  const result = await fabricFetch<FabricOntologyResponse>(
    `/workspaces/${encodeURIComponent(workspaceId)}/ontologies`,
    token,
    { method: 'POST', body: JSON.stringify(body) },
  );

  // If 202 (long-running), poll until complete
  if (result.operationId) {
    await pollOperation(result.operationId, token, 60, 3000, onProgress);
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
  onProgress?: (progress: PollProgress) => void,
): Promise<void> {
  validateForFabric(ontology);

  const { definition } = convertToFabricParts(ontology);

  const result = await fabricFetch<void>(
    `/workspaces/${encodeURIComponent(workspaceId)}/ontologies/${encodeURIComponent(ontologyId)}/updateDefinition?updateMetadata=true`,
    token,
    { method: 'POST', body: JSON.stringify({ definition }) },
  );

  if (result.operationId) {
    await pollOperation(result.operationId, token, 60, 3000, onProgress);
  }
}

// ─── Data Binding Support ──────────────────────────────────────────────────

export interface DataBindingConfig {
  workspaceId: string;
  lakehouseId: string;
  entityIdMap: Map<string, string>;
  propertyIdMap: Map<string, Map<string, string>>;
  entityNameMap: Map<string, string>;
}

/**
 * Generate DataBinding definition parts for each entity type.
 * Maps each entity to a Lakehouse table with matching column names.
 */
export function generateDataBindingParts(
  ontology: Ontology,
  config: DataBindingConfig,
): FabricDefinitionPart[] {
  const parts: FabricDefinitionPart[] = [];

  for (const entity of ontology.entityTypes) {
    const fabricEntityId = config.entityIdMap.get(entity.id);
    const propMap = config.propertyIdMap.get(entity.id);
    const tableName = config.entityNameMap.get(entity.id);
    if (!fabricEntityId || !propMap || !tableName) continue;

    const sourceProps = entity.properties.length > 0
      ? entity.properties
      : [{ name: 'Id', type: 'string' as const }];

    const bindingId = crypto.randomUUID();

    const binding = {
      id: bindingId,
      dataBindingConfiguration: {
        dataBindingType: 'NonTimeSeries',
        propertyBindings: sourceProps.map(prop => ({
          sourceColumnName: prop.name,
          targetPropertyId: propMap.get(prop.name) ?? '',
        })).filter(b => b.targetPropertyId),
        sourceTableProperties: {
          sourceType: 'LakehouseTable',
          workspaceId: config.workspaceId,
          itemId: config.lakehouseId,
          sourceTableName: tableName,
          sourceSchema: 'dbo',
        },
      },
    };

    parts.push({
      path: `EntityTypes/${fabricEntityId}/DataBindings/${bindingId}.json`,
      payload: toBase64(binding),
      payloadType: 'InlineBase64',
    });
  }

  return parts;
}

/**
 * Find a Lakehouse in a workspace by partial name match.
 * Retries to handle eventual consistency after ontology creation.
 */
export async function findLakehouse(
  workspaceId: string,
  token: string,
  nameContains: string,
  maxRetries = 10,
  delayMs = 3000,
): Promise<{ id: string; displayName: string } | null> {
  for (let i = 0; i < maxRetries; i++) {
    const { data } = await fabricFetch<{ value: { id: string; displayName: string }[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/lakehouses`,
      token,
    );
    const lakehouses = data?.value ?? [];
    const match = lakehouses.find(l =>
      l.displayName.toLowerCase().includes(nameContains.toLowerCase()),
    );
    if (match) return match;
    if (i < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return null;
}

// ─── GraphModel population ─────────────────────────────────────────────────

type GraphPropertyType = 'STRING' | 'INT' | 'FLOAT' | 'BOOLEAN';

/**
 * Infer column schemas from sample entity instances.
 * Column names come from EntityInstance.values keys (which become CSV headers
 * and thus Parquet column names). Types are inferred from the first non-null value.
 */
function inferColumnSchemas(
  instances: import('../data/ontology').EntityInstance[],
): { name: string; type: GraphPropertyType }[] {
  if (instances.length === 0) return [];
  const columns = Object.keys(instances[0].values);
  return columns.map(col => {
    let type: GraphPropertyType = 'STRING';
    for (const inst of instances) {
      const val = inst.values[col];
      if (val === null || val === undefined) continue;
      if (typeof val === 'boolean') { type = 'BOOLEAN'; break; }
      if (typeof val === 'number') {
        type = Number.isInteger(val) ? 'INT' : 'FLOAT';
        break;
      }
      // strings, Dates, and anything else → STRING (safest for dates/timestamps)
      type = 'STRING';
      break;
    }
    return { name: col, type };
  });
}

/**
 * Find the auto-provisioned GraphModel for a newly created ontology.
 * Fabric creates a GraphModel alongside each ontology with a matching name.
 */
async function findGraphModel(
  workspaceId: string,
  token: string,
  ontologyDisplayName: string,
  maxRetries = 10,
  delayMs = 3000,
): Promise<{ id: string; displayName: string } | null> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const { data } = await fabricFetch<{ value: { id: string; displayName: string }[] }>(
        `/workspaces/${encodeURIComponent(workspaceId)}/graphModels`,
        token,
      );
      const models = data?.value ?? [];
      const match = models.find(m =>
        m.displayName === ontologyDisplayName ||
        m.displayName.toLowerCase().includes(ontologyDisplayName.toLowerCase()),
      );
      if (match) return match;
    } catch { /* retry */ }
    if (i < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return null;
}

/**
 * Get the current GraphModel definition (needed for .platform part).
 * getDefinition is async (202) — poll then fetch result.
 */
async function getGraphModelDefinition(
  workspaceId: string,
  graphModelId: string,
  token: string,
): Promise<FabricDefinitionPart[] | null> {
  try {
    const result = await fabricFetch<{ definition: FabricOntologyDefinition } | null>(
      `/workspaces/${encodeURIComponent(workspaceId)}/graphModels/${encodeURIComponent(graphModelId)}/getDefinition`,
      token,
      { method: 'POST' },
    );
    if (!result.data && result.operationId) {
      await pollOperation(result.operationId, token, 20, 3000);
      const opResult = await fabricFetch<{ definition: FabricOntologyDefinition }>(
        `/operations/${result.operationId}/result`,
        token,
      );
      return opResult.data?.definition?.parts ?? null;
    }
    return result.data?.definition?.parts ?? null;
  } catch {
    return null;
  }
}

// ─── Edge table generation ─────────────────────────────────────────────────

interface EdgeTableMeta {
  tableName: string;          // sanitized Delta table name
  relationshipName: string;   // display label for the edge
  sourceEntityName: string;   // sanitized entity name (matches node alias prefix)
  destEntityName: string;     // sanitized entity name (matches node alias prefix)
  sourcePkColumn: string;     // PK column in source entity table
  destPkColumn: string;       // PK column in destination entity table
}

/**
 * Find the identifier (PK) column for an entity type.
 * Uses the ontology `isIdentifier` flag, falling back to the first property.
 */
function findPkColumn(
  entityName: string,
  ontology: import('../data/ontology').Ontology,
  instances: import('../data/ontology').EntityInstance[],
): string | null {
  // Try ontology metadata first
  const entityType = ontology.entityTypes.find(e => e.name === entityName);
  if (entityType) {
    const idProp = entityType.properties.find(p => p.isIdentifier);
    if (idProp) return idProp.name;
  }
  // Fallback: first column in the instance values
  if (instances.length > 0) {
    const keys = Object.keys(instances[0].values);
    if (keys.length > 0) return keys[0];
  }
  return null;
}

/**
 * Generate edge tables from ontology relationships and sample entity data.
 * Each relationship produces a two-column table (sourceId, targetId)
 * that the GraphModel uses to draw edges between nodes.
 */
export function generateEdgeTables(
  ontology: import('../data/ontology').Ontology,
  sampleTables: Map<string, import('../data/ontology').EntityInstance[]>,
): { edgeInstances: Map<string, import('../data/ontology').EntityInstance[]>; edgeMeta: EdgeTableMeta[] } {
  const edgeInstances = new Map<string, import('../data/ontology').EntityInstance[]>();
  const edgeMeta: EdgeTableMeta[] = [];
  const entityIdToName = new Map(ontology.entityTypes.map(e => [e.id, e.name]));
  // Collect all existing table names to prevent collisions
  const usedTableNames = new Set([...sampleTables.keys()].map(n => sanitizeName(n)));

  for (const rel of ontology.relationships) {
    const sourceName = entityIdToName.get(rel.from);
    const destName = entityIdToName.get(rel.to);
    if (!sourceName || !destName) continue;

    const sourceInstances = sampleTables.get(sourceName);
    const destInstances = sampleTables.get(destName);
    if (!sourceInstances?.length || !destInstances?.length) {
      console.warn(`Edge "${rel.name}": skipping — no sample data for ${!sourceInstances?.length ? sourceName : destName}`);
      continue;
    }

    const sourcePk = findPkColumn(sourceName, ontology, sourceInstances);
    const destPk = findPkColumn(destName, ontology, destInstances);
    if (!sourcePk || !destPk) {
      console.warn(`Edge "${rel.name}": skipping — cannot determine PK for ${!sourcePk ? sourceName : destName}`);
      continue;
    }

    // Build unique table name: {relName}_{source}_{dest}
    let tableName = sanitizeName(`${rel.name}_${sourceName}_${destName}`);
    if (usedTableNames.has(tableName)) {
      let suffix = 2;
      while (usedTableNames.has(`${tableName}_${suffix}`)) suffix++;
      tableName = `${tableName}_${suffix}`;
    }
    usedTableNames.add(tableName);

    // Generate edge rows based on cardinality
    const sourceKeys = sourceInstances.map(i => i.values[sourcePk]);
    const destKeys = destInstances.map(i => i.values[destPk]);
    const rows: import('../data/ontology').EntityInstance[] = [];
    const seen = new Set<string>(); // deduplicate edges

    const addEdge = (sk: unknown, dk: unknown) => {
      const key = `${sk}|${dk}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({
        id: `edge-${rows.length}`,
        entityTypeId: tableName,
        values: { sourceId: sk, targetId: dk },
      });
    };

    switch (rel.cardinality) {
      case 'one-to-many':
        // Each destination gets one source (round-robin across sources)
        destKeys.forEach((dk, i) => addEdge(sourceKeys[i % sourceKeys.length], dk));
        break;
      case 'many-to-one':
        // Each source gets one destination (round-robin across destinations)
        sourceKeys.forEach((sk, i) => addEdge(sk, destKeys[i % destKeys.length]));
        break;
      case 'one-to-one':
        for (let i = 0; i < Math.min(sourceKeys.length, destKeys.length); i++) {
          addEdge(sourceKeys[i], destKeys[i]);
        }
        break;
      case 'many-to-many':
        // Each source connects to 2-3 destinations (with dedup)
        sourceKeys.forEach((sk, si) => {
          const count = Math.min(2 + (si % 2), destKeys.length);
          for (let j = 0; j < count; j++) {
            addEdge(sk, destKeys[(si + j) % destKeys.length]);
          }
        });
        break;
    }

    if (rows.length > 0) {
      edgeInstances.set(tableName, rows);
      edgeMeta.push({
        tableName,
        relationshipName: sanitizeName(rel.name),
        sourceEntityName: sanitizeName(sourceName),
        destEntityName: sanitizeName(destName),
        sourcePkColumn: sourcePk,
        destPkColumn: destPk,
      });
    }
  }

  return { edgeInstances, edgeMeta };
}

// ─── GraphModel population ─────────────────────────────────────────────────

/**
 * Populate the auto-provisioned GraphModel with node types and edge types
 * derived from the sample data tables and ontology relationships.
 * This makes the IQ Graph explorer show nodes AND edges immediately.
 */
async function populateGraphModel(
  workspaceId: string,
  token: string,
  ontologyDisplayName: string,
  lakehouseId: string,
  sampleTables: Map<string, import('../data/ontology').EntityInstance[]>,
  edgeMeta: EdgeTableMeta[],
  boundTableNames: Set<string>,
  onStatus?: (message: string) => void,
): Promise<void> {
  // 1. Find the auto-provisioned GraphModel
  const graphModel = await findGraphModel(workspaceId, token, ontologyDisplayName);
  if (!graphModel) {
    onStatus?.('⚠ GraphModel not found — skipping graph population');
    return;
  }

  // 2. Get the current definition for the .platform part
  const currentParts = await getGraphModelDefinition(workspaceId, graphModel.id, token);
  const platformPart = currentParts?.find(p => p.path === '.platform');
  if (!platformPart) {
    onStatus?.('⚠ Could not read GraphModel platform — skipping graph population');
    return;
  }

  // 3. Build node definitions (only for tables that were successfully copied)
  const basePath = `abfss://${workspaceId}@onelake.dfs.fabric.microsoft.com/${lakehouseId}/Tables/dbo`;

  const nodeTypes: unknown[] = [];
  const dataSources: unknown[] = [];
  const nodeTables: unknown[] = [];
  const nodeAliases = new Set<string>(); // track which node aliases exist

  for (const [entityName, instances] of sampleTables) {
    const tableName = sanitizeName(entityName);
    if (!boundTableNames.has(tableName)) continue; // only bound tables
    const columns = inferColumnSchemas(instances);
    if (columns.length === 0) continue;

    const pk = columns[0].name;
    const alias = `${tableName}_node`;
    nodeAliases.add(alias);

    nodeTypes.push({
      alias,
      labels: [tableName],
      primaryKeyProperties: [pk],
      properties: columns.map(c => ({ name: c.name, type: c.type })),
    });

    dataSources.push({
      name: `${tableName}_ds`,
      type: 'DeltaTable',
      properties: { path: `${basePath}/${tableName}` },
    });

    nodeTables.push({
      id: `${tableName}_nt`,
      nodeTypeAlias: alias,
      dataSourceName: `${tableName}_ds`,
      propertyMappings: columns.map(c => ({
        propertyName: c.name,
        sourceColumn: c.name,
      })),
    });
  }

  if (nodeTypes.length === 0) return;

  // 4. Build edge definitions (only for edges whose table + both endpoints exist)
  const edgeTypes: unknown[] = [];
  const edgeTables: unknown[] = [];
  let skippedEdges = 0;

  for (const edge of edgeMeta) {
    if (!boundTableNames.has(edge.tableName)) { skippedEdges++; continue; }
    const srcAlias = `${edge.sourceEntityName}_node`;
    const dstAlias = `${edge.destEntityName}_node`;
    if (!nodeAliases.has(srcAlias) || !nodeAliases.has(dstAlias)) { skippedEdges++; continue; }

    const edgeAlias = `${edge.tableName}_edge`;

    // Fabric schema: sourceNodeType/destinationNodeType are objects with { alias }
    edgeTypes.push({
      alias: edgeAlias,
      labels: [edge.relationshipName],
      sourceNodeType: { alias: srcAlias },
      destinationNodeType: { alias: dstAlias },
      properties: [],
    });

    dataSources.push({
      name: `${edge.tableName}_ds`,
      type: 'DeltaTable',
      properties: { path: `${basePath}/${edge.tableName}` },
    });

    // Fabric schema: key columns are String[] (column names in the edge table)
    edgeTables.push({
      id: `${edge.tableName}_et`,
      edgeTypeAlias: edgeAlias,
      dataSourceName: `${edge.tableName}_ds`,
      sourceNodeKeyColumns: ['sourceId'],
      destinationNodeKeyColumns: ['targetId'],
      propertyMappings: [],
    });
  }

  if (skippedEdges > 0) {
    console.warn(`GraphModel: skipped ${skippedEdges} edge(s) — missing tables or endpoint nodes`);
  }

  // 5. Encode all definition parts
  const parts: FabricDefinitionPart[] = [
    {
      path: 'graphType.json',
      payload: toBase64({ nodeTypes, edgeTypes }),
      payloadType: 'InlineBase64',
    },
    {
      path: 'dataSources.json',
      payload: toBase64({ dataSources }),
      payloadType: 'InlineBase64',
    },
    {
      path: 'graphDefinition.json',
      payload: toBase64({ nodeTables, edgeTables }),
      payloadType: 'InlineBase64',
    },
    {
      path: 'stylingConfiguration.json',
      payload: toBase64({
        modelLayout: {
          positions: {},
          styles: {},
          pan: { x: 0, y: 0 },
          zoomLevel: 1.0,
        },
        visualFormat: null,
        scenario: 'Ontology',
      }),
      payloadType: 'InlineBase64',
    },
    platformPart,
  ];

  // 6. Push the definition
  const updateResult = await fabricFetch<void>(
    `/workspaces/${encodeURIComponent(workspaceId)}/graphModels/${encodeURIComponent(graphModel.id)}/updateDefinition?updateMetadata=true`,
    token,
    { method: 'POST', body: JSON.stringify({ definition: { parts } }) },
  );

  if (updateResult.operationId) {
    onStatus?.('Applying graph model definition…');
    await pollOperation(updateResult.operationId, token, 30, 3000);
  }

  onStatus?.(`✓ Graph populated with ${nodeTypes.length} node types and ${edgeTypes.length} edge types`);
}

/**
 * Full push with sample data: create ontology → upload data → bind → populate graph.
 * Returns the created ontology response.
 */
export async function createOntologyWithData(
  workspaceId: string,
  fabricToken: string,
  oneLakeToken: string,
  ontology: Ontology,
  sampleTables: Map<string, import('../data/ontology').EntityInstance[]>,
  onProgress?: (progress: PollProgress) => void,
  onStatus?: (message: string) => void,
  options?: { includeDataAgent?: boolean },
): Promise<FabricOntologyResponse> {
  // Step 1: Validate, convert, and generate edge tables
  validateForFabric(ontology);
  const conversion = convertToFabricParts(ontology);
  const { edgeInstances, edgeMeta } = generateEdgeTables(ontology, sampleTables);

  // Merge entity + edge tables for the upload pipeline
  const allTables = new Map([...sampleTables, ...edgeInstances]);

  // Step 2: Create the ontology (schema only)
  onStatus?.('Creating ontology schema…');
  let displayName = sanitizeItemName(ontology.name);
  try {
    const existing = await listOntologies(workspaceId, fabricToken);
    const existingNames = new Set(existing.map(o => o.displayName));
    if (existingNames.has(displayName)) {
      let suffix = 2;
      while (existingNames.has(`${displayName}_${suffix}`)) suffix++;
      displayName = `${displayName}_${suffix}`.slice(0, 89);
    }
  } catch { /* proceed with original name */ }

  const body: CreateOntologyRequest = {
    displayName,
    description: (ontology.description ?? '').slice(0, 256),
    definition: conversion.definition,
  };

  const result = await fabricFetch<FabricOntologyResponse>(
    `/workspaces/${encodeURIComponent(workspaceId)}/ontologies`,
    fabricToken,
    { method: 'POST', body: JSON.stringify(body) },
  );

  if (result.operationId) {
    onProgress?.({ attempt: 0, maxAttempts: 60, status: 'Creating ontology…' });
    await pollOperation(result.operationId, fabricToken, 60, 3000, onProgress);
  }

  const ontologies = await listOntologies(workspaceId, fabricToken);
  const created = ontologies.find(o => o.displayName === displayName);
  if (!created) {
    throw new FabricApiError('Ontology created but not found in workspace', 404);
  }

  // Step 3: Find the auto-provisioned Lakehouse for this ontology.
  // Fabric requires data bindings to reference the ontology's own Lakehouse.
  onStatus?.('Waiting for auto-provisioned Lakehouse…');
  const autoLh = await findLakehouse(workspaceId, fabricToken, created.id.replace(/-/g, ''));
  if (!autoLh) {
    onStatus?.('⚠ Could not find auto-provisioned Lakehouse — ontology created without sample data');
    return created;
  }

  // Step 4: Create a temporary plain Lakehouse for CSV→Delta conversion.
  // The auto-provisioned LH has schemas enabled and the Load Table API
  // doesn't support it, so we convert in a temp LH then copy the Delta
  // files over and delete the temp LH.
  onStatus?.('Creating temporary Lakehouse…');
  const { createLakehouse, uploadEntityTable, copyDeltaTable, deleteLakehouse } = await import('./fabricLakehouse');
  const tmpLhName = `${displayName}_tmp`.slice(0, 89);
  let tmpLakehouse: { id: string; displayName: string };
  try {
    tmpLakehouse = await createLakehouse(workspaceId, fabricToken, tmpLhName, 'Temporary — CSV to Delta conversion');
  } catch (err) {
    console.warn('Failed to create temp Lakehouse:', err);
    onStatus?.('⚠ Could not create temp Lakehouse — ontology created without sample data');
    return created;
  }

  // Step 5: Upload sample data + edge tables to the temp Lakehouse and convert to Delta
  const tableEntries = Array.from(allTables.entries());
  const loadedTableNames: string[] = [];
  for (let i = 0; i < tableEntries.length; i++) {
    const [entityName, instances] = tableEntries[i];
    const tableName = sanitizeName(entityName);
    onStatus?.(`Uploading ${entityName} (${i + 1}/${tableEntries.length})…`);
    try {
      await uploadEntityTable(workspaceId, tmpLakehouse.id, oneLakeToken, tableName, instances, fabricToken);
      loadedTableNames.push(tableName);
    } catch (err) {
      console.warn(`Failed to upload table ${tableName}:`, err);
    }
  }

  if (loadedTableNames.length === 0 && tableEntries.length > 0) {
    onStatus?.('⚠ All table uploads failed — ontology created without sample data');
    return created;
  }

  // Step 6: Copy Delta table files from temp LH into the auto-provisioned LH.
  // Fabric auto-registers Delta tables written to Tables/dbo/ in the catalog.
  onStatus?.('Copying tables to ontology Lakehouse…');
  const boundTableNames: string[] = [];
  for (const tableName of loadedTableNames) {
    try {
      await copyDeltaTable(workspaceId, tmpLakehouse.id, autoLh.id, tableName, oneLakeToken);
      boundTableNames.push(tableName);
    } catch (err) {
      console.warn(`Failed to copy ${tableName}:`, err);
    }
  }

  // Step 6b: Delete the temporary Lakehouse (best-effort cleanup)
  onStatus?.('Cleaning up temporary Lakehouse…');
  const deleted = await deleteLakehouse(workspaceId, tmpLakehouse.id, fabricToken);
  if (!deleted) {
    console.warn(`Could not delete temp Lakehouse ${tmpLhName} — manual cleanup needed`);
  }

  if (boundTableNames.length === 0) {
    onStatus?.('⚠ Could not copy tables — ontology created without data bindings');
    return created;
  }

  // Step 7: Create data bindings only for tables that have working shortcuts
  // (Fabric requires bindings reference the ontology's own Lakehouse)
  if (boundTableNames.length < loadedTableNames.length) {
    onStatus?.(`Linked ${boundTableNames.length}/${loadedTableNames.length} tables. Creating data bindings…`);
  } else {
    onStatus?.('Creating data bindings…');
  }

  // Only bind entities whose tables were successfully copied
  const boundTableSet = new Set(boundTableNames);
  const bindingParts = generateDataBindingParts(ontology, {
    workspaceId,
    lakehouseId: autoLh.id,
    entityIdMap: conversion.entityIdMap,
    propertyIdMap: conversion.propertyIdMap,
    entityNameMap: conversion.entityNameMap,
  }).filter(part => {
    // Extract table name from binding path to check if it has a shortcut
    const payload = JSON.parse(atob(part.payload));
    const tableName = payload?.dataBindingConfiguration?.sourceTableProperties?.sourceTableName;
    return !tableName || boundTableSet.has(tableName);
  });

  if (bindingParts.length > 0) {
    // Fetch the current definition from Fabric (it may have added $schema fields)
    // and merge our binding parts with it, rather than using our original parts
    const currentDefParts = await getDefinition(workspaceId, created.id, fabricToken);
    const defParts = currentDefParts ?? conversion.definition.parts;
    const fullDefinition: FabricOntologyDefinition = {
      parts: [...defParts, ...bindingParts],
    };

    const updateResult = await fabricFetch<void>(
      `/workspaces/${encodeURIComponent(workspaceId)}/ontologies/${encodeURIComponent(created.id)}/updateDefinition?updateMetadata=true`,
      fabricToken,
      { method: 'POST', body: JSON.stringify({ definition: fullDefinition }) },
    );

    if (updateResult.operationId) {
      onStatus?.('Applying data bindings…');
      await pollOperation(updateResult.operationId, fabricToken, 60, 3000, onProgress);
    }
  }

  // Step 8: Populate the auto-provisioned GraphModel with node types + edge types
  // derived from actual table schemas so the IQ Graph view shows data AND relationships.
  onStatus?.('Populating graph model…');
  try {
    await populateGraphModel(
      workspaceId,
      fabricToken,
      displayName,
      autoLh.id,
      sampleTables,
      edgeMeta,
      boundTableSet,
      onStatus,
    );
  } catch (err) {
    console.warn('GraphModel population failed (non-fatal):', err);
    onStatus?.('⚠ Graph model population failed — ontology and data are still available');
  }

  // Step 9: Create a Data Agent connected to the ontology (optional)
  if (options?.includeDataAgent) {
    onStatus?.('Creating Data Agent…');
    try {
      const { createDataAgent } = await import('./fabricDataAgent');
      await createDataAgent(
        workspaceId,
        fabricToken,
        displayName,
        created.id,
        ontology,
        onStatus,
      );
    } catch (err) {
      console.warn('Data Agent creation failed (non-fatal):', err);
      onStatus?.('⚠ Data Agent creation failed — ontology and data are still available');
    }
  }

  onStatus?.('✓ Ontology ready with sample data and graph');
  return created;
}
