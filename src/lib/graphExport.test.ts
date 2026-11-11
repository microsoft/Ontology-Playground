import { describe, expect, it } from 'vitest';
import {
  BASE_EXPORT_SCALE,
  computePngExportBounds,
  createPngExportOptions,
  isValidPngBlob,
  MAX_EXPORT_DIMENSION,
  MAX_EXPORT_PIXEL_AREA,
  MIN_PNG_BYTES,
} from './graphExport';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function pngBlob(
  size = MIN_PNG_BYTES,
  type = 'image/png',
  signature = PNG_SIGNATURE,
): Blob {
  const bytes = new Uint8Array(size);
  bytes.set(signature.slice(0, bytes.length));
  return new Blob([bytes], { type });
}

describe('computePngExportBounds', () => {
  it('keeps the desired scale for small graphs', () => {
    expect(computePngExportBounds(800, 600)).toEqual({
      maxWidth: 800 * BASE_EXPORT_SCALE,
      maxHeight: 600 * BASE_EXPORT_SCALE,
    });
  });

  it('keeps the desired scale at the side-length boundary', () => {
    expect(
      computePngExportBounds(MAX_EXPORT_DIMENSION / 2, 1_000),
    ).toEqual({
      maxWidth: MAX_EXPORT_DIMENSION,
      maxHeight: 2_000,
    });
  });

  it('caps an oversized width', () => {
    const bounds = computePngExportBounds(MAX_EXPORT_DIMENSION * 2, 100);
    expect(bounds).toEqual({
      maxWidth: MAX_EXPORT_DIMENSION,
      maxHeight: 50,
    });
  });

  it('caps an oversized height', () => {
    const bounds = computePngExportBounds(100, MAX_EXPORT_DIMENSION * 4);
    expect(bounds).toEqual({
      maxWidth: 25,
      maxHeight: MAX_EXPORT_DIMENSION,
    });
  });

  it('caps total pixel area even when both sides are below the limit', () => {
    const bounds = computePngExportBounds(5_000, 5_000);
    expect(bounds).toEqual({ maxWidth: 4_096, maxHeight: 4_096 });
    expect(bounds.maxWidth * bounds.maxHeight)
      .toBeLessThanOrEqual(MAX_EXPORT_PIXEL_AREA);
  });

  it('rounds fractional graph bounds before calculating limits', () => {
    expect(computePngExportBounds(100.1, 50.1)).toEqual({
      maxWidth: 202,
      maxHeight: 102,
    });
  });

  it('rejects degenerate graph bounds and limits', () => {
    expect(() => computePngExportBounds(0, 100)).toThrow(RangeError);
    expect(() => computePngExportBounds(-1, 100)).toThrow(RangeError);
    expect(() => computePngExportBounds(Number.NaN, 100)).toThrow(RangeError);
    expect(() => computePngExportBounds(100, Number.POSITIVE_INFINITY))
      .toThrow(RangeError);
    expect(() => computePngExportBounds(100, 100, 0)).toThrow(RangeError);
  });
});

describe('createPngExportOptions', () => {
  it('uses explicit max dimensions so device pixel ratio cannot expand the canvas', () => {
    const options = createPngExportOptions(800, 600, '#ffffff');

    expect(options).toEqual({
      maxWidth: 1_600,
      maxHeight: 1_200,
      full: true,
      bg: '#ffffff',
      output: 'blob-promise',
    });
    expect(options).not.toHaveProperty('scale');
  });
});

describe('isValidPngBlob', () => {
  it('accepts a non-empty PNG with the expected signature', async () => {
    await expect(isValidPngBlob(pngBlob())).resolves.toBe(true);
  });

  it('rejects an empty PNG blob', async () => {
    await expect(
      isValidPngBlob(new Blob([], { type: 'image/png' })),
    ).resolves.toBe(false);
  });

  it('rejects a metadata-only payload', async () => {
    await expect(isValidPngBlob(pngBlob(32))).resolves.toBe(false);
  });

  it('rejects a payload with the wrong MIME type', async () => {
    await expect(isValidPngBlob(pngBlob(MIN_PNG_BYTES, 'image/jpeg')))
      .resolves.toBe(false);
  });

  it('rejects a payload without the PNG signature', async () => {
    await expect(
      isValidPngBlob(pngBlob(MIN_PNG_BYTES, 'image/png', [0, 1, 2, 3])),
    ).resolves.toBe(false);
  });

  it('rejects non-blob values', async () => {
    await expect(isValidPngBlob('data:,')).resolves.toBe(false);
    await expect(isValidPngBlob(null)).resolves.toBe(false);
  });
});
