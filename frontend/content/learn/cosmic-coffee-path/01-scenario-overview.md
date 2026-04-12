---
title: "Scenario Overview"
slug: scenario-overview
description: "Meet the Cosmic Coffee Company — a modern coffee chain that needs an ontology to unify data across stores, suppliers, and orders."
order: 1
---

## The scenario

You are designing the data model for **Cosmic Coffee Company**, a specialty coffee chain with stores across multiple cities. The company tracks:

- **Customers** who visit stores and place orders
- **Orders** containing coffee products and food items
- **Products** sourced from suppliers around the world
- **Stores** in different cities with varying capacities
- **Suppliers** providing beans and goods
- **Shipments** moving products from suppliers to stores

Data lives in multiple systems — a lakehouse for customer profiles, a real-time Eventhouse for order transactions, and a Power BI semantic model for product analytics.

## Why an ontology?

Without an ontology, answering a question like **"Which suppliers provide organic beans to our highest-capacity stores?"** requires knowing which tables are in which system, how they join, and what the column names mean.

With an ontology, the question maps directly to a graph traversal:

`Store → Shipment → Supplier` filtered by `Product.isOrganic = true` and `Store.capacity`.

## What we'll build

Over three steps, we'll progressively construct the complete Cosmic Coffee ontology:

| Step | Entities | What you'll learn |
|---|---|---|
| 1 | Customer, Order, Product | Core entity types, identifiers, cardinality |
| 2 | + Store | Location modelling, many-to-one relationships |
| 3 | + Supplier, Shipment | Supply chain connections, hub entities |

By the end, you'll have a 6-entity, 7-relationship ontology that can power graph queries, GQL, and natural-language Data Agent interactions.

## Key concepts

- **Entity types** — the nouns of your domain (Customer, Order, Product…)
- **Properties** — attributes that describe each entity (name, price, status…)
- **Identifier properties** — unique keys for each entity instance
- **Relationships** — directed connections with cardinality (one-to-many, many-to-many)
- **Hub entities** — entities like Shipment that connect multiple domains

Let's start with the three most fundamental entities in any commerce system.
