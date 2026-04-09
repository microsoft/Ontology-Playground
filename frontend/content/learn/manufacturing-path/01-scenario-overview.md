---
title: "Scenario Overview"
slug: scenario-overview
description: "Meet the Smart Manufacturing system — an IoT-enabled factory that needs an ontology to connect machines, sensors, production, and quality control."
order: 1
---

## The scenario

You are designing the data model for a **smart manufacturing facility**. The factory manages:

- **Machines** on the factory floor with maintenance schedules and operational status
- **Sensors** collecting real-time data — temperature, vibration, pressure readings
- **Work Orders** tracking production jobs with priorities and deadlines
- **Parts** representing components being manufactured with specifications and tolerances
- **Quality Checks** recording inspection results, pass/fail status, and defect codes

Data flows from IoT sensors, MES (Manufacturing Execution Systems), ERP platforms, and quality management databases.

## Why an ontology?

A production question like **"Which machines with abnormal sensor readings produced parts that failed quality checks last week?"** crosses IoT telemetry, production schedules, part tracking, and inspection records.

With an ontology, this maps to: `Machine → Sensor (reading > threshold)` and `Machine → Work-Order → Part → Quality-Check (passed=false)`.

## What we'll build

| Step | Entities | What you'll learn |
|---|---|---|
| 1 | Machine, Sensor | IoT relationships, telemetry hierarchies |
| 2 | + Work-Order, Part | Production tracking, manufacturing chains |
| 3 | + Quality-Check | Inspection loops, closing the production cycle |

By the end, you'll have a 5-entity, 5-relationship ontology covering sensor monitoring through quality assurance.

## Key concepts

- **IoT hierarchies** — machines own sensors, readings flow upward
- **Production chains** — work orders produce parts
- **Quality loops** — inspections feed back into production decisions
- **Operational status** — real-time state tracking (running, idle, maintenance)

Let's start with the factory floor.
