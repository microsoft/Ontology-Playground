---
title: "Step 4: Regulatory Context"
slug: regulatory-context
description: Complete the model with banking regulations, concentration limits, and cross-domain connections.
order: 5
embed: official/fibo-risk-step-4
reviewStatus: under-human-review
---

## Closing the loop

The first three steps built reference data: industry, geography, and loan classification. In this final step we add the **regulatory enforcement layer** — the regulations and quantitative limits that constrain portfolio concentration.

This is where the ontology becomes operationally powerful: you can now trace from a specific loan to its concentration category to the regulatory limits that apply, and know which regulation mandates each limit.

## New entity types

### Regulation

A regulatory framework issued by a banking authority.

| Property | Type | Notes |
|---|---|---|
| `regulationCode` | string | Identifier (e.g., "OCC_CRE_2006") |
| `name` | string | Regulation name |
| `issuingAuthority` | string | Who issued it (OCC, FDIC, Basel Committee) |
| `effectiveDate` | date | When it took effect |
| `scope` | string | What it covers |
| `description` | string | Full description |

### RegulatoryLimit

A specific quantitative threshold from a regulation.

| Property | Type | Notes |
|---|---|---|
| `limitId` | string | Identifier |
| `limitName` | string | Display name |
| `category` | string | What dimension it constrains |
| `thresholdPct` | decimal (%) | The limit value |
| `severity` | string | Consequences of breach (e.g., "warning", "action required", "supervisory intervention") |
| `description` | string | What this limit means |

Key examples:

| Limit | Threshold | Regulation |
|---|---|---|
| CRE concentration | 300% of capital | OCC Guidance 2006-46 |
| Climate + hurricane | 15% of portfolio | Internal risk policy |
| Geographic concentration | 20% of portfolio | OCC Bulletin 2011-12 |
| Industry concentration | 25% of portfolio | FDIC Risk Management |

## New relationships

- **mandatedBy**: `RegulatoryLimit` → `Regulation` (`many-to-one`) — each limit is mandated by a specific regulation
- **limitAppliesToCategory**: `RegulatoryLimit` → `ConcentrationCategory` (`many-to-one`) — links limits to the concentration categories they constrain

## The design pattern: cross-domain bridge

With `limitAppliesToCategory`, the regulatory layer connects to the loan classification layer via ConcentrationCategory. This completes a **cross-domain query path**:

```
Jurisdiction (hurricaneZone=true)
  → [geographic dimension]
    → ConcentrationCategory
      → [regulatory dimension]
        → RegulatoryLimit (thresholdPct)
          → Regulation (issuingAuthority)
```

And from the industry side:

```
IndustryGroup (climateSensitivity="high")
  → [industry dimension]
    → Subsector → Sector
```

## Complete model

The final ontology has **11 entity types** across four domains and **10 relationships**:

| Domain | Entities | Relationships |
|---|---|---|
| Industry | Sector, Subsector, IndustryGroup | partOfSector, belongsToSubsector |
| Geography | Region, Country, Jurisdiction | inCountry, inRegion |
| Loan Classification | ConcentrationCategory, LoanType, CollateralType | loanClassifiedAs, collateralClassifiedAs, typicallySecuredBy |
| Regulation | Regulation, RegulatoryLimit | mandatedBy, limitAppliesToCategory |

## Step 4 graph (diff from Step 3)

<ontology-embed id="official/fibo-risk-step-4" diff="official/fibo-risk-step-3" height="480px"></ontology-embed>

*Two new entities (Regulation and RegulatoryLimit) complete the model. The limitAppliesToCategory relationship bridges regulatory enforcement to loan classification.*

## Full external reference ontologies

You can also explore each domain individually in the external catalogue:

- [FIBO Industry Classification](/#/catalogue/external/fibo/industry-classification)
- [FIBO Geographic Hierarchy](/#/catalogue/external/fibo/geographic-hierarchy)
- [FIBO Loan Classification](/#/catalogue/external/fibo/loan-classification)
- [FIBO Regulatory Context](/#/catalogue/external/fibo/regulatory-context)

## What you built

You now have a comprehensive FIBO-inspired risk management ontology that enables:

- **Industry concentration analysis** — roll up exposure by sector, subsector, and industry group
- **Geographic risk assessment** — filter by disaster-zone flags and cross-reference with portfolio data
- **Basel III capital calculations** — apply standardized risk weights to loan types
- **Regulatory compliance monitoring** — check portfolio concentration against mandated limits

This model powers the kind of cross-domain risk queries that would require complex multi-table JOINs in a traditional data warehouse, but can be expressed as simple graph traversals in an ontology-driven system.

## Licensing

All FIBO ontology content referenced in this lab is:

- **Copyright** (c) 2016-2025 EDM Council, Inc. and Object Management Group, Inc.
- **Licensed** under the [MIT License](https://opensource.org/licenses/MIT)

```quiz
Q: What role does ConcentrationCategory play in the complete model?
- It stores geographic coordinates
- It acts as a hub entity connecting loan classification, collateral types, and regulatory limits across domains [correct]
- It defines the Basel risk weight for each loan
- It replaces the Regulation entity for compliance tracking
> ConcentrationCategory is the central hub that bridges the loan classification domain to the regulatory domain. Both LoanType and CollateralType classify into it, and RegulatoryLimit constrains it. This makes it the key node for cross-domain concentration risk queries.
```
