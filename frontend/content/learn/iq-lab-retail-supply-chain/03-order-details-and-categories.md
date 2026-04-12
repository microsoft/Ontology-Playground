---
title: Order Details & Categories
slug: order-details-and-categories
description: Add OrderLine as a linking entity between Order and Product, and introduce ProductCategory for grouping.
order: 3
embed: official/iq-lab-retail-step-2
---

## The problem with many-to-many

In Step 1, we connected Order directly to Product with a many-to-many relationship. That works for simple queries like "which products were in this order?" — but what about **quantities** and **line totals**?

A direct many-to-many relationship can't carry attributes. If Customer A ordered 3 units of Product X and Customer B ordered 1 unit, where does the quantity live? Not on the Order (it has multiple products) and not on the Product (it appears in multiple orders).

## The linking entity pattern

The solution is a **linking entity** — an entity type that sits between two others and carries the per-association attributes:

**OrderLine** connects an Order to a Product and holds:

| Property | Type | Identifier? |
|---|---|---|
| `orderLineId` | string | ✓ |
| `quantity` | integer | |
| `lineTotal` | decimal (USD) | |

### New relationships

- **OrderHasLineItem** — `Order` → `OrderLine` (one-to-many)
  Each order has one or more line items.

- **OrderLineReferencesProduct** — `OrderLine` → `Product` (many-to-one)
  Each line item references exactly one product.

Now the traversal is: `Order` → `OrderLine` → `Product`, and each line item carries its own `quantity` and `lineTotal`.

> **Design pattern:** Whenever a many-to-many relationship needs attributes (quantity, price, date), introduce a linking entity. This is the ontology equivalent of an association table in relational databases.

## Organizing with categories

Products rarely exist in isolation — they belong to **categories** like "frozen goods", "household", or "electronics". Adding a ProductCategory entity lets us group products and answer questions like "Which category has the most returns?"

**ProductCategory**:

| Property | Type | Identifier? |
|---|---|---|
| `categoryId` | string | ✓ |
| `categoryName` | string | |

### New relationship

- **ProductInCategory** — `Product` → `ProductCategory` (many-to-one)
  Each product belongs to exactly one category.

## The graph at Step 2

<ontology-embed id="official/iq-lab-retail-step-2" diff="official/iq-lab-retail-step-1" height="400px"></ontology-embed>

*Five entity types connected by five relationships. OrderLine acts as a bridge between Order and Product, carrying quantity data. ProductCategory groups products.*

## What we learned

- **Linking entities** solve the many-to-many attribute problem
- When a relationship needs its own data, model it as an entity
- **Hierarchies** (Product → ProductCategory) enable roll-up queries
- The graph is growing — each new entity connects to existing ones

```quiz
Q: When should you introduce a linking entity (like OrderLine) instead of a direct relationship?
- When you have more than three entity types
- When the relationship between two entities needs its own attributes [correct]
- When both entity types have identifier properties
- When the entities are in different namespaces
> A linking entity is needed when a many-to-many relationship needs to carry its own data (like quantity or line total). A direct relationship cannot hold attributes.
```

Next, we'll add geographic structure with Region and Store.
