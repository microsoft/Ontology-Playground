---
title: "Scenario Overview"
slug: scenario-overview
description: "Meet the University System — an academic institution that needs an ontology to connect students, courses, faculty, and departments."
order: 1
---

## The scenario

You are designing the data model for a **university management system**. The institution tracks:

- **Students** with their enrollment status, GPA, and academic standing
- **Courses** with credit hours, levels, and prerequisites
- **Enrollments** recording which students take which courses and their grades
- **Professors** teaching courses with their rank, tenure status, and office hours
- **Departments** organizing academic programs and housing faculty

Data lives across student information systems (SIS), learning management systems (LMS), human resources, and academic planning databases.

## Why an ontology?

An academic question like **"Which departments have professors teaching courses where over 50% of enrolled students scored below a C?"** crosses departmental records, faculty assignments, course offerings, and student grades.

With an ontology, this maps to: `Department → Professor → Course → Enrollment (grade < C) ← Student`.

## What we'll build

| Step | Entities | What you'll learn |
|---|---|---|
| 1 | Student, Course, Enrollment | Academic records, many-to-many through junction entities |
| 2 | + Professor | Faculty assignments, teaching relationships |
| 3 | + Department | Organizational structure, hierarchy |

By the end, you'll have a 5-entity, 6-relationship ontology covering the complete academic administration model.

## Key concepts

- **Junction entities** — Enrollment resolves the Student–Course many-to-many relationship
- **Academic hierarchies** — Departments organize professors and courses
- **Grade tracking** — letter grades and GPA as ontology properties
- **Temporal data** — semesters, enrollment dates, academic years

Let's start with the academic core.
