/**
 * GitHub integration — device-flow OAuth + fork/branch/commit/PR via the REST API.
 *
 * Env vars (build-time):
 *   VITE_GITHUB_CLIENT_ID — OAuth app client ID (required to enable the feature)
 *
 * All API calls use the public GitHub API (api.github.com).
 *
 * The GitHub OAuth endpoints (github.com/login/device/code and
 * github.com/login/oauth/access_token) don't support CORS. In dev we proxy
 * them through Vite (/__github/…). In production we proxy through an Azure
 * Function at /api/github-oauth/….
 */

const GITHUB_API = 'https://api.github.com';

// In dev, Vite proxies /__github/* → github.com/*
// In prod, use VITE_GITHUB_OAUTH_BASE if set (e.g. Cloudflare Worker),
// otherwise fall back to Azure Function at /api/github-oauth.
const GITHUB_OAUTH_BASE = import.meta.env.DEV
  ? '/__github'
  : (import.meta.env.VITE_GITHUB_OAUTH_BASE || '/api/github-oauth');

// The upstream repo that the catalogue lives in.
// Change these if the repo moves.
const UPSTREAM_OWNER = 'microsoft';
const UPSTREAM_REPO = 'Ontology-Playground';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface GitHubUser {
  login: string;
  avatar_url: string;
  html_url: string;
}

export interface SubmitResult {
  prUrl: string;
  prNumber: number;
}

export interface CatalogueMetadata {
  name: string;
  description: string;
  icon: string;
  category: string;
  tags: string[];
  author: string;
}

// ─── Token storage ──────────────────────────────────────────────────────────

const TOKEN_KEY = 'github_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function storeToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // localStorage unavailable — token lives only in memory
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

// ─── Device Flow ────────────────────────────────────────────────────────────

/**
 * Start the GitHub device-flow OAuth.
 * Returns the device/user codes. The caller should display `user_code` and
 * direct the user to `verification_uri`, then call `pollForToken()`.
 */
export async function startDeviceFlow(clientId: string): Promise<DeviceCodeResponse> {
  const res = await fetch(`${GITHUB_OAUTH_BASE}/login/device/code`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ client_id: clientId, scope: 'public_repo' }),
  });
  if (!res.ok) throw new Error(`Device flow start failed (${res.status})`);
  return res.json();
}

/**
 * Poll until the user authorises (or the code expires).
 * Resolves with the access token, or rejects on expiry / error.
 */
export async function pollForToken(
  clientId: string,
  deviceCode: string,
  interval: number,
  expiresIn: number,
  signal?: AbortSignal,
): Promise<string> {
  const deadline = Date.now() + expiresIn * 1000;
  const wait = (ms: number) => new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });

  let pollInterval = interval * 1000; // GitHub sends seconds

  while (Date.now() < deadline) {
    await wait(pollInterval);
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const res = await fetch(`${GITHUB_OAUTH_BASE}/login/oauth/access_token`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    const data = await res.json();

    if (data.access_token) {
      storeToken(data.access_token);
      return data.access_token;
    }

    if (data.error === 'slow_down') {
      pollInterval += 5000;
      continue;
    }

    if (data.error === 'authorization_pending') {
      continue;
    }

    // Any other error (expired_token, access_denied, etc.)
    throw new Error(data.error_description || data.error || 'OAuth failed');
  }

  throw new Error('Device code expired');
}

// ─── GitHub API helpers ─────────────────────────────────────────────────────

async function ghFetch(path: string, token: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers || {}),
    },
  });
  return res;
}

export async function getUser(token: string): Promise<GitHubUser> {
  const res = await ghFetch('/user', token);
  if (!res.ok) throw new Error(`Failed to get user (${res.status})`);
  return res.json();
}

/**
 * Ensure the user has a fork of the upstream repo.
 * Returns the fork's full_name (e.g. "username/Ontology-Playground").
 */
async function ensureFork(token: string): Promise<{ owner: string; repo: string }> {
  // Check if fork already exists
  const username = (await getUser(token)).login;
  const check = await ghFetch(`/repos/${username}/${UPSTREAM_REPO}`, token);
  if (check.ok) {
    const data = await check.json();
    if (data.fork) {
      return { owner: username, repo: UPSTREAM_REPO };
    }
  }

  // Create fork
  const res = await ghFetch(`/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/forks`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ default_branch_only: true }),
  });
  if (!res.ok && res.status !== 202) {
    throw new Error(`Failed to fork repo (${res.status})`);
  }

  // Wait briefly for the fork to be ready
  await new Promise((r) => setTimeout(r, 3000));
  return { owner: username, repo: UPSTREAM_REPO };
}

/**
 * Get the SHA of the HEAD of a branch.
 */
async function getBranchSha(token: string, owner: string, repo: string, branch: string): Promise<string> {
  const res = await ghFetch(`/repos/${owner}/${repo}/git/ref/heads/${branch}`, token);
  if (!res.ok) throw new Error(`Branch '${branch}' not found (${res.status})`);
  const data = await res.json();
  return data.object.sha;
}

/**
 * Create a new branch in the fork.
 */
async function createBranch(token: string, owner: string, repo: string, branch: string, sha: string): Promise<void> {
  const res = await ghFetch(`/repos/${owner}/${repo}/git/refs`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
  });
  if (!res.ok && res.status !== 422) {
    // 422 = branch already exists, which is fine
    throw new Error(`Failed to create branch (${res.status})`);
  }
}

/**
 * Create or update a file in the repo.
 */
async function createOrUpdateFile(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  path: string,
  content: string,
  message: string,
): Promise<void> {
  // Check if file exists (to get its sha for update)
  const existing = await ghFetch(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, token);
  let sha: string | undefined;
  if (existing.ok) {
    const data = await existing.json();
    sha = data.sha;
  }

  const res = await ghFetch(`/repos/${owner}/${repo}/contents/${path}`, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: btoa(unescape(encodeURIComponent(content))),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Failed to create file ${path} (${res.status})`);
}

/**
 * Open a pull request from the fork branch to upstream main.
 */
async function openPullRequest(
  token: string,
  forkOwner: string,
  branch: string,
  title: string,
  body: string,
): Promise<{ html_url: string; number: number }> {
  const res = await ghFetch(`/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/pulls`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      body,
      head: `${forkOwner}:${branch}`,
      base: 'main',
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to create PR (${res.status})`);
  }
  const data = await res.json();
  return { html_url: data.html_url, number: data.number };
}

// ─── High-level submit flow ─────────────────────────────────────────────────

export async function submitToCatalogue(
  token: string,
  rdfContent: string,
  metadata: CatalogueMetadata,
  slug: string,
): Promise<SubmitResult> {
  const user = await getUser(token);
  const username = user.login;

  // 1. Ensure fork
  const fork = await ensureFork(token);

  // 2. Get upstream main HEAD
  // Use the fork's default branch (should be synced with upstream)
  let baseSha: string;
  try {
    baseSha = await getBranchSha(token, fork.owner, fork.repo, 'main');
  } catch {
    // Fork may not be synced — try upstream directly
    baseSha = await getBranchSha(token, UPSTREAM_OWNER, UPSTREAM_REPO, 'main');
  }

  // 3. Create branch
  const branch = `catalogue/${username}/${slug}`;
  await createBranch(token, fork.owner, fork.repo, branch, baseSha);

  // 4. Commit RDF file
  const rdfPath = `catalogue/community/${username}/${slug}.rdf`;
  await createOrUpdateFile(
    token, fork.owner, fork.repo, branch, rdfPath,
    rdfContent,
    `feat: add ${metadata.name} ontology`,
  );

  // 5. Commit metadata.json
  const metadataPath = `catalogue/community/${username}/metadata.json`;
  await createOrUpdateFile(
    token, fork.owner, fork.repo, branch, metadataPath,
    JSON.stringify(metadata, null, 2) + '\n',
    `feat: add metadata for ${metadata.name}`,
  );

  // 6. Open PR
  const entityCount = rdfContent.split('owl:Class').length - 1;
  const relCount = rdfContent.split('owl:ObjectProperty').length - 1;

  const prBody = [
    `## New community ontology: ${metadata.name}`,
    '',
    metadata.description,
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Entity types | ${entityCount} |`,
    `| Relationships | ${relCount} |`,
    `| Category | ${metadata.category} |`,
    `| Tags | ${metadata.tags.join(', ')} |`,
    `| Author | @${username} |`,
    '',
    `---`,
    `*Submitted via the Ontology Playground designer*`,
  ].join('\n');

  const pr = await openPullRequest(
    token,
    fork.owner,
    branch,
    `[Community] Add ${metadata.name} ontology`,
    prBody,
  );

  return { prUrl: pr.html_url, prNumber: pr.number };
}
