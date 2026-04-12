import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseHash, routeToHash, navigate, currentRoute, onRouteChange } from './router';

describe('parseHash', () => {
  it('returns home for empty hash', () => {
    expect(parseHash('')).toEqual({ page: 'home' });
  });

  it('returns home for "#/"', () => {
    expect(parseHash('#/')).toEqual({ page: 'home' });
  });

  it('returns home for "#"', () => {
    expect(parseHash('#')).toEqual({ page: 'home' });
  });

  it('returns home for unknown paths', () => {
    expect(parseHash('#/unknown/stuff')).toEqual({ page: 'home' });
  });

  it('parses catalogue route without id', () => {
    expect(parseHash('#/catalogue')).toEqual({ page: 'catalogue', ontologyId: undefined });
  });

  it('parses catalogue route with single-segment id', () => {
    expect(parseHash('#/catalogue/cosmic-coffee')).toEqual({
      page: 'catalogue',
      ontologyId: 'cosmic-coffee',
    });
  });

  it('parses catalogue route with path-based id (official)', () => {
    expect(parseHash('#/catalogue/official/cosmic-coffee')).toEqual({
      page: 'catalogue',
      ontologyId: 'official/cosmic-coffee',
    });
  });

  it('parses catalogue route with path-based id (community)', () => {
    expect(parseHash('#/catalogue/community/alice/my-ontology')).toEqual({
      page: 'catalogue',
      ontologyId: 'community/alice/my-ontology',
    });
  });

  it('parses embed route with path-based id', () => {
    expect(parseHash('#/embed/official/cosmic-coffee')).toEqual({
      page: 'embed',
      ontologyId: 'official/cosmic-coffee',
    });
  });

  it('returns home for embed route without id', () => {
    expect(parseHash('#/embed')).toEqual({ page: 'home' });
  });

  it('parses designer route without id (new ontology)', () => {
    expect(parseHash('#/designer')).toEqual({ page: 'designer', ontologyId: undefined });
  });

  it('parses designer route with path-based id', () => {
    expect(parseHash('#/designer/official/cosmic-coffee')).toEqual({
      page: 'designer',
      ontologyId: 'official/cosmic-coffee',
    });
  });

  it('rejects designer route with path traversal', () => {
    expect(parseHash('#/designer/../../etc/passwd')).toEqual({
      page: 'designer',
      ontologyId: undefined,
    });
  });
  it('parses learn route without slug', () => {
    expect(parseHash('#/learn')).toEqual({ page: 'learn', courseSlug: undefined, articleSlug: undefined });
  });

  it('parses learn route with course slug only', () => {
    expect(parseHash('#/learn/ontology-fundamentals')).toEqual({
      page: 'learn',
      courseSlug: 'ontology-fundamentals',
      articleSlug: undefined,
    });
  });

  it('parses learn route with course and article slug', () => {
    expect(parseHash('#/learn/ontology-fundamentals/what-is-an-ontology')).toEqual({
      page: 'learn',
      courseSlug: 'ontology-fundamentals',
      articleSlug: 'what-is-an-ontology',
    });
  });

  it('rejects learn route with path traversal in course', () => {
    expect(parseHash('#/learn/../../etc/passwd')).toEqual({
      page: 'learn',
      courseSlug: undefined,
      articleSlug: undefined,
    });
  });

  it('rejects learn route with path traversal in article', () => {
    expect(parseHash('#/learn/good-course/../../etc')).toEqual({
      page: 'learn',
      courseSlug: 'good-course',
      articleSlug: undefined,
    });
  });

  it('strips query params from learn route hash', () => {
    expect(parseHash('#/learn/my-course/my-article?slide=4')).toEqual({
      page: 'learn',
      courseSlug: 'my-course',
      articleSlug: 'my-article',
    });
  });

  it('parses share route with valid base64 data', () => {
    expect(parseHash('#/share/eJxLzs8FAAPcAbQ')).toEqual({
      page: 'share',
      data: 'eJxLzs8FAAPcAbQ',
    });
  });

  it('returns home for share route without data', () => {
    expect(parseHash('#/share')).toEqual({ page: 'home' });
  });

  it('returns home for share route with invalid characters', () => {
    expect(parseHash('#/share/<script>alert(1)</script>')).toEqual({ page: 'home' });
  });

  it('returns home for share route with extra segments', () => {
    expect(parseHash('#/share/abc/def')).toEqual({ page: 'home' });
  });
  it('handles leading slash variations', () => {
    expect(parseHash('#catalogue/test')).toEqual({ page: 'catalogue', ontologyId: 'test' });
  });
});

describe('parseHash – security', () => {
  it('rejects path traversal with ..', () => {
    expect(parseHash('#/catalogue/../../etc/passwd')).toEqual({
      page: 'catalogue',
      ontologyId: undefined,
    });
  });

  it('rejects encoded path traversal (%2e%2e)', () => {
    expect(parseHash('#/catalogue/%2e%2e/foo')).toEqual({
      page: 'catalogue',
      ontologyId: undefined,
    });
  });

  it('normalizes double slashes to valid path', () => {
    // split('/').filter(Boolean) removes empty segments before sanitization
    expect(parseHash('#/catalogue/official//coffee')).toEqual({
      page: 'catalogue',
      ontologyId: 'official/coffee',
    });
  });

  it('rejects uppercase characters', () => {
    expect(parseHash('#/catalogue/Official/Coffee')).toEqual({
      page: 'catalogue',
      ontologyId: undefined,
    });
  });

  it('rejects IDs starting with a hyphen', () => {
    expect(parseHash('#/catalogue/-bad')).toEqual({
      page: 'catalogue',
      ontologyId: undefined,
    });
  });

  it('rejects IDs ending with a hyphen', () => {
    expect(parseHash('#/catalogue/bad-')).toEqual({
      page: 'catalogue',
      ontologyId: undefined,
    });
  });

  it('rejects IDs with special characters', () => {
    expect(parseHash('#/catalogue/foo<script>bar')).toEqual({
      page: 'catalogue',
      ontologyId: undefined,
    });
  });

  it('rejects embed route with path traversal', () => {
    expect(parseHash('#/embed/../../etc/passwd')).toEqual({ page: 'home' });
  });

  it('rejects embed route with encoded chars', () => {
    expect(parseHash('#/embed/%2e%2e/foo')).toEqual({ page: 'home' });
  });

  it('accepts valid multi-segment IDs', () => {
    expect(parseHash('#/catalogue/community/alice/my-ontology')).toEqual({
      page: 'catalogue',
      ontologyId: 'community/alice/my-ontology',
    });
  });
});

describe('routeToHash', () => {
  it('converts home route', () => {
    expect(routeToHash({ page: 'home' })).toBe('#/');
  });

  it('converts catalogue route without id', () => {
    expect(routeToHash({ page: 'catalogue' })).toBe('#/catalogue');
  });

  it('converts catalogue route with path-based id', () => {
    expect(routeToHash({ page: 'catalogue', ontologyId: 'official/cosmic-coffee' })).toBe(
      '#/catalogue/official/cosmic-coffee',
    );
  });

  it('converts embed route with path-based id', () => {
    expect(routeToHash({ page: 'embed', ontologyId: 'official/cosmic-coffee' })).toBe(
      '#/embed/official/cosmic-coffee',
    );
  });

  it('converts designer route without id', () => {
    expect(routeToHash({ page: 'designer' })).toBe('#/designer');
  });

  it('converts designer route with id', () => {
    expect(routeToHash({ page: 'designer', ontologyId: 'official/cosmic-coffee' })).toBe(
      '#/designer/official/cosmic-coffee',
    );
  });

  it('converts learn route without slug', () => {
    expect(routeToHash({ page: 'learn' })).toBe('#/learn');
  });

  it('converts learn route with course slug', () => {
    expect(routeToHash({ page: 'learn', courseSlug: 'ontology-fundamentals' })).toBe(
      '#/learn/ontology-fundamentals',
    );
  });

  it('converts learn route with course and article slug', () => {
    expect(routeToHash({ page: 'learn', courseSlug: 'ontology-fundamentals', articleSlug: 'what-is-an-ontology' })).toBe(
      '#/learn/ontology-fundamentals/what-is-an-ontology',
    );
  });

  it('converts share route', () => {
    expect(routeToHash({ page: 'share', data: 'eJxLzs8FAAPcAbQ' })).toBe(
      '#/share/eJxLzs8FAAPcAbQ',
    );
  });
});

describe('roundtrip', () => {
  const routes = [
    { page: 'home' as const },
    { page: 'catalogue' as const },
    { page: 'catalogue' as const, ontologyId: 'official/healthcare' },
    { page: 'catalogue' as const, ontologyId: 'community/alice/finance-ledger' },
    { page: 'embed' as const, ontologyId: 'official/finance' },
    { page: 'designer' as const },
    { page: 'designer' as const, ontologyId: 'official/cosmic-coffee' },
    { page: 'learn' as const },
    { page: 'learn' as const, courseSlug: 'ontology-fundamentals' },
    { page: 'learn' as const, courseSlug: 'ontology-fundamentals', articleSlug: 'what-is-an-ontology' },
    { page: 'share' as const, data: 'eJxLzs8FAAPcAbQ' },
  ];

  for (const route of routes) {
    it(`roundtrips ${JSON.stringify(route)}`, () => {
      expect(parseHash(routeToHash(route))).toEqual(route);
    });
  }
});

describe('navigate + currentRoute', () => {
  let originalHash: string;

  beforeEach(() => {
    originalHash = window.location.hash;
  });

  afterEach(() => {
    window.location.hash = originalHash;
  });

  it('sets the hash via navigate()', () => {
    navigate({ page: 'catalogue', ontologyId: 'official/test' });
    expect(window.location.hash).toBe('#/catalogue/official/test');
    expect(currentRoute()).toEqual({ page: 'catalogue', ontologyId: 'official/test' });
  });
});

describe('onRouteChange', () => {
  let originalHash: string;

  beforeEach(() => {
    originalHash = window.location.hash;
  });

  afterEach(() => {
    window.location.hash = originalHash;
  });

  it('calls listener on hashchange', async () => {
    const listener = vi.fn();
    const unsub = onRouteChange(listener);

    window.location.hash = '#/catalogue';
    // hashchange fires asynchronously
    await new Promise((r) => setTimeout(r, 50));

    expect(listener).toHaveBeenCalledWith({ page: 'catalogue', ontologyId: undefined });

    unsub();
  });

  it('stops calling listener after unsubscribe', async () => {
    const listener = vi.fn();
    const unsub = onRouteChange(listener);
    unsub();

    window.location.hash = '#/embed/test';
    await new Promise((r) => setTimeout(r, 50));

    expect(listener).not.toHaveBeenCalled();
  });
});
