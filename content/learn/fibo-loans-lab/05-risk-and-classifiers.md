---
title: Risk and Classifiers
slug: risk-and-classifiers
description: Add ownership and lien classifiers to support underwriting and collateral risk analysis.
order: 5
embed: official/fibo-loans-step-4
---

## Classification layer

FIBO relies heavily on explicit classifiers. In this final step, we add:

- `OwnershipInterest`: classifies legal ownership type of collateral
- `LenderLienPosition`: classifies claim seniority over collateral

These concepts are crucial in mortgage and secured lending risk analysis.

## New relationships

- `classifiesCollateralOwnership`: `OwnershipInterest` -> `Collateral`
- `hasLienPosition`: `Collateral` -> `LenderLienPosition`

## Step 4 graph (diff from Step 3)

<ontology-embed id="official/fibo-loans-step-4" diff="official/fibo-loans-step-3" height="460px"></ontology-embed>

## External adapted FIBO subset

You can also inspect the compact external subset entry built from the same ideas:

<ontology-embed id="external/fibo/loans-general" height="420px"></ontology-embed>

## What you built

You now have a progressive, FIBO-inspired loan ontology that covers:

- Contract actors and obligations
- Security and schedule structure
- Servicing and payment operations
- Ownership and lien risk classifiers

This is a strong base for expanding into domain-specific modules (mortgage, HELOC, auto lending, small business lending).

```quiz
Q: What is the main value of adding `LenderLienPosition` to a collateral model?
- It replaces the need for borrower information
- It captures seniority of lender claims, which is key for credit risk and loss modeling [correct]
- It stores payment timestamps
- It determines loan interest rates automatically
> Lien position captures claim priority (for example, primary vs subordinate), which directly influences recovery expectations and therefore underwriting and portfolio risk models.
```
