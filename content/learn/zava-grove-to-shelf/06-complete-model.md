---
title: Complete Model
slug: complete-model
description: Add SustainabilityProgram to close the grove-to-shelf model — 12 entities, 13 relationships, ready for the demo.
order: 6
embed: official/zava-grove-to-shelf-step-5
---

## The last entity: sustainability

Zava runs a grower-development program — internally codenamed **Dreams** — that partner farms can opt into. It funds water-efficiency, fair-pay and biodiversity initiatives. Today this data lives in a marketing system, disconnected from the supply chain.

One entity and one relationship pull it into the model:

### SustainabilityProgram

| Property | Type | Identifier? |
|---|---|---|
| `programId` | string | ✓ |
| `name` | string | |
| `focusArea` | string | |
| `startYear` | integer | |

### New relationship

| From | Verb | To | Cardinality |
|---|---|---|---|
| Farm | participatesIn | SustainabilityProgram | many-to-many |

A many-to-many because a single farm can be in several programs (e.g. *Dreams Water* and *Dreams Biodiversity*) and a single program enrolls many farms.

## The complete graph

<ontology-embed id="official/zava-grove-to-shelf-step-5" diff="official/zava-grove-to-shelf-step-4" height="520px"></ontology-embed>

*12 entities, 13 relationships. Every business domain Zava cares about is now a first-class concept connected by named edges.*

## What this model unlocks on stage

Five questions, each previously a multi-system, multi-day effort, all now answerable from one ontology:

| Question | Path |
|---|---|
| *"Show me last quarter's revenue from mandarins, broken down by retail chain and origin country."* | `Order forVariety FruitVariety[category=citrus]`, group by `Store.retailerName` and `HarvestLot → Plot → Farm.country` |
| *"Which growers had quality-check failures on blueberries in the last 30 days?"* | `QualityCheck[passed=false] → HarvestLot[ofVariety.category=berry] → Plot → Farm ← owns ← Grower` |
| *"Which shipments in transit have temperature above the safe threshold for their variety?"* | `Shipment monitoredBy ColdChainSensor[temperatureC > carries.harvestLot.ofVariety.maxStorageTempC]` |
| *"For the breach on shipment SH-2026-04812, which retailer orders are at risk and what is the revenue exposure?"* | `Shipment[id=SH-2026-04812] → RetailDC supplies Store places Order[forVariety = breached variety, status=open]` then sum `kilograms × unitPriceEur` |
| *"What percentage of our berry volume this season came from Dreams-program farms?"* | `HarvestLot[ofVariety.category=berry, harvestDate∈season]`, group by whether `fromPlot → Farm participatesIn SustainabilityProgram[name~"Dreams"]` |

## What we built

| Step | Entities added | Cumulative | Key concept |
|---|---|---|---|
| 1 | Grower, Farm, Plot, FruitVariety | 4 | Multi-origin sourcing, traceability anchor |
| 2 | HarvestLot, QualityCheck | 6 | Lineage events, four-stage QC regime |
| 3 | Shipment, ColdChainSensor | 8 | Hub entities, time-series binding |
| 4 | RetailDC, Store, Order | 11 | Closing the loop to revenue |
| 5 | SustainabilityProgram | 12 | Many-to-many CSR overlay |

## Key takeaways

1. **One vocabulary spans five systems.** Agronomy ERPs, packhouse QC apps, IoT eventhouses, retail EDI feeds and CSR records all become bindings on the same 12-entity model.
2. **Hub entities matter.** `HarvestLot` is the lineage hub. `Shipment` is the lakehouse↔eventhouse hub. `FruitVariety` is the supply↔demand hub.
3. **Time-series telemetry is first-class.** `ColdChainSensor` looks just like any other entity in the ontology — the underlying storage choice (Eventhouse) is invisible to the question-asker.
4. **Sustainability isn't a side spreadsheet.** Adding `SustainabilityProgram` lets CSR questions ride the same graph as revenue questions.
5. **The ontology becomes the contract.** GQL queries, Fabric Data Agent prompts, and Activator rules all reference the same entity and relationship names.

```quiz
Q: In Zava's complete model, the question *"What percentage of our berry volume this season came from Dreams-program farms?"* requires which path?
- Order → Store → RetailDC → Farm
- HarvestLot → Plot → Farm → SustainabilityProgram [correct]
- ColdChainSensor → Shipment → Farm → SustainabilityProgram
- FruitVariety → SustainabilityProgram
> Volume is recorded on HarvestLot. To learn whether that lot came from a Dreams-program farm, walk HarvestLot → fromPlot → Plot → (contained by) Farm → participatesIn → SustainabilityProgram and filter on the program name.
```

You've completed the Zava Grove-to-Shelf lab. Open the [Step 5 ontology](#/catalogue/official/zava-grove-to-shelf-step-5) in the playground to query, extend, or export it.
