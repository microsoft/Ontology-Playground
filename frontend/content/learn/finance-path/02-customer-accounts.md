---
title: "Customer & Accounts"
slug: customer-accounts
description: "Define Customer and Account — the banking foundation — with ownership relationships and financial properties."
order: 2
embed: official/finance-step-1
---

## The banking foundation

Every financial institution starts with two core concepts:

- **Customer** — who holds the accounts?
- **Account** — where is money stored and managed?

This pair forms the foundation of any banking ontology. Every other financial product connects through them.

## Defining the entities

### Customer

| Property | Type | Identifier? |
|---|---|---|
| `customerId` | string | ✓ |
| `name` | string | |
| `ssn` | string | |
| `creditScore` | integer | |
| `riskProfile` | string | |

The `creditScore` is an integer (300–850) used for lending decisions. The `riskProfile` property captures the bank's assessment for compliance and monitoring.

> **Sensitive data note:** Properties like `ssn` appear in the ontology as metadata — they describe what data *exists*, not the actual values. The ontology is a schema, not a database.

### Account

| Property | Type | Identifier? |
|---|---|---|
| `accountNumber` | string | ✓ |
| `type` | string | |
| `balance` | decimal (USD) | |
| `interestRate` | decimal (%) | |
| `openDate` | date | |

The `type` property distinguishes between checking, savings, and brokerage accounts. The `interestRate` uses a percentage unit.

## Ownership relationship

- **owns** — `Customer` → `Account` (one-to-many)
  A customer can own multiple accounts (checking, savings, brokerage), but each account belongs to one customer.

## The graph so far

<ontology-embed id="official/finance-step-1" height="300px"></ontology-embed>

*Customer and Account connected by the ownership relationship. Simple but foundational.*

## What we learned

- **Integer properties** work well for scores and ratings (creditScore)
- **Percentage units** (%) indicate rate-based properties
- The **owns** relationship creates the fundamental ownership chain
- Ontologies describe the *shape* of data, not the data itself — sensitive fields like SSN are metadata

```quiz
Q: Why is creditScore modeled as an integer rather than a string?
- Strings are harder to store in databases
- Integer type enables numeric comparisons and range queries (e.g., creditScore > 700) [correct]
- Credit scores are always exactly three digits
- Integers take less storage space
> By using an integer type, the ontology signals that creditScore supports numeric operations — comparisons, ranges, averages, and thresholds. A string property wouldn't convey this capability to query engines.
```

Next, we'll add Transaction to track account activity.
