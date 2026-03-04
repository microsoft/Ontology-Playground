---
title: Collateral and Schedules
slug: collateral-and-schedules
description: Add security agreements and repayment cadence using collateral and payment schedule entities.
order: 3
embed: official/fibo-loans-step-2
---

## From contract to structure

A loan becomes operationally meaningful when you add:

- `Collateral`: what secures repayment
- `LoanPaymentSchedule`: how repayment is expected over time

These additions capture two core FIBO concerns: security and temporal obligations.

## New properties

- `Collateral`: `assetType`, `appraisedValue`
- `LoanPaymentSchedule`: `scheduleId`, `anticipatedNumberOfPayments`

## New relationships

- `securedBy`: `Loan` -> `Collateral` (`one-to-many`)
- `repaidBySchedule`: `Loan` -> `LoanPaymentSchedule` (`one-to-one`)

## Step 2 graph (diff from Step 1)

<ontology-embed id="official/fibo-loans-step-2" diff="official/fibo-loans-step-1" height="380px"></ontology-embed>

```quiz
Q: Why is `repaidBySchedule` modeled as one-to-one in this lab?
- Every payment schedule is shared by all loans
- A loan has no schedule in FIBO
- For instructional clarity, each loan is tied to one primary schedule artifact [correct]
- Because one-to-many is not supported in RDF
> Real-world systems can have edge cases, but using one primary schedule per loan keeps the model easy to reason about while preserving core repayment semantics.
```
