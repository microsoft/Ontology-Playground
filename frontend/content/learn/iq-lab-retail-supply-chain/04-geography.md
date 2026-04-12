---
title: Geography
slug: geography
description: Model Region and Store to add geographic structure — where orders are fulfilled and where stores are located.
order: 4
embed: official/iq-lab-retail-step-3
---

## Adding location context

Commerce doesn't happen in a vacuum — it happens in **places**. Adding geographic entities lets us answer questions like:

- "What were total sales in the southwest region?"
- "Which stores in the northeast have declining order volume?"
- "Does the southwest region require cold-chain logistics?"

## Region

Regions represent broad geographic areas that contain stores and warehouses:

| Property | Type | Identifier? |
|---|---|---|
| `regionId` | string | ✓ |
| `regionName` | string | |
| `timezone` | string | |
| `coldChainRequired` | boolean | |

The `coldChainRequired` property is a good example of a **boolean property** — it captures a yes/no business rule (does this region need refrigerated shipping?) as a queryable attribute rather than burying it in documentation.

## Store

Stores are the physical retail locations where customers place orders:

| Property | Type | Identifier? |
|---|---|---|
| `storeId` | string | ✓ |
| `storeName` | string | |
| `address` | string | |

## New relationships

- **OrderFulfilledToRegion** — `Order` → `Region` (many-to-one)
  Each order is fulfilled in one region. This enables regional sales analysis.

- **StoreInRegion** — `Store` → `Region` (many-to-one)
  Each store belongs to one region. Combined with the order relationship, this creates two paths to Region — useful for different analytical perspectives.

## Geographic hierarchies

Notice the pattern: **Store** → **Region** forms a **geographic hierarchy**. In a more detailed ontology, you might add City, State, or Country levels. The key principle is:

> Each level in the hierarchy connects to the next via a many-to-one relationship. This enables automatic roll-up: store-level data aggregates to region-level totals.

## The graph at Step 3

<ontology-embed id="official/iq-lab-retail-step-3" diff="official/iq-lab-retail-step-2" height="400px"></ontology-embed>

*Seven entity types. Region and Store add geographic context. Notice how Order now connects to both Customer (who bought) and Region (where it was fulfilled).*

## What we learned

- **Geographic entities** enable location-based analytics
- **Boolean properties** (like `coldChainRequired`) capture business rules
- **Hierarchies** allow data to roll up from granular to aggregate
- An entity can have multiple relationships to different entities — Order connects to Customer, Product (via OrderLine), and Region

```quiz
Q: Why is it useful to model Region as a separate entity instead of adding a "region" text property on Store?
- It saves storage space
- It enables roll-up queries and maintains a single source of truth for geographic data [correct]
- It makes the ontology diagram look better
- Fabric IQ requires it
> Modelling Region as a separate entity creates a hierarchy: Store → Region. This lets IQ aggregate data by region ("total sales in the northeast") and ensures region metadata is defined once, not duplicated across every store.
```

Next, we'll model how orders actually get delivered.
