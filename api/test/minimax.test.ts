import { HttpRequest, InvocationContext } from '@azure/functions';
import { describe, expect, it, vi } from 'vitest';
import { resolveConnector } from '../src/connectors';
import { createMiniMaxConnector } from '../src/connectors/minimax';
import { MAX_RESPONSE_BYTES } from '../src/connectors/types';
import {
  handleGenerateOntology,
  handleGenerationConnector,
  type GenerateOntologyDependencies,
} from '../src/handlers/generateOntology';

const origin = 'https://playground.example.test';
const ontology = {
  name: 'Inventory', description: 'Product inventory',
  entityTypes: [{
    id: 'product', name: 'Product', description: 'An inventory product',
    icon: 'P', color: '#0078D4',
    properties: [{ name: 'productId', type: 'string', isIdentifier: true }],
  }],
  relationships: [],
};

function envelope(content = JSON.stringify(ontology), finishReason = 'stop') {
  return JSON.stringify({ choices: [{
    finish_reason: finishReason,
    message: { content, reasoning_content: 'Private reasoning' },
  }] });
}

function dependencies(environment: Record<string, string | undefined> = {}): GenerateOntologyDependencies {
  return {
    environment: {
      AI_CONNECTORS_ENABLED: 'true', AI_ALLOWED_ORIGIN: origin,
      AI_CONNECTOR: 'minimax', MINIMAX_API_KEY: 'test-api-key', ...environment,
    },
    fetch: vi.fn(async () => new Response(envelope())),
  };
}

function request(deps: GenerateOntologyDependencies, changes: Record<string, unknown> = {}) {
  const { id, revision } = resolveConnector(deps).descriptor;
  return new HttpRequest({
    method: 'POST', url: 'https://function.example.test/api/generate-ontology',
    headers: {
      Origin: origin, 'Content-Type': 'application/json', 'X-Ontology-Request': 'generate',
    },
    body: { string: JSON.stringify({
      description: 'Track products in inventory', connectorId: id, revision, ...changes,
    }) },
  });
}

function context(logs: unknown[][] = []) {
  return new InvocationContext({
    functionName: 'generateOntology', logHandler: (level, ...args) => logs.push([level, ...args]),
  });
}

describe('MiniMax connector request boundary', () => {
  it.each([
    [undefined, undefined, 'https://api.minimax.io', 'MiniMax-M3.1-Flash'],
    ['https://api.minimaxi.com/v1///', undefined, 'https://api.minimaxi.com', 'MiniMax-M3.1-Flash'],
    ['https://api.minimax.cn/v1', undefined, 'https://api.minimax.cn', 'MiniMax-M3.1-Flash'],
    ['https://api.minimax.cn/v1/', 'MiniMax-M3', 'https://api.minimax.cn', 'MiniMax-M3'],
    [undefined, 'MiniMax-M3', 'https://api.minimax.io', 'MiniMax-M3'],
    ['https://api.minimaxi.com/v1', 'MiniMax-M3', 'https://api.minimaxi.com', 'MiniMax-M3'],
    [undefined, 'MiniMax-M2.7', 'https://api.minimax.io', 'MiniMax-M2.7'],
    [undefined, 'custom-model', 'https://api.minimax.io', 'custom-model'],
  ])('serializes the configured target without resetting explicit models (%s, %s)', async (base, model, destination, expectedModel) => {
    const deps = dependencies({ MINIMAX_BASE_URL: base, MINIMAX_MODEL: model });
    const metadata = await handleGenerationConnector(request(deps), context(), deps);
    expect(metadata).toMatchObject({ status: 200, jsonBody: { connector: {
      id: 'minimax', name: 'MiniMax', destination,
    } } });
    expect(deps.fetch).not.toHaveBeenCalled();
    const response = await handleGenerateOntology(request(deps), context(), deps);
    expect(response).toMatchObject({ status: 200, jsonBody: { ontology } });
    expect(deps.fetch).toHaveBeenCalledExactlyOnceWith(
      new URL(`${destination}/v1/chat/completions`),
      expect.objectContaining({
        method: 'POST', redirect: 'error', signal: expect.any(AbortSignal),
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-api-key' },
      }),
    );
    const [, init] = vi.mocked(deps.fetch).mock.calls[0];
    expect(JSON.parse(init?.body as string)).toEqual({
      model: expectedModel,
      messages: [
        { role: 'system', content: expect.stringContaining('Return only JSON:') },
        { role: 'user', content: 'Track products in inventory' },
      ],
      max_completion_tokens: 16384, reasoning_split: true,
    });
    expect(JSON.stringify([metadata, response])).not.toMatch(/test-api-key|Private reasoning/);
  });

  it('pins destination and model changes to a new consent revision, but not key rotation', async () => {
    const deps = dependencies();
    const original = resolveConnector(deps).descriptor;
    for (const environment of [
      { MINIMAX_BASE_URL: 'https://api.minimaxi.com/v1' },
      { MINIMAX_MODEL: 'MiniMax-M3' },
    ]) {
      const changed = dependencies(environment);
      expect(resolveConnector(changed).descriptor.revision).not.toBe(original.revision);
      expect((await handleGenerateOntology(request(deps), context(), changed)).status).toBe(409);
      expect(changed.fetch).not.toHaveBeenCalled();
    }
    expect(resolveConnector(dependencies({ MINIMAX_API_KEY: 'rotated-test-key' })).descriptor)
      .toEqual(original);
    expect(resolveConnector(dependencies({ MINIMAX_BASE_URL: 'https://api.minimax.io/v1/' })).descriptor)
      .toEqual(original);
  });

  it.each([
    'http://api.minimax.io/v1', 'https://api.minimax.io.evil.test/v1',
    'https://api.minimax.io@evil.test/v1', 'https://user:secret@api.minimax.io/v1',
    'https://127.0.0.1/v1', 'https://169.254.169.254/v1',
    'https://api.minimax.io:8443/v1', 'https://api.minimax.io/proxy/v1',
    'https://api.minimax.io/v1?token=secret', 'https://api.minimax.io/v1#fragment',
    'not-a-url',
  ])('rejects unsupported destinations before transport: %s', async (base) => {
    const deps = dependencies({ MINIMAX_BASE_URL: base });
    const response = await handleGenerateOntology(request(dependencies()), context(), deps);
    expect(response.status).toBe(503);
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it.each([
    { MINIMAX_API_KEY: undefined }, { MINIMAX_MODEL: 'bad\nmodel' },
    { MINIMAX_MODEL: 'x'.repeat(129) }, { AI_CONNECTOR: 'minmax' },
  ])('fails closed for invalid configuration %j', async (environment) => {
    const deps = dependencies(environment);
    expect((await handleGenerateOntology(request(dependencies()), context(), deps)).status).toBe(503);
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('does not allow browser model or destination overrides', async () => {
    const deps = dependencies();
    for (const changed of [{ model: 'caller-model' }, { endpoint: 'https://evil.test' }]) {
      expect((await handleGenerateOntology(request(deps, changed), context(), deps)).status).toBe(400);
    }
    expect(deps.fetch).not.toHaveBeenCalled();
  });
});

describe('MiniMax connector bounded failures', () => {
  it.each([
    ['provider error', () => new Response('private provider error', { status: 429 })],
    ['redirect', () => new Response(null, { status: 302, headers: { Location: 'https://evil.test' } })],
    ['invalid envelope', () => new Response('{')],
    ['missing choices', () => new Response('{}')],
    ['malformed content', () => new Response(envelope('{'))],
    ['truncated output', () => new Response(envelope(JSON.stringify(ontology), 'length'))],
    ['invalid ontology', () => new Response(envelope('{}'))],
    ['oversized response', () => new Response('x'.repeat(MAX_RESPONSE_BYTES + 1))],
  ])('redacts %s without retries or fallback', async (_name, response) => {
    const deps = dependencies();
    deps.fetch = vi.fn(async () => response());
    const logs: unknown[][] = [];
    const result = await handleGenerateOntology(request(deps), context(logs), deps);
    expect(result.status).toBe(502);
    expect(deps.fetch).toHaveBeenCalledOnce();
    expect(JSON.stringify([result, logs])).not.toMatch(/test-api-key|private provider error|Private reasoning|Track products/);
  });

  it('redacts transport exceptions', async () => {
    const deps = dependencies();
    deps.fetch = vi.fn(async () => { throw new Error('test-api-key private transport error'); });
    const logs: unknown[][] = [];
    const result = await handleGenerateOntology(request(deps), context(logs), deps);
    expect(result.status).toBe(502);
    expect(JSON.stringify([result, logs])).not.toMatch(/test-api-key|private transport error/);
    expect(deps.fetch).toHaveBeenCalledOnce();
  });

  it('cancels a stalled provider body when the handler deadline expires', async () => {
    const deps = dependencies();
    const cancel = vi.fn();
    deps.timeoutMs = 10;
    deps.fetch = vi.fn(async () => new Response(new ReadableStream({ cancel })));
    const response = await handleGenerateOntology(request(deps), context(), deps);
    expect(response.status).toBe(504);
    expect(cancel).toHaveBeenCalledOnce();
    const [, init] = vi.mocked(deps.fetch).mock.calls[0];
    expect(init?.signal?.aborted).toBe(true);
  });

  it('honors an aborted signal while consuming a response', async () => {
    const deps = dependencies();
    const controller = new AbortController();
    controller.abort();
    await expect(createMiniMaxConnector(deps).generate({
      description: 'Inventory', signal: controller.signal,
    })).rejects.toThrow();
  });
});
