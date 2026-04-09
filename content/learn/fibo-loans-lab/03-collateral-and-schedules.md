---
title: Collateral and Schedules
slug: collateral-and-schedules
description: Add security agreements and repayment cadence using FIBO's collateral and payment schedule concepts.
order: 3
embed: official/fibo-loans-step-2
reviewStatus: under-human-review
---

## From contract to structure

A loan becomes operationally meaningful when you add two concepts from FIBO:

- **Collateral** — what secures repayment (adapted from `fibo-fbc-dae-dbt:Collateral` in [FBC/DebtAndEquities/Debt](https://github.com/edmcouncil/fibo/tree/master/FBC/DebtAndEquities/Debt))
- **LoanPaymentSchedule** — how repayment is expected over time (adapted from `fibo-loan-ln-ln:LoanPaymentSchedule` in [LOAN/LoansGeneral/Loans](https://github.com/edmcouncil/fibo/tree/master/LOAN/LoansGeneral/Loans))

These additions capture two core FIBO concerns: **security agreements** and **temporal obligations**.

## New properties

### Collateral

| Property | Type | Notes |
|---|---|---|
| `assetType` | string | Identifier — the kind of asset (e.g., "real property", "vehicle", "securities") |
| `appraisedValue` | decimal (USD) | Market value at time of appraisal |

> **FIBO reference**: In the full ontology, collateral connects to `fibo-fnd-plc-rp:RealProperty` for mortgages and to abstract `Asset` classes for other secured lending. The FIBO Mortgages module ([LOAN/RealEstateLoans/Mortgages](https://github.com/edmcouncil/fibo/tree/master/LOAN/RealEstateLoans/Mortgages)) adds lien-specific restrictions via `owl:Restriction` blocks.

### LoanPaymentSchedule

| Property | Type | Notes |
|---|---|---|
| `scheduleId` | string | Identifier |
| `expectedPayments` | integer | Anticipated number of payment periods |

## New relationships

- **securedBy**: `Loan` → `Collateral` (`one-to-many`) — a loan can be secured by multiple assets
- **repaidBySchedule**: `Loan` → `LoanPaymentSchedule` (`one-to-one`) — each loan has one primary repayment schedule

## Step 2 graph (diff from Step 1)

<ontology-embed id="official/fibo-loans-step-2" diff="official/fibo-loans-step-1" height="380px"></ontology-embed>

*New entities highlighted: Collateral and LoanPaymentSchedule extend the loan model with security and temporal structure.*

```quiz
Q: In FIBO, where does the Collateral concept originate?
- LOAN/LoansGeneral/Loans
- FBC/DebtAndEquities/Debt [correct]
- FND/Agreements/Contracts
- FND/Places/RealProperty
> Collateral is defined in FIBO's FBC (Financial Business and Commerce) domain under DebtAndEquities/Debt. It represents assets pledged to secure repayment obligations — a concept shared across all secured lending types, not just mortgages.
```
