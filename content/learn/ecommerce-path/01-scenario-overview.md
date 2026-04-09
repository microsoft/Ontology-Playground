---
title: "Scenario Overview"
slug: scenario-overview
description: "Meet the E-Commerce Platform — a marketplace that needs an ontology to connect buyers, products, carts, orders, and reviews."
order: 1
---

## The scenario

You are building the data model for a **general-purpose e-commerce marketplace**. The platform handles:

- **Buyers** who browse and purchase products
- **Products** with inventory tracking
- **Shopping Carts** as active sessions before checkout
- **Orders** as completed purchase transactions
- **Reviews** where buyers rate and comment on products

Data flows through multiple systems — a transactional database for orders, a search engine for product discovery, and an analytics warehouse for buyer behavior.

## Why an ontology?

A question like **"Which verified reviewers rated products they didn't purchase?"** requires joining across buyers, reviews, orders, and products — touching multiple systems.

With an ontology, this becomes a graph pattern: find `Buyer` nodes that have a `writes → Review → reviews → Product` path but no `places → Order → includes → Product` path for the same product.

## What we'll build

| Step | Entities | What you'll learn |
|---|---|---|
| 1 | Buyer, Product, Order | Core marketplace entities and purchase flow |
| 2 | + Shopping-Cart | Pre-purchase sessions, one-to-one relationships |
| 3 | + Review | Customer feedback loop, closing the cycle |

By the end, you'll have a 5-entity, 6-relationship ontology covering the complete buyer journey from browsing to reviewing.

## Key concepts

- **Purchase flow** — the journey from browsing to buying
- **One-to-one relationships** — when each side has exactly one partner (Buyer ↔ Cart)
- **Feedback loops** — how reviews connect buyers back to products
- **Session entities** — temporary objects like shopping carts

Let's start with the core marketplace entities.
