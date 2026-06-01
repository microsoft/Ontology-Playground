---
title: Harvest & Quality
slug: harvest-and-quality
description: Add HarvestLot and QualityCheck to capture every traceable harvest event and Zava's four-stage quality regime.
order: 3
embed: official/zava-grove-to-shelf-step-2
---

## Every box has a lot

When a plot is picked, the kilos that come off it become a **HarvestLot** — the unit of traceability that flows through the rest of the supply chain. Every later event (a temperature breach, a retailer return, a customer claim) ultimately points back to a HarvestLot.

Zava also runs **"four times quality control"** — the same lot is inspected at four distinct stages: field, packhouse, destination DC, and finally store. Each inspection is a separate `QualityCheck` event with its own stage number.

## Entities

### HarvestLot

| Property | Type | Identifier? |
|---|---|---|
| `lotId` | string | ✓ |
| `harvestDate` | date | |
| `kilograms` | decimal (kg) | |
| `qcGrade` | string | |

### QualityCheck

| Property | Type | Identifier? |
|---|---|---|
| `checkId` | string | ✓ |
| `stage` | integer (1–4) | |
| `passed` | boolean | |
| `defectRate` | decimal (%) | |
| `checkedAt` | datetime | |

The `stage` field is what makes the four-stage regime explicit in the semantic layer: a single business question like *"which growers consistently fail stage 3 checks?"* is now a direct property filter.

## New relationships

| From | Verb | To | Cardinality |
|---|---|---|---|
| HarvestLot | fromPlot | Plot | many-to-one |
| HarvestLot | ofVariety | FruitVariety | many-to-one |
| QualityCheck | checks | HarvestLot | many-to-one |

`ofVariety` may seem redundant given `fromPlot → grows → FruitVariety`, but it lets queries about variety mix in shipments skip a hop — and crucially it captures the *as-harvested* variety, which can differ from the plot's nominal variety after replanting cycles.

## The graph so far

<ontology-embed id="official/zava-grove-to-shelf-step-2" diff="official/zava-grove-to-shelf-step-1" height="420px"></ontology-embed>

*Six entities. Notice the two new hubs: HarvestLot is the lineage anchor and QualityCheck attaches to it from the side.*

## Business questions this unlocks

- *"Which growers had QC failures on blueberries in the last 30 days?"*
  → `QualityCheck[passed=false] → HarvestLot → Plot → Farm → Grower` filtered on `ofVariety.category = "berry"`.
- *"What's our QC pass-rate by stage and country of origin?"*
  → group by `QualityCheck.stage` and `HarvestLot → Plot → Farm.country`.

```quiz
Q: Why does Zava model `QualityCheck` as a separate entity rather than four boolean columns on `HarvestLot` (e.g. `qc1Passed`, `qc2Passed`, …)?
- RDF does not support booleans
- Modelling it as an entity lets each check carry its own `inspector`, `defectRate`, `checkedAt`, and lets us count or filter checks by `stage` [correct]
- It improves graph rendering performance
- Boolean columns would not be supported by Fabric IQ
> Booleans would flatten away the inspector, timestamp and defect rate. As an entity, QualityCheck becomes a first-class event we can aggregate, filter and join — exactly what's needed to answer "which growers fail stage 3 most often?".
```

Next we'll connect harvest lots to the cold-chain side of the business.
