const SAFE_CATALOGUE_SEGMENT = /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/;

export function isValidCatalogueId(value: string | null | undefined): value is string {
  if (!value) return false;
  const [source, ...segments] = value.split('/');
  const expectedSegments = source === 'official'
    ? 1
    : source === 'community' || source === 'external'
      ? 2
      : -1;

  return segments.length === expectedSegments
    && segments.every((segment) => SAFE_CATALOGUE_SEGMENT.test(segment));
}
