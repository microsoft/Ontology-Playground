# Full RDF Preservation Research

**Recorded:** 2026-10-19

**Implementation baseline:** `f011681554d0c797206156a82a05fc0e7c2b7675`

## Decision

Use `rdfxml-streaming-parser@3.3.0` inside a Vite module worker to parse
complete RDF/XML graphs into structured-clone-safe RDF terms and quads. A
project-owned pass over the public `@rubensworks/saxes` API extracts XMLLiteral
infosets; protected parser hooks connect those values and accumulate ordinary
literal events without reading private dependency fields. Keep the exact input
`Uint8Array` separately from that graph. Serialize modified default graphs with
a small project-owned RDF/XML writer and use `rdf-canonize@5.0.0` only in tests
for independent RDFC-1.0 graph comparisons.

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

## Adapter hardening

Independent red-team probes found three correctness gaps in the selected
parser's default integration. The project adapter now:

- supplies a parser-scoped RDF data factory with disjoint namespaces for
  explicit and generated blank-node identifiers;
- applies property-element `xml:base` before resolving resource, datatype,
  reification, or nested IRIs and applies `xml:lang` before constructing
  property-attribute literals; and
- shares `relative-to-absolute-iri` resolution between the complete parser and
  visual projection so hostname case, explicit default ports, Unicode paths,
  dot segments, colon-containing path segments, and other RDF IRI identity are
  not changed by WHATWG URL normalization. The direct dependency is pinned to
  `^1.0.8`, which contains the required relative-path fixes; and
- reconstructs `rdf:parseType="Literal"` content with a direct public Saxes
  event pass. It escapes decoded XML text and attribute values, preserves
  comments, processing instructions, and CDATA order, and emits required
  inherited namespaces for visibly used element and attribute prefixes.
  Unused ancestor declarations are not injected; explicit declarations,
  default-namespace resets, and local prefix shadowing/restoration remain
  intact. Decoded attribute tabs, line feeds, and carriage returns are
  re-emitted as character references so a later XML parse cannot normalize
  them to spaces; and
- accumulates ordinary literal text and CDATA events on each active property
  tag captured through the dependency's protected `onTagProperty` hook rather
  than its private active-tag stack. Comments and processing instructions
  remain markup, while adjacent and empty properties retain isolated values,
  languages, and datatypes; and
- supplies node-element context for standalone RDF/XML roots so root
  `rdf:about`, `rdf:ID`, `rdf:nodeID`, property attributes, and typed-node
  identity are processed. Unknown `rdf:parseType` values are normalized
  internally to RDF/XML's Literal fallback while the supported RDF 1.2
  `Triple` value remains distinct.

The adapter no longer reads `saxParser` or `activeTagStack`. A compatibility
regression makes those private names inaccessible while parsing split ordinary
and XML literals. Independent DOM assertions cover default-namespace
inheritance/reset, element and attribute prefixes, nested and sibling
shadowing, comments, processing instructions, CDATA, control whitespace, and
multiple XML literals separated by an explicitly typed XMLLiteral. Minimal
approved W3C RDF/XML canonicalization and reification shapes produce
`<br></br>` without unused inherited namespace declarations.

The complete writer also rejects XML 1.0-forbidden code points and finds an
RDF/XML QName suffix with one Unicode-aware reverse scan over the complete XML
1.0 NCName start/character ranges, including U+200C/U+200D and supplementary
non-letter name starts. A 160,000-character
predicate namespace that previously required about 12.5 seconds serializes in
well under the release budget after the linear scan. Post-fix measurements for
10,000, 20,000, 40,000, 80,000, and 160,000 namespace characters were 0.6,
0.2, 0.2, 0.5, and 0.9 milliseconds respectively (single-run Node probes after
module startup); the largest input no longer shows overlapping-suffix growth.

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
- `DOCTYPE` is rejected before complete-graph or visual parser processing.
- `owl:imports`, SHACL, external entities, XInclude, and referenced IRIs remain
  inert statements. No parser path performs network access.
- RDF/XML cannot represent named graphs, so named-graph serialization is
  rejected explicitly.
- Nested `xml:base` is preserved correctly by the complete parser. The visual
  parser withholds edit mappings where it cannot prove the same exact resource,
  preventing an edit from targeting a different statement.
- Arbitrary URL embeds check declared length, bound streamed bytes to 8 MiB,
  cancel oversized streams, and route RDF/XML through the same complete
  ingestion path before visual projection. URL JSON remains bounded and
  projection-only.
- File selection checks the declared byte length before allocating a buffer and
  aborts active `FileReader` work when replaced, closed, or unmounted.
- Designer entry and deep-link loads are generation- and draft-identity
  guarded. The RDF editor locks submitted text during parsing, supports
  cancellation, and verifies that its text revision is still current.
- Header, modal, and Designer exports recheck request generation, component
  lifetime, active ontology, and RDF document ID/revision after asynchronous
  source loading or serialization. Authored sharing repeats that check after
  clipboard completion and before changing the route.
- The worker is inlined in the self-contained bundles so cross-origin HTTPS
  embeds create a consumer-origin Blob worker instead of requesting a
  cross-origin worker script. The deployed application CSP explicitly permits
  self and Blob workers.
- Complete sources above 256,000 characters render as one plain text node.
  This keeps the full copy/download value while bounding React token trees and
  avoiding spread-argument limits.
- Source-backed documents cannot enter the projection-only Fabric API through
  either the normal export surface or the Fabric modal's defensive checks.

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

Measurements were taken in this worktree on 2026-10-19.

| Check | Budget | Measured |
|---|---:|---:|
| Brick complete parse, final rebased Node probe | under 2,000 ms | 255.3 ms |
| Brick complete serialization, final rebased Node probe | under 1,000 ms | 72.6 ms |
| Retained heap with parsed graph and serialized text | under 80 MiB | 54.9 MiB |
| XMLLiteral extraction, 1,000 / 500,000 text characters | linear scaling | 0.294 / 20.985 ms |
| Inline RDF worker payload, gzip before inlining | under 75 KiB | 50,071 bytes |
| Main application JS chunks | build must succeed without polyfill warnings | passed |
| RDF-bearing main application chunk | build must succeed | 481.80 kB / 133.60 kB gzip |
| Self-contained embed bundle | build must succeed | 1,248.00 kB / 375.01 kB gzip |

The worker payload is now inlined rather than emitted as a separately fetched
asset. The main application chunks were 0.82 kB, 163.52 kB, 325.03 kB,
481.80 kB, and 556.79 kB before gzip, with no RDF worker, `import.meta`, or
Node-polyfill build errors. A native HTTPS cross-origin fixture loaded the
embed script from a second origin and completed worker parsing without a
worker-script request.

All ten Chromium checks passed:

- direct Brick route: 60 nodes, one layout, 37.3 ms layout, 69.3 ms
  interaction, 12.0 MiB retained page heap;
- Gallery load: 60 nodes, one layout, 31.5 ms layout, 13.3 MiB retained page
  heap; and
- active-render cancel/resume behavior: passed its cancellation gate;
- native UTF-16 source import, Unicode/astral clipboard text, CRLF-tolerant
  textarea semantics, worker parse, mapped edit, and modified export passed;
- native file DOCTYPE import was rejected before projection or network access;
- the exact deployed Content Security Policy permitted the main application's
  inline worker;
- native RDF/XML URL embed used its inline worker and retained complete source
  text;
- an HTTPS consumer loaded the embed bundle from another origin and completed
  inline-worker parsing;
- the pinned 5.18 MB Brick source tab rendered its complete text without a page
  error; and
- native URL-embed DOCTYPE input was rejected before worker or external access.

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
