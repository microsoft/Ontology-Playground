---
title: "Complete Platform"
slug: complete-platform
description: "Add Review to close the buyer feedback loop and complete the e-commerce ontology."
order: 4
embed: official/ecommerce-step-3
---

## Closing the feedback loop

The final piece of the e-commerce puzzle is **customer reviews**. Reviews connect buyers back to products, creating a feedback loop that influences future purchases.

## Review entity

| Property | Type | Identifier? |
|---|---|---|
| `reviewId` | string | ✓ |
| `rating` | integer | |
| `title` | string | |
| `body` | string | |
| `verified` | boolean | |

The `verified` boolean indicates whether the reviewer actually purchased the product — a critical trust signal for other buyers and for analytics.

## New relationships

- **writes** — `Buyer` → `Review` (one-to-many)
  A buyer can write many reviews over time.

- **reviews** — `Review` → `Product` (many-to-one)
  Each review is about exactly one product, but a product can have many reviews.

> **Feedback loop:** The path `Buyer → writes → Review → reviews → Product` creates a cycle back to Product — buyers consume products, then review them, influencing other buyers.

## The complete graph

<ontology-embed id="official/ecommerce-step-3" diff="official/ecommerce-step-2" height="500px"></ontology-embed>

*The complete E-Commerce ontology: 5 entities, 6 relationships. Review closes the buyer feedback loop.*

## What the complete model enables

| Question | Graph path |
|---|---|
| Which products have the highest-rated verified reviews? | Review (verified=true) → Product |
| Which buyers have full carts but no orders? | Buyer → Cart (itemCount > 0) with no Buyer → Order |
| What's the average rating for products in a category? | Review → Product (group by category) |
| Which loyal buyers write the most reviews? | Buyer (loyaltyTier=Gold) → Review (count) |

## GQL query example

Find verified reviews for products currently in someone's cart:

```gql
MATCH (b:Buyer)-[:has_cart]->(c:Cart)-[:contains]->(p:Product)<-[:reviews]-(r:Review)
WHERE r.verified = true
RETURN p.name, r.rating, r.title
```

## What we built

| Step | Entities added | Cumulative | Key concept |
|---|---|---|---|
| 1 | Buyer, Product, Order | 3 | Purchase flow, SKU identifiers |
| 2 | Shopping-Cart | 4 | Session entities, one-to-one |
| 3 | Review | 5 | Feedback loops, verified trust |

## Key takeaways

1. **Session entities** (Cart) capture in-progress state
2. **One-to-one** relationships model exclusive ownership
3. **Boolean properties** (verified) enable trust-based filtering
4. **Feedback loops** create richer query paths than linear chains
5. The complete graph enables **funnel analysis** from browsing to reviewing

```quiz
Q: What makes the Review entity create a "feedback loop" in this ontology?
- It connects to every other entity in the graph
- It creates a path from Buyer back to Product through a different route than the purchase path [correct]
- It has the most properties of any entity
- It uses a boolean verified property
> Without Review, the path from Buyer to Product only goes through Order. Review creates a second path — Buyer → Review → Product — forming a loop. This dual-path structure enables comparative queries (e.g. "bought but didn't review" vs "reviewed but didn't buy").
```

You've completed the E-Commerce Platform learning path! Load any step from the [catalogue](#/catalogue) to explore it interactively.
