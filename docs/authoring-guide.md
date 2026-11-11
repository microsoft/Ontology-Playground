# Ontology Authoring Guide

How to create an ontology that works well in Ontology Playground — from the
graph visualization and inspector to the natural-language query playground and
embeddable widget.

---

## Quick checklist

Before you submit, make sure your ontology has:

- [ ] A clear, human-readable **name** (e.g., "Healthcare System", not "hc_v2")
- [ ] A **description** that explains the domain in one sentence
- [ ] **3–8 entity types**, each with a name, description, icon, and color
- [ ] **At least one identifier property** per entity (marked `isIdentifier`)
- [ ] **Relationships** with verb-based names and cardinalities
- [ ] A **metadata.json** with name, description, category, and tags

---

## 1. Ontology structure

An ontology in this project has four parts:

```
Ontology
├── name            "Fourth Coffee"
├── description     "A coffee shop chain with suppliers, products, stores…"
├── entityTypes[]   The concepts in your domain
└── relationships[] How those concepts connect
```

### Entity types

Each entity type represents a real-world concept. Think of it as a table in a
database or a class in a UML diagram.

```
EntityType
├── id              "customer"          (URL-safe slug, unique within the ontology)
├── name            "Customer"          (human-readable, singular noun)
├── description     "A person who purchases coffee products"
├── icon            "👤"               (emoji)
├── color           "#0078D4"           (hex color for the graph node)
└── properties[]
    ├── { name: "customerId", type: "string", isIdentifier: true }
    ├── { name: "name",       type: "string" }
    ├── { name: "email",      type: "string" }
    └── { name: "loyaltyTier", type: "enum", values: ["Bronze","Silver","Gold"] }
```

### Relationships

Each relationship is a directional link between two entity types.

```
Relationship
├── id              "places"            (URL-safe slug, unique)
├── name            "places"            (a verb — "places", "contains", "teaches")
├── from            "customer"          (source entity ID)
├── to              "order"             (target entity ID)
├── cardinality     "one-to-many"       (one-to-one | one-to-many | many-to-one | many-to-many)
├── description     "A customer places one or more orders"
└── attributes[]    (optional — properties on the relationship itself)
    └── { name: "quantity", type: "integer" }
```

---

## 2. Field-by-field guide

Every field in the ontology is used somewhere in the app. Here's exactly
where, and what makes a good value.

### Entity fields

| Field | Used in | Best practice |
|-------|---------|---------------|
| `id` | Internal graph IDs, URL routing, query engine matching | Lowercase slug, no spaces: `customer`, `work-order` |
| `name` | Graph node labels, inspector, query suggestions, search | **Singular noun**, title case: "Customer", "Work Order" |
| `description` | Inspector panel, query results, embed inspector | One sentence explaining the concept. Starts with an article: "A person who…" |
| `icon` | Graph node labels, inspector header, query results | Single emoji that represents the concept: 👤 🛒 🏥 🏭 |
| `color` | Graph node background, inspector accent | Hex color. Use the Microsoft palette for consistency (see below) |
| `properties` | Inspector details, query suggestions, RDF output | 3–8 properties per entity. Mix types for interesting queries |

### Property fields

| Field | Used in | Best practice |
|-------|---------|---------------|
| `name` | Inspector property list, query suggestions, RDF output | camelCase, descriptive: `loyaltyTier`, not `lt` or `field3` |
| `type` | Inspector type badges, RDF XSD mapping | One of: `string`, `integer`, `decimal`, `date`, `datetime`, `boolean`, `enum` |
| `isIdentifier` | 🔑 badge in inspector, validation, RDF output | Exactly **one** property per entity must be the identifier |
| `description` | Inspector (if present) | Optional. Useful for non-obvious properties |
| `unit` | Inspector (if present) | Optional. E.g., `"USD"`, `"kg"`, `"minutes"` |
| `values` | Inspector enum display | Required when `type` is `enum`. Array of allowed values |

### Relationship fields

| Field | Used in | Best practice |
|-------|---------|---------------|
| `id` | Internal edge IDs, query engine matching | Lowercase slug: `places`, `sourced-from` |
| `name` | Graph edge labels, query results, inspector | **Active verb** describing the direction: "places", "teaches", "monitors" |
| `from` / `to` | Graph edge source/target | Must match existing entity `id` values |
| `cardinality` | Inspector, query results, RDF output | Think about real-world multiplicity. A customer places *many* orders → `one-to-many` |
| `description` | Inspector panel | One sentence: "A customer places one or more orders" |
| `attributes` | Inspector, RDF output | Optional. Use for properties that belong to the *relationship*, not the entities (e.g., `quantity` on an order→product link) |

---

## 3. How the query playground uses your ontology

The natural-language query playground generates suggestions and processes
queries based on your ontology's fields. Understanding this helps you write
ontologies that produce good query experiences.

### Auto-generated suggestions

The app creates up to 6 sample queries from your ontology:

| Pattern | Source | Example |
|---------|--------|---------|
| "Show me all **Xs**" | First entity's `name` (pluralized) | "Show me all customers" |
| "List all **Ys**" | Second entity's `name` | "List all orders" |
| "Show **X**s by **prop**" | Non-identifier string properties | "Show customers by loyaltyTier" |
| "How does **X** connect to **Y**?" | First relationship's `from`/`to` entities | "How does Customer connect to Order?" |

**Tip:** If your entity names are clean nouns and your properties have
descriptive names, the auto-suggestions will read naturally. If your entity
is named "tbl_cust", the suggestion becomes "Show me all tbl_custs" — not great.

### Query matching

When a user types a query, the engine matches against:

- **Entity names** — "show me all **customers**" → highlights the Customer entity
- **Property names** — "show customers by **loyaltyTier**" → highlights Customer
- **Relationship verbs** — "how does Customer **connect** to Order?" → highlights the relationship
- **Count queries** — "how many **orders**" → shows entity count
- **Conceptual queries** — "what is an entity type?" → works with any ontology

The better your names and descriptions, the richer the query results.

### What shows up in query results

When a user queries an entity, they see:

```
**Customer** 👤
A person who purchases coffee products from our stores

**Properties:**
• customerId (string) 🔑
• name (string)
• email (string)
• loyaltyTier (enum)
```

This is assembled from `entity.name`, `entity.icon`, `entity.description`, and
`entity.properties`. If any of these are empty, the result looks incomplete.

---

## 4. How the graph visualization uses your ontology

### Node appearance

Each entity becomes a circular node in the Cytoscape graph:

- **Label** = `icon` + `name` (e.g., "👤 Customer")
- **Background color** = `color`
- **Size** = uniform (60px), enlarged when selected

Use **distinct colors** so entities are easy to tell apart at a glance. The
official ontologies use this Microsoft-friendly palette:

| Color | Hex | Typical use |
|-------|-----|-------------|
| Blue | `#0078D4` | Primary entity (Customer, Patient) |
| Green | `#107C10` | Secondary entity (Product, Provider) |
| Orange | `#D83B01` | Action entity (Order, Appointment) |
| Purple | `#5C2D91` | Supporting entity (Store, Department) |
| Teal | `#008272` | Infrastructure (Machine, Sensor) |
| Cyan | `#00A9E0` | Financial (Account, Loan) |
| Yellow | `#FFB900` | Warning/special (QualityCheck) |
| Red | `#E81123` | Critical (Diagnosis, Prescription) |

### Edge appearance

Each relationship becomes a directed edge:

- **Label** = `name` (e.g., "places")
- **Arrow** points from `from` → `to`

**Tip:** Keep relationship names short (1–2 words). Long names overlap on the
graph. "sourcedFrom" is better than "is sourced from supplier".

### Layout

The graph uses the `fcose` force-directed layout. It works best with:

- **5–8 entities** — fewer looks sparse, more gets crowded
- **Connected graphs** — every entity should have at least one relationship
- **Reasonable density** — 1–2 relationships per entity on average

---

## 5. How the embed widget uses your ontology

The embeddable widget renders the same graph and inspector in a standalone
container. Everything mentioned above applies, plus:

- **Generated RDF tab** — the widget serializes the supported visual model as
  RDF/XML. For external catalogue standards, this is labelled as a subset and
  is not a replacement for the verified original source
- **Compact inspector** — the bottom overlay has limited space, so keep
  descriptions concise (one sentence, not a paragraph)
- **No search/filter** — the embed doesn't have the search bar, so users
  rely on clicking nodes. Make sure entity icons and colors are distinct

---

## 6. Metadata.json for the catalogue

Every catalogue ontology needs a `metadata.json` alongside the `.rdf` file:

```json
{
  "name": "Fourth Coffee",
  "description": "A sample ontology representing a coffee shop chain with suppliers, products, stores, customers, and orders.",
  "icon": "☕",
  "category": "retail",
  "tags": ["coffee", "supply-chain", "fabric-iq"],
  "author": "your-github-username"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `name` | Yes | Same as the ontology's `name` field |
| `description` | Yes | Short description for the gallery card |
| `category` | Yes | One of: `retail`, `healthcare`, `finance`, `manufacturing`, `education`, `food`, `media`, `events`, `technology`, `general`, `iq-lab`, `school`, `fibo` |
| `icon` | No | Emoji for the gallery card. Defaults to a generic icon |
| `tags` | No | Array of strings for filtering. Keep them lowercase |
| `author` | No | Your GitHub username. Shown in the gallery |
| `license` | External: yes | SPDX identifier or short license name shown in the gallery |
| `sourceUrl` | External: yes | HTTPS URL for the canonical upstream source |
| `version` | No | Upstream ontology version represented by this entry |

Community entries adapted from another open project should also provide
`license`, `sourceUrl`, and `version` when known. Original community entries
may omit them. The compiler rejects non-HTTPS source links.

### Tier-aware validation

Run `npm run validate` to validate built-in examples and every official,
community, and external catalogue entry. The catalogue compiler applies the
same tier selection and core checks:

- **Official and community** entries use the strict Designer profile, including
  identifier-property and Fabric naming requirements.
- **External** entries must have stable class and relationship identifiers,
  valid relationship endpoints, safe metadata, an HTTPS source URL, a license,
  valid UTF-8 RDF/XML, and remain within source and graph resource limits.
  Missing Designer identifiers and incompatible display labels are summarized
  as compatibility warnings instead of thousands of repeated errors.
- Validation rejects `DOCTYPE` and `ENTITY` declarations and does not fetch or
  dereference `owl:imports` or any other external resource.

### Original source versus the editable model

Catalogue compilation publishes two independent, content-addressed artifacts:

- the parsed graph payload used by the Playground; and
- the exact RDF bytes reviewed in the repository.

The gallery verifies the original artifact's SHA-256 and byte length before it
displays or downloads it. Ontology IRI, version IRI, version information,
license, imports, classes, object properties, and subclass edges are mapped
into the editable model. Imports remain inert identifiers and are never
dereferenced.

External ontologies can also contain SHACL rules or RDF constructs the visual
model does not support. Those bytes remain intact in the verified original but
are not executed, edited, or reproduced by generated RDF. Treat the graph,
Designer, generated export, and embed RDF view as a supported visual subset;
use the original download when complete source semantics are required.

Paths under `catalogue/` select their profile automatically:

```bash
npm run validate -- catalogue/external/brick-schema/brick/ontology.rdf
```

For a standalone external file, select the profile explicitly and place a
valid `metadata.json` beside it:

```bash
npm run validate -- --profile external path/to/ontology.rdf
```

---

## 7. Common mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| No identifier property | Validation fails, Fabric IQ can't resolve entities | Add `isIdentifier: true` to one property per entity |
| Generic entity names ("Item", "Thing") | Poor query suggestions and search results | Use domain-specific nouns ("Product", "Prescription") |
| Missing descriptions | Inspector and query results show blanks | Add a one-sentence description to every entity |
| Duplicate IDs | Build script rejects the ontology | Use unique slugs: `customer`, `order`, not `entity1`, `entity2` |
| No relationships | Graph shows disconnected nodes, no interesting queries | Add at least one relationship between entities |
| Noun-based relationship names ("ownership") | Reads oddly as a graph edge label | Use verbs: "owns", "places", "teaches" |
| Too many entities (>10) | Graph layout gets cluttered | Focus on 5–8 core concepts; split larger domains |
| Same color for all entities | Can't tell nodes apart in the graph | Assign distinct colors from the palette above |

---

## 8. Walkthrough: creating an ontology from scratch

Let's model a **Library System** step by step.

### Step 1: Identify your entities

Think about the core concepts in the domain:
- **Book** — a title in the catalogue
- **Author** — someone who writes books
- **Member** — a library patron
- **Loan** — a book checked out by a member
- **Branch** — a physical library location

### Step 2: Define properties

For each entity, list its attributes:

| Entity | Properties |
|--------|-----------|
| Book | `isbn` (string, 🔑), `title` (string), `genre` (enum), `pageCount` (integer), `publishedDate` (date) |
| Author | `authorId` (string, 🔑), `name` (string), `nationality` (string) |
| Member | `memberId` (string, 🔑), `name` (string), `email` (string), `memberSince` (date) |
| Loan | `loanId` (string, 🔑), `loanDate` (date), `dueDate` (date), `returned` (boolean) |
| Branch | `branchId` (string, 🔑), `name` (string), `city` (string), `capacity` (integer) |

### Step 3: Define relationships

How do these concepts connect?

| Relationship | From → To | Cardinality | Why |
|-------------|-----------|-------------|-----|
| `writtenBy` | Book → Author | many-to-one | Each book has one primary author |
| `borrows` | Member → Loan | one-to-many | A member can have many loans |
| `loanOf` | Loan → Book | many-to-one | Each loan is for one book |
| `locatedAt` | Book → Branch | many-to-one | A book copy belongs to a branch |
| `registeredAt` | Member → Branch | many-to-one | Members register at a branch |

### Step 4: Pick icons and colors

| Entity | Icon | Color |
|--------|------|-------|
| Book | 📚 | `#0078D4` |
| Author | ✍️ | `#5C2D91` |
| Member | 👤 | `#107C10` |
| Loan | 📋 | `#D83B01` |
| Branch | 🏛️ | `#008272` |

### Step 5: Create in the designer or write RDF

**Option A:** Open the Ontology Designer (`/#/designer`), add the entities and
relationships visually, then export as RDF. Use **Playground round-trip** when
the file needs to remain fully editable in the Playground, or
**Standards-oriented OWL + SHACL** for standards-based RDF tooling. See
[RDF export profiles](./rdf-export-profiles.md) for the differences.

**Option B:** Write the RDF directly following the pattern in any official
ontology (e.g., `catalogue/official/cosmic-coffee/cosmic-coffee.rdf`).

### Step 6: Test the experience

1. Load your ontology in the app (import or designer)
2. Try the query playground: "Show me all books", "How does Member connect to
   Loan?"
3. Check the inspector: click each node and edge
4. Switch to RDF Source tab: does it look clean?
5. Run validation: `npm run validate -- path/to/your-ontology.rdf`. Add
   `--profile external` for a standalone external standard.

### Step 7: Submit

Follow the instructions in [CONTRIBUTING.md](../CONTRIBUTING.md) to submit
your ontology to the community catalogue via pull request.

---

## 9. Reference: property types

| Type | RDF XSD mapping | Example values |
|------|----------------|----------------|
| `string` | `xsd:string` | "Alice", "ORD-001" |
| `integer` | `xsd:integer` | 42, 0, -1 |
| `decimal` | `xsd:decimal` | 3.14, 99.99 |
| `date` | `xsd:date` | "2025-01-15" |
| `datetime` | `xsd:dateTime` | "2025-01-15T10:30:00Z" |
| `boolean` | `xsd:boolean` | true, false |
| `enum` | `xsd:string` (with `ont:values`) | "Bronze", "Silver", "Gold" |

---

## 10. Reference: cardinalities

| Cardinality | Meaning | Example |
|-------------|---------|---------|
| `one-to-one` | Each A maps to exactly one B, and vice versa | Employee ↔ EmployeeBadge |
| `one-to-many` | Each A maps to many Bs | Customer → Orders |
| `many-to-one` | Many As map to one B | Orders → Store |
| `many-to-many` | Many As ↔ Many Bs (often needs a junction entity) | Students ↔ Courses (via Enrollment) |
