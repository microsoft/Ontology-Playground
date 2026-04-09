---
title: "Complete Banking Model"
slug: complete-banking
description: "Add Loan and Investment to complete the banking ontology — connecting credit products and portfolio holdings."
order: 4
embed: official/finance-step-3
---

## Financial products

Beyond basic accounts and transactions, banks offer two major product categories:

- **Loans** — credit products where the bank lends money
- **Investments** — holdings where customers grow wealth

Adding these completes the picture and creates interesting multi-path relationships.

## Loan

| Property | Type | Identifier? |
|---|---|---|
| `loanId` | string | ✓ |
| `principal` | decimal (USD) | |
| `apr` | decimal (%) | |
| `term` | integer (months) | |
| `status` | string | |

The `term` is an integer measured in months — a common pattern for duration properties. The `apr` (Annual Percentage Rate) uses a percentage unit.

## Investment

| Property | Type | Identifier? |
|---|---|---|
| `holdingId` | string | ✓ |
| `symbol` | string | |
| `shares` | decimal | |
| `purchasePrice` | decimal (USD) | |
| `currentValue` | decimal (USD) | |

The `symbol` property (e.g., MSFT, AAPL) identifies the stock. Having both `purchasePrice` and `currentValue` enables gain/loss calculations.

## New relationships

Four relationships connect the financial products:

- **has_loan** — `Customer` → `Loan` (one-to-many)
  A customer can have multiple loans.

- **funds** — `Account` → `Loan` (one-to-many)
  An account serves as the payment source for loan repayments.

- **holds** — `Customer` → `Investment` (one-to-many)
  A customer's investment portfolio.

- **linked_to** — `Account` → `Investment` (one-to-many)
  A brokerage account linked to investment holdings.

> **Multi-path pattern:** Investment connects to Customer through *two* different paths: directly via `holds` and indirectly via `Account → linked_to`. This redundancy is intentional — it models both ownership (who holds it?) and funding (which account backs it?).

## The complete graph

<ontology-embed id="official/finance-step-3" diff="official/finance-step-2" height="500px"></ontology-embed>

*The complete Banking & Finance ontology: 5 entities, 6 relationships. Loan and Investment connect through both Customer and Account.*

## What the complete model enables

| Question | Graph path |
|---|---|
| Which high-risk customers have large loans? | Customer (riskProfile=high) → Loan (principal > 100K) |
| What's the portfolio value for our top customers? | Customer → Investment (sum currentValue) |
| Which accounts fund both loans and investments? | Account → Loan AND Account → Investment |
| Which customers' investments outperform their loan costs? | Customer → Investment (currentValue) vs Customer → Loan (principal × apr) |

## GQL query example

Find customers whose investment portfolio exceeds their total loan principal:

```gql
MATCH (c:Customer)-[:holds]->(inv:Investment),
      (c)-[:has_loan]->(loan:Loan)
WITH c, SUM(inv.currentValue) AS portfolio, SUM(loan.principal) AS debt
WHERE portfolio > debt
RETURN c.name, portfolio, debt
```

## What we built

| Step | Entities added | Cumulative | Key concept |
|---|---|---|---|
| 1 | Customer, Account | 2 | Ownership, financial identifiers |
| 2 | Transaction | 3 | Activity tracking, datetime precision |
| 3 | Loan, Investment | 5 | Financial products, multi-path relationships |

## Key takeaways

1. **Ownership chains** (Customer → Account → Transaction) enable compliance queries
2. **Datetime precision** is critical for financial data
3. **Multi-path relationships** model different aspects of the same connection
4. **Duration properties** (term in months) use integers with units
5. Financial ontologies describe data shape — sensitive data stays in source systems

```quiz
Q: Why does Investment connect to both Customer (via "holds") and Account (via "linked_to")?
- It's a mistake — only one relationship is needed
- Each relationship models a different aspect: ownership vs. funding source [correct]
- Investment needs at least two relationships to be valid
- One-to-many relationships always come in pairs
> The "holds" relationship answers "who owns this investment?" while "linked_to" answers "which account funds it?" These are different questions with potentially different answers (e.g., a joint account funding one person's investment).
```

You've completed the Banking & Finance learning path! Load any step from the [catalogue](#/catalogue) to explore it interactively.
