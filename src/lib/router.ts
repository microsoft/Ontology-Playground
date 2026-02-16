/**
 * Lightweight hash-based router for deep linking.
 *
 * Routes:
 *   /#/                                              → home (default ontology)
 *   /#/catalogue                                     → opens gallery modal
 *   /#/catalogue/<source>/<slug>                     → loads a specific ontology
 *   /#/catalogue/community/<user>/<slug>             → community ontology
 *   /#/embed/<source>/<slug>                         → full-page embed view
 *   /#/designer                                       → new blank ontology
 *   /#/designer/<source>/<slug>                       → edit existing ontology
 *   /#/learn                                          → learning content index
 *   /#/learn/<slug>                                   → specific article
 */

export type Route =
  | { page: 'home' }
  | { page: 'catalogue'; ontologyId?: string }
  | { page: 'embed'; ontologyId: string }
  | { page: 'designer'; ontologyId?: string }
  | { page: 'learn'; articleSlug?: string };

/**
 * Validate and sanitize an ontology ID parsed from the URL hash.
 * Returns undefined if the ID contains unsafe patterns.
 *
 * Allowed: lowercase alphanumeric, hyphens, underscores, forward slashes
 * (for path-based IDs like "official/cosmic-coffee").
 * Rejected: path traversal (..), encoded characters (%), empty segments,
 * leading/trailing slashes, or any other special characters.
 */
function sanitizeOntologyId(raw: string): string | undefined {
  // Reject path traversal
  if (raw.includes('..')) return undefined;
  // Reject encoded characters (prevent double-encoding tricks)
  if (raw.includes('%')) return undefined;
  // Reject empty segments (e.g. "official//coffee")
  if (raw.includes('//')) return undefined;
  // Strip leading/trailing slashes
  const trimmed = raw.replace(/^\/+|\/+$/g, '');
  if (trimmed.length === 0) return undefined;
  // Only allow safe characters: a-z, 0-9, hyphens, underscores, slashes
  if (!/^[a-z0-9][a-z0-9\-_/]*[a-z0-9]$/.test(trimmed) && !/^[a-z0-9]$/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

/** Parse a hash string (e.g. "#/catalogue/official/cosmic-coffee") into a Route. */
export function parseHash(hash: string): Route {
  // Strip leading "#" and optional leading "/"
  const path = hash.replace(/^#\/?/, '');
  const segments = path.split('/').filter(Boolean);

  if (segments[0] === 'catalogue') {
    // Everything after "catalogue/" is the ontologyId (may be multi-segment)
    const rest = segments.slice(1);
    if (rest.length === 0) return { page: 'catalogue' };
    const id = sanitizeOntologyId(rest.join('/'));
    return { page: 'catalogue', ontologyId: id };
  }
  if (segments[0] === 'embed' && segments.length > 1) {
    const id = sanitizeOntologyId(segments.slice(1).join('/'));
    if (!id) return { page: 'home' };
    return { page: 'embed', ontologyId: id };
  }
  if (segments[0] === 'designer') {
    const rest = segments.slice(1);
    if (rest.length === 0) return { page: 'designer' };
    const id = sanitizeOntologyId(rest.join('/'));
    return { page: 'designer', ontologyId: id };
  }
  if (segments[0] === 'learn') {
    const slug = segments[1];
    if (!slug) return { page: 'learn' };
    const sanitized = sanitizeOntologyId(slug);
    return { page: 'learn', articleSlug: sanitized };
  }
  return { page: 'home' };
}

/** Convert a Route back to a hash string. */
export function routeToHash(route: Route): string {
  switch (route.page) {
    case 'catalogue':
      return route.ontologyId
        ? `#/catalogue/${route.ontologyId}`
        : '#/catalogue';
    case 'embed':
      return `#/embed/${route.ontologyId}`;
    case 'designer':
      return route.ontologyId
        ? `#/designer/${route.ontologyId}`
        : '#/designer';
    case 'learn':
      return route.articleSlug
        ? `#/learn/${route.articleSlug}`
        : '#/learn';
    case 'home':
    default:
      return '#/';
  }
}

/** Navigate to a route by updating window.location.hash. */
export function navigate(route: Route): void {
  window.location.hash = routeToHash(route);
}

/** Get the current route from the window hash. */
export function currentRoute(): Route {
  return parseHash(window.location.hash);
}

type RouteListener = (route: Route) => void;

const listeners = new Set<RouteListener>();

function onHashChange() {
  const route = currentRoute();
  for (const fn of listeners) {
    fn(route);
  }
}

/** Subscribe to route changes. Returns an unsubscribe function. */
export function onRouteChange(fn: RouteListener): () => void {
  if (listeners.size === 0) {
    window.addEventListener('hashchange', onHashChange);
  }
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) {
      window.removeEventListener('hashchange', onHashChange);
    }
  };
}
