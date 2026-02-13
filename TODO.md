# Ontology Playground — Feature Roadmap

> The goal: build the best community resource site for learning about ontologies
> and Microsoft Fabric IQ Ontologies. Fully static, deployable to Azure Static
> Web Apps or GitHub Pages.

---

## 1. RDF Import / Export (with full test coverage)

The current RDF export is inline in `ImportExportModal.tsx` and there is no RDF
**import**. RDF should become a first-class serialization format.

### 1.1 Extract RDF serialization module
- [x] Create `src/lib/rdf/serializer.ts` — move the existing `exportAsRDF()`
  logic out of `ImportExportModal.tsx` into a pure function
  `serializeToRDF(ontology, bindings) → string`
- [x] Create `src/lib/rdf/parser.ts` — implement `parseRDF(rdfXmlString) →
  { ontology, bindings }` using a lightweight XML parser (browser
  `DOMParser`; no heavy deps)
- [x] Support OWL classes → EntityTypes, DatatypeProperties → Properties,
  ObjectProperties → Relationships
- [x] Round-trip fidelity: `parse(serialize(ontology))` must produce an
  equivalent ontology

### 1.2 Wire RDF import into UI
- [x] In `ImportExportModal.tsx`, accept `.rdf` and `.owl` files in the file
  input
- [x] Detect format by extension and/or XML prologue, route to the RDF parser
- [x] Show validation errors inline if the RDF is malformed

### 1.3 Full test battery
- [x] Set up Vitest (`vitest`, `@testing-library/react`,
  `@testing-library/jest-dom`)
- [x] Unit tests for `serializer.ts`:
  - Empty ontology
  - Ontology with all property types (string, integer, decimal, date, etc.)
  - Ontology with relationship attributes
  - XML special character escaping (& < > " ')
  - Data bindings preservation in comments
- [x] Unit tests for `parser.ts`:
  - Valid RDF/OWL input → correct Ontology shape
  - Missing required fields → descriptive error
  - Namespace handling (custom prefixes, default namespace)
  - Malformed XML → graceful error
- [x] Round-trip tests: serialize → parse → deep-equal for every sample ontology
  in `sampleOntologies.ts` and `cosmicCoffeeOntology`
- [x] Integration test: import an RDF file via the modal, verify store state
- [x] Add `"test": "vitest run"` and `"test:watch": "vitest"` to
  `package.json` scripts

---

## 2. Fully static site (Azure Static Web Apps + GitHub Pages)

The app currently proxies `/api` to an Azure Functions backend. The site must
work as a pure static build with zero server-side dependencies. Azure SWA is
the **primary** deployment target; GitHub Pages support is for forks.

### 2.1 Remove runtime API dependency
- [x] The Azure OpenAI feature is already behind `VITE_ENABLE_AI_BUILDER` —
  confirm the build produces zero `/api` calls when the flag is off
- [x] Audit all `fetch()` calls; ensure none target a dynamic backend when
  running in static mode
- [x] Guard the Vite dev proxy (`server.proxy`) behind `VITE_ENABLE_AI_BUILDER`
  so it doesn't confuse static deployments

### 2.2 Azure Static Web Apps (primary)
The existing workflow
`.github/workflows/azure-static-web-apps-green-plant-0bb1d2910.yml` handles
build + deploy. Adapt it for the new build pipeline:
- [ ] Add `npm run catalogue:build` step before the SWA deploy action (once
  §3.2 is done)
- [x] Verify `staticwebapp.config.json` is correct for the static-only build
  (remove `api_location` if the API feature flag is off)
- [x] Ensure the `output_location: "build"` matches Vite's `outDir`
- [x] Keep the existing PR preview environment support (staging URLs on PRs)

### 2.3 GitHub Pages (for forks)
- [x] Add a **separate** GitHub Actions workflow
  `.github/workflows/deploy-ghpages.yml`:
  - Trigger on push to `main`
  - `npm ci && npm run catalogue:build && npm run build`
  - Deploy `build/` via `actions/deploy-pages`
  - Disabled by default (forks enable it by setting the Pages source)
- [x] Set `base` in `vite.config.ts` dynamically from an env var
  (`VITE_BASE_PATH`) so it works at `/` (Azure SWA) and
  `/<repo-name>/` (GitHub Pages)
- [x] Copy `index.html` → `build/404.html` for SPA fallback on GitHub Pages
- [x] Document both deployment paths in README

---

## 3. Ontology catalogue — official + community contributed

A curated + community-driven catalogue of ontologies, compiled at build time
into a static JSON file.

### 3.1 Catalogue file structure
- [ ] Create `catalogue/` directory at repo root
- [ ] Define a folder convention:
  ```
  catalogue/
    official/
      cosmic-coffee.rdf
      e-commerce.rdf
      ...
    community/
      <github-username>/
        <ontology-slug>.rdf
        metadata.json    ← { name, description, author, tags, ... }
  ```
- [ ] Create a JSON Schema for `metadata.json` to validate contributions
- [ ] Existing sample ontologies in `src/data/sampleOntologies.ts` should be
  migrated to `catalogue/official/` as RDF files with metadata

### 3.2 Build-time catalogue compilation
- [ ] Write a build script (`scripts/compile-catalogue.ts`) that:
  1. Reads all `catalogue/**/*.rdf` files
  2. Parses each via the RDF parser from §1
  3. Reads associated `metadata.json`
  4. Emits `public/catalogue.json` — a single JSON file with all ontologies,
     metadata, and category info
- [ ] Add an npm script: `"catalogue:build": "tsx scripts/compile-catalogue.ts"`
- [ ] Integrate into `npm run build`:
  `"build": "npm run catalogue:build && tsc -b && vite build"`
- [ ] On build failure (invalid RDF, missing metadata), fail loudly with a
  helpful error message

### 3.3 Community contribution workflow (Microsoft OSS conventions)
- [ ] Add `LICENSE` file — **MIT License** (standard for Microsoft OSS projects)
- [ ] Add `CONTRIBUTING.md` following the
  [Microsoft Open Source Contributing Guide](https://opensource.microsoft.com/contributing/):
  - Contributor License Agreement (CLA) requirement — add the
    [Microsoft CLA bot](https://cla.opensource.microsoft.com/) to the repo
  - Fork → add RDF + `metadata.json` under `catalogue/community/<username>/`
  - Open PR → CI validates the RDF and metadata schema
  - On merge, the next build includes the new ontology
- [ ] Add `CODE_OF_CONDUCT.md` — use the
  [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/)
- [ ] Add `SECURITY.md` — use the
  [Microsoft Security Policy template](https://github.com/microsoft/repo-templates/blob/main/shared/SECURITY.md)
- [ ] Add a GitHub Actions CI job that validates PRs touching `catalogue/`:
  - Parse RDF, verify round-trip, check metadata schema
  - Run the full test suite
- [ ] Consider also accepting GitHub Gist URLs in `metadata.json`
  (`"source": "gist:<gist-id>"`) and fetching them at build time
  (optional, evaluate complexity vs. value)

### 3.4 Catalogue UI (upgrade GalleryModal)
- [ ] Refactor `GalleryModal` to load from `catalogue.json` instead of
  hardcoded `sampleOntologies.ts`
- [ ] Add category filters: Official / Community, plus domain tags (retail,
  healthcare, etc.)
- [ ] Add search/filter by name, author, tags
- [ ] Show author + contributor info for community ontologies
- [ ] Add "View RDF source" button for each ontology (links to the raw file
  in the repo or displays inline)
- [ ] Add pagination or virtual scroll if the catalogue grows large

---

## 4. Embeddable ontology widget

Allow embedding an interactive ontology viewer in external pages (blogs,
tutorials, docs) — similar to how CodePen or GitHub Gist embeds work.

### 4.1 Standalone embed build
- [ ] Create a separate Vite entry point `src/embed.tsx` that renders a
  minimal, self-contained ontology viewer:
  - Cytoscape graph visualization (read-only)
  - Entity/relationship inspector on click
  - Tab to toggle between graph view and RDF source view
  - Accepts ontology data via:
    - `data-ontology-url` attribute (URL to a `.rdf` or `.json` file)
    - `data-ontology-inline` attribute (inline JSON, base64-encoded)
    - `data-catalogue-id` attribute (loads from the published `catalogue.json`)
- [ ] Build as a single JS + CSS bundle: `ontology-embed.js` + `ontology-embed.css`
- [ ] Add Vite build config for the embed target:
  ```ts
  // vite.config.embed.ts
  build: {
    lib: { entry: 'src/embed.tsx', formats: ['iife'], name: 'OntologyEmbed' },
    rollupOptions: { output: { assetFileNames: 'ontology-embed.[ext]' } }
  }
  ```
- [ ] Keep bundle size under 150KB gzipped (Cytoscape is ~90KB gz, must
  account for it)

### 4.2 Embed API & usage
- [ ] Usage pattern for external pages:
  ```html
  <div class="ontology-embed"
       data-catalogue-id="cosmic-coffee"
       data-theme="dark"
       data-height="500px">
  </div>
  <script src="https://<site>/ontology-embed.js"></script>
  ```
- [ ] Support configuration: theme (light/dark), height, initial zoom,
  read-only mode
- [ ] Provide a "Copy embed code" button in the main app's gallery for each
  ontology

### 4.3 RDF source tab
- [ ] In the embed widget, add a tabbed view: "Graph" | "RDF Source"
- [ ] RDF source tab shows syntax-highlighted RDF/XML (use a lightweight
  highlighter or simple regex-based coloring — no heavy deps)
- [ ] Add a "Copy RDF" button

---

## 5. Complementary features

These enhance the overall experience for a community learning resource.

### 5.1 Deep linking / URL routing
- [ ] Add client-side routing (e.g., lightweight hash-based router)
- [ ] Support routes:
  - `/#/` — home (current default ontology)
  - `/#/catalogue` — opens gallery
  - `/#/catalogue/<ontology-id>` — loads and displays a specific ontology
  - `/#/embed/<ontology-id>` — full-page embed view (useful for iframes)
- [ ] Shareable URLs: loading the app with a route pre-selects the ontology

### 5.2 Ontology diffing
- [ ] When loading a new ontology, optionally show a diff view:
  "You'll add 3 entities, remove 1 relationship..."
- [ ] Useful for reviewing community PRs or comparing versions

### 5.3 Accessibility & responsive design
- [ ] Audit and fix keyboard navigation across all modals and panels
- [ ] Add ARIA labels to the graph visualization
- [ ] Ensure the app is usable on tablet-sized screens (responsive breakpoints)
- [ ] Test with screen readers (VoiceOver, NVDA)

### 5.4 Offline support (PWA)
- [ ] Add a service worker + web app manifest
- [ ] Cache `catalogue.json` and the main app shell for offline use
- [ ] Users can browse the full catalogue without a network connection

### 5.5 Analytics & feedback (privacy-respecting)
- [ ] Add optional, privacy-respecting analytics (e.g., Plausible, or simple
  custom event tracking to a static endpoint)
- [ ] "Was this ontology helpful?" thumbs up/down on each catalogue entry
- [ ] Track which ontologies are most loaded to surface popular ones

### 5.6 Documentation site / learning content
- [ ] Add a `/learn` section with markdown-rendered educational content:
  - "What is an ontology?"
  - "Understanding RDF and OWL"
  - "Microsoft Fabric IQ Ontology concepts"
  - "Building your first ontology"
- [ ] Content stored as `.md` files in `content/learn/`, compiled at build time
- [ ] Each tutorial can embed an interactive ontology widget (from §4)

---

## 6. Ontology editor / designer

A visual designer for creating ontologies from scratch or editing existing ones.
The output is a valid RDF file that can be submitted to the catalogue via a
one-click PR flow.

### 6.1 Visual entity designer
- [ ] Create `OntologyDesigner` component — a full-screen editor panel
- [ ] Entity creation: name, icon picker, color picker, description
- [ ] Property builder: add/remove/reorder properties with type selectors
  (string, integer, decimal, date, datetime, boolean, enum)
- [ ] Mark identifier properties
- [ ] Drag-and-drop reordering of entities and properties

### 6.2 Relationship builder
- [ ] Visual relationship creation: select source entity → target entity
- [ ] Set relationship name, cardinality (1:1, 1:n, n:1, n:n), description
- [ ] Optional: relationship attributes (e.g., quantity on an order→product
  edge)
- [ ] Live preview: as relationships are added, the Cytoscape graph updates
  in real-time

### 6.3 Live graph preview
- [ ] Split-pane layout: editor form on the left, live Cytoscape graph on
  the right
- [ ] Graph updates in real-time as entities and relationships are
  added/edited/removed
- [ ] Click a node or edge in the graph to select it in the editor

### 6.4 RDF output & validation
- [ ] "Export RDF" button generates valid RDF/OWL via the serializer from §1
- [ ] "Preview RDF" tab shows the live RDF output as you design
- [ ] Validate the ontology before export:
  - All relationships reference existing entity IDs
  - No duplicate entity/relationship IDs
  - At least one entity type exists
  - Each entity has at least one identifier property

### 6.5 One-click PR to catalogue
- [ ] "Submit to Catalogue" button that:
  1. Serializes the ontology to RDF
  2. Prompts for metadata (name, description, tags, author GitHub username)
  3. Uses the GitHub API to:
     a. Fork the repo (if not already forked) into the user's account
     b. Create a branch `catalogue/<username>/<ontology-slug>`
     c. Commit the `.rdf` file + `metadata.json` to
        `catalogue/community/<username>/`
     d. Open a PR against the upstream repo
  4. Show a link to the created PR
- [ ] Requires GitHub OAuth — add a "Sign in with GitHub" flow (client-side
  OAuth via GitHub's device flow or a lightweight OAuth proxy)
- [ ] For unauthenticated users, fall back to "Download RDF" + manual PR
  instructions
- [ ] Pre-fill the PR description with an ontology summary (entity count,
  relationship count, description)

### 6.6 Edit existing ontologies
- [ ] "Edit" button in the Gallery for any loaded ontology → opens the
  designer pre-populated with the ontology data
- [ ] "Edit" button in the embed widget for catalogue ontologies
- [ ] When editing a community ontology, the PR targets the original file
  path (update, not create)

---

## Priority order (suggested)

| Phase | Items | Rationale |
|-------|-------|-----------|
| **Phase 1** | §1 (RDF), §2 (Static), §3.1–3.2 (Catalogue structure + build) | Foundation: proper serialization, static deploy, catalogue pipeline |
| **Phase 2** | §3.3–3.4 (Community workflow + UI), §5.1 (Deep linking), §6.1–6.4 (Editor/designer) | Community: accept contributions, browse catalogue, share links, design ontologies |
| **Phase 3** | §6.5–6.6 (One-click PR), §4 (Embed widget), §5.6 (Learning content) | Growth: frictionless contribution, embeds drive adoption, docs help newcomers |
| **Phase 4** | §5.2–5.5 (Diff, A11y, PWA, Analytics) | Polish: robustness, accessibility, offline, usage insights |

---

## Low-priority / deferred

- [ ] **Re-enable GitHub Pages workflow** — the repo is currently private so
  GitHub Pages won't work. Once the repo is made public (or moved to GitHub
  Enterprise with Pages support), uncomment the `push` trigger in
  `.github/workflows/deploy-ghpages.yml` and enable Pages in repo settings.
