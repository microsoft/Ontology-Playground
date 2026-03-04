---
title: Servicing and Payment History
slug: servicing-and-payment-history
description: Extend the model with servicing organizations and auditable payment events.
order: 4
embed: official/fibo-loans-step-3
---

## Operational lifecycle

After origination, loans enter servicing operations. We add three entities:

- `Servicer`: organization collecting and processing payments
- `PaymentHistory`: aggregate payment record for a loan account
- `IndividualPaymentTransaction`: atomic payment events

This mirrors how lending platforms separate contractual intent from execution logs.

## New relationships

- `servicedBy`: `Loan` -> `Servicer` (`many-to-one`)
- `hasPaymentHistory`: `LoanPaymentSchedule` -> `PaymentHistory` (`one-to-one`)
- `hasIndividualPayment`: `PaymentHistory` -> `IndividualPaymentTransaction` (`one-to-many`)

## Why this matters

With these links, you can trace a clear path:

`Loan` -> `LoanPaymentSchedule` -> `PaymentHistory` -> `IndividualPaymentTransaction`

That path supports audit, delinquency analysis, and servicing quality metrics.

## Step 3 graph (diff from Step 2)

<ontology-embed id="official/fibo-loans-step-3" diff="official/fibo-loans-step-2" height="420px"></ontology-embed>

```quiz
Q: Which entity should contain atomic payment events like amount and postedAt?
- Loan
- Servicer
- PaymentHistory
- IndividualPaymentTransaction [correct]
> `PaymentHistory` is the container record. The atomic events belong to `IndividualPaymentTransaction`, which stores event-level details used for reconciliation and audit trails.
```
