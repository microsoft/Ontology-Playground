# Generating Playground-Compatible RDF from External Tools

This guide documents the RDF/XML profile the Playground's importer
([`src/lib/rdf/parser.ts`](../src/lib/rdf/parser.ts)) understands, so that
external tools — schema generators, knowledge-graph frameworks, data
pipelines — can emit ontologies that load directly via **Import / Export**,
the catalogue, or the [embeddable widget](embed-guide.md).

If you are authoring ontologies by hand, see the
[Ontology Authoring Guide](authoring-guide.md) instead. This page is for
programmatic generation.

## Document shape

The importer reads a single RDF/XML document:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF
    xml:base="http://example.org/ontology/my-ontology/"
    xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
    xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
    xmlns:owl="http://www.w3.org/2002/07/owl#"
    xmlns:xsd="http://www.w3.org/2001/XMLSchema#"
    xmlns:ont="http://example.org/ontology/my-ontology/">

    <owl:Ontology rdf:about="http://example.org/ontology/my-ontology/">
        <rdfs:label>My Ontology</rdfs:label>
        <rdfs:comment>One-sentence description.</rdfs:comment>
    </owl:Ontology>

    <!-- classes, datatype properties, object properties … -->

</rdf:RDF>
```

Three OWL constructs map onto Playground concepts:

| RDF/XML element | Playground concept |
|---|---|
| `owl:Class` | Entity type (a node in the graph) |
| `owl:DatatypeProperty` | Property of an entity type |
| `owl:ObjectProperty` | Relationship (an edge between two entity types) |

The `ont:` prefix holds Playground-specific display annotations. Bind it to
your ontology's own base URI — the parser matches these elements **by local
name**, regardless of namespace, so any binding works. Standard RDF
consumers can ignore them.

## Entity types — `owl:Class`

```xml
<owl:Class rdf:about="http://example.org/ontology/my-ontology/Customer">
    <rdfs:label>Customer</rdfs:label>
    <rdfs:comment>A person who places orders.</rdfs:comment>
    <ont:icon>👤</ont:icon>
    <ont:color>#0078D4</ont:color>
</owl:Class>
```

- The **entity id** is derived from the URI: the local name (last `#` or `/`
  segment) with its first letter lower-cased. `…/Customer` → `customer`.
  Relationships reference entities by this id.
- `rdfs:label` is the display name (falls back to the local name).
- `ont:icon` is an emoji (default `📦`); `ont:color` a hex color
  (default `#0078D4`).
- `rdfs:subClassOf` is **not interpreted**. If you want an inheritance edge
  in the graph, emit an explicit `owl:ObjectProperty` (e.g. labelled
  *is a*) instead.

## Properties — `owl:DatatypeProperty`

```xml
<owl:DatatypeProperty rdf:about="http://example.org/ontology/my-ontology/customer_email">
    <rdfs:label>email</rdfs:label>
    <rdfs:domain rdf:resource="http://example.org/ontology/my-ontology/Customer"/>
    <rdfs:range rdf:resource="http://www.w3.org/2001/XMLSchema#string"/>
    <rdfs:comment>Primary contact address.</rdfs:comment>
    <ont:propertyType>string</ont:propertyType>
</owl:DatatypeProperty>
```

- `rdfs:domain` must **exactly match** the class URI — that is how the
  property is attached to its entity. Properties whose domain resolves to no
  class are dropped silently.
- The property type is taken from `ont:propertyType` when present, otherwise
  inferred from the XSD range. Valid types: `string`, `integer`, `decimal`,
  `double`, `date`, `datetime`, `boolean`, `enum`. Recognized XSD ranges:
  `string`, `integer`/`int`/`long`, `decimal`/`float`, `double`, `date`,
  `dateTime`, `boolean`. Anything else falls back to `string`.
- Optional annotations:
  - `<ont:isIdentifier>true</ont:isIdentifier>` — marks the identifier
    property (a comment of exactly `identifier property` also works).
  - `<ont:unit>kg</ont:unit>` — display unit.
  - `<ont:enumValues>Bronze,Silver,Gold</ont:enumValues>` — comma-separated
    values for `enum` properties.

## Relationships — `owl:ObjectProperty`

```xml
<owl:ObjectProperty rdf:about="http://example.org/ontology/my-ontology/customer_places_order">
    <rdfs:label>places</rdfs:label>
    <rdfs:domain rdf:resource="http://example.org/ontology/my-ontology/Customer"/>
    <rdfs:range rdf:resource="http://example.org/ontology/my-ontology/Order"/>
    <rdfs:comment>A customer places one or more orders.</rdfs:comment>
    <ont:cardinality>one-to-many</ont:cardinality>
    <ont:fromEntityId>customer</ont:fromEntityId>
    <ont:toEntityId>order</ont:toEntityId>
</owl:ObjectProperty>
```

- Endpoints come from `ont:fromEntityId` / `ont:toEntityId` when present,
  otherwise from the uncapitalized local names of `rdfs:domain` /
  `rdfs:range`. Emitting the explicit ids is recommended for generators.
- `ont:cardinality` is one of `one-to-one`, `one-to-many`, `many-to-one`,
  `many-to-many` (default `one-to-many`).
- Relationships whose source or target cannot be resolved are skipped —
  make sure both endpoint classes exist in the same document.
- A relationship can carry its own attributes: emit additional
  `owl:DatatypeProperty` elements with
  `<ont:relationshipAttributeOf>relationship_id</ont:relationshipAttributeOf>`
  (the relationship's URI local name) and an `<ont:attributeType>`.

## Practical tips for generators

- **Escape everything.** Labels and comments frequently contain `&`, `<`,
  and quotes; malformed XML fails the whole import.
- **Keep graphs class-level and modest.** The Playground is designed for
  conceptual models in the 3–20 entity range, not instance dumps.
- **Round-trip to verify.** Import your file, then export as RDF and diff —
  the exporter ([`src/lib/rdf/serializer.ts`](../src/lib/rdf/serializer.ts))
  writes this same profile and is the reference implementation.
- **Validate in CI.** Catalogue entries are checked by `npm run validate`;
  for external files, a headless parse with `parseRDF()` in a small vitest
  is the equivalent gate.

## Minimal complete example

A two-entity ontology that exercises every construct:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF
    xml:base="http://example.org/ontology/demo/"
    xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
    xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
    xmlns:owl="http://www.w3.org/2002/07/owl#"
    xmlns:xsd="http://www.w3.org/2001/XMLSchema#"
    xmlns:ont="http://example.org/ontology/demo/">

    <owl:Ontology rdf:about="http://example.org/ontology/demo/">
        <rdfs:label>Demo</rdfs:label>
        <rdfs:comment>Two entities and one relationship.</rdfs:comment>
    </owl:Ontology>

    <owl:Class rdf:about="http://example.org/ontology/demo/Customer">
        <rdfs:label>Customer</rdfs:label>
        <ont:icon>👤</ont:icon>
        <ont:color>#0078D4</ont:color>
    </owl:Class>

    <owl:Class rdf:about="http://example.org/ontology/demo/Order">
        <rdfs:label>Order</rdfs:label>
        <ont:icon>🧾</ont:icon>
        <ont:color>#107C10</ont:color>
    </owl:Class>

    <owl:DatatypeProperty rdf:about="http://example.org/ontology/demo/customer_email">
        <rdfs:label>email</rdfs:label>
        <rdfs:domain rdf:resource="http://example.org/ontology/demo/Customer"/>
        <rdfs:range rdf:resource="http://www.w3.org/2001/XMLSchema#string"/>
        <ont:isIdentifier>true</ont:isIdentifier>
        <ont:propertyType>string</ont:propertyType>
    </owl:DatatypeProperty>

    <owl:ObjectProperty rdf:about="http://example.org/ontology/demo/customer_places_order">
        <rdfs:label>places</rdfs:label>
        <rdfs:domain rdf:resource="http://example.org/ontology/demo/Customer"/>
        <rdfs:range rdf:resource="http://example.org/ontology/demo/Order"/>
        <ont:cardinality>one-to-many</ont:cardinality>
        <ont:fromEntityId>customer</ont:fromEntityId>
        <ont:toEntityId>order</ont:toEntityId>
    </owl:ObjectProperty>

</rdf:RDF>
```
