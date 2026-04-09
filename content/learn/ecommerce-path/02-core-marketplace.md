---
title: "Core Marketplace"
slug: core-marketplace
description: "Define Buyer, Product, and Order — the foundational entities that power any e-commerce platform."
order: 2
embed: official/ecommerce-step-1
---

## The purchase flow

Every marketplace revolves around three concepts:

- **Buyer** — who is purchasing?
- **Product** — what is being sold?
- **Order** — what was the completed transaction?

These three entities capture the essential purchase flow. Everything else we add enriches this foundation.

## Defining the entities

### Buyer

| Property | Type | Identifier? |
|---|---|---|
| `buyerId` | string | ✓ |
| `email` | string | |
| `memberSince` | date | |
| `loyaltyTier` | string | |
| `totalSpent` | decimal (USD) | |

Unlike a physical retail customer, an e-commerce buyer always has an `email` as a primary contact method. The `totalSpent` property enables lifetime-value segmentation.

### Product

| Property | Type | Identifier? |
|---|---|---|
| `sku` | string | ✓ |
| `name` | string | |
| `category` | string | |
| `price` | decimal (USD) | |
| `stockQty` | integer | |

The identifier here is `sku` (Stock Keeping Unit) — the standard product identifier in e-commerce. The `stockQty` property tracks real-time inventory.

### Order

| Property | Type | Identifier? |
|---|---|---|
| `orderId` | string | ✓ |
| `orderDate` | datetime | |
| `status` | string | |
| `total` | decimal (USD) | |
| `shippingMethod` | string | |

## Relationships

- **places** — `Buyer` → `Order` (one-to-many)
  A buyer can place many orders over time.

- **includes** — `Order` → `Product` (many-to-many)
  An order can include multiple products, and each product appears across many orders.

## The graph so far

<ontology-embed id="official/ecommerce-step-1" height="350px"></ontology-embed>

*Buyer, Product, and Order connected by the purchase flow relationships.*

## What we learned

- **SKU** is the standard identifier for e-commerce products
- The `stockQty` integer property enables inventory queries
- The basic purchase flow (Buyer → Order → Product) is the backbone of any marketplace

```quiz
Q: Why is "sku" used as the identifier for Product instead of "productId"?
- SKU is shorter to type
- SKU (Stock Keeping Unit) is the standard product identifier in e-commerce and retail systems [correct]
- productId would cause naming conflicts
- SKU is always a numeric value
> SKU stands for Stock Keeping Unit — it's the industry-standard identifier used across inventory management, warehousing, and e-commerce systems to uniquely identify each item.
```

Next, we'll add Shopping Cart to model the pre-purchase experience.
