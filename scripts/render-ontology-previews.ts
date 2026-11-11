import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Core } from 'cytoscape';
import { computePngExportBounds } from '../src/lib/graphExport.js';
import type { OntologyPreviewManifest } from './list-changed-catalogue-entries.js';

export interface RenderedPreview {
  id: string;
  file: string;
  bytes: number;
}

export interface RenderedManifest extends OntologyPreviewManifest {
  renderedAt: string;
  previews: RenderedPreview[];
}

interface CliOptions {
  manifest: string;
  baseUrl: string;
  outputDir: string;
}

function parseArgs(argv: string[]): CliOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value) {
      throw new Error(`Invalid argument near "${key ?? ''}"`);
    }
    values.set(key.slice(2), value);
  }

  return {
    manifest: values.get('manifest') ?? 'ontology-preview/manifest.json',
    baseUrl: values.get('base-url') ?? 'http://127.0.0.1:4173',
    outputDir: values.get('output-dir') ?? 'ontology-preview',
  };
}

function readManifest(filePath: string): OntologyPreviewManifest {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as OntologyPreviewManifest;
}

// This function is serialized into the browser by Playwright; keep it self-contained.
export function previewGraphReady(catalogueId: string): boolean {
  const canvas = document.querySelector<HTMLElement>(
    '[data-testid="ontology-graph-canvas"]',
  );
  const cy = (window as Window & { __ONTOLOGY_PREVIEW_CY__?: Core })
    .__ONTOLOGY_PREVIEW_CY__;
  return canvas?.dataset.catalogueId === catalogueId
    && canvas.dataset.layoutStatus === 'idle'
    && !!cy
    && !cy.destroyed()
    && cy.container() === canvas
    && cy.nodes().length > 0;
}

export function decodePreviewPng(data: string | null): Buffer {
  if (!data?.startsWith('data:image/png;base64,')) {
    throw new Error('Graph export did not return a PNG data URL.');
  }
  const png = Buffer.from(data.slice('data:image/png;base64,'.length), 'base64');
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (
    png.length < 1024
    || !png.subarray(0, 8).equals(signature)
    || png.toString('ascii', 12, 16) !== 'IHDR'
    || png.readUInt32BE(16) === 0
    || png.readUInt32BE(20) === 0
  ) {
    throw new Error('Graph export returned an invalid, empty, or unexpectedly small PNG.');
  }
  return png;
}

export async function renderPreviewPng(page: Page, catalogueId: string): Promise<Buffer> {
  await page.waitForFunction(previewGraphReady, catalogueId, { timeout: 60_000 });
  await page.getByTestId('ontology-graph-canvas').locator('canvas').first()
    .waitFor({ state: 'visible', timeout: 60_000 });
  const bounds = await page.evaluate(() => {
    const cy = (window as Window & { __ONTOLOGY_PREVIEW_CY__?: Core })
      .__ONTOLOGY_PREVIEW_CY__;
    if (!cy || cy.destroyed()) throw new Error('Preview graph is no longer available.');
    const { w, h } = cy.elements().boundingBox();
    return { width: w, height: h };
  });
  const exportBounds = computePngExportBounds(bounds.width, bounds.height);
  const pngData = await page.evaluate((limits) => {
    const cy = (window as Window & { __ONTOLOGY_PREVIEW_CY__?: Core })
      .__ONTOLOGY_PREVIEW_CY__;
    return cy?.png({ ...limits, full: true, bg: '#F5F5F5' }) ?? null;
  }, exportBounds);
  return decodePreviewPng(pngData);
}

async function gotoWithRetry(page: Page, url: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 5_000 });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(500);
    }
  }
  throw lastError;
}

export function writeRenderedManifest(
  outputDir: string,
  manifest: OntologyPreviewManifest,
  previews: RenderedPreview[],
): RenderedManifest {
  const renderedManifest: RenderedManifest = {
    ...manifest,
    renderedAt: new Date().toISOString(),
    previews,
  };
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    join(outputDir, 'manifest.json'),
    `${JSON.stringify(renderedManifest, null, 2)}\n`,
    'utf-8',
  );
  return renderedManifest;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = readManifest(options.manifest);
  mkdirSync(options.outputDir, { recursive: true });

  if (manifest.entries.length === 0) {
    writeRenderedManifest(options.outputDir, manifest, []);
    console.log('No changed catalogue entries to render.');
    return;
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => {
    window.localStorage.setItem('ontology-quest-tour-dismissed', 'true');
  });
  const page = await context.newPage();
  const previews: RenderedPreview[] = [];
  const baseUrl = options.baseUrl.replace(/\/$/, '');

  try {
    for (const entry of manifest.entries) {
      const url = `${baseUrl}/#/catalogue/${entry.id}`;
      console.log(`Rendering ${entry.id} from ${url}`);
      await gotoWithRetry(page, url);
      const file = `${entry.safeName}.png`;
      const outputPath = join(options.outputDir, file);
      const png = await renderPreviewPng(page, entry.id);
      writeFileSync(outputPath, png);
      previews.push({ id: entry.id, file, bytes: png.length });
    }
  } finally {
    await context.close();
    await browser.close();
  }

  writeRenderedManifest(options.outputDir, manifest, previews);
  console.log(`Rendered ${previews.length} ontology preview${previews.length === 1 ? '' : 's'}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}