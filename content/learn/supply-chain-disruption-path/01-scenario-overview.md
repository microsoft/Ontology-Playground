---
title: "Scenario Overview"
slug: scenario-overview
description: "Understand the real-world challenge of supply chain resilience — when a single supplier disruption cascades into millions in lost revenue."
order: 1
---

## The challenge

Your manufacturing operation depends on a complex web of suppliers. One disruption — a natural disaster, geopolitical event, quality issue, or cyber attack — doesn't just affect that one supplier. It ripples through:

- **Components** that depend on that supplier
- **Product lines** that use those components
- **Revenue** when products can't be shipped
- **Production timelines** that slip week by week

Without visibility into these cascades, you react after the damage is done. With it, you **anticipate and act before customers are affected**.

## Real-world example

A semiconductor supplier in Taiwan experiences a power outage lasting 48 hours:

```
Disruption: Taiwan Supplier Outage
  ↓
Affects: ChipX component supply
  ↓
Impacts: 3 product lines (laptops, tablets, displays)
  ↓
Cascades: Production halts in 2 weeks (inventory runs out)
  ↓
Result: $12M revenue at risk, customer orders delayed
  ↓
Mitigation: Activate pre-qualified alternative supplier + safety stock
```

**Without an ontology**, this analysis takes days and manual spreadsheets.  
**With an ontology**, an AI agent can:
1. Identify all affected components within minutes
2. Trace to all product lines and production timelines
3. Recommend alternative suppliers and safety stock quantities
4. Calculate cost-benefit of each mitigation action
5. Trigger automated alerts and procurement workflows

## What you'll build

Over four steps, we'll construct a production-grade ontology that powers this intelligence:

| Step | Focus | Outcome |
|---|---|---|
| 1 | Core entities (Supplier, Component, ProductLine, Disruption) | Vocabulary of your supply chain |
| 2 | Entity properties and identifiers | Rich attributes for risk calculation |
| 3 | Relationships and cascade modeling | Impact propagation graph |
| 4 | Risk assessment and mitigation actions | Decision automation |

By the end, you'll have an 8-entity ontology with:
- **40+ properties** capturing reliability scores, inventory levels, costs, timelines
- **7 relationships** modeling the disruption cascade
- **Fabric IQ compatibility** for data agent grounding and real-time alerting

## Key concepts

- **Disruption events** — the trigger (natural disaster, cyber attack, financial failure)
- **Impact propagation** — how disruptions cascade through dependencies
- **Risk assessment** — calculating revenue at risk and time to impact
- **Mitigation actions** — concrete steps to reduce or eliminate impact
- **Alternative suppliers** — pre-qualified backups with capacity and cost trade-offs

Let's start by understanding the core entities and relationships that make resilience decisions possible.
