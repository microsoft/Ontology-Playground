---
title: Complete Model
slug: complete-model
description: Add Promotion and Return to finish the full 15-entity retail supply chain ontology — then explore the complete graph.
order: 7
embed: official/iq-lab-retail-step-6
---

## The final two entities

The last two entity types close the loop on the retail lifecycle:

- **Promotion** — marketing campaigns that drive sales
- **Return** — items that come back, linking to both orders and products

## Promotion

Marketing campaigns targeting specific products:

| Property | Type | Identifier? |
|---|---|---|
| `promotionId` | string | ✓ |
| `promotionName` | string | |
| `isActivePromotion` | boolean | |

The `isActivePromotion` flag enables filtering for current campaigns — a question like "Which active promotions are associated with products that have high return rates?" traverses Promotion → Product ← Return.

## Return

Returned items linking back to orders and products:

| Property | Type | Identifier? |
|---|---|---|
| `returnId` | string | ✓ |
| `returnDate` | date | |
| `reason` | string | |

## New relationships

Three final relationships:

- **PromotionForProduct** — `Promotion` → `Product` (many-to-one)
  Which product a promotion targets.

- **ReturnForOrder** — `Return` → `Order` (many-to-one)
  Which order the return is linked to.

- **ReturnOfProduct** — `Return` → `Product` (many-to-one)
  Which product was returned.

## The complete graph

<ontology-embed id="official/iq-lab-retail-step-6" diff="official/iq-lab-retail-step-5" height="500px"></ontology-embed>

*The complete retail supply chain ontology: 15 entity types, 18 relationships. Every entity connects to at least one other, forming a rich, traversable graph.*

## What the complete model enables

With the full ontology in place, here are examples of questions that become natural to answer:

| Question | Graph path |
|---|---|
| Which promotions drove returns? | Promotion → Product ← Return |
| What's the inventory for returned products? | Return → Product ← Inventory → Warehouse |
| Which carriers serve regions with high demand? | DemandSignal → Region ← Store; Shipment → Carrier |
| Which customers ordered promoted products? | Customer ← Order → OrderLine → Product ← Promotion |
| What's the forecast for products running low? | Inventory → Product ← Forecast |

Each of these would require complex multi-table SQL joins. With the ontology, they're expressed as graph traversals — and in Fabric IQ, a natural-language Data Agent can answer them from the ontology structure.

## GQL query example

Here's how the first question — "Which promotions drove returns?" — would look in GQL:

```gql
MATCH (r:Return)-[:ReturnOfProduct]->(p:Product)<-[:PromotionForProduct]-(promo:Promotion)
WHERE promo.isActivePromotion = true
RETURN promo.promotionName, p.name, r.reason
```

The GQL pattern directly mirrors the ontology relationships you designed. There's no impedance mismatch between the model and the query.

## What we built

Over six steps, we progressively constructed a complete ontology:

| Step | Entities added | Cumulative | Key concept |
|---|---|---|---|
| 1 | Customer, Order, Product | 3 | Entity types, identifiers, cardinality |
| 2 | OrderLine, ProductCategory | 5 | Linking entities, hierarchies |
| 3 | Region, Store | 7 | Geographic structure, boolean properties |
| 4 | Shipment, Carrier, Warehouse | 10 | Hub entities, cross-domain connections |
| 5 | Inventory, Forecast, DemandSignal | 13 | Cross-source unification, planning data |
| 6 | Promotion, Return | 15 | Closing the loop, GQL querying |

## Key takeaways

1. **Start small, grow incrementally** — three entities are enough to create value
2. **Linking entities** solve the many-to-many attribute problem
3. **Hub entities** (like Shipment) bridge different domains
4. **Cross-source unification** is the core value — one ontology, multiple data engines
5. **Graph traversal** replaces complex SQL joins with intuitive path patterns
6. **The ontology is the API** — GQL queries and Data Agent questions both follow the same structure

```quiz
Q: In the complete retail ontology, how would you express the query "Which promotions drove returns?" as a graph traversal?
- Customer → Order → Product → Promotion
- Promotion → Product ← Return [correct]
- Return → Order → Customer → Promotion
- Promotion → Return → Product
> The path Promotion → Product ← Return follows the PromotionForProduct and ReturnOfProduct relationships, connecting promotions to returned products through their shared Product entity.
```

You've completed the IQ Lab: Retail Supply Chain. Load any step ontology from the [catalogue](#/catalogue) to explore it interactively in the playground.
