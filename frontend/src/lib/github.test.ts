import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getStoredToken,
  storeToken,
  clearToken,
  startDeviceFlow,
  pollForToken,
  getUser,
  submitToCatalogue,
} from './github';

// ─── Token storage ──────────────────────────────────────────────────────────

describe('token storage', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when no token stored', () => {
    expect(getStoredToken()).toBeNull();
  });

  it('stores and retrieves a token', () => {
    storeToken('ghp_abc123');
    expect(getStoredToken()).toBe('ghp_abc123');
  });

  it('clears the token', () => {
    storeToken('ghp_abc123');
    clearToken();
    expect(getStoredToken()).toBeNull();
  });
});

// ─── Device flow ────────────────────────────────────────────────────────────

describe('startDeviceFlow', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns device code response on success', async () => {
    const payload = {
      device_code: 'dc_123',
      user_code: 'ABCD-1234',
      verification_uri: 'https://github.com/login/device',
      expires_in: 900,
      interval: 5,
    };

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(payload),
    });

    const result = await startDeviceFlow('client-id-test');
    expect(result).toEqual(payload);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/login/device/code'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws on non-ok response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    await expect(startDeviceFlow('client-id-test')).rejects.toThrow('Device flow start failed (500)');
  });
});

// ─── pollForToken ───────────────────────────────────────────────────────────

describe('pollForToken', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    localStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns token when authorization succeeds', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      json: () => Promise.resolve({ access_token: 'ghp_real_token' }),
    });

    const token = await pollForToken('cid', 'dc', 0, 60);
    expect(token).toBe('ghp_real_token');
    expect(getStoredToken()).toBe('ghp_real_token');
  });

  it('retries on authorization_pending', async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ error: 'authorization_pending' }),
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ access_token: 'ghp_after_retry' }),
      });

    const token = await pollForToken('cid', 'dc', 0, 60);
    expect(token).toBe('ghp_after_retry');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('throws on access_denied', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      json: () => Promise.resolve({ error: 'access_denied', error_description: 'User denied' }),
    });

    await expect(pollForToken('cid', 'dc', 0, 60)).rejects.toThrow('User denied');
  });

  it('aborts when signal fires', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(pollForToken('cid', 'dc', 0, 60, controller.signal)).rejects.toThrow('Aborted');
  });
});

// ─── getUser ────────────────────────────────────────────────────────────────

describe('getUser', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.restoreAllMocks());

  it('returns user on success', async () => {
    const user = { login: 'alice', avatar_url: 'https://example.com/a.png', html_url: 'https://github.com/alice' };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(user),
    });

    const result = await getUser('ghp_test');
    expect(result.login).toBe('alice');
  });

  it('throws on 401', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(getUser('bad_token')).rejects.toThrow('Failed to get user (401)');
  });
});

// ─── submitToCatalogue ──────────────────────────────────────────────────────

describe('submitToCatalogue', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.restoreAllMocks());

  it('orchestrates the full fork → branch → commit → PR flow', async () => {
    const mockFetch = fetch as ReturnType<typeof vi.fn>;

    // Call sequence:
    // 1. getUser (inside submitToCatalogue)
    // 2. getUser (inside ensureFork)
    // 3. check if fork exists → 200 + fork:true
    // 4. getBranchSha(fork main)
    // 5. createBranch
    // 6. check existing RDF file → 404
    // 7. PUT RDF file
    // 8. check existing metadata file → 404
    // 9. PUT metadata file
    // 10. open PR

    const user = { login: 'alice', avatar_url: '', html_url: '' };

    mockFetch
      // 1. getUser (top-level)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(user) })
      // 2. getUser (in ensureFork)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(user) })
      // 3. check fork exists
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ fork: true }) })
      // 4. getBranchSha
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ object: { sha: 'abc123' } }) })
      // 5. createBranch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      // 6. check existing RDF file (404)
      .mockResolvedValueOnce({ ok: false, status: 404 })
      // 7. PUT RDF file
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      // 8. check existing metadata (404)
      .mockResolvedValueOnce({ ok: false, status: 404 })
      // 9. PUT metadata
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      // 10. open PR
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ html_url: 'https://github.com/test/pr/1', number: 1 }),
      });

    const result = await submitToCatalogue(
      'ghp_test',
      '<rdf:RDF>...</rdf:RDF>',
      {
        name: 'Test Ontology',
        description: 'A test',
        icon: '🧪',
        category: 'other',
        tags: ['test'],
        author: 'alice',
      },
      'test-ontology',
    );

    expect(result.prUrl).toBe('https://github.com/test/pr/1');
    expect(result.prNumber).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(10);
  });
});
