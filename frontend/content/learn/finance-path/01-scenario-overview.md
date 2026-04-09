---
title: "Scenario Overview"
slug: scenario-overview
description: "Meet the Banking & Finance scenario — why financial services need ontologies for customer, account, and product relationships."
order: 1
---

## The scenario

You are designing the data model for a **retail banking platform**. The bank manages:

- **Customers** with credit profiles and risk assessments
- **Accounts** (checking, savings, brokerage) with balances and interest rates
- **Transactions** recording every debit, credit, and transfer
- **Loans** including mortgages, auto loans, and personal credit
- **Investments** tracking stock holdings and portfolio values

Data spans core banking systems, payment processors, credit bureaus, and brokerage platforms — each with its own schema and identifiers.

## Why an ontology?

A compliance question like **"Show all transactions from accounts owned by high-risk customers with active loans exceeding $100K"** requires traversing from transactions to accounts to customers to loans, crossing multiple systems.

With an ontology, this is a graph traversal: `Transaction → Account → Customer (riskProfile='high') → Loan (principal > 100000)`.

## What we'll build

| Step | Entities | What you'll learn |
|---|---|---|
| 1 | Customer, Account | Core banking entities, ownership relationships |
| 2 | + Transaction | Activity tracking, temporal data |
| 3 | + Loan, Investment | Financial products, multi-path relationships |

By the end, you'll have a 5-entity, 6-relationship ontology covering the complete banking customer relationship.

## Key concepts

- **Ownership chains** — Customer → Account → Transaction / Loan / Investment
- **Financial identifiers** — account numbers, transaction IDs, loan IDs
- **Risk and compliance** — credit scores, risk profiles
- **Multi-path relationships** — when one entity connects to another through different paths

Let's start with the banking foundation: Customer and Account.
