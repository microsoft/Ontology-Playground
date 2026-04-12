---
title: "Complete Supply Chain"
slug: complete-supply-chain
description: "Add Supplier and Shipment to complete the Cosmic Coffee ontology — connecting sourcing, logistics, and retail."
order: 4
embed: official/cosmic-coffee-step-3
---

## Completing the picture

The Cosmic Coffee Company doesn't just sell coffee — it sources beans from suppliers around the world, receives shipments at its stores, and tracks the entire supply chain. Adding **Supplier** and **Shipment** closes the loop.

## Supplier

| Property | Type | Identifier? |
|---|---|---|
| `supplierId` | string | ✓ |
| `name` | string | |
| `country` | string | |
| `certification` | enum (Fair Trade, Rainforest Alliance, Organic, Direct Trade, None) | |
| `rating` | decimal | |

The `certification` property is an enum that captures sustainability credentials. The `rating` is a decimal (1–5) for quality scoring.

## Shipment

| Property | Type | Identifier? |
|---|---|---|
| `shipmentId` | string | ✓ |
| `dispatchDate` | date | |
| `arrivalDate` | date | |
| `status` | enum (In Transit, Delivered, Delayed) | |
| `weight` | decimal (kg) | |

Shipment acts as a **hub entity** — it connects Supplier to Store through Product, bridging the sourcing and retail sides of the business.

## New relationships

Four new relationships complete the supply chain:

- **sourcedFrom** — `Product` → `Supplier` (many-to-one)
  Each product's beans come from one supplier.

- **sentBy** — `Shipment` → `Supplier` (many-to-one)
  Each shipment originates from one supplier.

- **deliveredTo** — `Shipment` → `Store` (many-to-one)
  Each shipment arrives at one store.

- **carries** — `Shipment` → `Product` (many-to-many)
  A shipment can carry multiple products, and a product can be in multiple shipments.

> **Hub entity pattern:** Shipment connects three different entities (Supplier, Store, Product). Hub entities are powerful because they bridge otherwise disconnected parts of the graph.

## The complete graph

<ontology-embed id="official/cosmic-coffee-step-3" diff="official/cosmic-coffee-step-2" height="500px"></ontology-embed>

*The complete Cosmic Coffee ontology: 6 entity types, 7 relationships. Shipment acts as a hub connecting Supplier, Store, and Product.*

## What the complete model enables

| Question | Graph path |
|---|---|
| Which suppliers provide organic beans? | Product (isOrganic=true) → Supplier |
| Which stores received delayed shipments? | Shipment (status=Delayed) → Store |
| What's the rating of our top supplier? | Product → Supplier (sort by rating) |
| Which certified suppliers ship to our largest stores? | Supplier → Shipment → Store (sort by capacity) |

## GQL query example

Find suppliers with Fair Trade certification that ship to stores in California:

```gql
MATCH (sup:Supplier)<-[:sentBy]-(s:Shipment)-[:deliveredTo]->(st:Store)
WHERE sup.certification = 'Fair Trade' AND st.state = 'CA'
RETURN sup.name, st.name, s.status
```

## What we built

| Step | Entities added | Cumulative | Key concept |
|---|---|---|---|
| 1 | Customer, Order, Product | 3 | Entity types, identifiers, cardinality |
| 2 | Store | 4 | Location modelling, many-to-one |
| 3 | Supplier, Shipment | 6 | Supply chain, hub entities |

## Key takeaways

1. **Start small** — three entities are enough to create value
2. **Hub entities** like Shipment bridge different business domains
3. **Enum properties** enforce data quality at the model level
4. **The graph grows incrementally** — each step adds new query capabilities
5. **GQL queries** map directly to ontology structure — no impedance mismatch

```quiz
Q: Why is Shipment considered a "hub entity" in this ontology?
- It has the most properties of any entity
- It connects three different entities: Supplier, Store, and Product [correct]
- It is the most frequently queried entity
- It was the last entity added to the model
> Shipment is a hub because it has relationships to Supplier (sentBy), Store (deliveredTo), and Product (carries) — bridging the sourcing, logistics, and retail domains in a single entity.
```

You've completed the Cosmic Coffee Company learning path! Load any step from the [catalogue](#/catalogue) to explore it interactively.
