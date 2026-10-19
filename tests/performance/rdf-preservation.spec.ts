import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const OWL = 'http://www.w3.org/2002/07/owl#';

function deploymentAssetPath(relativePath: string): string {
  const configuredBase = process.env.VITE_BASE_PATH
    || (
      process.env.GITHUB_ACTIONS === 'true'
      && process.env.GITHUB_REPOSITORY
        ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/`
        : '/'
    );
  const base = configuredBase.endsWith('/')
    ? configuredBase
    : `${configuredBase}/`;
  return `${base}${relativePath.replace(/^\/+/, '')}`;
}

function utf16LeBytes(value: string): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from(value, 'utf16le'),
  ]);
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

function embedPage(
  sourceUrl: string,
  scriptUrl = deploymentAssetPath('embed/ontology-embed.js'),
): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
  </head>
  <body>
    <div
      class="ontology-embed"
      data-ontology-url="${sourceUrl}"
      data-theme="dark"
      data-height="500px"
    ></div>
    <script src="${scriptUrl}"></script>
  </body>
</html>`;
}

test('native worker, textarea, and clipboard preserve RDF text semantics', async ({
  page,
}) => {
  const source = [
    '<?xml version="1.0" encoding="UTF-16"?>',
    `<rdf:RDF xmlns:rdf="${RDF}"`,
    `  xmlns:rdfs="${RDFS}"`,
    `  xmlns:owl="${OWL}"`,
    '  xmlns:ex="urn:test:">',
    '  <owl:Ontology rdf:about="urn:ontology">',
    '    <rdfs:label>Café 🧪 ontology</rdfs:label>',
    '  </owl:Ontology>',
    '  <owl:Class rdf:about="urn:room">',
    '    <rdfs:label>Room 🧪</rdfs:label>',
    '    <ex:ordinary>Before<!--keep--><![CDATA[ & middle ]]><?step data?>After</ex:ordinary>',
    '    <ex:xml rdf:parseType="Literal"><x xmlns="urn:content:"><!--keep--><?step data?>Café 🧪</x></ex:xml>',
    '  </owl:Class>',
    '</rdf:RDF>',
  ].join('\r\n');

  await page.addInitScript(() => {
    localStorage.setItem('ontology-quest-tour-dismissed', 'true');
  });
  await page.context().grantPermissions([
    'clipboard-read',
    'clipboard-write',
  ]);
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Import / Export' }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'utf16-browser.rdf',
    mimeType: 'application/rdf+xml',
    buffer: utf16LeBytes(source),
  });
  await expect(page.getByText('Ontology loaded successfully!')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Designer' }).click();
  await expect(page.getByText(/Complete RDF mode:/)).toBeVisible();
  await page.getByRole('button', { name: 'RDF', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copy RDF' })).toBeEnabled();
  await page.getByRole('button', { name: 'Copy RDF' }).click();
  const originalClipboard = await page.evaluate(() =>
    navigator.clipboard.readText());

  expect(normalizeNewlines(originalClipboard))
    .toBe(normalizeNewlines(source));
  expect(originalClipboard).toContain('Café 🧪 ontology');
  expect(originalClipboard).toContain('encoding="UTF-16"');

  await page.getByRole('button', { name: 'Edit RDF' }).click();
  const textarea = page.getByPlaceholder(
    'Paste or edit RDF/XML content here…',
  );
  expect(normalizeNewlines(await textarea.inputValue()))
    .toBe(normalizeNewlines(source));
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.locator('.designer-entity-header', {
    hasText: 'Room 🧪',
  }).click();
  await page.getByPlaceholder('Entity name').fill('Space');
  await expect(page.locator('pre.designer-rdf-source')).toContainText('Space');
  await expect(page.getByRole('button', { name: 'Copy RDF' })).toBeEnabled();
  await page.getByRole('button', { name: 'Copy RDF' }).click();
  const editedClipboard = await page.evaluate(() =>
    navigator.clipboard.readText());

  expect(editedClipboard).toContain('encoding="UTF-8"');
  expect(editedClipboard).toContain('Space');
  expect(editedClipboard).toContain('Café 🧪 ontology');
  expect(editedClipboard).toContain('Before &amp; middle After');
  expect(editedClipboard).toContain(
    '&lt;x xmlns="urn:content:"&gt;',
  );
});

test('native import rejects DOCTYPE before projection or network access', async ({
  page,
}) => {
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('example.invalid')) {
      externalRequests.push(request.url());
    }
  });
  await page.addInitScript(() => {
    localStorage.setItem('ontology-quest-tour-dismissed', 'true');
  });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Import / Export' }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'doctype.rdf',
    mimeType: 'application/rdf+xml',
    buffer: Buffer.from(`<?xml version="1.0"?>
<!DOCTYPE rdf:RDF [
  <!ENTITY external SYSTEM "https://example.invalid/entity">
]>
<rdf:RDF xmlns:rdf="${RDF}" xmlns:ex="urn:test:">
  <rdf:Description rdf:about="urn:subject">
    <ex:value>&external;</ex:value>
  </rdf:Description>
</rdf:RDF>`),
  });

  await expect(page.getByText(
    'RDF/XML documents with DOCTYPE declarations are not accepted.',
  )).toBeVisible();
  expect(externalRequests).toEqual([]);
});

test('deployed CSP permits the inline RDF worker', async ({ page }) => {
  const config = JSON.parse(await readFile(
    'public/staticwebapp.config.json',
    'utf8',
  )) as {
    globalHeaders: Record<string, string>;
  };
  const csp = config.globalHeaders['Content-Security-Policy'];
  expect(csp).toContain("worker-src 'self' blob:");
  const consoleErrors: string[] = [];
  const pageErrors: Error[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.route('**/*', async (route) => {
    if (new URL(route.request().url()).pathname !== '/') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        'content-security-policy': csp,
      },
    });
  });
  await page.addInitScript(() => {
    localStorage.setItem('ontology-quest-tour-dismissed', 'true');
  });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Import / Export' }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'csp-worker.rdf',
    mimeType: 'application/rdf+xml',
    buffer: Buffer.from(`<?xml version="1.0"?>
<rdf:RDF
  xmlns:rdf="${RDF}"
  xmlns:rdfs="${RDFS}"
  xmlns:owl="${OWL}">
  <owl:Ontology rdf:about="urn:csp-worker">
    <rdfs:label>CSP Worker Ontology</rdfs:label>
  </owl:Ontology>
  <owl:Class rdf:about="urn:csp-worker:Thing">
    <rdfs:label>Thing</rdfs:label>
  </owl:Class>
</rdf:RDF>`),
  });

  await expect(page.getByText('Ontology loaded successfully!')).toBeVisible();
  expect(consoleErrors.filter((message) =>
    /worker|content security policy/i.test(message))).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('native URL embed parses complete RDF in its inline worker', async ({
  page,
}) => {
  const source = `<?xml version="1.0"?>
<rdf:RDF
  xmlns:rdf="${RDF}"
  xmlns:rdfs="${RDFS}"
  xmlns:owl="${OWL}"
  xmlns:ex="urn:test:">
  <owl:Ontology rdf:about="urn:embed">
    <rdfs:label>URL Embed Ontology</rdfs:label>
  </owl:Ontology>
  <owl:Class rdf:about="urn:embed:Thing">
    <rdfs:label>Thing</rdfs:label>
    <ex:preserved>source-only value</ex:preserved>
  </owl:Class>
</rdf:RDF>`;
  const workerRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/embed/assets/rdf.worker-')) {
      workerRequests.push(request.url());
    }
  });
  await page.route('**/embed/url-test.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: embedPage('/fixtures/url-embed.rdf'),
    }));
  await page.route('**/fixtures/url-embed.rdf', (route) =>
    route.fulfill({
      contentType: 'application/rdf+xml',
      body: source,
    }));

  await page.goto('/embed/url-test.html');

  await expect(page.getByText('URL Embed Ontology')).toBeVisible();
  await page.getByRole('button', { name: 'Complete RDF source' }).click();
  await expect(page.locator('pre')).toContainText('source-only value');
  expect(workerRequests).toEqual([]);
});

test('cross-origin embed assets start the inline RDF worker', async ({
  page,
}) => {
  const source = `<?xml version="1.0"?>
<rdf:RDF
  xmlns:rdf="${RDF}"
  xmlns:rdfs="${RDFS}"
  xmlns:owl="${OWL}"
  xmlns:ex="urn:test:">
  <owl:Ontology rdf:about="urn:cross-origin-embed">
    <rdfs:label>Cross-origin Embed Ontology</rdfs:label>
  </owl:Ontology>
  <owl:Class rdf:about="urn:cross-origin-embed:Thing">
    <rdfs:label>Thing</rdfs:label>
    <ex:preserved>cross-origin source-only value</ex:preserved>
  </owl:Class>
</rdf:RDF>`;
  const pageErrors: Error[] = [];
  const embedBundle = await readFile(
    'build/embed/ontology-embed.js',
    'utf8',
  );
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.route('https://embed-consumer.test/widget.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: embedPage(
        'https://embed-assets.test/cross-origin-embed.rdf',
        'https://embed-assets.test/ontology-embed.js',
      ),
    }));
  await page.route(
    'https://embed-assets.test/ontology-embed.js',
    (route) => route.fulfill({
      contentType: 'application/javascript',
      body: embedBundle,
    }),
  );
  await page.route('https://embed-assets.test/cross-origin-embed.rdf', (route) =>
    route.fulfill({
      contentType: 'application/rdf+xml',
      headers: {
        'access-control-allow-origin': '*',
      },
      body: source,
    }));

  await page.goto('https://embed-consumer.test/widget.html');

  await expect(page.getByText('Cross-origin Embed Ontology')).toBeVisible();
  await page.getByRole('button', { name: 'Complete RDF source' }).click();
  await expect(page.locator('pre')).toContainText(
    'cross-origin source-only value',
  );
  expect(pageErrors).toEqual([]);
});

test('native embed renders the pinned large complete source', async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.route('**/embed/large-source.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: embedPage(
        deploymentAssetPath(
          'catalogue-sources/external/brick-schema/brick/'
        + '655939e9b655b7bb890e47c2015d046f41cb2dc6f314895490ebe6c14c5fc423.rdf',
        ),
      ),
    }));

  await page.goto('/embed/large-source.html');

  await page.getByRole('button', { name: 'Complete RDF source' }).click();
  await expect.poll(async () => page.locator('pre').evaluate(
    (element) => element.textContent?.length ?? 0,
  )).toBeGreaterThan(5_000_000);
  expect(pageErrors).toEqual([]);
});

test('native URL embed rejects DOCTYPE before worker or external access', async ({
  page,
}) => {
  const workerRequests: string[] = [];
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/embed/assets/rdf.worker-')) {
      workerRequests.push(request.url());
    }
    if (request.url().includes('example.invalid')) {
      externalRequests.push(request.url());
    }
  });
  await page.route('**/embed/url-doctype-test.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: embedPage('/fixtures/url-doctype.rdf'),
    }));
  await page.route('**/fixtures/url-doctype.rdf', (route) =>
    route.fulfill({
      contentType: 'application/rdf+xml',
      body: `<?xml version="1.0"?>
<!DOCTYPE rdf:RDF [
  <!ENTITY external SYSTEM "https://example.invalid/entity">
]>
<rdf:RDF xmlns:rdf="${RDF}" xmlns:ex="urn:test:">
  <rdf:Description rdf:about="urn:subject">
    <ex:value>&external;</ex:value>
  </rdf:Description>
</rdf:RDF>`,
    }));

  await page.goto('/embed/url-doctype-test.html');

  await expect(page.getByText(
    'RDF/XML documents with DOCTYPE declarations are not accepted.',
  )).toBeVisible();
  expect(workerRequests).toEqual([]);
  expect(externalRequests).toEqual([]);
});
