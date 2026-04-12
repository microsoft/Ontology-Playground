---
title: "Complete University Model"
slug: complete-university
description: "Add Department to complete the university ontology — organizing faculty, courses, and students into academic programs."
order: 4
embed: official/university-step-3
---

## Organizational structure

Universities are organized into **Departments** — administrative units that house faculty, offer courses, and grant degrees. Adding Department creates the organizational hierarchy that ties everything together.

## Department entity

| Property | Type | Identifier? |
|---|---|---|
| `departmentId` | string | ✓ |
| `name` | string | |
| `building` | string | |
| `budget` | float | |
| `headOfDept` | string | |

The `budget` float enables resource allocation queries. The `headOfDept` property references a professor who leads the department — a self-referential pattern common in organizational hierarchies.

## New relationships

- **belongs_to** — `Professor` → `Department` (many-to-one)
  Professors are affiliated with a department.

- **offers** — `Department` → `Course` (one-to-many)
  Departments offer courses as part of their academic programs.

> **Organizational hierarchy:** Department sits at the top of the university ontology. It connects downward to both Professor (faculty) and Course (curriculum). This hub position makes Department ideal for aggregate queries: "department-level statistics."

## The complete graph

<ontology-embed id="official/university-step-3" diff="official/university-step-2" height="500px"></ontology-embed>

*The complete University ontology: 5 entities, 6 relationships. Department organizes both faculty and curriculum.*

## What the complete model enables

| Question | Graph path |
|---|---|
| Which departments have the highest average student GPA? | Department → Course ← Enrollment ← Student (avg GPA) |
| Which professors teach outside their department's courses? | Professor → Department vs Professor → Course → Department |
| What is the enrollment rate for each department? | Department → Course ← Enrollment (count) / Course.maxEnrollment |
| Which departments have the most tenured faculty? | Department ← Professor (tenured=true, count) |

## GQL query example

Find departments where students are struggling (average grade below B):

```gql
MATCH (d:Department)-[:offers]->(c:Course)<-[:for_course]-(e:Enrollment)<-[:enrolls_in]-(s:Student)
WHERE e.grade IN ['C', 'D', 'F']
RETURN d.name, c.title, COUNT(e) AS struggling_count
ORDER BY struggling_count DESC
```

## What we built

| Step | Entities added | Cumulative | Key concept |
|---|---|---|---|
| 1 | Student, Course, Enrollment | 3 | Junction entities, many-to-many |
| 2 | Professor | 4 | Transitive queries, boolean properties |
| 3 | Department | 5 | Organizational hierarchy, hub entities |

## Key takeaways

1. **Junction entities** (Enrollment) resolve many-to-many relationships with attributes
2. **Transitive queries** unlock insights by traversing multi-hop paths
3. **Boolean properties** (tenured) enable categorical filtering
4. **Organizational hierarchies** (Department) provide aggregate grouping
5. **Hub entities** (Department) connect multiple branches of the ontology

```quiz
Q: Why is Department considered a "hub entity" in the university ontology?
- Because it has the most properties
- Because it connects to both Professor and Course, sitting at the top of the organizational hierarchy [correct]
- Because it was added last
- Because hub entities must have a budget property
> Department connects downward to both Professor (via belongs_to) and Course (via offers). This dual connection makes it the organizational hub — ideal for aggregate queries that combine faculty and curriculum data at the departmental level.
```

You've completed the University System learning path! Load any step from the [catalogue](#/catalogue) to explore it interactively.
