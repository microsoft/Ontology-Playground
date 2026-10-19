# RDF export profiles

Ontology Playground exposes two distinct RDF/XML export paths with different
contracts:

1. **Complete source-backed export** for imported files and catalogue sources.
2. **Generated profiles** for ontologies authored in the Playground.

Choose the path or profile based on whether the file needs to return to the
editor or be consumed primarily by standards-based RDF tooling.
For generator-side input requirements, supported declarations, and parser
limits, see [Generating RDF from External Tools](external-rdf-generators.md).

The generated profile selector is intentionally hidden for source-backed
documents so a complete source is never silently reduced to the visual model.

## Complete source-backed export

RDF/XML imports retain both the exact original bytes and the complete parsed
RDF graph. The visual `Ontology` is a projection, not the export authority.

- An untouched document downloads as the original `Uint8Array` byte-for-byte.
- Undoing all net semantic edits restores exact-original eligibility.
- A modified document exports the complete graph plus intentional patches.
- Modified output may use different whitespace, prefixes, statement order, and
  blank-node labels; parse-write-parse graph semantics remain equivalent except
  for the requested patches.
- Export diagnostics report source hash, source and exported statement counts,
  patch count, and whether optional provenance was included.

Source-backed editing is deliberately bounded. The Designer enables only an
existing label or comment that maps to exactly one RDF literal, and direct
named-class `rdfs:subClassOf` endpoint changes or removal. Language tags and
datatypes on edited literals remain unchanged. Ambiguous multilingual values,
unmapped values, term renaming, class/property creation or deletion,
domain/range and cardinality changes, blank-node structure changes, and
arbitrary graph editing remain read-only.

An off-by-default export control can add:

```text
<mapped ontology> prov:wasDerivedFrom <urn:sha256:source-hash>
```

Selecting it intentionally creates a modified/derived export. The Playground
never injects this statement automatically.

### Source safety and limits

- RDF/XML is the supported source syntax; Turtle is reported as unsupported.
- Sources are limited to 8 MiB and 250,000 unique RDF statements. File
  selection checks the declared size before buffering and aborts a superseded
  reader.
- Named nodes, blank nodes, arbitrary predicates, literal lexical forms,
  languages, datatypes, restrictions, lists, and SHACL statements are retained.
- Explicit source blank-node identifiers remain disjoint from parser-generated
  blank nodes, including anonymous restrictions, collections, and
  `rdf:parseType="Resource"` structures.
- Relative IRIs use RDF IRI resolution without browser URL canonicalization;
  dot segments, colon-containing path segments, hostname case, explicit
  default ports, and Unicode remain RDF-term-correct. Property-level
  `xml:base` and `xml:lang` scopes apply regardless of XML attribute order.
- `rdf:parseType="Literal"` values escape decoded XML text and attributes and
  carry only inherited namespace bindings required by visibly used element or
  attribute prefixes. Explicit declarations, default-namespace resets, and
  nested or sibling prefix shadowing remain correct without copying unrelated
  ancestor declarations. Comments, processing instructions, CDATA text, and
  attribute tab, line-feed, and carriage-return values remain in order.
- Ordinary literal properties accumulate every text and CDATA chunk within
  their own element. XML comments and processing instructions do not become
  RDF literal text, but neither can they truncate the surrounding value.
- A standalone RDF/XML node element retains its `rdf:about`, `rdf:ID`, or
  `rdf:nodeID` identity in both the complete graph and visual projection.
  Blank-node projections remain read-only because bounded edit targets require
  a named RDF term.
  Unrecognized `rdf:parseType` values use the RDF/XML XML-literal fallback;
  the RDF 1.2 `Triple` value remains distinct.
- Modified exports support the complete XML 1.0 NCName start range, including
  U+200C/U+200D and allowed non-letter supplementary code points, with a
  linear QName-suffix scan.
- `owl:imports`, SHACL, and referenced IRIs are inert. They are not fetched or
  executed.
- `DOCTYPE` declarations are rejected before either complete-graph or visual
  parsing begins.
- Bounded literal edits containing XML-forbidden code points are rejected
  atomically. The complete writer performs the same validation defensively.
- RDF/XML cannot represent named graphs, so the writer rejects them rather than
  flattening them.
- A valid document with no visually projectable classes remains available for
  complete export.
- Pending imports are generation-guarded. Dismissal, reset, unmount, and older
  delayed-close callbacks cannot cancel or overwrite a newer file selection.
- Designer entry, deep-link catalogue loads, complete-RDF preview generation,
  and RDF editor parsing are generation- and identity-guarded. Submitted RDF
  text is locked while parsing, while cancellation remains available.
- Header, import/export, and Designer downloads recheck their initiating
  document revision and component lifetime after async source loading or
  serialization. Authored URL sharing repeats the check after clipboard
  completion and before route replacement. Stale output is never clicked or
  exposed as current.
- Complete sources above the syntax-highlighting budget render as one plain
  text node, avoiding argument-limit failures and enormous React token trees
  while preserving complete copy and download data.
- Clipboard and RDF editor surfaces expose decoded Unicode text, not original
  source bytes. Exact bytes remain the download contract. UTF-8 and UTF-16 byte
  signatures, BOMs, and leading XML declarations must agree; unsupported or
  conflicting declarations fail instead of associating bytes with a different
  graph. Editor normalization changes only the actual leading XML declaration,
  never processing instructions in XML literals. Live Chromium checks cover
  UTF-16 declarations, CRLF normalization, astral characters, edited worker
  output, and clipboard retry behavior.
- RDF/XML URL embeds use bounded response streaming and the same complete
  ingestion, `DOCTYPE`, source-size, and statement-count checks as file
  imports. JSON URL embeds remain supported within the same byte limit. The
  embed worker is inlined so third-party HTTPS pages do not launch a
  cross-origin worker script. The Playground deployment CSP permits its inline
  Blob worker; third-party CSP must do the same.
- Fabric's current API accepts only the visual projection. Fabric push is
  disabled defensively for source-backed documents so preserved statements
  cannot be dropped silently; complete RDF download remains available.

## Generated profiles for authored documents

Choose a generated profile based on whether a Playground-authored document
needs to return to the editor or be consumed primarily by standards-based RDF
tooling.

### Playground round-trip

The **Playground round-trip** profile is the default. It preserves the editable
visual model, including:

- entity icons and colors;
- original property types, units, identifiers, and enum values;
- relationship cardinality and relationship attributes;
- entity IDs used by relationship endpoints; and
- Playground data bindings.

These values use the declared Ontology Playground metadata vocabulary:

```text
https://microsoft.github.io/Ontology-Playground/ns/metadata#
```

The terms are declared as annotation properties, or as a metadata class where
appropriate. They are not Microsoft Fabric vocabulary and are kept separate
from the generated domain ontology namespace. Imports created with older
Playground releases remain supported even though those files placed the same
local term names in the generated domain namespace.

This profile is valid RDF/XML, but its Playground metadata requires knowledge of
the project vocabulary. It is intended for lossless editor round trips rather
than as a standards-neutral interchange contract.

### Standards-oriented OWL + SHACL

The **standards-oriented OWL + SHACL** profile omits Playground-only
presentation and binding metadata. It retains only the minimal Playground
annotations needed to identify a generated subset and record source
provenance. It represents the supported domain model with standard
vocabularies:

| Model feature | Representation |
| --- | --- |
| Entities and taxonomy | `owl:Class` and `rdfs:subClassOf` |
| Entity properties | `owl:DatatypeProperty` with XSD ranges |
| Relationships | Distinct `owl:ObjectProperty` IRIs with domain and range |
| Property order | `sh:order` |
| Enum constraints | `sh:in` with an RDF list of typed string literals |
| Identifier properties | `owl:hasKey`, plus `sh:minCount 1` and `sh:maxCount 1` |
| Relationship cardinality | Forward and inverse SHACL property shapes using `sh:maxCount` |
| Relationship attributes | An association class derived from `rdf:Statement`, with typed properties |
| Source provenance | `dcterms:source` plus explicit Playground source-version and source-import annotations |

Relationship participation is treated as optional because the visual model does
not currently store optionality. The exporter therefore does not invent a
relationship `sh:minCount`. A one-to-many relationship constrains only the
inverse path to at most one source, while a many-to-one relationship constrains
the forward path to at most one target.

Relationships that share a display label remain separate properties when their
IDs, domains, or ranges differ. RDF labels do not establish semantic identity,
and multiple `rdfs:domain` or `rdfs:range` statements would be conjunctive
rather than a union.

Relationship attributes use a first-class association model because RDF/XML
cannot serialize RDF-star quoted triples. The generated association class is a
subclass of `rdf:Statement`, identifies the related predicate with
`dcterms:relation`, and constrains its subject, predicate, and object through OWL
restrictions.

### Generated-profile import behavior and limits

The importer understands the generated OWL, SHACL order, enum lists,
`owl:hasKey`, cardinality shapes, and association classes. Statement order may
change in a triplestore without changing the reconstructed property order. It
also accepts equivalent RDF/XML that references RDF lists and inverse SHACL
paths through blank nodes.

Both generated profiles mint a base IRI from the ontology name and retain the
ontology label and description. They are for Playground-authored documents,
not for replacing an imported source graph.

The standards-oriented profile intentionally omits icons, colors, units, data
bindings, and other editor-only values that have no selected standards mapping.
Use the round-trip profile when those values must be preserved. Neither
generated profile substitutes for the complete source-backed export path.
