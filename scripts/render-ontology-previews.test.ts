import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Page } from '@playwright/test';
import {
  decodePreviewPng,
  previewGraphReady,
  renderPreviewPng,
} from './render-ontology-previews';
import { MAX_EXPORT_DIMENSION, MAX_EXPORT_PIXEL_AREA } from '../src/lib/graphExport';

const catalogueId = 'official/preview-fixture';

describe('preview graph readiness', () => {
  let canvas: HTMLDivElement;
  const cy = {
    destroyed: vi.fn(() => false),
    container: vi.fn((): HTMLElement | null => canvas),
    nodes: vi.fn(() => ({ length: 2 })),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    canvas = document.createElement('div');
    canvas.dataset.testid = 'ontology-graph-canvas';
    canvas.dataset.catalogueId = catalogueId;
    canvas.dataset.layoutStatus = 'idle';
    document.body.append(canvas);
    cy.destroyed.mockReturnValue(false);
    cy.container.mockImplementation(() => canvas);
    cy.nodes.mockReturnValue({ length: 2 });
    Object.defineProperty(window, '__ONTOLOGY_PREVIEW_CY__', {
      configurable: true,
      value: cy,
      writable: true,
    });
  });

  afterEach(() => {
    canvas.remove();
    delete window.__ONTOLOGY_PREVIEW_CY__;
  });

  it('accepts a completed graph without any expanded legend or legend items', () => {
    expect(document.querySelector('.legend-item')).toBeNull();
    expect(previewGraphReady(catalogueId)).toBe(true);
  });

  it.each(['scheduled', 'running', 'cancelled', 'error'])(
    'does not export a %s graph',
    (status) => {
      canvas.dataset.layoutStatus = status;
      expect(previewGraphReady(catalogueId)).toBe(false);
    },
  );

  it('rejects an old graph while another catalogue entry is loading', () => {
    expect(previewGraphReady('official/another-fixture')).toBe(false);
  });

  it('requires the live instance to belong to the current canvas', () => {
    cy.container.mockReturnValue(document.createElement('div'));
    expect(previewGraphReady(catalogueId)).toBe(false);
    cy.container.mockReturnValue(canvas);
    cy.destroyed.mockReturnValue(true);
    expect(previewGraphReady(catalogueId)).toBe(false);
  });

  it('rejects empty graphs and missing instances or containers', () => {
    cy.nodes.mockReturnValue({ length: 0 });
    expect(previewGraphReady(catalogueId)).toBe(false);
    delete window.__ONTOLOGY_PREVIEW_CY__;
    expect(previewGraphReady(catalogueId)).toBe(false);
    canvas.remove();
    expect(previewGraphReady(catalogueId)).toBe(false);
  });
});

function pngData(width = 800, height = 600): string {
  const png = Buffer.alloc(1024);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.write('IHDR', 12, 'ascii');
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  return `data:image/png;base64,${png.toString('base64')}`;
}

describe('preview PNG output', () => {
  it('retains the PNG bytes and positive dimensions', () => {
    const png = decodePreviewPng(pngData());
    expect(png.length).toBe(1024);
    expect(png.readUInt32BE(16)).toBe(800);
    expect(png.readUInt32BE(20)).toBe(600);
  });

  it.each([null, '', 'data:image/jpeg;base64,AAAA', 'data:image/png;base64,AAAA'])(
    'rejects missing, non-PNG, or truncated image data (%s)',
    (data) => {
      expect(() => decodePreviewPng(data)).toThrow(/PNG/);
    },
  );

  it.each([[0, 600], [800, 0]])('rejects zero-sized images (%i by %i)', (width, height) => {
    expect(() => decodePreviewPng(pngData(width, height))).toThrow(/PNG/);
  });

  it('rejects a sufficiently large payload without a PNG signature', () => {
    const png = Buffer.alloc(2048);
    expect(() => decodePreviewPng(`data:image/png;base64,${png.toString('base64')}`))
      .toThrow(/PNG/);
  });

  it('waits for the requested completed graph and applies shared safe export bounds', async () => {
    const waitForFunction = vi.fn().mockResolvedValue(undefined);
    const waitFor = vi.fn().mockResolvedValue(undefined);
    const locator = vi.fn(() => ({ first: () => ({ waitFor }) }));
    const getByTestId = vi.fn(() => ({ locator }));
    const evaluate = vi.fn()
      .mockResolvedValueOnce({ width: 100_000, height: 100_000 })
      .mockResolvedValueOnce(pngData());
    const page = { waitForFunction, getByTestId, evaluate } as unknown as Page;

    const png = await renderPreviewPng(page, catalogueId);
    expect(png.length).toBe(1024);
    expect(waitForFunction).toHaveBeenCalledWith(previewGraphReady, catalogueId, {
      timeout: 60_000,
    });
    expect(getByTestId).toHaveBeenCalledWith('ontology-graph-canvas');
    expect(locator).toHaveBeenCalledWith('canvas');
    const bounds = evaluate.mock.calls[1][1] as { maxWidth: number; maxHeight: number };
    expect(bounds.maxWidth).toBeLessThanOrEqual(MAX_EXPORT_DIMENSION);
    expect(bounds.maxHeight).toBeLessThanOrEqual(MAX_EXPORT_DIMENSION);
    expect(bounds.maxWidth * bounds.maxHeight).toBeLessThanOrEqual(MAX_EXPORT_PIXEL_AREA);
  });
});
