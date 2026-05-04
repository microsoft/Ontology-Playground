---
title: "Step 3: Loan Classification"
slug: loan-classification
description: Add loan types with Basel risk weights, collateral categories, and OCC/FDIC concentration buckets.
order: 4
embed: official/fibo-risk-step-3
reviewStatus: under-human-review
---

## The product dimension

We've modeled *where* risk lives (geography) and *what sectors* are exposed (industry). Now we add the **loan product dimension** — the classification of loans by type, their collateral, and the regulatory concentration buckets they fall into.

This is where Basel III risk weights enter the picture.

## New entity types

### ConcentrationCategory

Regulatory buckets defined by OCC/FDIC guidance. Banks must monitor exposure per category.

| Property | Type | Notes |
|---|---|---|
| `categoryId` | string | Identifier (e.g., "CRE", "C&I", "CONSUMER") |
| `name` | string | Display name |
| `description` | string | What falls in this category |
| `occGuidance` | string | Relevant OCC/FDIC guidance reference |

Example categories: **CRE** (Commercial Real Estate), **C&I** (Commercial & Industrial), **Consumer**, **Agriculture**.

### LoanType

Specific loan products with Basel III capital requirements.

| Property | Type | Notes |
|---|---|---|
| `loanTypeCode` | string | Identifier (e.g., "residential_mortgage") |
| `name` | string | Display name |
| `baselRiskWeight` | decimal (%) | Basel III standardized risk weight |
| `regulatoryTreatment` | string | How regulators classify this product |
| `capitalTier` | string | Capital treatment tier |
| `description` | string | Product description |

Key examples:

| Loan Type | Basel Risk Weight |
|---|---|
| Residential mortgage | 35% |
| Auto loan | 75% |
| SBA loan | 0% (government-guaranteed) |
| Construction loan | 150% |
| CRE mortgage | 100% |

### CollateralType

Asset categories that secure loans, with recovery expectations.

| Property | Type | Notes |
|---|---|---|
| `collateralTypeCode` | string | Identifier |
| `name` | string | Display name |
| `recoveryExpectation` | string | Expected recovery rate (e.g., "high", "moderate", "low") |
| `description` | string | Asset category description |

## New relationships

- **loanClassifiedAs**: `LoanType` → `ConcentrationCategory` (`many-to-one`) — each loan type maps to a concentration bucket
- **collateralClassifiedAs**: `CollateralType` → `ConcentrationCategory` (`many-to-one`) — collateral types also map to concentration buckets
- **typicallySecuredBy**: `CollateralType` → `LoanType` (`many-to-many`) — links which collateral types typically back which loan types

## The design pattern: hub entity

**ConcentrationCategory** is a *hub entity* — it connects the loan classification subgraph to the rest of the model. Both LoanType and CollateralType point to it, creating a shared reference point for regulatory analysis.

In Step 4, RegulatoryLimit will also connect to ConcentrationCategory, making it the central node for compliance queries.

## Basel III risk weights: why they matter

Basel III assigns risk weights that determine how much capital a bank must hold against each loan type. A 35% risk weight on residential mortgages means the bank needs less capital per dollar lent, while a 150% weight on construction loans means much more capital is required.

This directly impacts:

- **Profitability**: Lower risk weights = less capital tied up = higher return on equity
- **Portfolio strategy**: Banks optimize their loan mix with risk weights in mind
- **Regulatory compliance**: Exceeding risk-weighted asset limits triggers supervisory action

## Step 3 graph (diff from Step 2)

<ontology-embed id="official/fibo-risk-step-3" diff="official/fibo-risk-step-2" height="440px"></ontology-embed>

*Three new entities form the loan classification cluster. ConcentrationCategory is the hub connecting loan types and collateral types.*

```quiz
Q: Why does a construction loan have a 150% Basel risk weight while an SBA loan has 0%?
- Construction loans take longer to process
- SBA loans are government-guaranteed so the bank bears no credit risk, while construction loans have high default and completion risk [correct]
- Construction companies are less profitable
- SBA stands for Safe Banking Asset
> Basel III risk weights reflect the credit risk borne by the bank. SBA (Small Business Administration) loans are backed by the US government, so the bank has zero credit risk. Construction loans face completion risk, market risk, and high default rates, requiring banks to hold 150% risk-weighted capital.
```
