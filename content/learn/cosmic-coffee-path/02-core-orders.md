---
title: "Core Orders"
slug: core-orders
description: "Define Customer, Order, and Product — the foundational entities of the coffee business — and connect them with relationships."
order: 2
embed: official/cosmic-coffee-step-1
---

## The foundation

Every commerce system starts with three core concepts:

- **Customer** — who is buying?
- **Order** — what transaction happened?
- **Product** — what was purchased?

These three entity types form the heart of the Cosmic Coffee ontology. Everything we add later connects back to them.

## Defining the entities

### Customer

| Property | Type | Identifier? |
|---|---|---|
| `customerId` | string | ✓ |
| `name` | string | |
| `email` | string | |
| `loyaltyTier` | enum (Bronze, Silver, Gold, Platinum) | |
| `joinDate` | date | |
| `totalSpend` | decimal (USD) | |

The `customerId` uniquely identifies each customer. The `loyaltyTier` uses an enum to restrict values to valid tiers — this prevents data quality issues in downstream analytics.

### Order

| Property | Type | Identifier? |
|---|---|---|
| `orderId` | string | ✓ |
| `timestamp` | datetime | |
| `total` | decimal (USD) | |
| `status` | enum (Pending, Preparing, Ready, Completed, Cancelled) | |
| `paymentMethod` | enum (Card, Cash, Mobile, Gift Card) | |

### Product

| Property | Type | Identifier? |
|---|---|---|
| `productId` | string | ✓ |
| `name` | string | |
| `category` | enum (Espresso, Brewed, Cold Brew, Tea, Food, Merchandise) | |
| `price` | decimal (USD) | |
| `origin` | string | |
| `isOrganic` | boolean | |

The `isOrganic` flag is a boolean — useful for filtering and compliance queries later.

## Connecting with relationships

Entities alone are just isolated tables. **Relationships** turn them into a graph:

- **places** — `Customer` → `Order` (one-to-many)
  Each customer can place many orders, but each order belongs to one customer.

- **contains** — `Order` → `Product` (many-to-many)
  An order can contain multiple products, and a product can appear in many orders.

## The graph so far

<ontology-embed id="official/cosmic-coffee-step-1" height="350px"></ontology-embed>

*Three entities, two relationships. This is the foundation everything else builds on.*

## What we learned

- Every entity needs an **identifier property** — a unique key
- **Enum properties** constrain values to valid options
- **Boolean properties** enable simple filtering
- **Cardinality** (one-to-many vs many-to-many) determines how entities relate

```quiz
Q: Why is the "contains" relationship between Order and Product set to many-to-many instead of one-to-many?
- Each order can only have one product
- Products can only appear in one order at a time
- An order can contain multiple products AND a product can appear in multiple orders [correct]
- Many-to-many is always the default relationship type
> An order typically includes several products (a latte, a muffin, a bag of beans), and each product appears across many different orders — this bidirectional multiplicity requires many-to-many.
```

Next, we'll add Store to track where orders are processed.
