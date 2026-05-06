---
title: Servicing and Payment History
slug: servicing-and-payment-history
description: Extend the model with FIBO servicing organizations and auditable payment events.
order: 4
embed: official/fibo-loans-step-3
reviewStatus: under-human-review
---

## Operational lifecycle

After origination, loans enter servicing operations. FIBO models this transition across two modules:

- **Servicer** — the organization collecting and processing payments (adapted from `fibo-loan-ln-ln:Servicer` in [LOAN/LoansGeneral/Loans](https://github.com/edmcouncil/fibo/tree/master/LOAN/LoansGeneral/Loans))
- **PaymentHistory** — the aggregate payment record (adapted from `fibo-loan-ln-ln:PaymentHistory` in [LOAN/LoansGeneral/Loans](https://github.com/edmcouncil/fibo/tree/master/LOAN/LoansGeneral/Loans), which extends transaction-record patterns from [FBC/ProductsAndServices/ClientsAndAccounts](https://github.com/edmcouncil/fibo/tree/master/FBC/ProductsAndServices/ClientsAndAccounts))
- **PaymentTransaction** — atomic payment events (adapted from `fibo-loan-ln-ln:IndividualPaymentTransaction`, itself based on `fibo-fbc-pas-caa:IndividualTransaction`)

This mirrors how real lending platforms separate contractual intent from execution logs.

## New properties

### Servicer

| Property | Type | Notes |
|---|---|---|
| `servicerId` | string | Identifier |
| `organizationName` | string | Name of the servicing organization |

### PaymentHistory

| Property | Type | Notes |
|---|---|---|
| `paymentHistoryId` | string | Identifier |

### PaymentTransaction

| Property | Type | Notes |
|---|---|---|
| `paymentTransactionId` | string | Identifier |
| `amount` | decimal (USD) | Payment amount |
| `postedAt` | datetime | When the payment was recorded |

## New relationships

- **servicedBy**: `Loan` → `Servicer` (`many-to-one`) — many loans can be serviced by one organization
- **hasPaymentHistory**: `LoanPaymentSchedule` → `PaymentHistory` (`one-to-one`) — links scheduled expectations to actual records
- **hasIndividualPayment**: `PaymentHistory` → `PaymentTransaction` (`one-to-many`) — each history contains many transaction events

## The audit trail

With these links, you can trace a clear path through the model:

`Loan` → `LoanPaymentSchedule` → `PaymentHistory` → `PaymentTransaction`

This path supports audit queries, delinquency analysis, and servicing quality metrics — exactly the kind of graph traversal that makes ontology-driven data integration valuable.

> **FIBO reference**: In production FIBO, loan servicing and payment-history patterns bridge LOAN and FBC modules: `Loan` relates to a loan-specific account, payment history is modeled as a transaction record, and individual payment transactions capture event-level facts. Our simplified model captures this core pattern. See [LOAN/LoansGeneral/Loans](https://github.com/edmcouncil/fibo/tree/master/LOAN/LoansGeneral/Loans) and [FBC/ProductsAndServices/ClientsAndAccounts](https://github.com/edmcouncil/fibo/tree/master/FBC/ProductsAndServices/ClientsAndAccounts).

## Step 3 graph (diff from Step 2)

<ontology-embed id="official/fibo-loans-step-3" diff="official/fibo-loans-step-2" height="420px"></ontology-embed>

*Three new entities (Servicer, PaymentHistory, PaymentTransaction) create an operational layer for tracking loan lifecycle events.*

```quiz
Q: Which entity should contain atomic payment events like amount and postedAt?
- Loan
- Servicer
- PaymentHistory
- PaymentTransaction [correct]
> PaymentHistory is the aggregate container. Atomic events belong to PaymentTransaction, which stores event-level details used for reconciliation and audit trails. This separation follows FIBO's modeling pattern of distinguishing aggregate records from individual transactions.
```
