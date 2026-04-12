---
title: Microsoft Fabric IQ Ontology Concepts
slug: fabric-iq-ontology-concepts
description: How Microsoft Fabric uses ontologies to power natural-language queries over structured data — entity types, identifier properties, relationships, and cardinality.
order: 3
embed: official/ecommerce
---

## What is Fabric IQ?

**Microsoft Fabric** is a unified analytics platform that brings together data engineering, data science, real-time analytics, and business intelligence. **IQ** is a Fabric capability that lets users ask questions in **natural language** and get answers from structured data — no SQL required.

The key ingredient is an **ontology**: a formal description of entity types, their properties, and relationships. IQ reads the ontology, understands the shape of your data, and translates plain-English questions into the correct queries.

## How IQ uses ontologies

When a user asks *"What were last month's total sales by region?"*, IQ needs to know:

1. **Entity types** — `Order`, `Store`, `Region`
2. **Properties** — `Order.totalAmount`, `Order.date`, `Store.region`
3. **Relationships** — `Order` → `placedAt` → `Store`, `Store` → `locatedIn` → `Region`
4. **Identifier properties** — which fields uniquely identify each entity (e.g. `Order.orderId`)

The ontology provides all four. Without it, IQ can't distinguish a "store" from a "product" or know how to join them.

## Entity types

An entity type is a category of business object. In Fabric IQ, each entity type:

- Has a **name** and optional **description**
- Contains one or more **properties** (typed columns)
- Must have at least one **identifier property** that uniquely identifies instances

Think of it as a table definition: `Customer(customerId, name, email, tier)`.

## Properties and types

Each property has a data type:

| Type | Description | Example |
|------|-------------|---------|
| `string` | Text value | Customer name, product SKU |
| `integer` | Whole number | Quantity, year |
| `decimal` | Fractional number | Price, rating |
| `date` | Calendar date | Order date, birth date |
| `datetime` | Date with time | Created timestamp |
| `boolean` | True/false | Is active, is premium |

The **identifier property** (marked with a key icon) is critical: it tells IQ how to count, group, and join entities correctly.

## Relationships and cardinality

Relationships connect entity types. Each relationship specifies:

- **Source and target** entity types
- **Name** (the verb: "places", "contains", "worksAt")
- **Cardinality** — how many instances can connect

| Cardinality | Meaning | Example |
|------------|---------|---------|
| One-to-one | Each A maps to exactly one B | `Employee` → `Badge` |
| One-to-many | Each A maps to many Bs | `Customer` → `Order` |
| Many-to-one | Many As map to one B | `Order` → `Store` |
| Many-to-many | Many As map to many Bs | `Student` → `Course` |

IQ uses cardinality to generate correct aggregations. A one-to-many relationship between `Customer` and `Order` means "count of orders per customer" is valid, while "count of customers per order" would typically be 1.

<ontology-embed id="official/ecommerce" height="400px"></ontology-embed>

*The E-Commerce ontology demonstrates IQ-ready patterns: identifier properties on each entity, typed columns, and cardinality on every relationship.*

## Designing for IQ

When building an ontology for Fabric IQ, follow these guidelines:

1. **Name entities clearly** — use business terms your users would say ("Customer", not "tbl_cust")
2. **Add descriptions** — IQ uses them to disambiguate similar concepts
3. **Mark identifiers** — every entity MUST have at least one identifier property
4. **Set cardinality** — helps IQ generate correct GROUP BY and JOIN logic
5. **Keep it focused** — model the concepts users will query, not every internal table

## Key takeaways

- Fabric IQ translates natural-language questions into SQL using an ontology
- Entity types, properties, relationships, and cardinality are the four pillars
- Every entity needs an identifier property for correct counting and joining
- Good naming and descriptions improve IQ's question-answering accuracy
- Use the [Ontology Designer](#/designer) to create IQ-ready ontologies visually

```quiz
Q: Why is an identifier property required on every entity type in Fabric IQ?
- It makes the ontology look professional
- It tells IQ how to count, group, and join entities correctly [correct]
- It is used as the entity's display name
- It sets the default sort order
> The identifier property uniquely distinguishes instances of an entity type. Without it, IQ cannot correctly generate COUNT, GROUP BY, or JOIN operations in the translated SQL.
```

```quiz
Q: What does the cardinality of a relationship tell Fabric IQ?
- The colour to use when drawing the relationship
- How many instances can connect on each side of the relationship [correct]
- Whether the relationship is optional or required
- The order in which entities should be displayed
> Cardinality (one-to-one, one-to-many, many-to-one, many-to-many) tells IQ how to generate correct aggregations and joins — for example, knowing that one customer has many orders.
```
