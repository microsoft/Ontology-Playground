---
title: "Complete HR Model"
slug: complete-model
description: "Add PerformanceReview and apply the full HR ontology to real workforce analytics questions."
order: 4
embed: community/ravi-chandu/hr-system
---

## Completing the people analytics layer

The final entity is **PerformanceReview**. It connects evaluation outcomes to employees over review cycles.

Relationship:

- `Employee` -> `PerformanceReview` (one-to-many)

### PerformanceReview properties

| Property | Type | Identifier? |
|---|---|---|
| `reviewId` | string | ✓ |
| `reviewPeriod` | string | |
| `rating` | enum | |
| `reviewDate` | date | |

Now the ontology supports operational and strategic HR questions in one graph.

## Complete graph

<ontology-embed id="community/ravi-chandu/hr-system" height="460px"></ontology-embed>

*HR System ontology with 5 entities: Employee, Department, Position, Assignment, PerformanceReview.*

## Example graph questions

| Question | Graph path |
|---|---|
| Which departments have the most senior employees? | Department <- Assignment <- Employee (`jobLevel=senior`) |
| Which employees changed roles in the last year? | Employee -> Assignment (multiple records by date) -> Position |
| Which teams have many outstanding reviews? | Department <- Assignment <- Employee -> PerformanceReview (`rating=outstanding`) |
| Which assignments are no longer active? | Assignment (`endDate` set or `isPrimary=false`) |

## Key takeaways

1. Separate **person**, **org unit**, and **role** into distinct entities.
2. Use **Assignment** as a junction entity for time-aware staffing history.
3. Use **PerformanceReview** to attach measurable outcomes to workforce entities.
4. Keep identifiers stable and statuses controlled via enum values.

```quiz
Q: Which entity enables historical analysis of role and department changes over time?
- Employee
- Department
- Assignment [correct]
- PerformanceReview
> Assignment records start and end dates for a specific employee-department-position link. Without it, you cannot track staffing history cleanly.
```

You have completed the HR System path. Open the model in the [catalogue](#/catalogue/community/ravi-chandu/hr-system) or continue iterating in [designer](#/designer/community/ravi-chandu/hr-system).
