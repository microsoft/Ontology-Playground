---
title: "Step 1: Industry Classification"
slug: industry-classification
description: Model the economic hierarchy — Sector, Subsector, and IndustryGroup with climate and cyclicality attributes.
order: 2
embed: official/fibo-risk-step-1
reviewStatus: under-human-review
---

## Why classify industries?

Banks need to understand their exposure across economic sectors. If 40% of a portfolio's loans are to construction companies, a housing downturn could be devastating. The **NAICS** (North American Industry Classification System) provides a standard taxonomy that FIBO builds upon.

In this step we model a three-level hierarchy: Sector → Subsector → IndustryGroup, enriched with risk-relevant attributes.

## Entity types

### Sector

The broadest classification — think "Manufacturing", "Finance", "Healthcare".

| Property | Type | Notes |
|---|---|---|
| `sectorCode` | string | Identifier (e.g., "31-33") |
| `sectorName` | string | Display name |
| `description` | string | What this sector covers |

### Subsector

A subdivision within a sector — "Food Manufacturing" within "Manufacturing".

| Property | Type | Notes |
|---|---|---|
| `subsectorCode` | string | Identifier (e.g., "311") |
| `subsectorName` | string | Display name |

### IndustryGroup

The most granular level, with risk attributes that matter for portfolio analysis.

| Property | Type | Notes |
|---|---|---|
| `naicsCode` | string | Identifier — official NAICS code |
| `name` | string | Industry name |
| `cyclicality` | string | How sensitive to economic cycles (e.g., "high", "low", "counter-cyclical") |
| `climateSensitivity` | string | Exposure to climate events (e.g., "high", "moderate", "low") |
| `essentialServices` | boolean | Whether the industry provides essential services (more resilient) |
| `description` | string | Industry description |

## Relationships

- **partOfSector**: `Subsector` → `Sector` (`many-to-one`) — every subsector belongs to exactly one sector
- **belongsToSubsector**: `IndustryGroup` → `Subsector` (`many-to-one`) — every industry group belongs to a subsector

This creates a strict hierarchy: `Sector` ← `Subsector` ← `IndustryGroup`

## The design pattern: classification hierarchy

This is one of the most common ontology patterns — a **strict tree hierarchy** where each child has exactly one parent. It enables:

- **Roll-up aggregation**: Sum all loans to IndustryGroups within a Subsector to get subsector exposure
- **Drill-down analysis**: Start at Sector level, drill into Subsectors, then into specific IndustryGroups
- **Risk attribute inheritance**: If a Sector is "cyclical", all its children inherit that risk context

## Step 1 graph

<ontology-embed id="official/fibo-risk-step-1" height="340px"></ontology-embed>

*Three entities forming a classification tree — the foundational pattern for industry concentration analysis.*

```quiz
Q: Why does IndustryGroup include a climateSensitivity property?
- To track the industry's carbon emissions
- To enable portfolio risk queries that filter industries by their exposure to climate events like hurricanes or wildfires [correct]
- To comply with ESG reporting requirements
- To calculate insurance premiums for loans
> The climateSensitivity property lets risk analysts identify which parts of the loan portfolio are exposed to climate-related events. Combined with geographic data (next step), this enables powerful cross-domain concentration queries.
```
