---
title: Core Loan Triad
slug: core-loan-triad
description: Model the foundational FIBO loan triangle — Loan, Borrower, and Lender — with properties and relationships.
order: 2
embed: official/fibo-loans-step-1
reviewStatus: under-human-review
---

## The contractual core

Every lending system starts with three core concepts from FIBO loan and debt modules:

- **Loan** — the debt instrument and contract envelope (`LOAN/LoansGeneral/Loans`)
- **Borrower** — the obligated repayment party role (`FBC/DebtAndEquities/Debt`)
- **Lender** — the originating funding party role (`FBC/DebtAndEquities/Debt`)

In FIBO's OWL ontologies, these are modeled as `fibo-loan-ln-ln:Loan`, `fibo-fbc-dae-dbt:Borrower`, and `fibo-fbc-dae-dbt:Lender`.
The LOAN module imports and constrains these party-role concepts for loan-specific use. We simplify the class hierarchy but preserve the core semantics.

## Key properties

### Loan

| Property | Type | Notes |
|---|---|---|
| `loanId` | string | Identifier |
| `principalAmount` | decimal (USD) | The originally contracted amount |
| `isInterestOnly` | boolean | Whether the borrower pays only interest during the initial term |

### Borrower

| Property | Type | Notes |
|---|---|---|
| `borrowerId` | string | Identifier |
| `name` | string | Party name |
| `creditScore` | integer | Underwriting metric (e.g., FICO score) |

### Lender

| Property | Type | Notes |
|---|---|---|
| `lenderId` | string | Identifier |
| `name` | string | Organization name |
| `lenderType` | string | Classification (e.g., "bank", "credit union", "mortgage company") |

## Relationships

FIBO models loan party roles as relationships from the contract object to the party:

- **owedBy**: `Loan` → `Borrower` (`many-to-one`) — a loan is owed by exactly one borrower, but a borrower can hold multiple loans
- **originatedBy**: `Loan` → `Lender` (`many-to-one`) — a loan is originated by one lender, but a lender can originate many loans

> **FIBO reference**: In the full FIBO model, borrower and lender are contract-party role concepts used through debt and loan ontologies, with role semantics grounded in party and contract patterns. We use the simplified direct-entity model for clarity. See [FBC Debt](https://github.com/edmcouncil/fibo/tree/master/FBC/DebtAndEquities/Debt), [LOAN LoansGeneral](https://github.com/edmcouncil/fibo/tree/master/LOAN/LoansGeneral/Loans), and [FND Parties](https://github.com/edmcouncil/fibo/tree/master/FND/Parties).

## Step 1 graph

<ontology-embed id="official/fibo-loans-step-1" height="340px"></ontology-embed>

*Three entities with two relationships form the core loan triangle — the foundation of every FIBO lending model.*

```quiz
Q: Which relationship best represents loan repayment responsibility?
- Borrower → Loan (originatedBy)
- Loan → Borrower (owedBy) [correct]
- Lender → Loan (owedBy)
- Loan → Lender (hasCollateral)
> In this model the loan points to the borrower through `owedBy`, making repayment obligation explicit from the contract object. This follows FIBO's pattern of modeling obligations directionally from the instrument to the party.
```
