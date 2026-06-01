---
title: Scenario Overview
slug: scenario-overview
description: Meet Zava — a premium fresh-fruit producer that needs one semantic layer across farms, cold-chain logistics, retail and sustainability.
order: 1
---

## The Zava story

**Zava** is a global premium fresh fruit & vegetable producer and distributor. Their business spans:

- **Multi-origin sourcing** — partner farms in Spain, Ecuador, South Africa, Tunisia, Germany and more.
- **Four-stage quality control** — every harvest is inspected in the field, the packhouse, the destination DC and finally the store.
- **Cold-chain logistics** — reefer containers carrying perishable lots, monitored continuously by temperature sensors.
- **Retail partners** — supermarket chains (DCs and stores) place orders for specific varieties.
- **Sustainability** — a grower-development program (Zava Dreams) that farms can join.

## The data problem

Today, every one of those domains lives in a different system: agronomy ERPs, packhouse QC apps, IoT eventhouses, retail EDI feeds, CSR spreadsheets. A single question like:

> *"This morning a reefer container with 18 tonnes of Nadorcott mandarins crossed 9°C while in transit to a retailer's DC. Which retailer orders are at risk, and what is the revenue exposure?"*

…requires manually traversing five different systems. Analysts need to know which table holds shipments, which lakehouse holds orders, which eventhouse holds sensor telemetry — and how to join them.

## Why an ontology

An ontology defines the **business concepts** — `Grower`, `Farm`, `HarvestLot`, `Shipment`, `ColdChainSensor`, `RetailDC`, `Order`, `SustainabilityProgram` — and the **relationships** between them, *once*. The underlying tables and event streams are then **bound** to these concepts.

| Without ontology | With ontology |
|---|---|
| Analyst must know that `dim_grow.gr_lt_id = fact_harv.gr_id` | Business user asks "which growers placed lots at risk this week?" |
| Cold-chain telemetry lives in one system, orders in another | One traversal `Sensor → Shipment → HarvestLot → Order → Store` |
| New retailer? Rewrite five queries | New retailer? Add bindings, model stays the same |
| Sustainability tracking is a side spreadsheet | `Farm participatesIn SustainabilityProgram` is first-class |

## What we'll build

Over five progressive steps we'll construct the complete Zava grove-to-shelf ontology — **12 entity types** and **13 relationships** covering every layer of the business:

1. **Orchard Foundation** — `Grower`, `Farm`, `Plot`, `FruitVariety`
2. **Harvest & Quality** — `HarvestLot`, `QualityCheck`
3. **Cold-Chain Logistics** — `Shipment`, `ColdChainSensor`
4. **Retail Fulfillment** — `RetailDC`, `Store`, `Order`
5. **Complete Model** — `SustainabilityProgram`

At each step you'll see the graph grow and we'll preview the business questions the new entities unlock.

```quiz
Q: Which of these is the *primary* reason Zava benefits from an ontology over a traditional data warehouse?
- An ontology is faster than SQL at runtime
- It eliminates the need to store data altogether
- It expresses cross-domain business concepts once so business users can ask plain-language questions [correct]
- It replaces the need for cold-chain sensors
> The value isn't speed or storage — it's that *one* semantic vocabulary spans agronomy, logistics, retail and CSR data, so cross-domain questions become natural.
```

Let's start with the orchard.
