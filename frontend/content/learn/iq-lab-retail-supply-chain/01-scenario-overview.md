---
title: Scenario Overview
slug: scenario-overview
description: Meet the retail supply chain scenario — why ontologies matter for multi-system retail data, and what we'll build in this lab.
order: 1
---

## The problem

You work for a fictional retail company that manages orders, products, customers, warehouses, and shipments across multiple regions. Data lives in multiple systems:

- An **Eventhouse** stores real-time transactional data — orders, shipments, demand signals.
- A **Lakehouse** holds dimensional data — product catalogs, customer profiles, forecasts.

Traditional approaches require analysts to know _which_ system holds _which_ data and how to join across them. A single question like **"Which promotions drove returns in the southwest region?"** requires traversing from returns → products → promotions → regions — touching both systems and multiple tables.

## Why ontology?

An ontology solves this by creating a **semantic layer** over the raw data:

| Without ontology | With ontology |
|---|---|
| Analysts must know table names and join columns | Business users ask questions in plain language |
| Column names like `cust_lt_val` are opaque | Properties like *Customer lifetime value* are self-describing |
| Cross-system queries require manual orchestration | The ontology maps concepts to sources transparently |
| Adding a new data source means rewriting queries | Adding a new binding extends the model without breaking queries |

## What we'll build

Over the next six steps, we'll progressively build a **Retail Supply Chain ontology** with 15 entity types and 18 relationships:

1. **Core Commerce** — Customer, Order, Product
2. **Order Details & Categories** — OrderLine, ProductCategory
3. **Geography** — Region, Store
4. **Fulfillment & Logistics** — Shipment, Carrier, Warehouse
5. **Inventory & Demand** — Inventory, Forecast, DemandSignal
6. **Complete Model** — Promotion, Return

Each step introduces new concepts and shows the growing graph. By the end, you'll have a fully connected ontology that could power graph queries, GQL, and natural-language Data Agent interactions in Microsoft Fabric IQ.

## Key concepts we'll cover

- **Entity types** and **identifier properties** — the building blocks
- **Relationships** and **cardinality** — how entities connect
- **Linking entities** — using OrderLine to bridge Order and Product
- **Geographic hierarchies** — modelling Region → Store
- **Cross-source unification** — one entity, multiple data sources
- **Graph traversal** — following connections to answer complex questions

Let's start with the three most fundamental entities in any commerce system.
