import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { parseOntologyValue } from '../../../src/lib/ontologySchema';
import { validateGeneratedOntology } from '../../../src/lib/ontologyValidation';
import { resolveConnector } from '../connectors';
import { readBoundedText } from '../connectors/http';
import {
  ConnectorError,
  GENERATION_TIMEOUT_MS,
  MAX_DESCRIPTION_LENGTH,
  MAX_REQUEST_BYTES,
  MAX_RESPONSE_BYTES,
  type ConnectorDependencies,
  type ConnectorFactory,
} from '../connectors/types';

export interface GenerateOntologyDependencies extends ConnectorDependencies {
  factories?: ReadonlyMap<string, ConnectorFactory>;
  timeoutMs?: number;
}

type GenerationRequest = Pick<HttpRequest, 'body' | 'headers'>;
type GenerationContext = Pick<InvocationContext, 'error'>;

const defaults: GenerateOntologyDependencies = {
  environment: process.env,
  fetch: (input, init) => globalThis.fetch(input, init),
};

const COLORS = ['#0078D4', '#107C10', '#D83B01', '#5C2D91', '#00A9E0', '#FFB900', '#E81123', '#008272'];
const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype']);
let activeRequests = 0;

function result(status: number, jsonBody: unknown, origin?: string): HttpResponseInit {
  return {
    status,
    jsonBody,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Vary': 'Origin',
      ...(origin ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
      } : {}),
    },
  };
}

function allowedOrigin(dependencies: GenerateOntologyDependencies): string {
  const origin = dependencies.environment.AI_ALLOWED_ORIGIN;
  if (!origin) throw new ConnectorError('configuration');
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new ConnectorError('configuration');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.origin !== origin || url.username || url.password
    || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
    throw new ConnectorError('configuration');
  }
  return origin;
}

function preflight(
  request: GenerationRequest,
  dependencies: GenerateOntologyDependencies,
  requireOrigin: boolean,
): { origin: string } | HttpResponseInit {
  if (dependencies.environment.AI_CONNECTORS_ENABLED !== 'true') {
    return result(503, { error: 'Ontology generation is disabled.' });
  }
  const origin = allowedOrigin(dependencies);
  const requestOrigin = request.headers.get('origin');
  if ((requireOrigin || requestOrigin !== null) && requestOrigin !== origin) {
    return result(403, { error: 'Request origin is not allowed.' });
  }
  if (request.headers.get('x-ontology-request') !== 'generate') {
    return result(403, { error: 'Required request header is missing.' }, origin);
  }
  return { origin };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validatedOutput(value: unknown) {
  if (!isRecord(value) || value.rdfMetadata !== undefined
    || !Array.isArray(value.entityTypes) || value.entityTypes.length > 100
    || !Array.isArray(value.relationships) || value.relationships.length > 500) {
    throw new ConnectorError('invalid_output');
  }
  for (const entity of value.entityTypes) {
    if (!isRecord(entity) || !Array.isArray(entity.properties)
      || entity.properties.length > 50) throw new ConnectorError('invalid_output');
  }
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_RESPONSE_BYTES) {
    throw new ConnectorError('too_large');
  }
  const checkBudget = (item: unknown, depth: number): void => {
    if (depth > 12 || (typeof item === 'string' && item.length > 8000)
      || (Array.isArray(item) && item.length > 500)) {
      throw new ConnectorError('invalid_output');
    }
    if (typeof item === 'object' && item !== null) {
      const entries = Object.entries(item);
      if (entries.length > 500) throw new ConnectorError('invalid_output');
      for (const [key, child] of entries) {
        if (RESERVED_IDS.has(key)) throw new ConnectorError('invalid_output');
        checkBudget(child, depth + 1);
      }
    }
  };
  checkBudget(value, 0);
  const parsed = parseOntologyValue(value, { defaultEntityColors: COLORS });
  if (!parsed.ontology || parsed.issues.length
    || !parsed.ontology.name.trim() || parsed.ontology.name.length > 120
    || validateGeneratedOntology(parsed.ontology).length) {
    throw new ConnectorError('invalid_output');
  }
  const ontology = parsed.ontology;
  const validId = (id: string) => /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(id)
    && !RESERVED_IDS.has(id);
  if (ontology.entityTypes.some((entity) =>
    !validId(entity.id) || entity.icon.length > 32
    || !/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(entity.color))
    || ontology.relationships.some((relationship) =>
      !validId(relationship.id) || !relationship.name.trim())) {
    throw new ConnectorError('invalid_output');
  }
  return ontology;
}

function failure(error: unknown, context: GenerationContext, origin?: string): HttpResponseInit {
  const code = error instanceof ConnectorError ? error.code : 'upstream';
  context.error('Ontology connector request failed', code);
  if (code === 'configuration') {
    return result(503, { error: 'Ontology connector is not configured correctly.' }, origin);
  }
  return result(502, { error: 'Ontology connector could not produce a valid ontology.' }, origin);
}

export async function handleGenerationConnector(
  request: GenerationRequest,
  context: GenerationContext,
  dependencies: GenerateOntologyDependencies = defaults,
): Promise<HttpResponseInit> {
  let origin: string | undefined;
  try {
    const checked = preflight(request, dependencies, false);
    if (!('origin' in checked)) return checked;
    origin = checked.origin;
    const connector = resolveConnector(dependencies, dependencies.factories);
    return result(200, { connector: connector.descriptor }, origin);
  } catch (error) {
    return failure(error, context, origin);
  }
}

export async function handleGenerateOntology(
  request: GenerationRequest,
  context: GenerationContext,
  dependencies: GenerateOntologyDependencies = defaults,
): Promise<HttpResponseInit> {
  let origin: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  try {
    const checked = preflight(request, dependencies, true);
    if (!('origin' in checked)) return checked;
    origin = checked.origin;
    if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
      !== 'application/json') {
      return result(415, { error: 'Content-Type must be application/json.' }, origin);
    }
    const connector = resolveConnector(dependencies, dependencies.factories);
    if (activeRequests >= 2) {
      return result(429, { error: 'Ontology generation is busy. Try again later.' }, origin);
    }
    activeRequests++;
    const work = (async (): Promise<HttpResponseInit> => {
      let body: unknown;
      try {
        const text = await readBoundedText(request.body, MAX_REQUEST_BYTES, controller.signal);
        body = JSON.parse(text);
      } catch (error) {
        if (error instanceof ConnectorError && error.code === 'too_large') {
          return result(413, { error: 'Generation request exceeds the size limit.' }, origin);
        }
        if (controller.signal.aborted) throw error;
        return result(400, { error: 'Generation request must contain valid JSON.' }, origin);
      }
      if (!isRecord(body)
        || Object.keys(body).some((key) => !['description', 'connectorId', 'revision'].includes(key))
        || typeof body.description !== 'string' || !body.description.trim()
        || body.description.length > MAX_DESCRIPTION_LENGTH
        || typeof body.connectorId !== 'string' || typeof body.revision !== 'string') {
        return result(400, { error: 'A description (1-8000 characters) and connector identity are required.' }, origin);
      }
      if (body.connectorId !== connector.descriptor.id
        || body.revision !== connector.descriptor.revision) {
        return result(409, { error: 'The connector has changed. Reload its details and consent again.' }, origin);
      }
      controller.signal.throwIfAborted();
      const value = await connector.generate({
        description: body.description.trim(),
        signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      const ontology = validatedOutput(value);
      return result(200, {
        ontology,
        connector: { id: connector.descriptor.id, revision: connector.descriptor.revision },
      }, origin);
    })();
    // A non-cooperative adapter retains its slot until it actually settles.
    void work.then(() => { activeRequests--; }, () => { activeRequests--; });
    const timeout = new Promise<HttpResponseInit>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        context.error('Ontology connector request failed', 'timeout');
        resolve(result(504, { error: 'Ontology generation timed out.' }, origin));
      }, dependencies.timeoutMs ?? GENERATION_TIMEOUT_MS);
    });
    return await Promise.race([work, timeout]);
  } catch (error) {
    return failure(error, context, origin);
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
  }
}
