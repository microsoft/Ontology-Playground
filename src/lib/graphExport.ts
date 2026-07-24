// Helpers for exporting the ontology graph as a PNG.
//
// Browsers enforce a maximum canvas size (dimension and total area). When a
// canvas exceeds it, `toDataURL()` silently returns the empty data URI
// ("data:,"), which is why exporting a large graph at a fixed scale produced
// a 0-byte PNG file (issue #87). We clamp the export scale so the rendered
// canvas stays within a conservative cross-browser limit.

/** Conservative per-side canvas limit that works across modern browsers. */
export const MAX_EXPORT_DIMENSION = 8192;

/** Default export scale for crisp images of small/medium graphs. */
export const BASE_EXPORT_SCALE = 2;

/**
 * Compute the largest safe export scale for a graph with the given model
 * bounding box, never exceeding `desiredScale`.
 */
export function computeExportScale(
  width: number,
  height: number,
  desiredScale: number = BASE_EXPORT_SCALE,
  maxDimension: number = MAX_EXPORT_DIMENSION
): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return desiredScale;
  }
  const largestSide = Math.max(width, height);
  return Math.min(desiredScale, maxDimension / largestSide);
}

/**
 * True when the value is a usable PNG data URI. Oversized canvases yield
 * "data:," instead of a PNG payload.
 */
export function isValidPngDataUri(dataUri: unknown): dataUri is string {
  return typeof dataUri === 'string' && dataUri.startsWith('data:image/png');
}
