import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { OntologyPreviewManifest } from './list-changed-catalogue-entries.js';

interface RenderedPreview {
  id: string;
  file: string;
  bytes: number;
}

interface RenderedManifest extends OntologyPreviewManifest {
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = readManifest(options.manifest);
  mkdirSync(options.outputDir, { recursive: true });

  if (manifest.entries.length === 0) {
    const renderedManifest: RenderedManifest = { ...manifest, renderedAt: new Date().toISOString(), previews: [] };
    writeFileSync(join(options.outputDir, 'manifest.json'), JSON.stringify(renderedManifest, null, 2) + '\n', 'utf-8');
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
      await page.getByTestId('ontology-graph-canvas').locator('canvas').first().waitFor({ state: 'visible', timeout: 60_000 });
      await page.locator('.graph-legend .legend-item').first().waitFor({ state: 'visible', timeout: 60_000 });

      const file = `${entry.safeName}.png`;
      const outputPath = join(options.outputDir, file);
      const pngData = await page.evaluate(() => {
        const previewWindow = window as Window & {
          __ONTOLOGY_PREVIEW_CY__?: { png: (options: { scale: number; full: boolean; bg: string }) => string };
        };
        const cy = previewWindow.__ONTOLOGY_PREVIEW_CY__;
        return cy?.png({ scale: 2, full: true, bg: '#F5F5F5' }) ?? null;
      });
      if (pngData) {
        const base64 = pngData.replace(/^data:image\/png;base64,/, '');
        writeFileSync(outputPath, Buffer.from(base64, 'base64'));
      } else {
        await page.getByTestId('ontology-graph-canvas').screenshot({ path: outputPath });
      }

      const bytes = statSync(outputPath).size;
      if (bytes < 1024) {
        throw new Error(`Rendered PNG for ${entry.id} is unexpectedly small (${bytes} bytes)`);
      }
      previews.push({ id: entry.id, file, bytes });
    }
  } finally {
    await context.close();
    await browser.close();
  }

  const renderedManifest: RenderedManifest = { ...manifest, renderedAt: new Date().toISOString(), previews };
  writeFileSync(join(options.outputDir, 'manifest.json'), JSON.stringify(renderedManifest, null, 2) + '\n', 'utf-8');
  console.log(`Rendered ${previews.length} ontology preview${previews.length === 1 ? '' : 's'}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}