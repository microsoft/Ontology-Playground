---
title: "Organization Core"
slug: organization-core
description: "Define Employee, Department, and Position to model core organizational structure."
order: 2
---

## Building the organizational backbone

Every HR ontology starts with three core entities:

- **Employee** — the person in your workforce
- **Department** — the business unit where work is organized
- **Position** — the role definition that describes responsibility and level

These three entities provide the minimum structure for hiring, reporting, and workforce planning.

## Entity design

### Employee

| Property | Type | Identifier? |
|---|---|---|
| `employeeId` | string | ✓ |
| `name` | string | |
| `hireDate` | date | |
| `employmentStatus` | enum | |
| `jobLevel` | enum | |

`employeeId` is a stable business identifier. Avoid using mutable attributes like email as the primary key.

### Department

| Property | Type | Identifier? |
|---|---|---|
| `departmentId` | string | ✓ |
| `name` | string | |
| `budget` | decimal | |
| `status` | enum | |

Department budgets allow resource planning and cost center analysis from the same graph.

### Position

| Property | Type | Identifier? |
|---|---|---|
| `positionId` | string | ✓ |
| `title` | string | |
| `level` | enum | |
| `salaryBand` | string | |

Position separates role definition from the person currently assigned to it.

## Why this separation matters

If you collapse these concepts into one "EmployeeProfile" entity, you lose flexibility for:

- historical staffing changes
- role transitions
- open positions that exist before a hire

Separate entities keep the model clean and extensible.

```quiz
Q: Why model Position as its own entity instead of storing role fields directly on Employee only?
- Because ontology tools require at least three entities
- Because Position is a reusable role definition that can exist independently of a specific employee [correct]
- To reduce the number of relationships
- To avoid using identifier properties
> Position represents the role itself (title, level, salary band), while Employee represents a person. Separating them supports open roles, transitions, and cleaner staffing analytics.
```

Next, we add Assignment to capture who filled which role, where, and when.
