# Full Fabric IQ Ontology Format — Gap Analysis & Implementation Plan

> This document maps every feature of the **Microsoft Fabric IQ Ontology
> (preview)** format against the Playground's current data model, identifies
> gaps, and proposes the work needed to reach full parity.
>
> Reference docs:
> - [What is ontology (preview)?](https://learn.microsoft.com/fabric/iq/ontology/overview)
> - [Entity type creation](https://learn.microsoft.com/fabric/iq/ontology/how-to-create-entity-types)
> - [Data binding](https://learn.microsoft.com/fabric/iq/ontology/how-to-bind-data)
> - [Relationship types](https://learn.microsoft.com/fabric/iq/ontology/how-to-create-relationship-types)
> - [Preview experience](https://learn.microsoft.com/fabric/iq/ontology/how-to-use-preview-experience)
> - [Ontology glossary](https://learn.microsoft.com/fabric/iq/ontology/resources-glossary)
> - [Generate from semantic model](https://learn.microsoft.com/fabric/iq/ontology/concepts-generate)

---

## Current state vs. Fabric IQ — Feature matrix

| Fabric IQ Concept | Current Playground Support | Gap |
|-|-|-|
| **Entity type** (name, description) | ✅ Full | — |
| **Entity type name constraints** (1–26 chars, alphanumeric + hyphens/underscores) | ❌ No validation | Need validation |
| **Entity type key** (composite, from one or more string/integer properties) | ⚠️ Partial — single `isIdentifier` boolean per property | Need composite key model |
| **Instance display name** (a property chosen as the friendly label) | ❌ Not modelled | New field on EntityType |
| **Property — data types** | ⚠️ Partial — supports `string`, `integer`, `decimal`, `date`, `datetime`, `boolean`, `enum` | Missing `double`, `long`/`bigint`, `guid`, `time` |
| **Property — property type (static vs. time series)** | ❌ All properties are implicitly static | Need `propertyType: 'static' \| 'timeseries'` |
| **Property — name constraints** (1–26 chars, unique across all entity types for the same data type) | ❌ No validation | Need cross-entity uniqueness check |
| **Property — semantic annotations** (units, metadata attributes) | ⚠️ Partial — `unit` field exists, no general metadata | Consider metadata map |
| **Data binding — static** (one per entity type, maps properties to lakehouse table columns) | ⚠️ Partial — `DataBinding` exists with `source`, `table`, `columnMappings` | Missing binding type flag, key mapping |
| **Data binding — time series** (multiple per entity type, timestamp column, eventhouse support) | ❌ Not supported | Need time-series binding model |
| **Data binding — source types** (OneLake lakehouse, Eventhouse, Power BI semantic model) | ⚠️ Hardcoded `source: string` | Need structured source type enum |
| **Relationship type** (name, source entity, target entity) | ✅ Full | — |
| **Relationship type — data binding** (link table with source/target key columns) | ❌ Not modelled | New `RelationshipBinding` type |
| **Relationship type — cardinality** | ✅ Full (`one-to-one`, `one-to-many`, `many-to-one`, `many-to-many`) | — |
| **Relationship type — attributes** | ✅ Supported (`RelationshipAttribute[]`) | — |
| **Relationship type — source ≠ target constraint** | ❌ No validation | Need validation |
| **Ontology graph** (auto-generated instance graph via Fabric Graph) | ❌ Out of scope for static site | Informational only |
| **NL2Ontology querying** | ⚠️ Partial — NL Query Playground exists but is demo-only | Could enhance |
| **Versioning** | ❌ Not supported (Fabric IQ also doesn't support this yet) | Deferred |
| **Generate from semantic model** | ❌ No import from Power BI semantic models | Could add PBIX/TMDL parser |
| **Governance (rules, constraints, data quality checks)** | ❌ Not modelled | Need constraint model |

---

## 1. Entity Type Key — Composite Key Model

Fabric IQ supports **composite entity type keys** built from one or more
string/integer properties. The current model uses a simple `isIdentifier`
boolean on each property, with no concept of a composite key.

### 1.1 Extend `EntityType` with a `key` field
- [ ] Add `key?: string[]` to `EntityType` — an ordered list of property
  names that together form the entity type's unique key
- [ ] Keep `isIdentifier` on `Property` for backward compatibility, but
  derive it from `key` when present
- [x] Only `string` and `integer` properties may participate in a key
  (validate this)

### 1.2 Update the designer UI
- [ ] Replace the per-property "Identifier" checkbox with a dedicated
  **Entity Type Key** section in the entity configuration panel
- [ ] Allow selecting one or more properties as key components (drag to
  reorder)
- [ ] Show a validation error if no key is defined or if a key property
  has a non-string/non-integer type

### 1.3 Update RDF serializer/parser
- [ ] Serialize composite keys as a custom OWL annotation (e.g.,
  `ont:entityTypeKey` with an ordered list of property URIs)
- [ ] Parse composite keys back from RDF, falling back to `isIdentifier`
  for legacy files

### 1.4 Update tests
- [ ] Round-trip tests for composite keys
- [ ] Validation tests for invalid key configurations (wrong types,
  empty key)

---

## 2. Instance Display Name

Fabric IQ lets you pick a property as the **instance display name** — the
friendly label shown in downstream experiences.

### 2.1 Extend `EntityType` with `displayNameProperty`
- [ ] Add `displayNameProperty?: string` to `EntityType` — the name of the
  property used as the instance label

### 2.2 Update the designer UI
- [ ] Add an "Instance Display Name" dropdown in the entity configuration
  panel, populated with the entity's properties

### 2.3 Update graph visualization
- [ ] If `displayNameProperty` is set, use it as the node label in the
  Cytoscape graph (instead of the entity type name)
- [ ] Show the display name property in the inspector panel

### 2.4 Update RDF serializer/parser
- [ ] Serialize as a custom annotation `ont:displayNameProperty`
- [ ] Parse back from RDF

---

## 3. Property Types — Static vs. Time Series

Fabric IQ distinguishes between **static** properties (fixed attributes like
an ID or location) and **time series** properties (values that change over
time, like temperature or pressure, with a timestamp column).

### 3.1 Extend `Property` with `propertyType`
- [ ] Add `propertyType: 'static' | 'timeseries'` to the `Property`
  interface (default `'static'` for backward compatibility)

### 3.2 Update the designer UI
- [ ] Add a "Property Type" toggle (Static / Time Series) when adding or
  editing a property
- [ ] Time series properties should show an info tooltip explaining they
  require a timestamp column in the data binding

### 3.3 Update the inspector panel
- [ ] Show a badge or icon distinguishing static vs. time series properties

### 3.4 Update RDF serializer/parser
- [ ] Serialize `propertyType` as a custom annotation
  `ont:propertyType` (`"static"` or `"timeseries"`)
- [ ] Parse back, defaulting to `"static"` if absent

### 3.5 Update graph/embed visualization
- [ ] Time series properties could be rendered with a small clock icon or
  different styling in the inspector

---

## 4. Additional Property Data Types

Fabric IQ supports data types that map to the underlying Fabric Data
Warehouse types. The current Playground supports: `string`, `integer`,
`decimal`, `date`, `datetime`, `boolean`, `enum`.

### 4.1 Add missing types to `Property.type`
- [x] Add `'double'` — floating-point (maps to `xsd:double`)
- [ ] Add `'long'` — 64-bit integer (maps to `xsd:long`)
- [ ] Add `'guid'` — globally unique identifier (maps to a custom type or
  `xsd:string` with format annotation)
- [ ] Add `'time'` — time of day without date (maps to `xsd:time`)

### 4.2 Update designer property type dropdown
- [ ] Add the new types to the dropdown with appropriate labels
- [ ] Group types logically: Text (string, guid) → Numeric (integer, long,
  decimal, double) → Date/Time (date, time, datetime) → Other (boolean,
  enum)

### 4.3 Update RDF serializer/parser
- [ ] Map new types to/from XSD types in `XSD_TYPE_MAP`
- [ ] Add round-trip tests for each new type

### 4.4 Update query playground
- [ ] Ensure the NL query engine recognizes the new types for filter
  operations

---

## 5. Data Binding — Full Model

The current `DataBinding` interface is a simple mapping (`entityTypeId`,
`source`, `table`, `columnMappings`). Fabric IQ has a richer model with
binding types, structured source references, key mapping, and support
for multiple bindings per entity type.

### 5.1 Restructure `DataBinding` interface
- [ ] Add `bindingType: 'static' | 'timeseries'`
- [ ] Add `timestampColumn?: string` (required for time series bindings)
- [ ] Add `keyMappings?: Record<string, string>` — maps entity key
  properties to source columns (separate from regular `columnMappings`)
- [ ] Change `source` from a free string to a structured type:
  ```ts
  interface DataSource {
    type: 'onelake' | 'eventhouse' | 'semantic-model';
    workspace?: string;
    name: string;    // lakehouse name, eventhouse name, or semantic model name
  }
  ```
- [ ] Support multiple bindings per entity type: one static + N time series

### 5.2 Update the binding editor UI
- [ ] Redesign the data binding panel in the designer with:
  - Source type selector (OneLake / Eventhouse / Semantic Model)
  - Binding type selector (Static / Time Series)
  - Timestamp column selector (for time series)
  - Key mapping section (for linking key properties to source columns)
  - Column mapping section (for regular properties)
- [ ] Show a summary of all bindings on the entity type's Bindings tab

### 5.3 Validation rules
- [ ] Static binding: max one per entity type
- [ ] Time series binding: must have at least one static binding first
- [ ] Time series binding: `timestampColumn` is required
- [ ] Key properties in time series bindings must match static binding keys

### 5.4 Update RDF serializer/parser
- [ ] Serialize bindings as structured RDF comments or custom annotations
  (current approach uses XML comments)
- [ ] Parse back the richer binding structure

### 5.5 Update tests
- [ ] Round-trip tests for static and time series bindings
- [ ] Validation tests for binding constraints

---

## 6. Relationship Type — Data Binding

Fabric IQ relationships have their own **data bindings** that specify a
linking table and the source columns that identify the source and target
entity instances. The current model has no concept of relationship-level
data binding.

### 6.1 Add `RelationshipBinding` type
- [ ] Create a new interface:
  ```ts
  interface RelationshipBinding {
    source: DataSource;
    table: string;
    sourceEntityColumn: string;  // column matching source entity type key
    targetEntityColumn: string;  // column matching target entity type key
  }
  ```
- [ ] Add `binding?: RelationshipBinding` to the `Relationship` interface

### 6.2 Update the designer UI
- [ ] Add a "Bind Data" section in the relationship configuration panel
- [ ] Source data selector (workspace → lakehouse → table)
- [ ] Column selectors for source entity key and target entity key
- [ ] Show binding status on the relationship edge in the graph
  (bound vs. unbound)

### 6.3 Update RDF serializer/parser
- [ ] Serialize relationship bindings as custom annotations
- [ ] Parse back from RDF

### 6.4 Update tests
- [ ] Round-trip and validation tests

---

## 7. Entity Type Name & Property Name Validation

Fabric IQ enforces strict naming rules that the Playground currently ignores.

### 7.1 Entity type name rules
- [x] 1–26 characters
- [x] Only alphanumeric characters, hyphens (`-`), and underscores (`_`)
- [x] Must start and end with an alphanumeric character
- [x] Validate in the designer on input (inline error)
- [ ] Validate in the RDF parser on import (warning, not blocking)

### 7.2 Property name rules
- [x] 1–26 characters
- [x] Same character rules as entity types
- [x] Property names must be **unique across all entity types** if they share
  the same data type (e.g., two entities can both have `string ID`, but
  one entity can't have `string ID` while another has `integer ID`)
- [x] Validate in the designer (cross-entity check on save)
- [x] Show a clear error message explaining the cross-entity constraint

### 7.3 Relationship type constraints
- [x] Source and target entity types must be **distinct** (no self-referencing
  relationships in Fabric IQ)
- [x] Validate in the designer when creating a relationship
- [ ] Show a warning when importing an RDF file with self-referencing
  relationships

---

## 8. Governance: Constraints & Data Quality Rules

Fabric IQ's data binding layer supports schema evolution rules and data
quality checks (nullability, ranges, uniqueness). This is the most advanced
gap and could be implemented progressively.

### 8.1 Define a constraint model
- [ ] Create a `Constraint` interface:
  ```ts
  interface PropertyConstraint {
    type: 'required' | 'unique' | 'range' | 'pattern' | 'enum';
    property: string;
    config?: {
      min?: number;
      max?: number;
      pattern?: string;     // regex for pattern constraints
      values?: string[];    // for enum constraints
    };
  }
  ```
- [ ] Add `constraints?: PropertyConstraint[]` to `EntityType`

### 8.2 Designer UI for constraints
- [ ] Add a "Constraints" section in the entity configuration panel
- [ ] Allow adding required, unique, range, and pattern constraints per
  property
- [ ] Show constraint badges on properties in the form

### 8.3 Validation engine
- [ ] Create a `validateOntology()` function that checks all constraints
  are internally consistent (e.g., range constraint on a string property
  is invalid)
- [ ] Run validation before export and on import (warnings, not blocking)

### 8.4 RDF serializer/parser
- [ ] Serialize constraints as OWL restrictions or custom annotations
- [ ] Parse back from RDF

---

## 9. Enhanced Data Source Types in Data Bindings

### 9.1 OneLake (lakehouse) source
- [ ] Model workspace + lakehouse + table path
- [ ] Display the 3-part path in the binding UI
- [ ] Validate that only managed tables are referenced (informational
  warning in the UI)

### 9.2 Eventhouse source
- [ ] Model workspace + eventhouse + table/stream
- [ ] Only valid for time series bindings
- [ ] Eventhouse icon/badge in the binding UI

### 9.3 Power BI semantic model source
- [ ] Model workspace + semantic model + table
- [ ] This source type is used when generating ontologies from semantic
  models

### 9.4 UI source selector
- [ ] Replace the free-text source field in the binding editor with a
  structured form: Source Type → Workspace → Item → Table

---

## 10. Generate Ontology from Semantic Model

Fabric IQ can generate an ontology from an existing Power BI semantic model.
This is valuable for the Playground as a learning tool.

### 10.1 TMDL / PBIX import
- [ ] Research TMDL (Tabular Model Definition Language) file format
- [ ] Build a parser that extracts tables → entity types, columns →
  properties, and relationships → relationship types
- [ ] Wire into the import flow (accept `.tmdl` or `.bim` files)

### 10.2 Import wizard UI
- [ ] Step 1: Upload semantic model file
- [ ] Step 2: Review generated entity types and properties (allow
  edits before confirming)
- [ ] Step 3: Review generated relationship types
- [ ] Step 4: Open in designer for further refinement

---

## 11. Ontology Graph & Query Preview

Fabric IQ builds an instance graph from bound data. While the Playground
can't connect to real Fabric data, it can improve its visualization to
better represent what the actual Fabric IQ experience looks like.

### 11.1 Instance graph preview
- [ ] Show sample entity instances as nodes (populated from
  `EntityInstance[]` in the data model)
- [ ] Show relationship instances as edges between instance nodes
- [ ] Toggle between "Schema" view (entity types) and "Instance" view
  (entity instances)

### 11.2 Graph query builder
- [ ] Add a lightweight query builder that lets users filter instances
  by property values
- [ ] Support traversal: "Show me all orders for customer X"
- [ ] Results displayed in graph view, table view, or card view
  (matching Fabric IQ's 3 view modes)

### 11.3 Enhance NL2Ontology playground
- [ ] Improve the existing NL query playground to generate more
  realistic structured queries
- [ ] Show how the ontology layer translates NL questions into
  entity traversals

---

## 12. RDF Serialization — Fabric IQ Alignment

Ensure the RDF/XML output matches what Fabric IQ expects/produces as
closely as possible.

### 12.1 Audit current RDF output
- [ ] Compare the RDF produced by the Playground serializer with any
  available Fabric IQ RDF exports or samples
- [ ] Document differences in namespace conventions, annotation
  properties, and class/property naming

### 12.2 Align custom annotations
- [ ] Use annotations that align with Fabric IQ conventions (if
  documented) for: entity type key, display name, property type,
  constraints, data bindings
- [ ] Add a `fabricIqCompatible` flag to the serializer that outputs
  Fabric-aligned annotations (vs. the current custom `ont:` prefix)

### 12.3 Import from Fabric IQ export
- [ ] If Fabric IQ exports RDF in a specific format, ensure the parser
  can round-trip it
- [ ] Add test cases with sample Fabric IQ exports once available

---

## Implementation priority

| Phase | Items | Rationale |
|-------|-------|-----------|
| **Phase A** | §1 (Composite keys), §2 (Display name), §7 (Name validation) | Core model correctness — these are fundamental to Fabric IQ compatibility |
| **Phase B** | §3 (Static vs. time series), §4 (Data types), §12 (RDF alignment) | Property model parity — align the property system with Fabric IQ |
| **Phase C** | §5 (Data binding), §6 (Relationship binding), §9 (Source types) | Data binding — the richest gap, requires UI redesign |
| **Phase D** | §8 (Constraints), §10 (Semantic model import), §11 (Graph/query) | Advanced features — governance, import, and visualization |

---

## Notes

- **Fabric IQ is in preview** — the format may evolve. This document is based
  on the February 2026 documentation. The implementation should be flexible
  enough to absorb schema changes.
- **Backward compatibility** — all changes must preserve round-trip fidelity
  for existing catalogue ontologies. New fields should be optional with
  sensible defaults.
- **Versioning not needed yet** — Fabric IQ's FAQ confirms versioning is not
  currently available, so we skip it.
- **Self-referencing relationships** — Fabric IQ requires source ≠ target.
  The Playground currently allows self-references. We should warn but not
  block, since self-references are valid in general OWL ontologies.
