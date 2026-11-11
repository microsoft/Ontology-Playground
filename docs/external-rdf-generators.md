# Generating Playground-Compatible RDF from External Tools

This guide describes the **current supported RDF/XML import subset** in
[`parseRDF()`](../src/lib/rdf/parser.ts), for schema generators and data
pipelines targeting **Import / Export**, the catalogue, or the
[embeddable widget](embed-guide.md). It is not a general RDF/OWL conformance
contract. For hand-authored models, see the [authoring guide](authoring-guide.md).
For generated output contracts, see [RDF export profiles](rdf-export-profiles.md).

## Source artifacts, editable models, and generated subsets

Keep these distinct:

1. **Original source artifact:** catalogue ingestion preserves the reviewed
   source bytes separately, at a content-addressed URL verified by SHA-256.
   Unsupported triples and source-only SHACL remain in that artifact. Retain
   your own original file for standalone imports; `parseRDF()` does not return
   a complete source dataset.
2. **Supported visual model:** the parser extracts entities, properties,
   relationships, selected constraints, bindings, and source metadata. A graph
   overview is a further display projection of this model, not the source
   ontology and not evidence that unsupported statements were imported.
3. **Generated RDF subset:** the round-trip profile preserves supported editor
   values; the standards-oriented OWL + SHACL profile intentionally omits
   editor-only values. Neither reconstructs arbitrary source triples.

This is the existing source-preservation and generated-profile behavior
(#154/#155), **not full RDF dataset preservation**. A future full-dataset plan
would require a separate implementation: arbitrary triples, blank-node
structures, named graphs, and unsupported axioms are not currently retained
in an editable dataset. This guide adds no runtime capabilities. Recorded
`owl:imports` are never fetched; source SHACL is not executed by a validation
engine.

## Document shape and declarations

Emit one well-formed RDF/XML document with an `rdf:RDF` root, the standard
RDF/RDFS/OWL namespaces, and **absolute IRIs** in `rdf:about` and
`rdf:resource`. The parser reads these attribute strings directly; do not rely
on `xml:base` to resolve relative references. Turtle, JSON-LD, and named-graph
dataset syntaxes are not supported by this importer.

| Declaration | Supported model concept |
| --- | --- |
| `owl:Ontology` | Name, description, and selected source metadata |
| `owl:Class` | Entity type |
| `owl:DatatypeProperty` | Entity property or relationship attribute |
| `owl:ObjectProperty` | Association relationship |

Each of these may instead be an `rdf:Description` with an explicit
`rdf:type rdf:resource` naming the corresponding OWL type. Typed class
descriptions are supported (#96); they are not ignored. Arbitrary
`rdf:Description` nodes and instance data do not become entities.

Use this metadata namespace for new generators:

```text
https://microsoft.github.io/Ontology-Playground/ns/metadata#
```

The examples bind it to `ont:`. Legacy display/model annotations such as
`icon`, `color`, and `propertyType` are also matched by local name, so older
files using their domain namespace still import. This fallback does not make
arbitrary RDF predicates meaningful. Generated-subset provenance annotations
use the declared metadata namespace.

The first ontology declaration supplies `rdfs:label` and `rdfs:comment`.
Without a label the name becomes `Imported Ontology`. Ontology IRI,
`owl:versionIRI`, `owl:versionInfo`, `dcterms:license` (IRI or literal), and
`owl:imports` IRIs are retained as source metadata. Generated subsets record
source identity/version/imports as provenance instead of claiming to be the
authoritative upstream ontology; see the export profiles guide.

## Entities and native subclass axioms

Classes require a nonempty `rdf:about`. Their entity ID is the IRI's fragment
(after the last `#`), otherwise its last `/` segment, with only the first
character lower-cased: `…/Sensor` → `sensor`. This is not slug normalization.
Colliding IDs receive numeric suffixes (`sensor-2`, etc.); avoid collisions
and empty local names for predictable generated models.

- `rdfs:label` supplies the display name (fallback: IRI local name).
- `rdfs:comment` supplies the description (fallback: empty).
- `ont:icon` and `ont:color` supply display values (defaults: `📦`, `#0078D4`).

**Emit real `rdfs:subClassOf` axioms for taxonomy** (#102):

```xml
<owl:Class rdf:about="https://example.org/model/Sensor">
    <rdfs:subClassOf rdf:resource="https://example.org/model/Equipment"/>
</owl:Class>
```

Direct resource references between imported classes become edges named
`subClassOf`, with `kind: 'subclass'`, directed from subclass to superclass.
Their visual cardinality is `many-to-one`; it is not an OWL cardinality
restriction. Duplicate pairs, self-references, and references to classes not
imported as entities are skipped. Multiple internal superclasses are supported.
Nested restrictions and anonymous superclass expressions are not interpreted
as taxonomy edges.

Both export profiles serialize these edges back as `rdfs:subClassOf`;
Fabric relationship exports omit them. **Do not replace subclass axioms with
an `owl:ObjectProperty` labelled “is a” or “subClassOf”.** A label does not
make an association into an inheritance axiom.

## Entity properties

An `owl:DatatypeProperty` needs a nonempty `rdf:about` and a direct
`rdfs:domain rdf:resource` exactly matching an imported class IRI. Missing
or unknown domains cause ordinary entity properties to be skipped. Emit a
single domain and range; the parser does not implement general multi-domain
or multi-range OWL semantics.

- Name: `rdfs:label`, falling back to the property IRI's local name.
- Description: a direct comment other than the identifier marker below.
- Type: valid `ont:propertyType` first, then a supported SHACL enum, then
  the range's local name, otherwise `string`.

| Range local name | Model type |
| --- | --- |
| `string` | `string` |
| `integer`, `int`, `long` | `integer` |
| `decimal`, `float` | `decimal` |
| `double` | `double` |
| `date` | `date` |
| `dateTime` | `datetime` |
| `boolean` | `boolean` |

Use XSD IRIs for these ranges. Valid `ont:propertyType` values are `string`,
`integer`, `decimal`, `double`, `date`, `datetime`, `boolean`, and `enum`;
invalid overrides fall through to inference.

Optional model annotations:

- `ont:isIdentifier` with text exactly `true`, or a direct comment matching
  `identifier property` (case-insensitive, with surrounding whitespace allowed).
  Supported `owl:hasKey` collections also mark individual properties as
  identifiers; this does not provide a general composite-key constraint model.
- `ont:unit` for a display unit.
- `ont:enumValues` for comma-separated enum values; values are split without
  trimming or an escaping convention. Use `ont:propertyType` = `enum` with this
  legacy annotation. Supported SHACL enum lists take precedence over it.

## Association relationships and attributes

An `owl:ObjectProperty` needs a nonempty `rdf:about`. Its relationship ID is
the IRI local name, made unique against entity and relationship IDs with
numeric suffixes. Its name and description come from label and comment.

Prefer exact class IRIs in `rdfs:domain` and `rdfs:range`: the parser uses
the corresponding allocated entity IDs. Optional `ont:fromEntityId` and
`ont:toEntityId` override these endpoints, with their first character
lower-cased. Omit overrides unless you know the allocated IDs.

**Validate endpoint membership yourself.** Empty endpoints are skipped, but a
nonempty unknown domain/range can fall back to a local-name ID, and explicit
IDs are not checked against imported entities by `parseRDF()`. A successful
parse alone is not proof of a valid graph.

`ont:cardinality` accepts `one-to-one`, `one-to-many`, `many-to-one`, or
`many-to-many`. A valid annotation takes precedence over supported SHACL
cardinality shapes; absent either, the default is `one-to-many`.

For legacy relationship attributes, emit a datatype property with
`ont:relationshipAttributeOf` naming the relationship's **source IRI local
name** (before any ID suffix), plus `ont:attributeType` for its type. Without
`attributeType`, ordinary type inference applies. This routes the property to
the relationship rather than an entity; it does not require an entity domain.
Use unique source local names to avoid ambiguous attribute attachment.

The importer also recognizes the exporter's standards-oriented association
class pattern: a class subclassing `rdf:Statement`, related to a declared
object property through `dcterms:relation`, with datatype properties whose
domain is that association class. It becomes relationship attributes, not an
extra entity. This is a selected pattern, not arbitrary reification support.

## Other supported model metadata and limits

- Typed `sh:PropertyShape` declarations supply `sh:order`, `sh:in` literal
  lists, and forward/inverse `sh:maxCount 1` cardinality information.
  Both inline inverse paths and blank-node references are supported. Refer to
  the serializer and its round-trip tests for the exact generated pattern;
  arbitrary SHACL constraints are not imported or executed.
- A local-name `DataBinding` element can carry `boundEntityId`, `source`,
  `table`, and repeated `columnMapping` texts in `property=column` form.
  These are editor metadata, not live data connections.
- There is no OWL reasoning, import resolution, arbitrary instance graph
  editing, or preservation of unsupported expressions in the visual model.
  Selected list parsing is not general blank-node graph preservation.

## Minimal complete example

This schema-only example combines both class declaration forms, native
taxonomy, an entity property, an association, and a relationship attribute.
It contains no instance records or personal data.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF
    xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
    xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
    xmlns:owl="http://www.w3.org/2002/07/owl#"
    xmlns:xsd="http://www.w3.org/2001/XMLSchema#"
    xmlns:ont="https://microsoft.github.io/Ontology-Playground/ns/metadata#">

    <owl:Ontology rdf:about="https://example.org/model/">
        <rdfs:label>Equipment Model</rdfs:label>
        <rdfs:comment>Equipment taxonomy and installation sites.</rdfs:comment>
    </owl:Ontology>

    <owl:Class rdf:about="https://example.org/model/Equipment">
        <rdfs:label>Equipment</rdfs:label>
    </owl:Class>
    <rdf:Description rdf:about="https://example.org/model/Sensor">
        <rdf:type rdf:resource="http://www.w3.org/2002/07/owl#Class"/>
        <rdfs:label>Sensor</rdfs:label>
        <rdfs:subClassOf rdf:resource="https://example.org/model/Equipment"/>
    </rdf:Description>
    <owl:Class rdf:about="https://example.org/model/Site">
        <rdfs:label>Site</rdfs:label>
    </owl:Class>

    <owl:DatatypeProperty rdf:about="https://example.org/model/equipment_code">
        <rdfs:label>equipmentCode</rdfs:label>
        <rdfs:domain rdf:resource="https://example.org/model/Equipment"/>
        <rdfs:range rdf:resource="http://www.w3.org/2001/XMLSchema#string"/>
        <ont:isIdentifier>true</ont:isIdentifier>
    </owl:DatatypeProperty>

    <owl:ObjectProperty rdf:about="https://example.org/model/installed_at">
        <rdfs:label>installed at</rdfs:label>
        <rdfs:domain rdf:resource="https://example.org/model/Equipment"/>
        <rdfs:range rdf:resource="https://example.org/model/Site"/>
        <ont:cardinality>many-to-one</ont:cardinality>
    </owl:ObjectProperty>
    <owl:DatatypeProperty rdf:about="https://example.org/model/installation_date">
        <rdfs:label>installationDate</rdfs:label>
        <ont:relationshipAttributeOf>installed_at</ont:relationshipAttributeOf>
        <ont:attributeType>date</ont:attributeType>
    </owl:DatatypeProperty>
</rdf:RDF>
```

Expected import: three entities (`equipment`, `sensor`, `site`), one
`equipmentCode` identifier on Equipment, one `installed_at` association with
a date attribute, and one Sensor → Equipment subclass edge. Subclass
properties are not materialized onto Sensor by inference.

## Verification workflow

- Escape text and attribute values as XML; malformed XML fails import. Avoid
  DTDs, entities, executable content, and external resource dependencies.
- Parse and inspect the returned `{ ontology, bindings }`. Check entity and
  relationship counts, allocated IDs, endpoint membership, property types,
  and `kind: 'subclass'` explicitly.
- Run `npm run validate -- --profile external path/to/model.rdf` for
  standalone external-source validation, or `--profile authored` for authored
  model requirements. For paths inside `catalogue/`, omit `--profile`:
  the tier is selected automatically and an override is rejected.
  `npm run validate` checks discovered catalogue entries and built-in samples.
  These gates do not certify full OWL/SHACL semantics.
- Round-trip the supported model with `serializeToRDF()` and `parseRDF()`;
  compare model values, not raw XML bytes. Generated identities, statement
  order, and syntax may change; unsupported source statements will not return.
- Use the [catalogue contribution guide](contributing-ontology-from-design-to-github.md)
  for metadata, provenance, licensing, and tier requirements beyond parser
  acceptance. Keep the original source artifact alongside generated subsets.
