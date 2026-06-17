---
title: Retail Fulfillment
slug: retail-fulfillment
description: Add RetailDC, Store and Order to connect Zava's supply chain to its retail partners and to revenue.
order: 5
embed: official/zava-grove-to-shelf-step-4
---

## Where the supply chain meets the till

The previous step ended with a shipment in transit. This step puts a face on the receiver: which retail chain, which DC, which stores, which orders.

Three new entities complete the commercial side of Zava:

- **RetailDC** — a retailer's distribution centre that receives Zava shipments.
- **Store** — a retailer's storefront, supplied by one DC.
- **Order** — a purchase order placed by a store for a specific fruit variety.

## Entities

### RetailDC

| Property | Type | Identifier? |
|---|---|---|
| `dcId` | string | ✓ |
| `name` | string | |
| `country` | string | |
| `city` | string | |
| `retailerCode` | string | |

### Store

| Property | Type | Identifier? |
|---|---|---|
| `storeId` | string | ✓ |
| `name` | string | |
| `retailerName` | string | |
| `country` | string | |
| `city` | string | |

### Order

| Property | Type | Identifier? |
|---|---|---|
| `orderId` | string | ✓ |
| `kilograms` | decimal (kg) | |
| `orderDate` | date | |
| `deliveryDate` | date | |
| `status` | string | |
| `unitPriceEur` | decimal (EUR) | |

## New relationships

| From | Verb | To | Cardinality |
|---|---|---|---|
| Shipment | deliveredTo | RetailDC | many-to-one |
| RetailDC | supplies | Store | one-to-many |
| Store | places | Order | one-to-many |
| Order | forVariety | FruitVariety | many-to-one |

## Now the cold-chain breach query closes the loop

Recall the breach question from step 3. With retail in place, the full traversal is:

```
ColdChainSensor[breach]
   → Shipment
   → HarvestLot ─ ofVariety → FruitVariety
   → Shipment
   → RetailDC
   → Store
   → Order[forVariety = same variety, status = open]
```

A Fabric IQ Data Agent can now answer the customer-impact question in business English:

> *"For the cold-chain breach on shipment SH-2026-04812, which retailer orders are at risk and what is the revenue exposure (kg × unitPriceEur)?"*

## The graph so far

<ontology-embed id="official/zava-grove-to-shelf-step-4" diff="official/zava-grove-to-shelf-step-3" height="480px"></ontology-embed>

*Eleven entities. The retail branch (RetailDC → Store → Order) plugs directly into the FruitVariety hub via `Order forVariety FruitVariety`, closing the grove-to-shelf path.*

```quiz
Q: In the breach query, why do we need `Order forVariety FruitVariety` *in addition to* `Shipment carries HarvestLot ofVariety FruitVariety`?
- Redundancy is required by Fabric IQ
- It lets us match an at-risk lot to the *open orders for the same variety*, since orders are placed against varieties, not against specific lots [correct]
- It is only there for visualisation
- Without it, the graph is disconnected
> Retailers order by variety, not by lot. To know *which orders are exposed* by a breach on a specific lot, we cross-reference its variety with `Order.forVariety`. Without that link the graph would tell us the shipment is at risk, but not which open orders are.
```

One last entity to add — the program that makes the model sing for Zava's CSR story.
