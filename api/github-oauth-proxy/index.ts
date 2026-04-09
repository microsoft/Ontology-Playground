import { AzureFunction, Context, HttpRequest } from '@azure/functions';

/**
 * CORS proxy for GitHub's OAuth device-flow endpoints.
 *
 * GitHub's /login/device/code and /login/oauth/access_token endpoints
 * don't send Access-Control-Allow-Origin headers, so browsers block
 * direct cross-origin requests. This function proxies only those two
 * specific paths and nothing else.
 *
 * Route: POST /api/github-oauth/{path}
 *   - /api/github-oauth/login/device/code        → github.com/login/device/code
 *   - /api/github-oauth/login/oauth/access_token  → github.com/login/oauth/access_token
 */

const ALLOWED_PATHS = new Set([
  'login/device/code',
  'login/oauth/access_token',
]);

const httpTrigger: AzureFunction = async function (
  context: Context,
  req: HttpRequest,
): Promise<void> {
  const path = context.bindingData.path as string;

  if (!ALLOWED_PATHS.has(path)) {
    context.res = { status: 404, body: 'Not found' };
    return;
  }

  try {
    const upstream = await fetch(`https://github.com/${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: req.rawBody,
    });

    const body = await upstream.text();

    context.res = {
      status: upstream.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      body,
    };
  } catch {
    context.res = {
      status: 502,
      body: JSON.stringify({ error: 'Proxy request to GitHub failed' }),
      headers: { 'Content-Type': 'application/json' },
    };
  }
};

export default httpTrigger;
