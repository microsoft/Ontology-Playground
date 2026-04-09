---
title: "Adding Stores"
slug: adding-stores
description: "Introduce Store locations into the ontology and connect orders to their processing stores."
order: 3
embed: official/cosmic-coffee-step-2
---

## Where orders happen

So far, we know *who* orders *what* — but not *where*. The Cosmic Coffee Company operates stores across multiple cities, and each order is processed at a specific store.

Adding the **Store** entity lets us answer location-based questions like:
- "Which store has the most orders?"
- "What's the average order value per city?"
- "Which stores need more staff based on order volume?"

## Store entity

| Property | Type | Identifier? |
|---|---|---|
| `storeId` | string | ✓ |
| `name` | string | |
| `city` | string | |
| `state` | string | |
| `openDate` | date | |
| `capacity` | integer | |

The `capacity` property (seating capacity) is an **integer** — useful for operations planning. The `city` and `state` properties provide geographic context without the complexity of a full address hierarchy.

## New relationship

- **processedAt** — `Order` → `Store` (many-to-one)
  Each order is processed at exactly one store, but a store processes many orders.

> **Design note:** This is a many-to-one relationship. Many orders map to one store. This is the most common cardinality pattern for "belongs to" or "happens at" relationships.

## The growing graph

<ontology-embed id="official/cosmic-coffee-step-2" diff="official/cosmic-coffee-step-1" height="400px"></ontology-embed>

*Store joins the graph via the processedAt relationship. The diff highlights what's new since Step 1.*

## What we learned

- **Many-to-one relationships** model "belongs to" or "located at" patterns
- **Integer properties** work well for countable quantities (capacity, floors, seats)
- Adding one entity opens up an entire category of location-based queries
- The `diff` view shows exactly what changed — making it easy to track ontology evolution

```quiz
Q: What cardinality should the "processedAt" relationship between Order and Store have?
- One-to-one — each store has exactly one order
- One-to-many — each order is processed at many stores
- Many-to-one — many orders are processed at one store [correct]
- Many-to-many — orders can be processed at multiple stores simultaneously
> Each order is processed at exactly one store location, but a store processes many orders throughout the day. From Order's perspective, this is many-to-one.
```

Next, we'll complete the supply chain with Supplier and Shipment.
