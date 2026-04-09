---
title: Ontology Design Patterns
slug: ontology-design-patterns
description: Practical naming conventions, modelling patterns, and common anti-patterns to avoid when designing ontologies for data platforms.
order: 5
embed: official/healthcare
---

## Name things for humans

The most important design decision is naming. Your entity types and properties will be read by both humans and machines — clear names make natural-language queries more accurate.

**Do:**
- Use singular nouns for entity types: `Customer`, `Product`, `Order`
- Use camelCase for properties: `firstName`, `totalAmount`, `createdDate`
- Use verb phrases for relationships: `placedBy`, `worksAt`, `contains`

**Don't:**
- Use internal table names: `tbl_cust_v2`, `DIM_PRODUCT`
- Abbreviate: `qty`, `amt`, `dt` — spell them out
- Use generic names: `Item`, `Record`, `Thing`

## One entity, one concept

Each entity type should represent a **single business concept**. If you find yourself adding unrelated properties, you probably need to split the entity.

**Anti-pattern:** A `Person` entity with `salary`, `patientId`, `courseGrade`, and `accountBalance` — this is four different concepts (Employee, Patient, Student, Customer) forced into one.

**Better:** Create separate entity types and relate them if needed: a `Person` can be linked to an `Employee` record, a `Patient` record, etc.

## Choose identifiers carefully

The identifier property determines how instances are counted, grouped, and joined. A good identifier is:

- **Unique** across all instances
- **Stable** — doesn't change over time
- **Meaningful** — preferably a business key, not an internal auto-increment

Examples: `isbn` for books, `email` for users, `orderId` for orders.

Avoid using compound identifiers (multiple fields that together form the key) — most ontology tools expect a single identifier per entity.

## Model relationships, not foreign keys

In relational databases, you use foreign keys to link tables. In an ontology, you use **named relationships** with explicit semantics.

| Relational | Ontology |
|-----------|----------|
| `orders.customer_id → customers.id` | `Order` → `placedBy` → `Customer` |
| `order_items.product_id → products.id` | `OrderItem` → `contains` → `Product` |

The relationship **name** is critical: it tells query engines (and humans) what the connection means. "placedBy" is infinitely clearer than a column called `fk_cust_id`.

## Get cardinality right

Wrong cardinality leads to wrong aggregations. Ask yourself: "For one instance of A, how many instances of B can there be?"

- A customer can place **many** orders → one-to-many
- An order is placed at **one** store → many-to-one
- A student can take **many** courses, and a course has **many** students → many-to-many

<ontology-embed id="official/healthcare" height="400px"></ontology-embed>

*The Healthcare ontology is a good study in cardinality: a patient has many appointments, but each appointment has one provider. A diagnosis belongs to one patient but may be linked to many prescriptions.*

## Avoid these common mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| **God entity** | One entity with 30+ properties | Split into focused entities |
| **Missing identifiers** | Can't count or group instances | Add a unique identifier property |
| **Vague relationship names** | `relatedTo`, `hasLink` | Use specific verbs: `prescribes`, `enrolledIn` |
| **Circular one-to-ones** | A → B and B → A both 1:1 | Probably the same entity — merge them |
| **Over-modelling** | Every internal table becomes an entity | Model what users will query, not your schema |

## When to use descriptions

Every entity type, property, and relationship can have an optional **description**. Use them when:

- The name alone is ambiguous (`status` could mean many things)
- The concept is domain-specific (`formulary`, `SKU`, `yield`)
- You want to guide natural-language query interpretation

## Key takeaways

- Name for humans: singular nouns, camelCase, verb phrases
- One entity, one concept — split over-loaded entities
- Choose stable, unique, meaningful identifiers
- Model relationships with names, not foreign key columns
- Set cardinality correctly to enable proper aggregations
- Add descriptions where names are ambiguous

```quiz
Q: A Person entity has properties salary, patientId, courseGrade, and accountBalance. What design pattern should you apply?
- Add an identifier property
- Merge all properties into a description field
- Split into separate entity types (Employee, Patient, Student, Customer) and relate them [correct]
- Remove all but one property to keep it simple
> When an entity accumulates unrelated properties, it becomes a "god entity". The fix is to separate each concept into its own entity type and link them with relationships where needed.
```
