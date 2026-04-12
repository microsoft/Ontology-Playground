---
title: "Production Tracking"
slug: production
description: "Add Work-Order and Part to track what's being produced — connecting machines to their manufacturing output."
order: 3
embed: official/manufacturing-step-2
---

## From monitoring to producing

Sensors tell us *how* machines are performing, but we also need to know *what* they're producing. **Work-Order** and **Part** entities add production tracking to the factory model.

Adding production tracking enables:
- "Which machine is producing the most parts this shift?"
- "How many work orders are behind schedule?"
- "What parts are currently being manufactured on CNC-01?"

## Work-Order entity

| Property | Type | Identifier? |
|---|---|---|
| `workOrderId` | string | ✓ |
| `priority` | string | |
| `status` | string | |
| `startDate` | date | |
| `dueDate` | date | |

Work orders have both `startDate` and `dueDate` — enabling schedule adherence calculations. Combined with `priority`, this powers production planning queries.

## Part entity

| Property | Type | Identifier? |
|---|---|---|
| `partId` | string | ✓ |
| `name` | string | |
| `material` | string | |
| `weight` | float | |
| `tolerance` | float | |

The `tolerance` property defines acceptable manufacturing deviation. Parts with tighter tolerances need higher-precision machines — a key production planning constraint.

## New relationships

- **assigned_to** — `Work-Order` → `Machine` (many-to-one)
  Work orders are assigned to specific machines for production.

- **produces** — `Work-Order` → `Part` (one-to-many)
  A work order produces one or more parts.

- **has_part** — `Machine` → `Part` (one-to-many)
  A machine produces parts (the output perspective).

> **Production chain:** The chain `Machine ← Work-Order → Part` connects equipment to output through a scheduling entity. This is similar to how Appointment connects Patient and Provider in healthcare — the middle entity represents the event.

## The growing graph

<ontology-embed id="official/manufacturing-step-2" diff="official/manufacturing-step-1" height="400px"></ontology-embed>

*Work-Order and Part join the graph, adding production tracking to the IoT foundation. The diff shows what's new.*

## What we learned

- **Production chains** connect equipment to output through scheduling entities (Work-Order)
- **Dual date properties** (startDate/dueDate) enable schedule adherence tracking
- **Tolerance properties** encode manufacturing precision requirements
- The factory model now covers both monitoring (sensors) and production (work orders)

```quiz
Q: What does the tolerance property represent on the Part entity?
- The maximum number of parts that can be defective
- The acceptable manufacturing deviation — parts outside tolerance need higher-precision machines [correct]
- The time allowed to manufacture the part
- The temperature range the part can withstand
> Tolerance defines how much a part's actual dimensions can deviate from specifications. Tighter tolerances require higher-precision machines and more careful quality control — making this a key constraint in production planning.
```

Next, we'll add Quality-Check to close the production loop.
