import type {
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import type { FetchFunction } from './http';

export interface GitHubOAuthProxyDependencies {
  fetch: FetchFunction;
}

type GitHubOAuthRequest = Pick<HttpRequest, 'params' | 'text'>;
type GitHubOAuthContext = Pick<InvocationContext, 'error'>;

const ALLOWED_PATHS = new Set([
  'login/device/code',
  'login/oauth/access_token',
]);

const defaultDependencies: GitHubOAuthProxyDependencies = {
  fetch: (input, init) => globalThis.fetch(input, init),
};

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

export async function handleGitHubOAuthProxy(
  request: GitHubOAuthRequest,
  context: GitHubOAuthContext,
  dependencies: GitHubOAuthProxyDependencies = defaultDependencies,
): Promise<HttpResponseInit> {
  const path = request.params.path;

  if (!ALLOWED_PATHS.has(path)) {
    return {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: { error: 'Not found' },
    };
  }

  let requestBody: string;
  try {
    requestBody = await request.text();
  } catch (error) {
    context.error(
      'Unable to read GitHub OAuth proxy request body',
      errorName(error),
    );
    return {
      status: 400,
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: { error: 'Invalid request body' },
    };
  }

  let upstream: Response;
  try {
    upstream = await dependencies.fetch(`https://github.com/${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: requestBody,
    });
  } catch (error) {
    context.error('GitHub OAuth proxy request failed', errorName(error));
    return {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: { error: 'Proxy request to GitHub failed' },
    };
  }

  let responseBody: string;
  try {
    responseBody = await upstream.text();
  } catch (error) {
    context.error(
      'Unable to read GitHub OAuth proxy response',
      errorName(error),
    );
    return {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: { error: 'Proxy response from GitHub was invalid' },
    };
  }

  return {
    status: upstream.status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: responseBody,
  };
}
