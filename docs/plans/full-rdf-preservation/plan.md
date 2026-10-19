# Full RDF Preservation: Implementation Plan

**Date:** 2026-10-16

**Priority:** P0 preservation first; P1 bounded editing second

**Status:** Implemented and validated after rebasing the remediation branch
onto `origin/main` at `d78965d`.

## Summary and scope

Preserve the complete imported RDF document, not merely the portion displayed
in the graph. Keep the visual `Ontology` as a projection, not the authority for
exporting imported RDF.

The first release provides full-document ingestion and preservation, read-only
visualization, and original-source export. It does not provide arbitrary RDF,
OWL, or SHACL editing. A second release enables only edits with explicit,
statement-level behavior and complete-document export.

**Specification and design inputs:** the user-approved discussion of full RDF
preservation, the supplied dataset-first proposal, and its review in this
conversation. The numbered requirements below record that scope for execution.
No separate feature specification, constitution, topology, or approved adapter
design was supplied or found under `.github/`. Repository `AGENTS.md` governs
changes. This is not a migration pipeline; no upstream architecture artifacts
are being claimed as available. The implementation baseline is
`f011681554d0c797206156a82a05fc0e7c2b7675`; adapter decisions and measurements
are recorded in `research.md`.

## Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-001 | Untouched RDF exports return the exact original bytes, without regenerated identities or annotations. | P0 |
| REQ-002 | Retain every supported RDF 1.1 statement, including blank-node structures, literal lexical forms, language tags, datatypes, and arbitrary predicates; the visual projection may be incomplete. | P0 |
| REQ-003 | Retain document identity and source context across every applicable import, catalogue, graph, Designer, preview, copy, download, and submission path; never silently downgrade to projection-only RDF. | P0 |
| REQ-004 | Keep catalogue loading lazy and UI work bounded, never fetch imports or execute SHACL, and report parsing, integrity, and unsupported-format errors explicitly. | P0 |
| REQ-005 | Disable semantic editing of source-backed documents until the full patch path is ready; keep existing editing/export behavior for newly authored Playground documents. | P0 |
| REQ-006 | Enable only precisely mapped edits, updating RDF, projection, and undo/redo atomically; preserve all unrelated statements. | P1 |
| REQ-007 | Export the complete patched graph and distinguish modified documents from upstream sources, without requiring blanket ontology/term IRI renaming. | P1 |
| REQ-008 | Demonstrate byte fidelity, graph fidelity, lifecycle consistency, explicit failures, and measured performance before releasing each milestone. | P0/P1 |

## Technical context

- TypeScript 5.9, React 19, Zustand, Vite; static browser application.
- Existing implementation boundaries: `src/lib/rdf/parser.ts`,
  `src/lib/rdf/serializer.ts`, `src/data/ontology.ts`, `src/types/catalogue.ts`,
  `src/store/appStore.ts`, and `src/store/designerStore.ts`.
- Existing validation tools: Vitest, Testing Library, Playwright, TypeScript,
  catalogue compiler, and production/embed builds.
- Use an RDF/JS-compatible dataset behind a small parser/writer adapter.
  Select the actual implementation through T002, not an unverified dependency
  recommendation.
- Preserve original bytes separately from the parsed dataset. Record media
  type, effective document/base IRI, source reference, hash, and document
  revision. Prefixes and formatting are document metadata, not RDF statements.
- Source-backed documents and Playground-authored documents have explicit,
  distinct export paths. The existing serializer remains for authored documents.
- Start with RDF/XML, the existing input syntax. Turtle, TriG, N-Quads, RDF-star,
  reasoning, and SHACL execution are not additional feature commitments.
- RDF/XML represents a graph, not named graphs. Reject incompatible input or
  output explicitly; never flatten a dataset silently.
- Use a worker for large semantic parsing/serialization; account for transfer
  and peak memory costs rather than assuming a worker solves performance.

## Repository constraints and applied guidelines

- Preserve static deployment and existing authored-ontology workflows.
- Follow strict TypeScript and existing store/component conventions.
- Keep source semantics out of the visual-only model and catalogue index.
- No new backend, implicit network imports, or automatic rule execution.
- Make source-backed read-only mode explicit rather than silently detaching the
  source when entering Designer.
- The installed migration guidelines concern Java/Struts/Spring and do not
  apply. No migration-specific abstraction or tooling is required.
- No source RDF files are changed by this planning task.

## Implementation steps and task breakdown

### Step 1: Establish the baseline and fidelity contract

**Plan item 1.1; requirements:** REQ-001 through REQ-008.

Implementation uses the current `origin/main` baseline in an isolated worktree.
It incorporates the merged lazy catalogue/source-artifact behavior without
copying changes from another dirty worktree.

- [x] T001 [Plan:1.1] Identify the approved integration commit containing the current catalogue/source changes; reconcile `src/types/catalogue.ts`, `scripts/compile-catalogue.ts`, and RDF entry points on a dedicated implementation branch. Record the baseline commit, source-backed versus authored behavior, accepted input/base-IRI rules, and numeric performance gates in this plan before dependent work.
- [x] T002 [Plan:1.1] Evaluate a browser/worker-compatible RDF/XML parser and writer for `src/lib/rdf/` and `package.json`. Prove complete graph retention, literal lexical preservation, base resolution, blank-node handling, no external-resource fetching, and real-artifact round trips. Record the selected libraries and measured size/time/memory before adding production dependencies.

**Gate:** adapter feasibility and concrete performance budgets must be recorded.
If RDF/XML cannot serialize a parsed graph faithfully, report an explicit
export limitation; do not return success with a reduced graph.

### Step 2: Build the complete-document foundation

**Plan item 2.1; requirements:** REQ-001, REQ-002, REQ-004.

Introduce the semantic document boundary without replacing the graph UI.
Source parsing success must not depend on finding a visible OWL class: valid
RDF with no projectable classes remains a preserved document with an empty
graph and an explanatory message.

- [x] T003 [Plan:2.1] Add document types in `src/types/rdfDocument.ts` and source-byte/dataset operations in `src/lib/rdf/document.ts`; distinguish source-backed documents from authored projections, preserve effective base context and integrity metadata, and expose explicit loading/error states.
- [x] T004 [Plan:2.1] Implement the selected adapter in `src/lib/rdf/dataset.ts` and worker boundary in `src/lib/rdf/rdf.worker.ts`; adapt `src/lib/rdf/parser.ts` to derive the visual projection from the complete graph while retaining compatibility for existing authored callers. Reject unsupported syntax explicitly and keep imports/SHACL inert.

**Gate:** independent graph-equivalence checks must pass for supported source
graphs; projection omissions must not remove statements from the dataset.

### Step 3: Carry the document through application lifecycles

**Plan item 3.1; requirements:** REQ-003, REQ-004, REQ-005.

Use one document context/revision across stores and views. Keep worker datasets
out of JSON-cloned visual history; source identity must survive passing a
document to Designer, not just its `Ontology` projection.

- [x] T005 [Plan:3.1] Wire document identity and load/reset transitions through `src/store/appStore.ts`, `src/store/designerStore.ts`, and `src/components/ImportExportModal.tsx`. Preserve bytes from file input before decoding; ignore stale async loads using document revision/cancellation. Preserve the active document on failed replacement.
- [x] T006 [Plan:3.1] Update `src/types/catalogue.ts`, `scripts/compile-catalogue.ts`, `src/components/GalleryModal.tsx`, `src/components/OntologyDesigner.tsx`, and `src/components/EmbedWidget.tsx` to carry verified lazy source references without embedding datasets or bytes in gallery summaries. Reuse baseline source loaders where present; report missing/hash-mismatched artifacts without generated-RDF fallback.

**Lifecycle boundary:** preserve context through existing in-session navigation
and draft operations. This does not introduce autosave or persistent browser
storage. Any offered saved-document workflow must either retain source context
or explicitly declare a projection-only format before saving.

### Step 4: Ship preservation-only behavior first

**Plan item 4.1; requirements:** REQ-001, REQ-003, REQ-005, REQ-008.

Original download means original bytes, not a decoded/re-encoded string. Source
preview/copy may display decoded text but must be labeled separately from the
byte-exact download. A hash verifies the pinned bytes; it does not prove
publisher authority.

- [x] T007 [Plan:4.1] Centralize source-aware export routing in `src/lib/rdf/document.ts`; wire `src/components/Header.tsx`, `src/components/ImportExportModal.tsx`, `src/components/GalleryModal.tsx`, `src/components/EmbedWidget.tsx`, `src/components/designer/DesignerActions.tsx`, `src/components/designer/DesignerPreview.tsx`, and `src/components/designer/SubmitCatalogueModal.tsx`. Untouched source downloads return original bytes; authored documents retain current profile serializers.
- [x] T008 [Plan:4.1] Enforce source-backed preservation guards in `src/store/designerStore.ts` and Designer controls. Disable unsupported semantic and structural mutations, validate complete RDF text replacement as a new source document, and block catalogue submission without silently converting imported RDF to an authored projection.

**Milestone A release gate:** complete source/dataset retention and all source
surfaces work; source-backed editing is explicitly unavailable. A separate
source-download button beside a still-lossy imported-document export does not
satisfy this milestone.

### Step 5: Define and implement bounded edits

**Plan item 5.1; requirements:** REQ-003, REQ-006.

Start with editing a selected existing label/comment and direct named-class
`rdfs:subClassOf` edges. Do not initially enable term renaming, arbitrary
domain/range edits, resource deletion/cascades, or blank-node structure editing.

- [x] T009 [Plan:5.1] Add statement-level mappings and operation preconditions in `src/types/rdfDocument.ts`, `src/lib/rdf/parser.ts`, and `src/lib/rdf/patch.ts`. Map visible fields/edges to their exact supporting quads, retain language/datatype distinctions, identify shared/ambiguous mappings, and refuse edits that cannot be resolved explicitly.
- [x] T010 [Plan:5.1] Integrate patch transactions with `src/store/designerStore.ts` and relevant Designer controls: apply graph changes, reproject affected data, and update document revision/history atomically; undo/redo restores both representations. Failed preconditions leave the document unchanged with an explicit error.

**Patch boundary:** operations initially stay inside one pinned document and
its dataset; blank-node IDs are not portable identifiers. Do not offer RDF
Patch/SPARQL Update interchange until a separate stable-addressing design is
proven. Shared source statements affect every dependent visual element.

### Step 6: Export complete edited documents

**Plan item 6.1; requirements:** REQ-001, REQ-006, REQ-007.

Edited export serializes the complete dataset after the intentional net patch.
Unchanged statements remain, but this is not a promise that an intentional
semantic change has no wider logical consequences.

- [x] T011 [Plan:6.1] Extend `src/lib/rdf/document.ts` and `src/lib/rdf/patch.ts` to serialize the complete patched graph; retain the original artifact for source download, derive dirty status from actual semantic changes, and keep original-byte export available when all edits have been undone.
- [x] T012 [Plan:6.1] Update source-aware export and Designer UI to distinguish original from modified documents, retain source hash/revision and edit diagnostics, and provide deliberate derivation metadata options. Do not automatically rename ontology/term IRIs, claim a modified artifact is an official upstream release, or inject provenance into the graph without an explicit action.

**Milestone B release gate:** only supported edits are enabled, after end-to-end
patch, history, and whole-graph export checks pass. Unsupported operations stay
blocked even after this milestone.

### Step 7: Verify release gates and update documentation

**Plan item 7.1; requirements:** REQ-001 through REQ-008.

- [x] T013 [Plan:7.1] Verify the acceptance matrix below using the repository's existing validation tooling, the pinned real artifact, and baseline measurements. Record measured results and run the required read-only branch review before enabling either milestone.
- [x] T014 [Plan:7.1] Update `README.md`, `README.zh-CN.md`, `README.ja.md`, `docs/rdf-export-profiles.md`, `docs/embed-guide.md`, and `TODO.md` with the implemented milestone's scope and limitations; mark only verified implementation tasks complete here.

## Dependencies and execution order

`T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008`
is the initial P0 integration order. T013/T014 must verify/document Milestone A
before release; repeat them for Milestone B.

`T009` depends on T004/T005; `T010` on T008/T009; `T011` on T007/T010;
`T012` on T011. Do not let P1 editing delay P0 preservation.

## Acceptance and validation matrix

All release checks below passed on 2026-10-19.

| Check | Result | Evidence |
|-------|--------|----------|
| Untouched import/export | Passed | Exact byte tests cover UTF-8, UTF-16, BOM, and unchanged Designer reloads; relative IRIs retain their recorded base. |
| Complete graph retention | Passed | RDF canonicalization tests compare the full parsed and reserialized graphs; independent expectations cover standalone node roots using `rdf:about`, empty `rdf:about`, `rdf:ID`, or `rdf:nodeID`, unknown `rdf:parseType` XML-literal fallback, XMLLiteral infosets, approved RDF/XML canonical namespace/reification shapes, and ordinary literals split by comments, CDATA, or processing instructions. |
| Complex RDF | Passed | Restrictions, lists, blank nodes, SHACL, arbitrary predicates, the complete XML 1.0 Unicode NCName range, language tags, datatypes, lexical forms, split and empty literals, literal carriage returns, and RDF-correct relative IRI edge cases are covered. |
| Empty projection | Passed | Valid non-projectable RDF retains its complete document and exact export. |
| Lifecycle/surfaces | Passed | File import, catalogue, application store, Designer, gallery, preview, sharing, and embed paths have regression coverage. File readers are size-preflighted and aborted when obsolete. Reset timers, Designer entry/deep-link loads, RDF editor text, clipboard sharing, async downloads, cancellation, unmount, and reverse completion are generation- and identity-guarded. |
| Preservation guards | Passed | Unsupported source-backed mutations, catalogue submission, and projection-only Fabric push are blocked while mapped labels/comments and direct subclass edits remain available. |
| Exact edits | Passed | Literal and hierarchy tests assert exact statement deltas, ambiguity rejection, duplicate-edge rejection, and unrelated-statement retention. |
| Undo/redo | Passed | Atomic projection/document history and undo-to-original-byte eligibility are covered. |
| Failure behavior | Passed | Malformed input, DOCTYPE, missing/hash-mismatched sources, named graphs, oversized file or streamed URL input, stale downloads, and unsafe mappings fail explicitly; live Chromium verifies file and URL-embed DOCTYPE rejection before projection, worker parsing, or network access. |
| Inert imports/rules | Passed | Tests verify no import/external-resource requests and no SHACL execution. |
| Real artifact | Passed | Brick: 5,179,865 bytes, SHA-256 `655939e9b655b7bb890e47c2015d046f41cb2dc6f314895490ebe6c14c5fc423`, 53,957 unique RDF 1.1 quads. |
| Performance | Passed | Final rebased Brick probe: parse 255.3 ms, serialize 72.6 ms, retained heap baseline 54.9 MiB. XMLLiteral extraction scaled from 0.294 ms at 1,000 text characters to 20.985 ms at 500,000. The 5.18 MB source view uses one plain text node; all ten Chromium checks passed. |
| Regression/build | Passed | 58 files / 830 tests, TypeScript, ESLint, production/inline-worker embed build, deployed CSP, native UTF-16/Unicode app, same-origin and cross-origin URL-embed workers, large-source rendering, textarea and clipboard checks, RDF validation, deployment validation, and 10 Chromium checks passed. |
| Independent review | Passed | The same read-only reviewer reproduced five final risks, verified both follow-up fixes, and returned `No high-confidence findings` on the exact final worktree. |

## Implemented file additions

```text
src/types/rdfDocument.ts
src/lib/rdf/document.ts
src/lib/rdf/dataset.ts
src/lib/rdf/rdf.worker.ts
src/lib/rdf/patch.ts            # P1 bounded transactions
```

Statement-level projection mappings live in `src/types/rdfDocument.ts` and
`src/lib/rdf/parser.ts`; no redundant `projection.ts` module was needed.

## Requirement mapping

Implementation evidence below was validated by the acceptance matrix.

| Requirement | Plan items | Tasks | Implementation evidence |
|-------------|------------|-------|-------------------------|
| REQ-001 | 1.1, 2.1, 4.1, 6.1, 7.1 | T001-T004, T007, T008, T011-T014 | Original-byte document/export path and byte comparisons |
| REQ-002 | 1.1, 2.1, 7.1 | T001-T004, T013, T014 | Complete dataset adapter and independent graph checks |
| REQ-003 | 1.1, 3.1, 4.1, 5.1, 7.1 | T001, T002, T005-T010, T013, T014 | Store document context and every source/export surface |
| REQ-004 | 1.1, 2.1, 3.1, 7.1 | T001-T006, T013, T014 | Verified lazy sources, worker behavior, explicit errors, measurements |
| REQ-005 | 1.1, 3.1, 4.1, 7.1 | T001, T002, T005-T008, T013, T014 | Read-only store/UI guards and authored-flow regression checks |
| REQ-006 | 1.1, 5.1, 6.1, 7.1 | T001, T002, T009-T014 | Statement provenance, atomic patches, semantic history |
| REQ-007 | 1.1, 6.1, 7.1 | T001, T002, T011-T014 | Complete edited export and original/modified labeling |
| REQ-008 | 1.1, 4.1, 7.1 | T001, T002, T007, T008, T013, T014 | Recorded milestone acceptance and release evidence |
