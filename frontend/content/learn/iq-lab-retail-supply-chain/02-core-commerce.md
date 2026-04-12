---
title: Core Commerce
slug: core-commerce
description: Define Customer, Order, and Product — the three foundational entities of any retail ontology — and connect them with relationships.
order: 2
embed: official/iq-lab-retail-step-1
---

## The foundation

Every retail system starts with three core concepts:

- **Customer** — who is buying?
- **Order** — what transaction happened?
- **Product** — what was purchased?

These three entity types form the heart of the ontology. Everything else we add in later steps connects back to them.

## Defining entity types

Each entity type needs:

1. A **name** — singular, descriptive (e.g. `Customer`, not `Customers` or `tbl_cust`)
2. An **identifier property** — a unique key for each instance
3. **Properties** — the attributes that describe each instance

### Customer

| Property | Type | Identifier? |
|---|---|---|
| `customerId` | string | ✓ |
| `name` | string | |
| `email` | string | |
| `loyaltyTier` | string | |
| `lifetimeValue` | decimal (USD) | |

The `customerId` uniquely identifies each customer. Properties like `loyaltyTier` and `lifetimeValue` are business-meaningful names that map to potentially cryptic column names in the source database.

### Order

| Property | Type | Identifier? |
|---|---|---|
| `orderId` | string | ✓ |
| `orderDate` | datetime | |
| `status` | string | |
| `totalAmount` | decimal (USD) | |

### Product

| Property | Type | Identifier? |
|---|---|---|
| `productId` | string | ✓ |
| `name` | string | |
| `unitCost` | decimal (USD) | |
| `discountPercent` | decimal (%) | |

## Connecting with relationships

Entities alone are just isolated tables. **Relationships** turn them into a connected graph:

- **OrderPlacedByCustomer** — `Order` → `Customer` (many-to-one)
  Each order is placed by exactly one customer, but a customer can place many orders.

- **OrderContainsProduct** — `Order` → `Product` (many-to-many)
  An order can contain multiple products, and a product can appear in multiple orders.

### Cardinality matters

The cardinality tells the system how to count and aggregate:

| Cardinality | Meaning | Example |
|---|---|---|
| one-to-one | Exactly one on each side | Employee → Badge |
| one-to-many | One parent, many children | Customer → Orders |
| many-to-one | Many children, one parent | Orders → Customer |
| many-to-many | No restriction | Orders ↔ Products |

Choosing the right cardinality ensures that queries like "How many orders did each customer place?" return correct counts.

## The graph so far

With just three entities and two relationships, we already have a connected graph:

<ontology-embed id="official/iq-lab-retail-step-1" height="350px"></ontology-embed>

*Customer, Order, and Product connected by two relationships. This is the foundation everything else builds on.*

## What we learned

- Every entity type needs an identifier property
- Use business-meaningful names, not internal column names
- Relationships have cardinality that affects how data is counted
- Even three entities create a useful connected graph

```quiz
Q: A Customer can place many Orders, but each Order belongs to one Customer. What cardinality is this?
- One-to-one
- Many-to-many
- One-to-many [correct]
- Many-to-one
> From Customer's perspective this is one-to-many: one customer can have many orders. From Order's perspective it's many-to-one. The relationship is defined as Customer → Order with one-to-many cardinality.
```

Next, we'll add detail to orders and organize products into categories.
