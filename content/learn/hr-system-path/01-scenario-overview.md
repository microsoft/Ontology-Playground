---
title: "Scenario Overview"
slug: scenario-overview
description: "Meet the HR System scenario and the cross-functional questions your ontology must answer."
order: 1
---

## The scenario

You are designing a **human resources ontology** for a growing organization. The business needs a shared model for:

- **Employees** and their lifecycle status
- **Departments** and budget ownership
- **Positions** and role hierarchy
- **Assignments** that place employees into departments and positions over time
- **Performance reviews** used for development and compensation discussions

Data currently lives across payroll tools, HRIS, spreadsheets, and manager notes.

## Why an ontology?

A question like **"Which departments have the highest number of senior employees rated outstanding in the last review cycle?"** crosses employee records, org structure, role definitions, and review outcomes.

With an ontology, this becomes a connected graph query instead of manual joins across disconnected systems.

## What we'll build

| Step | Entities in focus | What you'll learn |
|---|---|---|
| 1 | Employee, Department, Position | Organizational foundation and identifiers |
| 2 | + Assignment | Junction entity pattern for staffing history |
| 3 | + PerformanceReview | Review cycles, ratings, and people analytics |
| 4 | Complete model | End-to-end HR questions and graph reasoning |

By the end, you'll understand how to model a practical HR domain with clear governance-ready structure.

## Key concepts

- **Stable identifiers** for every entity
- **Junction entities** for many-to-many staffing scenarios
- **Temporal properties** (startDate, reviewDate) for time-aware analysis
- **Enum values** for controlled statuses and ratings

Let's start with the organization core.
