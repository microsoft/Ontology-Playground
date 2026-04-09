---
title: "Shopping Carts"
slug: shopping-carts
description: "Add Shopping-Cart to model active shopping sessions and introduce the one-to-one relationship pattern."
order: 3
embed: official/ecommerce-step-2
---

## Before the purchase

Not every browsing session leads to a purchase. The **Shopping Cart** captures what a buyer is considering before checking out. It's a session entity — temporary and mutable.

Adding the cart lets us answer questions like:
- "How many carts were abandoned this week?"
- "What's the average cart value vs. average order value?"
- "Which products are most often added to carts but not purchased?"

## Shopping-Cart entity

| Property | Type | Identifier? |
|---|---|---|
| `cartId` | string | ✓ |
| `createdAt` | datetime | |
| `itemCount` | integer | |
| `subtotal` | decimal (USD) | |

The `itemCount` and `subtotal` are denormalized summary properties — they could be computed from cart contents, but storing them directly makes queries faster.

## New relationships

- **has_cart** — `Buyer` → `Shopping-Cart` (one-to-one)
  Each buyer has exactly one active cart, and each cart belongs to exactly one buyer.

- **contains** — `Shopping-Cart` → `Product` (many-to-many)
  A cart can contain multiple products, and a product can be in many carts.

> **One-to-one pattern:** The `has_cart` relationship is one-to-one because each buyer has a single active shopping session. This is different from orders (one-to-many) because a buyer accumulates orders over time but only has one cart at any moment.

## The growing graph

<ontology-embed id="official/ecommerce-step-2" diff="official/ecommerce-step-1" height="400px"></ontology-embed>

*Shopping-Cart connects Buyer to Product through two new relationships. The diff highlights what changed since Step 1.*

## What we learned

- **Session entities** model temporary or in-progress states (carts, drafts, sessions)
- **One-to-one relationships** enforce a strict pairing (one buyer ↔ one cart)
- **Denormalized properties** (itemCount, subtotal) trade storage for query speed
- Cart analysis enables **conversion funnel** insights (cart → order ratio)

```quiz
Q: Why is the has_cart relationship between Buyer and Shopping-Cart set to one-to-one instead of one-to-many?
- Because shopping carts don't need unique identifiers
- Because each buyer has exactly one active cart at any given time [correct]
- Because one-to-one is simpler to implement
- Because carts are deleted after purchase
> A buyer maintains a single active shopping session (cart) at a time. Unlike orders which accumulate over a buyer's lifetime, the cart is a current-state entity — one buyer, one active cart.
```

Next, we'll complete the platform with customer reviews.
