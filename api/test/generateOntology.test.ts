import { HttpRequest, InvocationContext } from '@azure/functions';
import { describe, expect, it, vi } from 'vitest';
import {
  handleGenerateOntology,
  handleGenerationConnector,
  type GenerateOntologyDependencies,
} from '../src/handlers/generateOntology';
import { createAzureOpenAIConnector } from '../src/connectors/azureOpenAI';
import { MAX_DESCRIPTION_LENGTH, MAX_REQUEST_BYTES, MAX_RESPONSE_BYTES } from '../src/connectors/types';

const origin = 'https://playground.example.test';
const configuredEnvironment = {
  AI_CONNECTORS_ENABLED: 'true',
  AI_ALLOWED_ORIGIN: origin,
  AZURE_OPENAI_ENDPOINT: 'https://example.openai.azure.com/',
  AZURE_OPENAI_API_KEY: 'test-api-key',
  AZURE_OPENAI_DEPLOYMENT: 'test-deployment',
};

function ontology() {
  return {
    name: 'Inventory',
    description: 'Product inventory',
    entityTypes: [{
      id: 'product',
      name: 'Product',
      description: 'An inventory product',
      icon: 'P',
      color: '#0078D4',
      properties: [{ name: 'productId', type: 'string', isIdentifier: true }],
    }],
    relationships: [],
  };
}

function dependencies(value: unknown = ontology()): GenerateOntologyDependencies {
  return {
    environment: configuredEnvironment,
    fetch: vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(value) } }],
    }))),
  };
}

function request(
  body: unknown,
  headers: Record<string, string> = {},
  omitted: string[] = [],
): HttpRequest {
  const allHeaders: Record<string, string> = {
    Origin: origin,
    'Content-Type': 'application/json',
    'X-Ontology-Request': 'generate',
    ...headers,
  };
  for (const name of omitted) delete allHeaders[name];
  return new HttpRequest({
    method: 'POST',
    url: 'https://function.example.test/api/generate-ontology',
    headers: allHeaders,
    body: { string: typeof body === 'string' ? body : JSON.stringify(body) },
  });
}

function body(deps: GenerateOntologyDependencies = dependencies()) {
  const descriptor = createAzureOpenAIConnector(deps).descriptor;
  return { description: 'Track products in inventory', connectorId: descriptor.id, revision: descriptor.revision };
}

function context(logs: unknown[][] = []): InvocationContext {
  return new InvocationContext({
    functionName: 'generateOntology',
    logHandler: (level, ...args) => logs.push([level, ...args]),
  });
}

describe('connector metadata and selection', () => {
  it('discloses only the pinned public descriptor without invoking a provider', async () => {
    const deps = dependencies();
    const response = await handleGenerationConnector(request({}), context(), deps);
    expect(response).toMatchObject({
      status: 200,
      jsonBody: { connector: {
        id: 'azure-openai', name: 'Azure OpenAI',
        destination: 'https://example.openai.azure.com',
        revision: expect.stringMatching(/^[a-f0-9]{64}$/),
        maxDescriptionLength: MAX_DESCRIPTION_LENGTH,
      } },
      headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': origin },
    });
    expect(JSON.stringify(response)).not.toContain('test-api-key');
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('supports same-origin browser metadata GETs without an Origin header', async () => {
    const response = await handleGenerationConnector(
      request({}, {}, ['Origin']), context(), dependencies(),
    );
    expect(response.status).toBe(200);
  });

  it.each(['', 'false', undefined])('stays disabled unless explicitly enabled: %s', async (enabled) => {
    const deps = dependencies();
    deps.environment = { ...configuredEnvironment, AI_CONNECTORS_ENABLED: enabled };
    expect((await handleGenerationConnector(request({}), context(), deps)).status).toBe(503);
    expect((await handleGenerateOntology(request(body()), context(), deps)).status).toBe(503);
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it.each(['unknown', '__proto__', 'constructor'])('rejects unregistered configuration %s', async (id) => {
    const deps = dependencies();
    deps.environment = { ...configuredEnvironment, AI_CONNECTOR: id };
    const response = await handleGenerateOntology(request(body()), context(), deps);
    expect(response.status).toBe(503);
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('permits a trusted deployment-registered non-Azure connector without core changes', async () => {
    const deps = dependencies();
    const generate = vi.fn(async () => ontology());
    deps.environment = { ...configuredEnvironment, AI_CONNECTOR: 'example-connector' };
    deps.factories = new Map([['example-connector', () => ({
      descriptor: {
        id: 'example-connector', name: 'Example connector', destination: 'https://provider.example.test',
        revision: 'a'.repeat(64), maxDescriptionLength: MAX_DESCRIPTION_LENGTH,
        privateSecret: 'do-not-serialize',
      },
      generate,
    })]]);
    const metadata = await handleGenerationConnector(request({}), context(), deps);
    expect(JSON.stringify(metadata)).not.toContain('do-not-serialize');
    const response = await handleGenerateOntology(request({
      description: 'Track inventory', connectorId: 'example-connector', revision: 'a'.repeat(64),
    }), context(), deps);
    expect(response.status).toBe(200);
    expect(generate).toHaveBeenCalledOnce();
    expect(deps.fetch).not.toHaveBeenCalled();
  });
});

describe('Azure connector destination and routing boundary', () => {
  it.each([
    'http://example.openai.azure.com/',
    'https://example.openai.azure.com.evil.test/',
    'https://example.openai.azure.com@evil.test/',
    'https://user:secret@example.openai.azure.com/',
    'https://127.0.0.1/',
    'https://169.254.169.254/',
    'https://example.openai.azure.com:8443/',
    'https://example.openai.azure.com/proxy',
    'https://example.openai.azure.com/?token=secret',
    'https://example.openai.azure.com/#fragment',
    'not-a-url',
  ])('fails closed for unsupported configured endpoint %s', async (endpoint) => {
    const deps = dependencies();
    deps.environment = { ...configuredEnvironment, AZURE_OPENAI_ENDPOINT: endpoint };
    expect((await handleGenerateOntology(request(body()), context(), deps)).status).toBe(503);
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('changes the public revision when the actual resource or deployment changes', () => {
    const original = createAzureOpenAIConnector(dependencies()).descriptor;
    for (const changed of [
      { AZURE_OPENAI_ENDPOINT: 'https://other.openai.azure.com/' },
      { AZURE_OPENAI_DEPLOYMENT: 'other-model' },
    ]) {
      const other = createAzureOpenAIConnector({
        ...dependencies(), environment: { ...configuredEnvironment, ...changed },
      }).descriptor;
      expect(other.revision).not.toBe(original.revision);
    }
  });

  it('uses fixed Azure routing with redirect rejection, deadlines and bounded generation options', async () => {
    const deps = dependencies();
    const response = await handleGenerateOntology(
      request({ ...body(), description: '  Track products in inventory  ' }), context(), deps,
    );
    expect(response).toMatchObject({ status: 200, jsonBody: { ontology: ontology() } });
    expect(deps.fetch).toHaveBeenCalledWith(
      new URL('https://example.openai.azure.com/openai/deployments/test-deployment/chat/completions?api-version=2024-02-15-preview'),
      expect.objectContaining({
        method: 'POST', redirect: 'error', signal: expect.any(AbortSignal),
        headers: { 'Content-Type': 'application/json', 'api-key': 'test-api-key' },
      }),
    );
    const [, init] = vi.mocked(deps.fetch).mock.calls[0];
    expect(JSON.parse(init?.body as string)).toMatchObject({
      messages: expect.arrayContaining([{ role: 'user', content: 'Track products in inventory' }]),
      max_tokens: 4000, response_format: { type: 'json_object' },
    });
  });

  it.each([{ connectorId: 'other' }, { revision: '0'.repeat(64) }])('rejects stale identity %j before generation', async (changed) => {
    const deps = dependencies();
    expect((await handleGenerateOntology(request({ ...body(), ...changed }), context(), deps)).status).toBe(409);
    expect(deps.fetch).not.toHaveBeenCalled();
  });
});

describe('generation input and browser CSRF boundary', () => {
  it.each([
    ['null', {}], ['https://attacker.example.test', {}], ['', {}],
  ])('rejects disallowed Origin %s', async (header) => {
    const deps = dependencies();
    expect((await handleGenerateOntology(request(body(), { Origin: header }), context(), deps)).status).toBe(403);
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it.each(['Origin', 'X-Ontology-Request'])('rejects missing %s', async (name) => {
    const deps = dependencies();
    expect((await handleGenerateOntology(request(body(), {}, [name]), context(), deps)).status).toBe(403);
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it.each(['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data'])('rejects simple content type %s', async (contentType) => {
    const deps = dependencies();
    expect((await handleGenerateOntology(request(body(), { 'Content-Type': contentType }), context(), deps)).status).toBe(415);
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it.each([
    '{', null, [], {}, { description: '' }, { description: '   ' },
    { description: 123 }, { description: 'x'.repeat(MAX_DESCRIPTION_LENGTH + 1) },
    { endpoint: 'https://attacker.example.test' }, { apiKey: 'caller-key' },
    { model: 'caller-model' }, { plugin: 'https://attacker.example.test/plugin.js' },
  ])('rejects malformed or overpowered input %j', async (changed) => {
    const deps = dependencies();
    const input = typeof changed === 'object' && changed !== null && !Array.isArray(changed)
      && Object.keys(changed).length > 0
      ? { ...body(), ...changed } : changed;
    expect((await handleGenerateOntology(request(input), context(), deps)).status).toBe(400);
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('accepts exactly the description limit and rejects one additional character', async () => {
    const deps = dependencies();
    expect((await handleGenerateOntology(request({
      ...body(), description: 'x'.repeat(MAX_DESCRIPTION_LENGTH),
    }), context(), deps)).status).toBe(200);
  });

  it('counts actual UTF-8 request bytes without trusting Content-Length', async () => {
    const deps = dependencies();
    const response = await handleGenerateOntology(
      request({ ...body(), description: '€'.repeat(MAX_REQUEST_BYTES / 3 + 1) }, { 'Content-Length': '1' }),
      context(), deps,
    );
    expect(response.status).toBe(413);
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('enforces the exact request-byte boundary', async () => {
    const text = JSON.stringify(body());
    const padded = text + ' '.repeat(MAX_REQUEST_BYTES - Buffer.byteLength(text));
    expect((await handleGenerateOntology(request(padded), context(), dependencies())).status).toBe(200);
    const deps = dependencies();
    expect((await handleGenerateOntology(request(padded + ' '), context(), deps)).status).toBe(413);
    expect(deps.fetch).not.toHaveBeenCalled();
  });
});

describe('untrusted provider output', () => {
  it.each([
    null, {}, { ...ontology(), entityTypes: [] },
    { ...ontology(), entityTypes: [{ ...ontology().entityTypes[0], properties: [] }] },
    { ...ontology(), entityTypes: [{ ...ontology().entityTypes[0], id: 'constructor' }] },
    { ...ontology(), entityTypes: [{ ...ontology().entityTypes[0], properties: [{ name: 'id', type: 'invalid' }] }] },
    { ...ontology(), entityTypes: Array.from({ length: 101 }, () => ontology().entityTypes[0]) },
    { ...ontology(), entityTypes: [ontology().entityTypes[0], ontology().entityTypes[0]] },
    { ...ontology(), relationships: [{ id: 'edge', name: 'Has', from: 'missing', to: 'product', cardinality: 'one-to-many' }] },
    { ...ontology(), relationships: [{ id: 'product', name: 'Has', from: 'product', to: 'product', cardinality: 'one-to-many' }] },
    { ...ontology(), rdfMetadata: { ontologyIRI: 'https://trusted.example.test' } },
    JSON.parse('{"name":"Inventory","entityTypes":[],"relationships":[],"__proto__":{"polluted":true}}'),
  ])('rejects invalid nested schema/semantics %j', async (output) => {
    expect((await handleGenerateOntology(request(body()), context(), dependencies(output))).status).toBe(502);
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it.each(['not-json', JSON.stringify({ choices: [] }), JSON.stringify({ choices: [{ message: { content: '{' } }] })])('rejects malformed transport JSON %s', async (text) => {
    const deps = dependencies();
    deps.fetch = vi.fn(async () => new Response(text));
    expect((await handleGenerateOntology(request(body()), context(), deps)).status).toBe(502);
  });

  it('bounds actual response bytes and cancels the provider stream', async () => {
    const cancelled = vi.fn();
    const deps = dependencies();
    deps.fetch = vi.fn(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(MAX_RESPONSE_BYTES + 1)); },
      cancel: cancelled,
    }), { headers: { 'Content-Length': '1' } }));
    expect((await handleGenerateOntology(request(body()), context(), deps)).status).toBe(502);
    expect(cancelled).toHaveBeenCalled();
  });

  it('enforces the exact upstream response-byte boundary', async () => {
    const text = JSON.stringify({ choices: [{ message: { content: JSON.stringify(ontology()) } }] });
    const padded = text + ' '.repeat(MAX_RESPONSE_BYTES - Buffer.byteLength(text));
    const deps = dependencies();
    deps.fetch = vi.fn(async () => new Response(padded));
    expect((await handleGenerateOntology(request(body()), context(), deps)).status).toBe(200);
    deps.fetch = vi.fn(async () => new Response(padded + ' '));
    expect((await handleGenerateOntology(request(body()), context(), deps)).status).toBe(502);
  });

  it.each(['entities', 'properties', 'relationships'])('enforces the exact %s count boundary', async (collection) => {
    const base = ontology();
    const value: Record<string, unknown> = { ...base };
    if (collection === 'entities') {
      value.entityTypes = Array.from({ length: 100 }, (_, i) => ({
        ...base.entityTypes[0], id: `product${i}`,
      }));
    } else if (collection === 'properties') {
      value.entityTypes = [{
        ...base.entityTypes[0],
        properties: Array.from({ length: 50 }, (_, i) => ({
          name: `property${i}`, type: 'string', isIdentifier: i === 0,
        })),
      }];
    } else {
      value.relationships = Array.from({ length: 500 }, (_, i) => ({
        id: `edge${i}`, name: 'Tracks', from: 'product', to: 'product', cardinality: 'one-to-many',
      }));
    }
    expect((await handleGenerateOntology(request(body()), context(), dependencies(value))).status).toBe(200);
    const entities = value.entityTypes as Array<Record<string, unknown>>;
    if (collection === 'entities') entities.push({ ...base.entityTypes[0], id: 'extra' });
    else if (collection === 'properties') {
      (entities[0].properties as unknown[]).push({ name: 'extra', type: 'string' });
    } else {
      (value.relationships as unknown[]).push({
        id: 'extra', name: 'Tracks', from: 'product', to: 'product', cardinality: 'one-to-many',
      });
    }
    expect((await handleGenerateOntology(request(body()), context(), dependencies(value))).status).toBe(502);
  });

  it('rejects deeply nested provider payloads', async () => {
    let nested: unknown = 'leaf';
    for (let i = 0; i < 14; i++) nested = { child: nested };
    expect((await handleGenerateOntology(
      request(body()), context(), dependencies({ ...ontology(), extra: nested }),
    )).status).toBe(502);
  });

  it.each(['upstream-status', 'transport-exception'])('never exposes provider messages, credentials or prompts: %s', async (mode) => {
    const logs: unknown[][] = [];
    const secret = 'test-api-key Track products in inventory private-provider-response';
    const deps = dependencies();
    deps.fetch = vi.fn(async () => {
      if (mode === 'transport-exception') throw new Error(secret);
      return new Response(secret, { status: 401 });
    });
    const response = await handleGenerateOntology(request(body()), context(logs), deps);
    expect(response.status).toBe(502);
    for (const value of ['test-api-key', 'Track products in inventory', 'private-provider-response']) {
      expect(JSON.stringify([response, logs])).not.toContain(value);
    }
    expect(deps.fetch).toHaveBeenCalledOnce();
  });
});

describe('deadline, cancellation and per-instance admission', () => {
  it('aborts stalled provider headers and returns a bounded timeout', async () => {
    const deps = dependencies();
    deps.timeoutMs = 10;
    let signal: AbortSignal | undefined;
    deps.fetch = vi.fn((_input, init) => new Promise<Response>((_resolve, reject) => {
      signal = init?.signal ?? undefined;
      signal?.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
    }));
    const response = await handleGenerateOntology(request(body()), context(), deps);
    expect(response.status).toBe(504);
    expect(signal?.aborted).toBe(true);
  });

  it('cancels stalled response-body reading at the same deadline', async () => {
    const deps = dependencies();
    deps.timeoutMs = 10;
    const cancelled = vi.fn();
    deps.fetch = vi.fn(async () => new Response(new ReadableStream({ cancel: cancelled })));
    expect((await handleGenerateOntology(request(body()), context(), deps)).status).toBe(504);
    expect(cancelled).toHaveBeenCalled();
  });

  it('cancels stalled incoming bodies without leaving admission slots stuck', async () => {
    const deps = dependencies();
    deps.timeoutMs = 10;
    const stalled = { headers: request(body()).headers, body: new ReadableStream<Uint8Array>() };
    expect((await handleGenerateOntology(stalled, context(), deps)).status).toBe(504);
    expect(deps.fetch).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await handleGenerateOntology(request(body()), context(), dependencies())).status).toBe(200);
  });

  it('rejects excess work and retains slots for adapters that ignore cancellation', async () => {
    const deps = dependencies();
    deps.timeoutMs = 10;
    const pending: Array<(value: Response) => void> = [];
    deps.fetch = vi.fn(() => new Promise<Response>((resolve) => { pending.push(resolve); }));
    const results = await Promise.all([
      handleGenerateOntology(request(body()), context(), deps),
      handleGenerateOntology(request(body()), context(), deps),
    ]);
    expect(results.map((value) => value.status)).toEqual([504, 504]);
    expect((await handleGenerateOntology(request(body()), context(), deps)).status).toBe(429);
    expect(deps.fetch).toHaveBeenCalledTimes(2);
    for (const resolve of pending) resolve(new Response('{}'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await handleGenerateOntology(request(body()), context(), dependencies())).status).toBe(200);
  });
});
