---
title: Core Loan Triad
slug: core-loan-triad
description: Model the foundational FIBO loan triangle — Loan, Borrower, and Lender — with properties and relationships.
order: 2
embed: official/fibo-loans-step-1
reviewStatus: under-human-review
---

## The contractual core

Every lending system starts with three concepts from FIBO's `LOAN/LoansGeneral/Loans` module ([source](https://github.com/edmcouncil/fibo/tree/master/LOAN/LoansGeneral/Loans)):

- **Loan** — the debt instrument and contract envelope
- **Borrower** — the obligated repayment party
- **Lender** — the originating funding party

In FIBO's OWL ontology, these are modeled as `fibo-loan-ln-ln:Loan`, `fibo-loan-ln-ln:Borrower`, and `fibo-loan-ln-ln:Lender`. We simplify the class hierarchy but preserve the core semantics.

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

> **FIBO reference**: In the full FIBO model, party roles are more granular — a Borrower is a `PartyInRole` with a `BorrowerRole`. We use the simplified direct-entity model for clarity. See [FIBO Party module](https://github.com/edmcouncil/fibo/tree/master/FND/Parties).

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
