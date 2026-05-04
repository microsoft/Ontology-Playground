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
- [x] Add `npm run catalogue:build` step before the SWA deploy action (once
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
- [x] Create `catalogue/` directory at repo root
- [x] Define a folder convention:
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
- [x] Create a JSON Schema for `metadata.json` to validate contributions
- [x] Existing sample ontologies in `src/data/sampleOntologies.ts` should be
  migrated to `catalogue/official/` as RDF files with metadata

### 3.2 Build-time catalogue compilation
- [x] Write a build script (`scripts/compile-catalogue.ts`) that:
  1. Reads all `catalogue/**/*.rdf` files
  2. Parses each via the RDF parser from §1
  3. Reads associated `metadata.json`
  4. Emits `public/catalogue.json` — a single JSON file with all ontologies,
     metadata, and category info
- [x] Add an npm script: `"catalogue:build": "tsx scripts/compile-catalogue.ts"`
- [x] Integrate into `npm run build`:
  `"build": "npm run catalogue:build && tsc -b && vite build"`
- [x] On build failure (invalid RDF, missing metadata), fail loudly with a
  helpful error message

### 3.3 Community contribution workflow (Microsoft OSS conventions)
- [x] Add `LICENSE` file — **MIT License** (standard for Microsoft OSS projects)
- [x] Add `CONTRIBUTING.md` following the
  [Microsoft Open Source Contributing Guide](https://opensource.microsoft.com/contributing/):
  - Contributor License Agreement (CLA) requirement — add the
    [Microsoft CLA bot](https://cla.opensource.microsoft.com/) to the repo
  - Fork → add RDF + `metadata.json` under `catalogue/community/<username>/`
  - Open PR → CI validates the RDF and metadata schema
  - On merge, the next build includes the new ontology
- [x] Add `CODE_OF_CONDUCT.md` — use the
  [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/)
- [x] Add `SECURITY.md` — use the
  [Microsoft Security Policy template](https://github.com/microsoft/repo-templates/blob/main/shared/SECURITY.md)
- [x] Add a GitHub Actions CI job that validates PRs touching `catalogue/`:
  - Parse RDF, verify round-trip, check metadata schema
  - Run the full test suite
- [ ] Consider also accepting GitHub Gist URLs in `metadata.json`
  (`"source": "gist:<gist-id>"`) and fetching them at build time
  (optional, evaluate complexity vs. value)
- [x] **RDF validation in CI** — use `npm run validate` (backed by
  `scripts/validate-rdf.ts`) in a GitHub Actions step to gate community
  PRs. The script already validates all catalogue RDF files and can
  validate specific files via `npm run validate -- path/to/file.rdf`.
  Wire it into the PR validation workflow so invalid ontologies are
  rejected before merge.
- [ ] **Contribution CTA link** — Add a "Want to contribute? See
  CONTRIBUTING.md" button/link in the gallery or footer that points
  directly to the GitHub repo fork/PR flow. Link should be:
  `https://github.com/microsoft/Ontology-Playground/fork` (for forking)
  or the CONTRIBUTING.md file, so contributors can start the process
  without manual navigation.

### 3.4 Catalogue UI (upgrade GalleryModal)
- [x] Refactor `GalleryModal` to load from `catalogue.json` instead of
  hardcoded `sampleOntologies.ts`
- [x] Add category filters: Official / Community, plus domain tags (retail,
  healthcare, etc.)
- [x] Add search/filter by name, author, tags
- [x] Show author + contributor info for community ontologies
- [x] Add "View RDF source" button for each ontology (links to the raw file
  in the repo or displays inline)
- [x] Add pagination or virtual scroll if the catalogue grows large

---

## 4. Embeddable ontology widget

Allow embedding an interactive ontology viewer in external pages (blogs,
tutorials, docs) — similar to how CodePen or GitHub Gist embeds work.

### 4.1 Standalone embed build
- [x] Create a separate Vite entry point `src/embed.tsx` that renders a
  minimal, self-contained ontology viewer:
  - Cytoscape graph visualization (read-only)
  - Entity/relationship inspector on click
  - Tab to toggle between graph view and RDF source view
  - Accepts ontology data via:
    - `data-ontology-url` attribute (URL to a `.rdf` or `.json` file)
    - `data-ontology-inline` attribute (inline JSON, base64-encoded)
    - `data-catalogue-id` attribute (loads from the published `catalogue.json`)
- [x] Build as a single JS + CSS bundle: `ontology-embed.js` + `ontology-embed.css`
- [x] Add Vite build config for the embed target:
  ```ts
  // vite.config.embed.ts
  build: {
    lib: { entry: 'src/embed.tsx', formats: ['iife'], name: 'OntologyEmbed' },
    rollupOptions: { output: { assetFileNames: 'ontology-embed.[ext]' } }
  }
  ```
- [x] Keep bundle size under 150KB gzipped (Cytoscape is ~90KB gz, must
  account for it)

### 4.2 Embed API & usage
- [x] Usage pattern for external pages:
  ```html
  <div class="ontology-embed"
       data-catalogue-id="cosmic-coffee"
       data-theme="dark"
       data-height="500px">
  </div>
  <script src="https://<site>/ontology-embed.js"></script>
  ```
- [x] Support configuration: theme (light/dark), height, initial zoom,
  read-only mode
- [x] Provide a "Copy embed code" button in the main app's gallery for each
  ontology

### 4.3 RDF source tab
- [x] In the embed widget, add a tabbed view: "Graph" | "RDF Source"
- [ ] RDF source tab shows syntax-highlighted RDF/XML (use a lightweight
  highlighter or simple regex-based coloring — no heavy deps)
- [x] Add a "Copy RDF" button

### 4.4 Interactive samples page
- [x] Create `public/embed/samples.html` — an article-style page that
  teaches ontology concepts using live embedded visualizations
- [x] Cover all 6 official ontologies across 8 sections
- [x] Include dark/light theme comparison (side-by-side Finance embeds)
- [x] Embed usage instructions + copy-paste snippet at the end

---

## 5. Complementary features

These enhance the overall experience for a community learning resource.

### 5.1 Deep linking / URL routing
- [x] Add client-side routing (e.g., lightweight hash-based router)
- [x] Support routes:
  - `/#/` — home (current default ontology)
  - `/#/catalogue` — opens gallery
  - `/#/catalogue/<ontology-id>` — loads and displays a specific ontology
  - `/#/embed/<ontology-id>` — full-page embed view (useful for iframes)
- [x] Shareable URLs: loading the app with a route pre-selects the ontology
- [ ] Persist catalogue category filter in URL: when user selects a category
  filter in the gallery, the selection should be saved in the URL query
  params (e.g., `/#/catalogue?category=healthcare`) so that navigating
  away and back (or sharing a link) preserves the filter state

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

## 5.7 Release artifact optimization (post-freeze)
- [ ] Once feature/code churn stops, run a dedicated optimization pass for release artifacts:
  - profile bundle composition with `rollup-plugin-visualizer`
  - split/trim graph-heavy paths and embed runtime where possible
  - tighten long-term caching strategy and asset naming
  - re-baseline size targets for main app and embed bundle

### 5.5 Analytics & feedback (privacy-respecting)
- [ ] Add optional, privacy-respecting analytics (e.g., Plausible, or simple
  custom event tracking to a static endpoint)
- [ ] "Was this ontology helpful?" thumbs up/down on each catalogue entry
- [ ] Track which ontologies are most loaded to surface popular ones

### 5.6 Documentation site / learning content
- [x] Add a `/learn` section with markdown-rendered educational content:
  - "What is an ontology?"
  - "Understanding RDF and OWL"
  - "Microsoft Fabric IQ Ontology concepts"
  - "Building your first ontology"
- [x] Content stored as `.md` files in `content/learn/`, compiled at build time
- [x] Each tutorial can embed an interactive ontology widget (from §4)
- [x] Restructured into course-based catalogue with learning paths and hands-on
  labs (8 courses, 39 articles total)
- [x] Interactive quizzes with instant correct/wrong feedback
- [x] Presentation mode (slides split at `##` headings)
- [x] Progressive ontology catalogue entries for step-by-step learning (18
  school entries + 6 IQ Lab entries)

---

## 6. Ontology editor / designer

A visual designer for creating ontologies from scratch or editing existing ones.
The output is a valid RDF file that can be submitted to the catalogue via a
one-click PR flow.

### 6.1 Visual entity designer
- [x] Create `OntologyDesigner` component — a full-screen editor panel
- [x] Entity creation: name, icon picker, color picker, description
- [x] Property builder: add/remove/reorder properties with type selectors
  (string, integer, decimal, date, datetime, boolean, enum)
- [x] Mark identifier properties
- [x] Drag-and-drop reordering of entities and properties

### 6.2 Relationship builder
- [x] Visual relationship creation: select source entity → target entity
- [x] Set relationship name, cardinality (1:1, 1:n, n:1, n:n), description
- [x] Optional: relationship attributes (e.g., quantity on an order→product
  edge)
- [x] Live preview: as relationships are added, the Cytoscape graph updates
  in real-time

### 6.3 Live graph preview
- [x] Split-pane layout: editor form on the left, live Cytoscape graph on
  the right
- [x] Graph updates in real-time as entities and relationships are
  added/edited/removed
- [x] Click a node or edge in the graph to select it in the editor

### 6.4 RDF output & validation
- [x] "Export RDF" button generates valid RDF/OWL via the serializer from §1
- [x] "Preview RDF" tab shows the live RDF output as you design
- [x] Validate the ontology before export:
  - All relationships reference existing entity IDs
  - No duplicate entity/relationship IDs
  - At least one entity type exists
  - Each entity has at least one identifier property

### 6.5 One-click PR to catalogue
- [x] "Submit to Catalogue" button that:
  1. Serializes the ontology to RDF
  2. Prompts for metadata (name, description, tags, author GitHub username)
  3. Uses the GitHub API to:
     a. Fork the repo (if not already forked) into the user's account
     b. Create a branch `catalogue/<username>/<ontology-slug>`
     c. Commit the `.rdf` file + `metadata.json` to
        `catalogue/community/<username>/`
     d. Open a PR against the upstream repo
  4. Show a link to the created PR
- [x] Requires GitHub OAuth — add a "Sign in with GitHub" flow (client-side
  OAuth via GitHub's device flow or a lightweight OAuth proxy)
- [x] For unauthenticated users, fall back to "Download RDF" + manual PR
  instructions
- [x] Pre-fill the PR description with an ontology summary (entity count,
  relationship count, description)

### 6.6 Edit existing ontologies
- [x] "Edit" button in the Gallery for any loaded ontology → opens the
  designer pre-populated with the ontology data
- [ ] "Edit" button in the embed widget for catalogue ontologies
- [x] When editing a community ontology, the PR targets the original file
  path (update, not create)

### 6.7 Undo / Redo in the designer
- [x] Add an undo/redo history stack to the designer store (track snapshots
  of the ontology state on each mutation)
- [x] Wire Ctrl+Z / Cmd+Z (undo) and Ctrl+Shift+Z / Cmd+Shift+Z (redo)
  keyboard shortcuts
- [x] Add undo/redo buttons in the designer toolbar
- [x] Cap history depth (e.g., 50 steps) to limit memory usage

### 6.8 RDF syntax highlighting
- [x] Add syntax highlighting to the RDF source view in the designer's
  "Preview RDF" tab — color XML tags, attributes, namespaces, and values
- [x] Use a lightweight regex-based highlighter (no heavy deps like
  Prism/highlight.js) to keep bundle size small
- [x] Apply the same highlighting to the embed widget's RDF Source tab
  and the Gallery's "View RDF source" panel

### 6.9 Download RDF from designer
- [x] Add a "Download .rdf" button to the designer toolbar that saves the
  current ontology as an RDF/XML file (similar to the catalogue's
  existing RDF download)
- [x] File name should be derived from the ontology name (slugified),
  e.g., `my-ontology.rdf`
- [x] Validate before download — show validation errors if the ontology
  has issues, but allow download anyway with a warning

---

## Priority order (suggested)

| Phase | Items | Rationale |
|-------|-------|-----------|
| **Phase 1** | §1 (RDF), §2 (Static), §3.1–3.2 (Catalogue structure + build) | Foundation: proper serialization, static deploy, catalogue pipeline |
| **Phase 2** | §3.3–3.4 (Community workflow + UI), §5.1 (Deep linking), §6.1–6.4 (Editor/designer) | Community: accept contributions, browse catalogue, share links, design ontologies |
| **Phase 3** | §6.5–6.6 (One-click PR), §4 (Embed widget), §5.6 (Learning content) | Growth: frictionless contribution, embeds drive adoption, docs help newcomers |
| **Phase 4** | §8 (Command palette), §9 (Templates), §10 (Onboarding) | UX: power-user shortcuts, lower barriers, guided first run |
| **Phase 5** | §5.2–5.5 (Diff, A11y, PWA, Analytics), §6.8–6.9 | Polish: diffing, accessibility, offline, syntax highlighting |

---

## 7. Responsive design & mobile-friendly layout

The app must be usable on phones and tablets. Shared links (Teams, Slack,
social media) often land on mobile — if users can't interact, adoption stalls.

### 7.1 Responsive header
- [x] Collapse icon buttons into a hamburger/overflow menu on small screens
- [x] Stack logo + subtitle vertically on narrow viewports
- [x] Hide gamification stats on mobile (or move to hamburger menu)

### 7.2 Responsive main layout
- [x] Switch from the 3-column grid (inspector | graph | quest) to a
  single-column stacked layout below 768px
- [x] Graph takes full width; inspector and quest panel become collapsible
  drawers or tabs below the graph
- [x] Touch-friendly: larger tap targets, swipe to dismiss drawers

### 7.3 Responsive modals
- [x] Modals become full-screen sheets on mobile (no floating card)
- [x] Scrollable content within the sheet
- [x] Close button always visible at top

### 7.4 Responsive learn page
- [x] Article cards stack single-column on narrow screens
- [x] Article content uses fluid typography and responsive images
- [x] Navigation buttons (prev/next) are full-width on mobile

### 7.5 Responsive catalogue / gallery
- [x] Gallery grid adapts: 1 column on phone, 2 on tablet, 3+ on desktop
- [x] Filter bar wraps or collapses on narrow screens
- [x] Search bar is full-width on mobile

### 7.6 Responsive designer
- [x] Stacked layout: entity/relationship form on top, graph preview below
- [x] Toolbar wraps or uses overflow on narrow screens

---

## 8. Command palette / keyboard shortcuts

- [x] `Cmd+K` / `Ctrl+K` opens a command palette
- [x] Type to navigate: ontologies, designer, learn, import/export
- [x] Keyboard shortcuts for common actions (listed in Help modal)

---

## 9. Starter templates in designer

- [x] "Start from template" option when opening the designer empty
- [x] Domain presets: Retail, Healthcare, Finance, IoT, Education
- [x] Each template creates 2–3 entities with relationships pre-wired
- [x] Lowers the "blank page" barrier

---

## 10. Interactive onboarding tour

- [x] Replace the static welcome modal with a 5-step guided tour
- [x] Spotlight overlay highlights: header → graph → inspector → query bar
  → designer
- [x] Dismissable, with "Don't show again" option
- [x] First-time users get oriented in 30 seconds

---

## Low-priority / deferred

- [ ] **"Use in Fabric IQ" export wizard** — A guided flow (validate →
  download RDF → show Fabric IQ upload instructions). Deferred until the
  Fabric IQ integration story is clearer and a native link/API may be
  available.
- [x] **Re-enable GitHub Pages workflow** — enabled with repo-scoped behavior:
  push-triggered Pages deploy runs for `microsoft/Ontology-Playground`.
