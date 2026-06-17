---
title: Orchard Foundation
slug: orchard-foundation
description: Define Grower, Farm, Plot and FruitVariety — the four entities that capture Zava's multi-origin sourcing model.
order: 2
embed: official/zava-grove-to-shelf-step-1
---

## Where Zava's data starts

Zava sources premium fruit from a network of partner producers. Before we can talk about quality, shipments or retail orders, we need a vocabulary for **who grows what, where**.

Four entities capture this:

- **Grower** — the partner company (e.g. *Finca La Marina S.L.*).
- **Farm** — the geographic site a grower owns or operates.
- **Plot** — a managed parcel inside a farm, planted with one variety.
- **FruitVariety** — the commercial variety (e.g. *Nadorcott* mandarin, *Sekoya Pop* blueberry).

## Entities

### Grower

| Property | Type | Identifier? |
|---|---|---|
| `growerId` | string | ✓ |
| `name` | string | |
| `country` | string | |
| `partnerSince` | date | |
| `isMasterGrower` | boolean | |

`isMasterGrower` flags Zava's strategic, long-term partners.

### Farm

| Property | Type | Identifier? |
|---|---|---|
| `farmId` | string | ✓ |
| `name` | string | |
| `country` | string | |
| `region` | string | |
| `hectares` | decimal (ha) | |

### Plot

| Property | Type | Identifier? |
|---|---|---|
| `plotId` | string | ✓ |
| `hectares` | decimal (ha) | |
| `plantingYear` | integer | |

### FruitVariety

| Property | Type | Identifier? |
|---|---|---|
| `varietyId` | string | ✓ |
| `commercialName` | string | |
| `category` | string | |
| `shelfLifeDays` | integer (days) | |

## Relationships

| From | Verb | To | Cardinality |
|---|---|---|---|
| Grower | owns | Farm | one-to-many |
| Farm | contains | Plot | one-to-many |
| Plot | grows | FruitVariety | many-to-one |

The chain `Grower → Farm → Plot → FruitVariety` is what makes **end-to-end traceability** possible: from a piece of fruit on the shelf back to the exact plot it came from.

## The graph so far

<ontology-embed id="official/zava-grove-to-shelf-step-1" height="380px"></ontology-embed>

*Four entities and three relationships are already enough to answer questions like "How many hectares of Nadorcott mandarin does Zava source from Spain?"*

```quiz
Q: In Zava's model, why is `Plot` a separate entity from `Farm` rather than just a property of `Farm`?
- It makes the graph look denser
- A farm can host multiple plots each planted with a different variety, and traceability requires plot-level identity [correct]
- Plots have different owners than farms
- It's required by RDF
> Plots are first-class because a single farm typically grows several varieties side-by-side, and Zava needs to trace each harvest lot back to the specific plot — not just the farm.
```

Next, we'll add the **harvest events** and the famous **four-stage quality check**.
