import {
  expect,
  test,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_OVERVIEW_NODE_LIMIT,
  LARGE_GRAPH_INTERACTION_BUDGET_MS,
  LARGE_GRAPH_LONG_TASK_BUDGET_MS,
  LARGE_GRAPH_RETAINED_HEAP_BUDGET_BYTES,
} from '../../src/lib/graphView';
import type { OntologyGraphMetrics } from '../../src/components/OntologyGraph';

const BRICK_ROUTE = '/#/catalogue/external/brick-schema/brick';
const BRICK_NODE_COUNT = 1_518;
const BRICK_EDGE_COUNT = 1_736;

interface PerformanceWindow extends Window {
  __ONTOLOGY_GRAPH_METRICS__?: OntologyGraphMetrics;
  __ONTOLOGY_GRAPH_PERFORMANCE_ENABLED__?: boolean;
  __ONTOLOGY_GRAPH_LAYOUT_ANIMATION_MS__?: number;
  __ONTOLOGY_GRAPH_PAGE_MAX_LONG_TASK_MS__?: number;
  __ONTOLOGY_GRAPH_LONG_TASK_OBSERVER__?: PerformanceObserver;
}

interface PerformanceMemory {
  usedJSHeapSize?: number;
}

interface PerformanceReport {
  flow: 'direct' | 'gallery' | 'cancel-resume';
  metrics: OntologyGraphMetrics;
  retainedHeapBytes: number | null;
  pageMaxLongTaskDurationMs: number;
  interactionMs?: number;
  indexRequestCount: number;
  payloadRequestCount: number;
}

async function preparePage(
  page: Page,
  layoutAnimationMs?: number,
): Promise<void> {
  await page.addInitScript((animationDuration) => {
    localStorage.setItem('ontology-quest-tour-dismissed', 'true');
    const target = window as PerformanceWindow;
    target.__ONTOLOGY_GRAPH_PERFORMANCE_ENABLED__ = true;
    target.__ONTOLOGY_GRAPH_PAGE_MAX_LONG_TASK_MS__ = 0;
    if (
      typeof PerformanceObserver !== 'undefined'
      && PerformanceObserver.supportedEntryTypes?.includes('longtask')
    ) {
      target.__ONTOLOGY_GRAPH_LONG_TASK_OBSERVER__ = new PerformanceObserver(
        (list) => {
          for (const entry of list.getEntries()) {
            const maxDuration = Math.max(
              target.__ONTOLOGY_GRAPH_PAGE_MAX_LONG_TASK_MS__ ?? 0,
              entry.duration,
            );
            target.__ONTOLOGY_GRAPH_PAGE_MAX_LONG_TASK_MS__ = maxDuration;
            if (target.__ONTOLOGY_GRAPH_METRICS__) {
              target.__ONTOLOGY_GRAPH_METRICS__.maxLongTaskDurationMs =
                Math.max(
                  target.__ONTOLOGY_GRAPH_METRICS__
                    .maxLongTaskDurationMs,
                  maxDuration,
                );
            }
          }
        },
      );
      target.__ONTOLOGY_GRAPH_LONG_TASK_OBSERVER__.observe({
        type: 'longtask',
        buffered: true,
      });
    }
    if (animationDuration !== undefined) {
      target.__ONTOLOGY_GRAPH_LAYOUT_ANIMATION_MS__ = animationDuration;
    }
  }, layoutAnimationMs);
}

async function waitForBrickLayout(page: Page): Promise<void> {
  await page.waitForFunction((nodeCount) => {
    const metrics = (window as PerformanceWindow)
      .__ONTOLOGY_GRAPH_METRICS__;
    return metrics?.totalNodeCount === nodeCount
      && metrics.status === 'idle';
  }, BRICK_NODE_COUNT);
  await page.waitForTimeout(600);
}

async function readMetrics(page: Page): Promise<OntologyGraphMetrics> {
  const metrics = await page.evaluate(() => (
    (window as PerformanceWindow).__ONTOLOGY_GRAPH_METRICS__
  ));
  if (!metrics) throw new Error('Graph performance metrics were not recorded');
  return metrics;
}

async function readRetainedHeap(page: Page): Promise<number | null> {
  const session = await page.context().newCDPSession(page);
  await session.send('HeapProfiler.collectGarbage');
  return page.evaluate(() => (
    (performance as Performance & { memory?: PerformanceMemory })
      .memory?.usedJSHeapSize ?? null
  ));
}

async function readPageMaxLongTaskDuration(page: Page): Promise<number> {
  return page.evaluate(() => (
    (window as PerformanceWindow)
      .__ONTOLOGY_GRAPH_PAGE_MAX_LONG_TASK_MS__ ?? 0
  ));
}

function catalogueRequestCounts(requestUrls: readonly string[]): {
  indexRequestCount: number;
  payloadRequestCount: number;
} {
  return {
    indexRequestCount: requestUrls.filter(
      (url) => new URL(url).pathname.endsWith('/catalogue.json'),
    ).length,
    payloadRequestCount: requestUrls.filter(
      (url) => new URL(url).pathname.includes(
        '/catalogue-payloads/external/brick-schema/brick/',
      ),
    ).length,
  };
}

async function attachReport(
  testInfo: TestInfo,
  report: PerformanceReport,
): Promise<void> {
  const reportBody = `${JSON.stringify(report, null, 2)}\n`;
  const reportDirectory = path.resolve(
    process.cwd(),
    'test-results/large-graph/reports',
  );
  await mkdir(reportDirectory, { recursive: true });
  const reportPath = path.join(
    reportDirectory,
    `${report.flow}-large-graph-performance.json`,
  );
  await writeFile(reportPath, reportBody, 'utf8');
  console.log(`Large graph performance: ${JSON.stringify(report)}`);
  await testInfo.attach(`${report.flow}-large-graph-performance.json`, {
    path: reportPath,
    contentType: 'application/json',
  });
}

function expectInitialBudgets(
  metrics: OntologyGraphMetrics,
  retainedHeapBytes: number | null,
  pageMaxLongTaskDurationMs: number,
): void {
  expect(metrics).toMatchObject({
    mode: 'bounded',
    totalNodeCount: BRICK_NODE_COUNT,
    totalEdgeCount: BRICK_EDGE_COUNT,
    layoutCount: 1,
    status: 'idle',
  });
  expect(metrics.renderedNodeCount).toBeLessThanOrEqual(
    DEFAULT_OVERVIEW_NODE_LIMIT,
  );
  expect(metrics.maxLongTaskDurationMs).toBeLessThan(
    LARGE_GRAPH_LONG_TASK_BUDGET_MS,
  );
  expect(pageMaxLongTaskDurationMs).toBeLessThan(
    LARGE_GRAPH_LONG_TASK_BUDGET_MS,
  );
  expect(retainedHeapBytes).not.toBeNull();
  expect(retainedHeapBytes).toBeLessThan(
    LARGE_GRAPH_RETAINED_HEAP_BUDGET_BYTES,
  );
}

test('direct Brick link stays within the rendering budgets', async ({
  page,
}, testInfo) => {
  await preparePage(page);
  const requestUrls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('catalogue')) {
      requestUrls.push(request.url());
    }
  });

  await page.goto(BRICK_ROUTE, { waitUntil: 'networkidle' });
  await waitForBrickLayout(page);

  const initialMetrics = await readMetrics(page);
  const retainedHeapBytes = await readRetainedHeap(page);
  const pageMaxLongTaskDurationMs = await readPageMaxLongTaskDuration(page);
  const counts = catalogueRequestCounts(requestUrls);

  await page.getByRole(
    'searchbox',
    { name: 'Jump to an entity' },
  ).fill('Zone');
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await page.waitForFunction(() => {
    const metrics = (window as PerformanceWindow)
      .__ONTOLOGY_GRAPH_METRICS__;
    return metrics?.layoutCount === 2
      && metrics.status === 'idle'
      && document.querySelector('.large-graph-result')
        ?.textContent?.includes('matching');
  });
  const interactionMetrics = await readMetrics(page);
  const interactionMs = interactionMetrics.lastInteractionDurationMs;
  if (interactionMs === null) {
    throw new Error('Semantic-view interaction timing was not recorded');
  }

  await attachReport(testInfo, {
    flow: 'direct',
    metrics: initialMetrics,
    retainedHeapBytes,
    pageMaxLongTaskDurationMs,
    interactionMs,
    ...counts,
  });
  expectInitialBudgets(
    initialMetrics,
    retainedHeapBytes,
    pageMaxLongTaskDurationMs,
  );
  expect(counts).toEqual({
    indexRequestCount: 1,
    payloadRequestCount: 1,
  });
  expect(interactionMs).toBeLessThan(
    LARGE_GRAPH_INTERACTION_BUDGET_MS,
  );
});

test('Gallery Load lays out Brick once', async ({ page }, testInfo) => {
  await preparePage(page);
  const requestUrls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('catalogue')) {
      requestUrls.push(request.url());
    }
  });

  await page.goto('/#/catalogue', { waitUntil: 'networkidle' });
  await page.getByPlaceholder(/Search by name/).fill('Brick');
  await page
    .locator('[data-catalogue-id="external/brick-schema/brick"]')
    .getByRole('button', { name: 'Load', exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`${BRICK_ROUTE}$`));
  await waitForBrickLayout(page);

  const metrics = await readMetrics(page);
  const retainedHeapBytes = await readRetainedHeap(page);
  const pageMaxLongTaskDurationMs = await readPageMaxLongTaskDuration(page);
  const counts = catalogueRequestCounts(requestUrls);

  await attachReport(testInfo, {
    flow: 'gallery',
    metrics,
    retainedHeapBytes,
    pageMaxLongTaskDurationMs,
    ...counts,
  });
  expectInitialBudgets(
    metrics,
    retainedHeapBytes,
    pageMaxLongTaskDurationMs,
  );
  expect(counts).toEqual({
    indexRequestCount: 1,
    payloadRequestCount: 1,
  });
});

test('active Brick rendering can change view and cancel', async ({
  page,
}, testInfo) => {
  await preparePage(page, 500);
  const requestUrls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('catalogue')) {
      requestUrls.push(request.url());
    }
  });

  await page.goto(BRICK_ROUTE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (
    (window as PerformanceWindow).__ONTOLOGY_GRAPH_METRICS__?.status
      === 'running'
  ));
  await page.getByRole(
    'searchbox',
    { name: 'Jump to an entity' },
  ).fill('Zone');
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await expect(page.locator('.large-graph-result')).toContainText('matching');
  await page.waitForFunction(() => (
    (window as PerformanceWindow).__ONTOLOGY_GRAPH_METRICS__?.status
      === 'running'
  ));
  await page.getByRole('button', { name: 'Cancel rendering' }).click();
  await expect(page.getByText('Rendering paused')).toBeVisible();
  await page.waitForTimeout(600);

  const cancelledMetrics = await readMetrics(page);
  expect(cancelledMetrics).toMatchObject({
    totalNodeCount: BRICK_NODE_COUNT,
    layoutCount: 0,
    status: 'cancelled',
  });

  await page.getByRole('button', { name: 'Resume rendering' }).click();
  await waitForBrickLayout(page);
  const metrics = await readMetrics(page);
  const retainedHeapBytes = await readRetainedHeap(page);
  const pageMaxLongTaskDurationMs = await readPageMaxLongTaskDuration(page);
  await attachReport(testInfo, {
    flow: 'cancel-resume',
    metrics,
    retainedHeapBytes,
    pageMaxLongTaskDurationMs,
    ...catalogueRequestCounts(requestUrls),
  });
  expect(metrics).toMatchObject({
    renderedNodeCount: 20,
    layoutCount: 1,
    status: 'idle',
  });
  expect(metrics.maxLongTaskDurationMs).toBeLessThan(
    LARGE_GRAPH_LONG_TASK_BUDGET_MS,
  );
  expect(pageMaxLongTaskDurationMs).toBeLessThan(
    LARGE_GRAPH_LONG_TASK_BUDGET_MS,
  );
});
