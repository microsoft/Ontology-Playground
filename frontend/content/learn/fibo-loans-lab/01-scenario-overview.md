---
title: Scenario Overview
slug: scenario-overview
description: What is FIBO, where does it come from, and what we'll build in this lab.
order: 1
reviewStatus: under-human-review
---

## What is FIBO?

The **Financial Industry Business Ontology** (FIBO) is an industry-standard ontology family developed by the [EDM Council](https://edmcouncil.org/) and the [Object Management Group](https://www.omg.org/) (OMG). It provides a formal, machine-readable vocabulary for financial instruments, parties, contracts, and regulatory concepts.

FIBO is:

- **Open source** under the [MIT License](https://opensource.org/licenses/MIT)
- **Hosted on GitHub** at [edmcouncil/fibo](https://github.com/edmcouncil/fibo)
- **Published as OWL ontologies** at [spec.edmcouncil.org/fibo](https://spec.edmcouncil.org/fibo/)
- **Developed since 2012** with contributions from major financial institutions, regulators, and standards bodies

> **Source**: All concepts in this lab are adapted from the FIBO ontology modules under `LOAN/LoansGeneral/Loans` and `FBC/DebtAndEquities/Debt`. See the [FIBO GitHub repository](https://github.com/edmcouncil/fibo) for the full source.

## Why this lab

FIBO is large — hundreds of ontology modules covering securities, derivatives, corporate actions, indices, and more. The `LOAN` domain alone spans multiple sub-modules:

| FIBO Module | What it covers |
|---|---|
| `LOAN/LoansGeneral/Loans` | Core loan contracts, borrower/lender parties, servicing |
| `LOAN/RealEstateLoans/Mortgages` | Mortgage types, liens, real property collateral |
| `FBC/DebtAndEquities/Debt` | Collateral, security agreements, debt instruments |
| `FBC/ProductsAndServices/ClientsAndAccounts` | Payment processing, account management |
| `FND/Agreements/Contracts` | Contract elements, effective dates, provisions |

*(Source: [FIBO ontology structure](https://github.com/edmcouncil/fibo/tree/master/LOAN))*

This lab extracts a teachable subset focused on loan contracts and payment flows so you can learn FIBO modeling patterns without navigating the full module hierarchy.

## What we'll build

Over four progressive steps, we'll model a **Loans ontology** with 10 entity types and 10 relationships:

1. **Core Loan Triad** — `Loan`, `Borrower`, `Lender`
2. **Collateral & Schedules** — `Collateral`, `LoanPaymentSchedule`
3. **Servicing & Payment History** — `Servicer`, `PaymentHistory`, `PaymentTransaction`
4. **Risk Classifiers** — `OwnershipInterest`, `LenderLienPosition`

## Real questions this model supports

- Which collateralized loans have subordinate lien positions?
- Which borrowers have interest-only loans above a principal threshold?
- How do payment transaction patterns vary by servicer?
- Which ownership structures correlate with repayment issues?

## Licensing and attribution

This lab is adapted from the EDM Council FIBO ontology:

- **Copyright**: (c) 2016-2025 EDM Council, Inc. and Object Management Group, Inc.
- **License**: [MIT License](https://opensource.org/licenses/MIT)
- **Source repository**: [github.com/edmcouncil/fibo](https://github.com/edmcouncil/fibo)
- **Specification**: [spec.edmcouncil.org/fibo](https://spec.edmcouncil.org/fibo/)

The ontology files in this lab are simplified, classroom-friendly adaptations. They preserve core FIBO semantics while reducing complexity for step-by-step instruction.

```quiz
Q: What organization develops and maintains FIBO?
- The World Bank
- The EDM Council and Object Management Group (OMG) [correct]
- The European Central Bank
- The W3C Web Ontology Working Group
> FIBO is developed by the EDM Council (Enterprise Data Management Council) in collaboration with the Object Management Group. It is open source under the MIT License and hosted on GitHub at edmcouncil/fibo.
```
