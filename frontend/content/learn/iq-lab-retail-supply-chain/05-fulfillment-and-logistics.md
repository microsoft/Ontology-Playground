---
title: Fulfillment & Logistics
slug: fulfillment-and-logistics
description: Add Shipment, Carrier, and Warehouse to model the delivery pipeline — how orders move from warehouse to customer.
order: 5
embed: official/iq-lab-retail-step-4
---

## The delivery pipeline

Customers place orders, but how do those orders reach them? The fulfillment layer connects orders to the physical logistics infrastructure:

- **Shipment** — a delivery record
- **Carrier** — the logistics provider (FedEx, UPS, etc.)
- **Warehouse** — the fulfillment center that stocks and ships products

## Shipment

Each shipment represents a delivery:

| Property | Type | Identifier? |
|---|---|---|
| `shipmentId` | string | ✓ |
| `shipDate` | date | |
| `deliveryDate` | date | |
| `status` | string | |

## Carrier

The logistics company handling the delivery:

| Property | Type | Identifier? |
|---|---|---|
| `carrierId` | string | ✓ |
| `carrierName` | string | |
| `serviceType` | string | |

## Warehouse

The fulfillment center:

| Property | Type | Identifier? |
|---|---|---|
| `warehouseId` | string | ✓ |
| `warehouseName` | string | |
| `capacity` | integer | |

## New relationships

Three new relationships connect the logistics entities:

- **ShipmentFulfillsOrder** — `Shipment` → `Order` (many-to-one)
  Each shipment fulfills one order. Multiple shipments can fulfill the same order (split shipments).

- **ShipmentByCarrier** — `Shipment` → `Carrier` (many-to-one)
  Each shipment is handled by one carrier.

- **ShipmentDepartedFromWarehouse** — `Shipment` → `Warehouse` (many-to-one)
  Each shipment departs from one warehouse.

## The hub pattern

Notice that **Shipment** acts as a **hub entity** — it connects to Order, Carrier, and Warehouse simultaneously. This is a common pattern for transaction or event entities that bridge multiple concepts:

```
Carrier ← Shipment → Order → Customer
              ↓
          Warehouse
```

A single graph traversal from Carrier through Shipment to Order to Customer answers: "Which customers received shipments from CarrierX?"

## The graph at Step 4

<ontology-embed id="official/iq-lab-retail-step-4" diff="official/iq-lab-retail-step-3" height="450px"></ontology-embed>

*Ten entity types forming a rich connected graph. Shipment links the logistics layer (Carrier, Warehouse) to the commerce layer (Order, Customer). You can traverse from any warehouse to any customer through the graph.*

## What we learned

- **Hub entities** (like Shipment) connect multiple domains
- The logistics layer extends the commerce layer — no need to modify existing entities
- Graph traversal makes cross-domain queries natural: "Which warehouses ship to the southwest region?" requires no SQL joins
- The ontology is now 10 entities with 10 relationships — growing but still readable

```quiz
Q: What role does the Shipment entity play in the ontology?
- It replaces the Order entity
- It acts as a hub connecting the logistics layer to the commerce layer [correct]
- It stores customer addresses
- It defines the cardinality between Warehouse and Carrier
> Shipment is a hub entity that connects multiple domains: it links Order to the logistics infrastructure (Carrier, Warehouse), enabling cross-domain queries without modifying existing entities.
```

Next, we'll add inventory tracking and demand forecasting.
