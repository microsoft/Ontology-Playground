import { describe, it, expect } from 'vitest';
import {
  computeExportScale,
  isValidPngDataUri,
  MAX_EXPORT_DIMENSION,
  BASE_EXPORT_SCALE,
} from './graphExport';

describe('computeExportScale', () => {
  it('keeps the desired scale for small graphs', () => {
    expect(computeExportScale(800, 600)).toBe(BASE_EXPORT_SCALE);
  });

  it('keeps the desired scale when the scaled size exactly hits the limit', () => {
    const side = MAX_EXPORT_DIMENSION / BASE_EXPORT_SCALE;
    expect(computeExportScale(side, side)).toBe(BASE_EXPORT_SCALE);
  });

  it('clamps the scale so the largest side stays within the limit', () => {
    const width = MAX_EXPORT_DIMENSION; // at scale 2 this would be 2x the limit
    const scale = computeExportScale(width, 400);
    expect(scale).toBe(1);
    expect(width * scale).toBeLessThanOrEqual(MAX_EXPORT_DIMENSION);
  });

  it('clamps based on the larger of width/height', () => {
    const scale = computeExportScale(1000, MAX_EXPORT_DIMENSION * 4);
    expect(MAX_EXPORT_DIMENSION * 4 * scale).toBeLessThanOrEqual(MAX_EXPORT_DIMENSION);
  });

  it('falls back to the desired scale for degenerate bounding boxes', () => {
    expect(computeExportScale(0, 0)).toBe(BASE_EXPORT_SCALE);
    expect(computeExportScale(-5, 100)).toBe(BASE_EXPORT_SCALE);
    expect(computeExportScale(NaN, 100)).toBe(BASE_EXPORT_SCALE);
    expect(computeExportScale(Infinity, 100)).toBe(BASE_EXPORT_SCALE);
  });

  it('respects a custom desired scale and max dimension', () => {
    expect(computeExportScale(100, 100, 4, 1000)).toBe(4);
    expect(computeExportScale(1000, 1000, 4, 1000)).toBe(1);
  });
});

describe('isValidPngDataUri', () => {
  it('accepts a PNG data URI', () => {
    expect(isValidPngDataUri('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
  });

  it('rejects the empty data URI produced by oversized canvases', () => {
    expect(isValidPngDataUri('data:,')).toBe(false);
  });

  it('rejects non-string and empty values', () => {
    expect(isValidPngDataUri(undefined)).toBe(false);
    expect(isValidPngDataUri(null)).toBe(false);
    expect(isValidPngDataUri('')).toBe(false);
    expect(isValidPngDataUri('data:image/jpeg;base64,abc')).toBe(false);
  });
});
