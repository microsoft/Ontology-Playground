# TODO: Learning Paths & Labs

Transform the Learn section from a flat list of articles into a catalogue of courses
(learning paths and hands-on labs), starting with the IQ Retail Supply Chain lab.

## Phase 1 — Foundation

- [x] **Types & router** — Extend `LearnManifest`/`LearnArticle` with `LearnCourse`
  wrapper (`type: 'path' | 'lab'`). Extend learn route to three levels:
  `/#/learn`, `/#/learn/<course>`, `/#/learn/<course>/<article>`.
- [x] **Router tests** — Add tests for new learn route with course + article slugs.

## Phase 2 — Progressive Ontologies

- [x] **Catalogue entries** — Create 6 incremental sub-ontologies under
  `catalogue/official/iq-lab-retail/`:

  | Step | Catalogue ID | New entities | Cumulative |
  |------|-------------|-------------|-----------|
  | 1 | `official/iq-lab-retail/step-1` | Customer, Order, Product | 3 |
  | 2 | `official/iq-lab-retail/step-2` | + OrderLine, ProductCategory | 5 |
  | 3 | `official/iq-lab-retail/step-3` | + Region, Store | 7 |
  | 4 | `official/iq-lab-retail/step-4` | + Shipment, Carrier, Warehouse | 10 |
  | 5 | `official/iq-lab-retail/step-5` | + Inventory, Forecast, DemandSignal | 13 |
  | 6 | `official/iq-lab-retail/step-6` | + Promotion, Return | 15 (complete) |

- [x] **sampleOntologies.ts** — Add the 6 step ontologies to sampleOntologies
  under a new `"iq-lab"` category.

## Phase 3 — Content Restructure

- [x] **Move existing articles** — Move `content/learn/*.md` into
  `content/learn/ontology-fundamentals/` subdirectory.
- [x] **Add `_meta.md`** — Create course-level metadata file for
  `ontology-fundamentals` (type: path).
- [x] **Lab content** — Create `content/learn/iq-lab-retail-supply-chain/`
  with `_meta.md` (type: lab) and 7 step markdown files:
  1. Scenario Overview — why retail supply chain, what we'll model
  2. Core Commerce — Customer, Order, Product (embed step-1)
  3. Order Details & Categories — OrderLine, ProductCategory (embed step-2)
  4. Geography — Region, Store (embed step-3)
  5. Fulfillment & Logistics — Shipment, Carrier, Warehouse (embed step-4)
  6. Inventory & Demand — Inventory, Forecast, DemandSignal (embed step-5)
  7. Complete Model — Promotion, Return, full graph review (embed step-6)

## Phase 4 — Build Pipeline

- [x] **compile-learn.ts** — Update to scan subdirectories, parse `_meta.md`
  for course metadata, emit `courses[]` instead of flat `articles[]`.

## Phase 5 — UI

- [x] **LearnPage.tsx** — Three views:
  1. **Course catalogue** — cards for each course with type badge (Path/Lab)
  2. **Course detail** — article list within a course, progress for labs
  3. **Article view** — existing renderer (already supports `<ontology-embed>`)

## Phase 6 — Verify

- [x] All tests pass (`npm test`)
- [x] Build succeeds (`npm run build`)
- [x] Learn catalogue renders correctly
- [x] Lab steps show progressive ontology embeds
- [x] Existing "ontology fundamentals" articles still work
