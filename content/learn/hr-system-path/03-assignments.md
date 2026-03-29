---
title: "Assignments"
slug: assignments
description: "Add Assignment as a junction entity to model staffing history across employees, departments, and positions."
order: 3
---

## The staffing history problem

An employee can move between departments or positions over time. A department can host many employees. A position can be filled by different people over time.

This is not a simple one-to-one structure.

## Assignment as a junction entity

Create **Assignment** to connect:

- `Employee` -> `Assignment` (one-to-many)
- `Assignment` -> `Department` (many-to-one)
- `Assignment` -> `Position` (many-to-one)

Assignment holds the context of the relationship.

### Assignment properties

| Property | Type | Identifier? |
|---|---|---|
| `assignmentId` | string | ✓ |
| `startDate` | date | |
| `endDate` | date | |
| `isPrimary` | boolean | |

With `startDate` and `endDate`, you can answer historical questions like:

- "Who was in Finance during Q2?"
- "Which employees changed departments this year?"

## Design pattern in action

This is the same general pattern used in many domains:

- Student-Course via Enrollment
- Customer-Product via Order line items
- Employee-Department-Position via Assignment

Use junction entities when relationships need their own attributes.

```quiz
Q: What is the main reason Assignment should be its own entity?
- It improves icon choices in the graph
- It carries relationship-specific attributes like startDate and endDate [correct]
- It removes the need for identifiers
- It prevents many-to-one relationships
> Assignment stores the context of staffing over time. Those properties belong to the relationship, not to Employee, Department, or Position alone.
```

Next, we add performance reviews to complete the HR analytics model.
