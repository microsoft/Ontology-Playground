---
title: "Transactions"
slug: transactions
description: "Add Transaction records to track every debit, credit, and transfer on an account."
order: 3
embed: official/finance-step-2
---

## Tracking activity

An account without transaction history is just a static balance. Adding **Transaction** captures the flow of money — every purchase, deposit, transfer, and fee.

This enables questions like:
- "What did this customer spend at restaurants last month?"
- "Which accounts have unusual transaction patterns?"
- "What's the average transaction amount per account type?"

## Transaction entity

| Property | Type | Identifier? |
|---|---|---|
| `transactionId` | string | ✓ |
| `amount` | decimal (USD) | |
| `type` | string | |
| `timestamp` | datetime | |
| `merchant` | string | |

The `timestamp` is a datetime (not just a date) because financial transactions need precision — a purchase at 2:30 PM is different from one at 2:31 PM for fraud detection.

The `merchant` property captures where the transaction occurred — useful for spending category analysis.

## New relationship

- **has_transaction** — `Account` → `Transaction` (one-to-many)
  Each account has many transactions over time, but each transaction belongs to one account.

This extends the ownership chain: `Customer → Account → Transaction`.

## The growing graph

<ontology-embed id="official/finance-step-2" diff="official/finance-step-1" height="400px"></ontology-embed>

*Transaction adds the activity layer. The ownership chain grows: Customer → Account → Transaction.*

## What we learned

- **Datetime precision** matters for financial and compliance scenarios
- **Ownership chains** (Customer → Account → Transaction) enable drill-down queries
- The `merchant` property opens up spending analysis without adding a Merchant entity
- Each new entity deepens the questions you can answer

```quiz
Q: Why does Transaction use a datetime type for timestamp instead of a date?
- Datetime is the default property type for all time-based fields
- Financial transactions require time-of-day precision for fraud detection and audit trails [correct]
- Date types are deprecated in modern ontologies
- Datetime uses less storage than date
> Financial compliance and fraud detection require precise timestamps. Two transactions on the same date but minutes apart could indicate a fraud pattern. Datetime captures both date and time, providing the precision needed.
```

Next, we'll add Loan and Investment to complete the banking product suite.
