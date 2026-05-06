---
title: Risk and Classifiers
slug: risk-and-classifiers
description: Add FIBO ownership and lien classifiers to support underwriting and collateral risk analysis.
order: 5
embed: official/fibo-loans-step-4
reviewStatus: under-human-review
---

## Classification layer

FIBO relies heavily on explicit classifiers — entities whose primary role is to categorize other entities. In this final step, we add two concepts critical to mortgage and secured lending risk analysis:

- **OwnershipInterest** — classifies the legal ownership type of collateral (adapted from `fibo-loan-ln-ln:OwnershipInterest` in [LOAN/LoansGeneral/Loans](https://github.com/edmcouncil/fibo/tree/master/LOAN/LoansGeneral/Loans), grounded in `fibo-fnd-oac-own:Ownership`)
- **LenderLienPosition** — classifies lender claim seniority over collateral assets (adapted from `fibo-loan-ln-ln:LenderLienPosition` in [LOAN/LoansGeneral/Loans](https://github.com/edmcouncil/fibo/tree/master/LOAN/LoansGeneral/Loans))

## Why classifiers matter

In the FIBO Mortgages module ([LOAN/RealEstateLoans/Mortgages](https://github.com/edmcouncil/fibo/tree/master/LOAN/RealEstateLoans/Mortgages)), lien position determines recovery priority in foreclosure. A first-lien mortgage has stronger recovery expectations than a subordinate lien, which directly affects:

- Credit risk modeling
- Loss-given-default estimation
- Portfolio risk aggregation
- Regulatory capital calculations

> **FIBO reference**: The FIBO Mortgages ontology uses `owl:Restriction` blocks to constrain real-estate collateral and contract semantics. In the LOAN ontology, `SecurityAgreement` and `Loan` are further constrained by classifier usage such as `LenderLienPosition` and `OwnershipInterest`. See [LOAN/RealEstateLoans/Mortgages.rdf](https://github.com/edmcouncil/fibo/blob/master/LOAN/RealEstateLoans/Mortgages.rdf) and [LOAN/LoansGeneral/Loans.rdf](https://github.com/edmcouncil/fibo/blob/master/LOAN/LoansGeneral/Loans.rdf).

## New relationships

- **classifiesCollateralOwnership**: `OwnershipInterest` → `Collateral` (`one-to-many`)
- **hasLienPosition**: `Collateral` → `LenderLienPosition` (`many-to-one`)

## Step 4 graph (diff from Step 3)

<ontology-embed id="official/fibo-loans-step-4" diff="official/fibo-loans-step-3" height="460px"></ontology-embed>

*Two classifier entities (OwnershipInterest and LenderLienPosition) complete the model with risk and underwriting semantics.*

## Complete adapted model

You can also inspect the full external subset built from the same FIBO source concepts:

<ontology-embed id="external/fibo/loans-general" height="420px"></ontology-embed>

## What you built

You now have a progressive, FIBO-inspired loan ontology covering:

| Layer | Entities | FIBO source module |
|---|---|---|
| Contract actors | Loan, Borrower, Lender | [LOAN/LoansGeneral/Loans](https://github.com/edmcouncil/fibo/tree/master/LOAN/LoansGeneral/Loans) |
| Security & schedule | Collateral, LoanPaymentSchedule | [FBC/DebtAndEquities/Debt](https://github.com/edmcouncil/fibo/tree/master/FBC/DebtAndEquities/Debt) |
| Servicing operations | Servicer, PaymentHistory, PaymentTransaction | [LOAN/LoansGeneral/Loans](https://github.com/edmcouncil/fibo/tree/master/LOAN/LoansGeneral/Loans) + [FBC/ProductsAndServices/ClientsAndAccounts](https://github.com/edmcouncil/fibo/tree/master/FBC/ProductsAndServices/ClientsAndAccounts) |
| Risk classifiers | OwnershipInterest, LenderLienPosition | [LOAN/LoansGeneral/Loans](https://github.com/edmcouncil/fibo/tree/master/LOAN/LoansGeneral/Loans) + [FND/OwnershipAndControl/Ownership](https://github.com/edmcouncil/fibo/tree/master/FND/OwnershipAndControl) |

This is a strong foundation for expanding into domain-specific modules — mortgage types, HELOC products, auto lending, or small business lending.

## Further reading

- **FIBO GitHub**: [github.com/edmcouncil/fibo](https://github.com/edmcouncil/fibo)
- **FIBO specification**: [spec.edmcouncil.org/fibo](https://spec.edmcouncil.org/fibo/)
- **EDM Council**: [edmcouncil.org](https://edmcouncil.org/)
- **FIBO Loans module**: [LOAN/LoansGeneral/Loans source](https://github.com/edmcouncil/fibo/tree/master/LOAN/LoansGeneral/Loans)
- **FIBO Mortgages module**: [LOAN/RealEstateLoans/Mortgages source](https://github.com/edmcouncil/fibo/tree/master/LOAN/RealEstateLoans/Mortgages)
- **FIBO Debt module**: [FBC/DebtAndEquities/Debt source](https://github.com/edmcouncil/fibo/tree/master/FBC/DebtAndEquities/Debt)
- **FIBO Clients and Accounts module**: [FBC/ProductsAndServices/ClientsAndAccounts source](https://github.com/edmcouncil/fibo/tree/master/FBC/ProductsAndServices/ClientsAndAccounts)

## Licensing

All FIBO ontology content referenced in this lab is:

- **Copyright** EDM Council, Inc. and Object Management Group, Inc. (see module headers for exact year ranges)
- **Licensed** under the [MIT License](https://opensource.org/licenses/MIT)

The MIT License permits use, modification, and redistribution of the ontology files, including for commercial purposes, provided the copyright notice is retained. The ontology files in this lab are adapted subsets created for educational purposes.

```quiz
Q: What is the main value of adding LenderLienPosition to a collateral model?
- It replaces the need for borrower information
- It captures seniority of lender claims, which is key for credit risk and loss modeling [correct]
- It stores payment timestamps
- It determines loan interest rates automatically
> Lien position captures claim priority (for example, first lien vs. subordinate lien), which directly influences recovery expectations in foreclosure. This is critical for underwriting, portfolio risk models, and regulatory capital calculations — a key concept from FIBO's debt and equity modules.
```
