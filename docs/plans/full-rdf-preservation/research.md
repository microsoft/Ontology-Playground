# Full RDF Preservation Research

**Recorded:** 2026-10-16

**Implementation baseline:** `f011681554d0c797206156a82a05fc0e7c2b7675`

## Decision

Use `rdfxml-streaming-parser@3.3.0` inside a Vite module worker to parse
complete RDF/XML graphs into structured-clone-safe RDF terms and quads. Keep
the exact input `Uint8Array` separately from that graph. Serialize modified
default graphs with a small project-owned RDF/XML writer and use
`rdf-canonize@5.0.0` only in tests for independent RDFC-1.0 graph comparisons.

The visual `Ontology` remains a projection. It is never used to regenerate a
source-backed document.

## Rationale

- `rdfxml-streaming-parser` emits RDF/JS-compatible named nodes, blank nodes,
  literals, datatypes, language tags, and quads without dereferencing IRIs.
- Its explicit `baseIRI` option resolves relative IRIs and nested `xml:base`
  scopes in the authoritative graph parser.
- Plain term and quad objects cross the worker boundary without tying Zustand
  state or undo snapshots to a mutable dataset class.
- The project does not need a query-indexed RDF store for its bounded patch
  operations. At the measured 53,957-statement reference size, arrays plus
  exact quad keys avoid another production dependency and remain within the
  memory budget.
- No maintained, lightweight RDF/JS RDF/XML writer met the browser/worker
  requirements. A flat `rdf:Description` writer is sufficient for RDF 1.1
  graph serialization and can explicitly reject named graphs rather than
  flattening them.
- Keeping original bytes is the only way to guarantee byte identity,
  including BOM, encoding, whitespace, namespace prefixes, comments, and
  ordering. Graph serialization is used only after a deliberate semantic
  change or an explicit provenance request.

## Alternatives considered

### `N3.Store`

`N3.Store` is an indexed RDF/JS `DatasetCore` and is a good choice for repeated
arbitrary graph queries. It was not selected because the implemented
operations are exact statement lookups over a bounded document and immutable
patch list. Adding the store would increase bundle/state conversion costs
without changing the preservation contract.

### `@rdfjs/dataset`

This is a small standards-aligned dataset implementation, but it provides no
indexing advantage for the current operations. Plain immutable arrays are
smaller, worker-safe, and sufficient.

### `rdflib`

`rdflib` includes RDF/XML writing, but it is substantially heavier and also
contains optional network-fetching facilities that this feature must never
activate. Published parser benchmarks also report materially higher memory use
and a correctness discrepancy on a large OWL input. It was not selected.

### `@graphy/content.xml.scribe`

Graphy's writer was considered, but its stream-oriented dependency surface
introduced browser/Vite uncertainty. The project-owned writer has a narrower
surface and is covered by parse-write-parse tests.

## Security and resource boundaries

- RDF/XML only; Turtle is rejected with an actionable error.
- Maximum source size: 8 MiB.
- Maximum unique statements: 250,000.
- `DOCTYPE` is rejected before parser processing.
- `owl:imports`, SHACL, external entities, XInclude, and referenced IRIs remain
  inert statements. No parser path performs network access.
- RDF/XML cannot represent named graphs, so named-graph serialization is
  rejected explicitly.
- Nested `xml:base` is preserved correctly by the complete parser. The visual
  parser withholds edit mappings where it cannot prove the same exact resource,
  preventing an edit from targeting a different statement.

## Pinned reference artifact

| Measurement | Result |
|---|---:|
| Artifact | Brick catalogue source |
| Source bytes | 5,179,865 |
| SHA-256 | `655939e9b655b7bb890e47c2015d046f41cb2dc6f314895490ebe6c14c5fc423` |
| Parser statement events | 53,958 |
| Unique RDF 1.1 quads | 53,957 |
| Serialized bytes | 4,656,815 |

The one duplicate source statement is
`https://w3id.org/rec#substance rdfs:label "substance"`, expressed once as a
simple literal and once explicitly as `xsd:string`. Those are the same RDF 1.1
literal term, so the semantic dataset contains 53,957 unique quads.

## Measured budgets

Measurements were taken in this worktree on 2026-10-16.

| Check | Budget | Measured |
|---|---:|---:|
| Brick complete parse, Node reference | under 2,000 ms | 175.2 ms |
| Brick complete serialization, Node reference | under 1,000 ms | 43.4 ms |
| Retained heap with parsed graph and serialized text | under 80 MiB | 54.9 MiB |
| RDF worker bundle, gzip | under 75 KiB | 48,222 bytes |
| Main application JS chunks | build must succeed without polyfill warnings | passed |
| Embed bundle | build must succeed | 828.37 kB / 259.16 kB gzip |

The production build emitted a 168.34 kB RDF worker before gzip. The main
application chunks were 0.82 kB, 163.50 kB, 294.75 kB, 325.03 kB, and
556.79 kB before gzip, with no RDF worker or Node-polyfill build errors.

Chromium large-graph regression checks also passed:

- direct Brick route: 60 nodes, one layout, 38.5 ms layout, 68.8 ms
  interaction, 11.1 MiB retained page heap;
- Gallery load: 60 nodes, one layout, 33 ms layout, 12.3 MiB retained page
  heap; and
- active-render cancel/resume behavior: passed its cancellation gate.

## Export contract

- Untouched source-backed documents return the original bytes exactly.
- Undoing all net semantic changes restores original-byte eligibility.
- Modified export serializes the complete patched graph; it preserves
  unrelated statements but not original formatting or blank-node labels.
- An optional, off-by-default provenance control adds
  `prov:wasDerivedFrom <urn:sha256:...>` to an exactly mapped ontology
  resource. Requesting it intentionally creates a modified export.
- Generated Playground and OWL + SHACL profiles remain available only for
  Playground-authored documents.
