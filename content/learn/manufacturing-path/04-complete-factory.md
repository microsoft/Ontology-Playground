---
title: "Complete Factory Model"
slug: complete-factory
description: "Add Quality-Check to complete the manufacturing ontology — closing the loop from production to inspection."
order: 4
embed: official/manufacturing-step-3
---

## Closing the quality loop

Manufacturing doesn't end when a part is produced — it must be inspected. **Quality-Check** closes the production cycle by verifying that parts meet specifications.

## Quality-Check entity

| Property | Type | Identifier? |
|---|---|---|
| `checkId` | string | ✓ |
| `inspector` | string | |
| `checkDate` | date | |
| `passed` | boolean | |
| `defectCode` | string | |

The `passed` boolean is the critical property — it determines whether a part ships or gets reworked. The `defectCode` property categorizes failures for root cause analysis.

## New relationship

- **inspects** — `Quality-Check` → `Part` (many-to-one)
  Each quality check inspects a specific part. A part may undergo multiple inspections (initial check, re-check after rework).

> **Feedback loop:** When a quality check fails, the production chain reverses: `Quality-Check (passed=false) → Part → Work-Order → Machine`. This feedback loop is how smart factories identify problematic machines and improve production quality over time.

## The complete graph

<ontology-embed id="official/manufacturing-step-3" diff="official/manufacturing-step-2" height="500px"></ontology-embed>

*The complete Smart Manufacturing ontology: 5 entities, 5 relationships. Quality-Check closes the feedback loop from inspection back to production.*

## What the complete model enables

| Question | Graph path |
|---|---|
| Which machines produce parts that fail inspection? | Machine → Part ← Quality-Check (passed=false) |
| Which sensors were abnormal when defective parts were produced? | Sensor → Machine → Part ← Quality-Check (passed=false) |
| What is the defect rate by work order priority? | Work-Order (priority) → Part ← Quality-Check |
| Which parts need re-inspection? | Part ← Quality-Check (passed=false, count > 1) |

## GQL query example

Correlate sensor anomalies with quality failures:

```gql
MATCH (s:Sensor)-[:monitors]->(m:Machine)-[:has_part]->(p:Part)<-[:inspects]-(qc:QualityCheck)
WHERE s.lastReading > s.threshold AND qc.passed = false
RETURN m.name, s.type, s.lastReading, p.name, qc.defectCode
```

## What we built

| Step | Entities added | Cumulative | Key concept |
|---|---|---|---|
| 1 | Machine, Sensor | 2 | IoT hierarchy, telemetry |
| 2 | Work-Order, Part | 4 | Production chains, tolerances |
| 3 | Quality-Check | 5 | Feedback loops, inspection |

## Key takeaways

1. **IoT hierarchies** organize sensors under machines for telemetry aggregation
2. **Production chains** connect equipment to output through scheduling entities
3. **Quality feedback loops** enable root cause analysis across the production chain
4. **Threshold-based alerts** power predictive maintenance
5. **Boolean properties** (passed) create clear decision points in the workflow

```quiz
Q: How does Quality-Check create a feedback loop in the manufacturing ontology?
- It connects directly to Machine
- A failed check traces back through Part → Work-Order → Machine, identifying the source of defects [correct]
- It loops back to the Sensor entity
- Quality checks don't create feedback loops
> When a quality check fails, the path Quality-Check → Part → Work-Order → Machine traces the defect back to its source. This feedback loop is fundamental to continuous improvement in smart manufacturing — identifying which machines, work orders, or conditions produce defective parts.
```

You've completed the Smart Manufacturing learning path! Load any step from the [catalogue](#/catalogue) to explore it interactively.
