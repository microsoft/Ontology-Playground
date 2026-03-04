---
title: Scenario Overview
slug: scenario-overview
description: Understand why FIBO matters for loan, mortgage, and servicing data integration.
order: 1
---

## Why this lab

FIBO (Financial Industry Business Ontology) is a large, modular ontology family. In production, teams use it to standardize terms across lending systems, servicing platforms, compliance workflows, and reporting pipelines.

The challenge for learners is scope: raw FIBO modules are deep and highly interconnected. This lab uses an adapted subset focused on loan contracts and payment behavior so you can learn the patterns without losing semantic fidelity.

## Target outcome

By the end of this lab you will model:

1. Core participants: `Loan`, `Borrower`, `Lender`
2. Contract structure: `Collateral`, `LoanPaymentSchedule`
3. Operations: `Servicer`, `PaymentHistory`, `IndividualPaymentTransaction`
4. Risk and underwriting classifiers: `OwnershipInterest`, `LenderLienPosition`

## Real questions this model supports

- Which collateralized loans have subordinate lien positions?
- Which borrowers have interest-only loans above a principal threshold?
- How do payment transaction patterns vary by servicer?
- Which ownership structures correlate with repayment issues?

## How this maps to FIBO

This tutorial is inspired by `LOAN/LoansGeneral/Loans` concepts in FIBO. We preserve key semantics (loan parties, collateral, servicing, schedule, payment history, lien classifiers) but keep the graph compact for instruction.

```quiz
Q: Why does this lab use an adapted subset instead of the full FIBO repository?
- Full FIBO is proprietary and cannot be used in open tutorials
- Full FIBO is too small to teach meaningful concepts
- Full FIBO is large and highly modular, so a focused subset makes progressive learning easier [correct]
- Full FIBO only supports securities and not loans
> The full FIBO model is rich and interconnected, which is excellent for production but heavy for first-pass learning. This lab keeps core semantics while making the model teachable step by step.
```
