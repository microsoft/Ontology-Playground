---
title: Core Loan Triad
slug: core-loan-triad
description: Model the foundational FIBO loan triangle: Loan, Borrower, and Lender.
order: 2
embed: official/fibo-loans-step-1
---

## The contractual core

Most loan workflows start with three concepts:

- `Loan`: the debt instrument and contract envelope
- `Borrower`: the obligated repayment party
- `Lender`: the originating funding party

This triad gives you enough structure to represent who owes what to whom.

## Key properties

- `loanId` (identifier), `principalAmount`, `isInterestOnly`
- `borrowerId` (identifier), `creditScore`
- `lenderId` (identifier), `lenderType`

These properties are intentionally practical: they combine contractual identity, underwriting context, and portfolio segmentation.

## Relationships

- `owedBy`: `Loan` -> `Borrower` (`many-to-one`)
- `originatedBy`: `Loan` -> `Lender` (`many-to-one`)

## Step 1 graph

<ontology-embed id="official/fibo-loans-step-1" height="340px"></ontology-embed>

```quiz
Q: Which relationship best represents loan repayment responsibility?
- Borrower -> Loan (originatedBy)
- Loan -> Borrower (owedBy) [correct]
- Lender -> Loan (owedBy)
- Loan -> Lender (hasCollateral)
> In this model the loan points to the borrower through `owedBy`, making repayment obligation explicit from the contract object.
```
