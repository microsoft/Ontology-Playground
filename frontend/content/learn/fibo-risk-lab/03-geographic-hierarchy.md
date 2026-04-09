---
title: "Step 2: Geographic Hierarchy"
slug: geographic-hierarchy
description: Add regions, countries, and jurisdictions with disaster-zone flags for geographic concentration analysis.
order: 3
embed: official/fibo-risk-step-2
reviewStatus: under-human-review
---

## Where risk lives

Industry classification tells you *what* sectors your portfolio is exposed to. Geographic hierarchy tells you *where*. A portfolio concentrated in Florida faces different risks than one concentrated in California — hurricanes vs. earthquakes and wildfires.

In this step we add three entities that model geographic location at increasing granularity, enriched with natural disaster flags.

## New entity types

### Region

Continental or macroeconomic regions — "North America", "Europe", "Asia-Pacific".

| Property | Type | Notes |
|---|---|---|
| `regionCode` | string | Identifier |
| `regionName` | string | Display name |
| `description` | string | Region description |
| `disasterProfile` | string | Dominant disaster types for the region |

### Country

Nation-states with economic and regulatory attributes.

| Property | Type | Notes |
|---|---|---|
| `countryCode` | string | Identifier (ISO country code) |
| `countryName` | string | Display name |
| `economicZone` | string | Economic classification (e.g., "developed", "emerging") |
| `currency` | string | National currency code |
| `regulatoryFramework` | string | Primary banking regulatory body |

### Jurisdiction

Subnational jurisdictions (states, provinces) with boolean disaster-zone flags.

| Property | Type | Notes |
|---|---|---|
| `code` | string | Identifier (e.g., "FL", "CA") |
| `name` | string | Display name |
| `hurricaneZone` | boolean | Exposed to hurricane risk |
| `floodZone` | boolean | Exposed to flood risk |
| `earthquakeZone` | boolean | Exposed to earthquake risk |
| `wildfireZone` | boolean | Exposed to wildfire risk |
| `coastal` | boolean | Coastal jurisdiction |
| `latitude` | decimal | Geographic latitude |
| `longitude` | decimal | Geographic longitude |

## New relationships

- **inCountry**: `Jurisdiction` → `Country` (`many-to-one`) — each jurisdiction belongs to one country
- **inRegion**: `Jurisdiction` → `Region` (`many-to-one`) — each jurisdiction maps to a geographic region

## The design pattern: boolean risk flags

Notice that Jurisdiction uses **boolean flags** rather than a single "riskType" enum. This is deliberate — a jurisdiction can be in multiple disaster zones simultaneously. Florida is both a `hurricaneZone` and a `floodZone`. California is both an `earthquakeZone` and a `wildfireZone`.

This pattern enables precise filtering:

- "Show all jurisdictions that are both `hurricaneZone = true` AND `coastal = true`"
- "What's our total exposure in `earthquakeZone` jurisdictions?"

## Two independent hierarchies

At this point the model has two separate subgraphs:

1. **Industry**: Sector ← Subsector ← IndustryGroup
2. **Geography**: Region ← Country (via Jurisdiction) and Region ← Jurisdiction

These will connect in later steps when we add loan products and regulatory limits.

## Step 2 graph (diff from Step 1)

<ontology-embed id="official/fibo-risk-step-2" diff="official/fibo-risk-step-1" height="400px"></ontology-embed>

*Three new entities (highlighted) add the geographic dimension. Note the two independent subgraphs — they'll connect in Step 3.*

```quiz
Q: Why does Jurisdiction use boolean flags instead of a single riskType property?
- Boolean flags are easier to store in a database
- A jurisdiction can be in multiple disaster zones simultaneously, which a single enum cannot represent [correct]
- Boolean flags render better in the graph visualization
- FIBO requires boolean properties for all classifiers
> A single jurisdiction can face multiple natural disaster risks at once. Florida is both hurricane-prone and flood-prone. Boolean flags allow precise multi-dimensional filtering, which is essential for compound risk queries like "hurricane zone AND coastal AND flood zone."
```
