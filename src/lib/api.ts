const DEFAULT_API_BASE = '/api';

export function buildApiUrl(
  route: string,
  configuredBase: string | undefined = import.meta.env.VITE_API_BASE,
): string {
  const apiBase = (configuredBase?.trim() || DEFAULT_API_BASE)
    .replace(/\/+$/, '');
  const normalizedRoute = route.replace(/^\/+/, '');

  return `${apiBase}/${normalizedRoute}`;
}
