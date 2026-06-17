---
title: Cold-Chain Logistics
slug: cold-chain-logistics
description: Add Shipment and ColdChainSensor to model the perishable logistics layer — and the live temperature telemetry that drives Zava's most important alerting rule.
order: 4
embed: official/zava-grove-to-shelf-step-3
---

## The most expensive minutes in Zava's day

Once a HarvestLot leaves the packhouse, the clock starts. Fruit is perishable. A 15-minute breach above the safe temperature for a variety can write off an entire reefer container — easily six figures of revenue. The cold-chain layer is where Zava's investment in semantics pays back hardest.

Two new entities express this domain:

- **Shipment** — a reefer container or truck moving one or more HarvestLots toward a retail DC.
- **ColdChainSensor** — a sensor attached to a shipment streaming temperature and humidity telemetry.

## Entities

### Shipment

| Property | Type | Identifier? |
|---|---|---|
| `shipmentId` | string | ✓ |
| `departureDate` | datetime | |
| `etaDate` | datetime | |
| `modality` | string | |
| `containerId` | string | |

### ColdChainSensor

| Property | Type | Identifier? |
|---|---|---|
| `sensorId` | string | ✓ |
| `sensorModel` | string | |
| `temperatureC` | decimal (°C) | |
| `humidityPct` | decimal (%) | |

In Microsoft Fabric IQ, `ColdChainSensor` is the canonical example of a **time-series entity** — its readings are bound to an Eventhouse rather than a Lakehouse table. The ontology hides that split: queries traverse `Sensor → Shipment` without knowing the underlying engine.

## New relationships

| From | Verb | To | Cardinality |
|---|---|---|---|
| Shipment | carries | HarvestLot | one-to-many |
| Shipment | monitoredBy | ColdChainSensor | one-to-many |

Notice how `Shipment` acts as a **hub** — it bridges the static lakehouse world (HarvestLot lineage) to the streaming eventhouse world (sensor telemetry).

## The cold-chain breach query

The flagship Zava demo question:

> *"Shipment SH-2026-04812 just crossed 9°C. Which retailer orders are exposed?"*

Today this is a five-system manual chase. With the ontology, it is a single traversal:

```
ColdChainSensor[temperatureC > FruitVariety.maxStorageTempC + 2]
   → Shipment
   → HarvestLot
   → (later) Order → Store → Retailer
```

We'll connect the retail side in the next step.

## The graph so far

<ontology-embed id="official/zava-grove-to-shelf-step-3" diff="official/zava-grove-to-shelf-step-2" height="450px"></ontology-embed>

*Eight entities. The right-hand branch (Sensor → Shipment) is the live telemetry side; the left-hand branch (HarvestLot → Plot → Farm → Grower) is the lineage side. The ontology unifies them.*

```quiz
Q: What does it mean that `Shipment` is described as a "hub" entity?
- It is the largest entity in the graph
- It connects two otherwise separate domains — lineage (harvest lots) and telemetry (sensors) — through a single shared concept [correct]
- Every other entity must connect through it
- Hubs are required for RDF compliance
> A hub entity links domains that would otherwise live in different systems. Shipment connects HarvestLot (Lakehouse lineage) with ColdChainSensor (Eventhouse telemetry), so a single graph traversal spans both.
```

Next we'll close the loop to retail — DCs, stores and the orders at risk.
