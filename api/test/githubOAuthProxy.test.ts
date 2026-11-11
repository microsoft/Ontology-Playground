import { HttpRequest, InvocationContext } from '@azure/functions';
import { describe, expect, it } from 'vitest';
import {
  handleGitHubOAuthProxy,
  type GitHubOAuthProxyDependencies,
} from '../src/handlers/githubOAuthProxy';

function createRequest(path: string, body = '{"client_id":"client-id"}'): HttpRequest {
  return new HttpRequest({
    method: 'POST',
    url: `https://example.test/api/github-oauth/${path}`,
    headers: { 'Content-Type': 'application/json' },
    params: { path },
    body: { string: body },
  });
}

function createContext(logs: unknown[][] = []): InvocationContext {
  return new InvocationContext({
    functionName: 'githubOAuthProxy',
    logHandler: (level, ...args) => logs.push([level, ...args]),
  });
}

describe('handleGitHubOAuthProxy', () => {
  it.each([
    'login/device/code',
    'login/oauth/access_token',
  ])('proxies the allowed path %s', async (path) => {
    const requestBody = '{"client_id":"client-id"}';
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const dependencies: GitHubOAuthProxyDependencies = {
      fetch: async (input, init) => {
        capturedUrl = input.toString();
        capturedInit = init;
        return new Response('{"status":"ok"}', { status: 201 });
      },
    };

    const response = await handleGitHubOAuthProxy(
      createRequest(path, requestBody),
      createContext(),
      dependencies,
    );

    expect(capturedUrl).toBe(`https://github.com/${path}`);
    expect(capturedInit).toMatchObject({
      method: 'POST',
      body: requestBody,
    });
    expect(response).toMatchObject({
      status: 201,
      body: '{"status":"ok"}',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  });

  it('rejects paths outside the OAuth allowlist', async () => {
    let fetchCalled = false;

    const response = await handleGitHubOAuthProxy(
      createRequest('api/v3/user'),
      createContext(),
      {
        fetch: async () => {
          fetchCalled = true;
          throw new Error('fetch should not be called');
        },
      },
    );

    expect(fetchCalled).toBe(false);
    expect(response).toMatchObject({
      status: 404,
      jsonBody: { error: 'Not found' },
    });
  });

  it('returns a secret-safe error when GitHub is unavailable', async () => {
    const secret = 'sensitive-device-code';
    const logs: unknown[][] = [];

    const response = await handleGitHubOAuthProxy(
      createRequest('login/oauth/access_token', `{"device_code":"${secret}"}`),
      createContext(logs),
      {
        fetch: async () => {
          throw new Error('GitHub is unavailable');
        },
      },
    );

    expect(response).toMatchObject({
      status: 502,
      jsonBody: { error: 'Proxy request to GitHub failed' },
    });
    expect(JSON.stringify(response)).not.toContain(secret);
    expect(JSON.stringify(logs)).not.toContain(secret);
  });
});
