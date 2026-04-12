---
title: Scenario Overview
slug: scenario-overview
description: Why risk management needs ontologies, and what we'll build in this lab.
order: 1
reviewStatus: under-human-review
---

## The problem: concentration risk

When a bank's loan portfolio is too heavily exposed to a single industry, geography, or product type, a single adverse event — a hurricane, an industry downturn, a regulatory change — can cascade into systemic losses. This is **concentration risk**, and regulators like the OCC and FDIC require banks to monitor and limit it.

The challenge? Concentration risk spans multiple domains simultaneously:

- **Industry**: Is too much lending concentrated in construction or real estate?
- **Geography**: Are loans clustered in hurricane-prone or earthquake-prone jurisdictions?
- **Product type**: What's the Basel III risk-weighted exposure by loan type?
- **Regulation**: Which concentration limits are approaching their thresholds?

## Why ontologies matter here

Traditional data warehouses store these dimensions in separate tables with foreign keys. An ontology-driven approach gives you:

- **Explicit semantics** — "a residential mortgage has a 35% Basel risk weight" is encoded in the model, not buried in business rules
- **Cross-domain queries** — traverse from a jurisdiction's disaster flags through its loans to their concentration categories in a single graph walk
- **Regulatory traceability** — every limit links to the regulation that mandates it

## What we'll build

Over four progressive steps, we'll model a **FIBO Risk Management** ontology with 11 entity types and 10 relationships:

| Step | Domain | New Entities |
|---|---|---|
| 1 | Industry Classification | Sector, Subsector, IndustryGroup |
| 2 | Geographic Hierarchy | Region, Country, Jurisdiction |
| 3 | Loan Classification | ConcentrationCategory, LoanType, CollateralType |
| 4 | Regulatory Context | Regulation, RegulatoryLimit |

## Real questions this model supports

- Which jurisdictions in hurricane zones have the highest concentration of construction loans?
- What percentage of the portfolio exceeds OCC concentration limits?
- Which loan types carry the highest Basel risk weight in regions with high climate sensitivity?
- How do regulatory limits map across concentration categories?

## Source and licensing

All concepts in this lab are adapted from the [EDM Council FIBO](https://github.com/edmcouncil/fibo) ontology under the [MIT License](https://opensource.org/licenses/MIT). The specific modules referenced include classification, geographic, debt/equity, and regulatory frameworks from the FIBO family.

```quiz
Q: What is concentration risk in banking?
- The risk that a bank's technology systems are too centralized
- The risk that too much of a loan portfolio is exposed to a single industry, geography, or product type [correct]
- The risk that a bank has too many branches in one city
- The risk that interest rates change unexpectedly
> Concentration risk occurs when a bank's lending is overly exposed to a single sector, region, or product type. A single adverse event (natural disaster, industry downturn) can then cause outsized losses across the portfolio.
```
