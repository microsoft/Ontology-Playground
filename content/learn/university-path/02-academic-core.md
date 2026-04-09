---
title: "Academic Core"
slug: academic-core
description: "Define Student, Course, and Enrollment — the junction entity pattern that powers academic record-keeping."
order: 2
embed: official/university-step-1
---

## The academic record foundation

Academic records revolve around a core question: *which students take which courses, and how do they perform?* Three entities answer this:

- **Student** — who is learning?
- **Course** — what is being taught?
- **Enrollment** — the record connecting a student to a course with a grade

## Defining the entities

### Student

| Property | Type | Identifier? |
|---|---|---|
| `studentId` | string | ✓ |
| `name` | string | |
| `gpa` | float | |
| `enrollmentYear` | integer | |
| `major` | string | |

The `gpa` property is a float — Grade Point Average ranges from 0.0 to 4.0. This aggregate metric enables academic standing queries and honor roll calculations.

### Course

| Property | Type | Identifier? |
|---|---|---|
| `courseId` | string | ✓ |
| `title` | string | |
| `credits` | integer | |
| `level` | string | |
| `maxEnrollment` | integer | |

The `level` property (100, 200, 300, 400) indicates course difficulty and prerequisites. The `maxEnrollment` integer enables capacity planning.

### Enrollment

| Property | Type | Identifier? |
|---|---|---|
| `enrollmentId` | string | ✓ |
| `semester` | string | |
| `grade` | string | |
| `enrollDate` | date | |
| `status` | string | |

Enrollment is a **junction entity** — it exists specifically to connect Students and Courses with additional context (grade, semester, status).

## Relationships

- **enrolls_in** — `Student` → `Enrollment` (one-to-many)
  A student has multiple enrollments across semesters.

- **for_course** — `Enrollment` → `Course` (many-to-one)
  Each enrollment is for one specific course.

> **Junction entity pattern:** When two entities have a many-to-many relationship with attributes, you create a junction entity. A student takes many courses. A course has many students. Enrollment sits between them, carrying the grade, semester, and status. This is one of the most common patterns in ontology design.

## The graph so far

<ontology-embed id="official/university-step-1" height="350px"></ontology-embed>

*Student and Course connected through Enrollment — the classic junction entity pattern.*

## What we learned

- **Junction entities** (Enrollment) resolve many-to-many relationships with attributes
- **Float properties** (GPA) enable aggregate calculations and thresholds
- **Integer properties** (credits, maxEnrollment) enable capacity and workload planning
- The academic core follows Student → Enrollment → Course

```quiz
Q: Why is Enrollment modelled as a separate entity instead of a direct Student–Course relationship?
- To make the graph have more nodes
- Because Enrollment carries its own attributes (grade, semester, status) that don't belong to either Student or Course [correct]
- Ontologies require at least three entities
- Direct relationships between entities are not allowed
> A direct Student–Course relationship couldn't carry grade, semester, or status information. The junction entity pattern creates a first-class entity for the relationship itself, enabling queries like "What grade did this student get in this course this semester?" — which requires attributes on the connection, not on either endpoint.
```

Next, we'll add Professor to track faculty assignments.
