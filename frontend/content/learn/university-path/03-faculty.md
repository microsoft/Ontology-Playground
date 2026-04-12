---
title: "Faculty"
slug: faculty
description: "Add Professor to track who teaches what — connecting faculty to courses and students through teaching assignments."
order: 3
embed: official/university-step-2
---

## Adding faculty

Who teaches the courses? The **Professor** entity adds the teaching dimension — connecting faculty to courses and, transitively, to students.

Adding Professor enables:
- "Which professor teaches the most 400-level courses?"
- "What is the average GPA in Professor Smith's courses?"
- "Which tenured faculty teach introductory courses?"

## Professor entity

| Property | Type | Identifier? |
|---|---|---|
| `professorId` | string | ✓ |
| `name` | string | |
| `rank` | string | |
| `tenured` | boolean | |
| `officeHours` | string | |

The `rank` property (Assistant, Associate, Full) reflects academic hierarchy. The `tenured` boolean enables queries about job security and institutional investment.

## New relationships

- **teaches** — `Professor` → `Course` (one-to-many)
  A professor teaches one or more courses per semester.

- **advises** — `Professor` → `Student` (one-to-many)
  A professor advises students in their academic program.

> **Transitive queries:** With Professor → Course ← Enrollment ← Student, you can now ask questions that cross the teaching relationship: "Which students are taking courses from tenured professors?" This requires traversing Professor → Course → Enrollment → Student.

## The growing graph

<ontology-embed id="official/university-step-2" diff="official/university-step-1" height="400px"></ontology-embed>

*Professor joins with teaching and advising relationships. The diff highlights what's new.*

## What we learned

- **Boolean properties** (tenured) create yes/no categorizations for filtering
- **Transitive queries** traverse multiple relationships to connect distant entities
- **Academic rank** follows a defined hierarchy (Assistant → Associate → Full)
- The graph now supports both student-centric and faculty-centric queries

```quiz
Q: What does a transitive query across the university ontology look like?
- Querying a single entity's properties
- Traversing multiple relationships like Professor → Course → Enrollment → Student to connect distant entities [correct]
- Looking up a professor by their ID
- Counting the number of courses in the system
> Transitive queries are one of the greatest strengths of graph-based ontologies. By traversing Professor → Course → Enrollment → Student, you can answer questions like "Which students are in tenured professors' classes?" — connecting entities that have no direct relationship but are linked through intermediate nodes.
```

Next, we'll add Department to organize the academic structure.
