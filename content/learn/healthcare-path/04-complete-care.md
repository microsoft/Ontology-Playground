---
title: "Complete Care Model"
slug: complete-care
description: "Add Prescription to complete the healthcare ontology — connecting diagnoses to treatments and closing the care cycle."
order: 4
embed: official/healthcare-step-3
---

## The treatment chain

The final piece of the healthcare puzzle is **Prescription** — the treatment response to a diagnosis. This closes the care cycle: appointment → diagnosis → treatment.

## Prescription entity

| Property | Type | Identifier? |
|---|---|---|
| `rxNumber` | string | ✓ |
| `medication` | string | |
| `dosage` | string | |
| `frequency` | string | |
| `refillsRemaining` | integer | |

The identifier is `rxNumber` (prescription number) — a pharmacy-standard identifier. The `refillsRemaining` integer enables refill tracking and medication adherence monitoring.

## New relationships

- **treated_by** — `Diagnosis` → `Prescription` (one-to-many)
  A diagnosis can lead to multiple prescriptions (e.g., multiple medications for the same condition).

- **prescribes** — `Provider` → `Prescription` (one-to-many)
  A provider writes prescriptions for their patients.

> **Care chain:** The complete path is now `Patient → Diagnosis → Prescription`, with `Provider` connecting at every stage (sees appointments, makes diagnoses, writes prescriptions). This reflects the real clinical workflow.

## The complete graph

<ontology-embed id="official/healthcare-step-3" diff="official/healthcare-step-2" height="500px"></ontology-embed>

*The complete Healthcare ontology: 5 entities, 6 relationships. The care chain flows from Patient through Diagnosis to Prescription.*

## What the complete model enables

| Question | Graph path |
|---|---|
| Which patients need prescription refills? | Patient → Diagnosis → Prescription (refillsRemaining=0) |
| Which providers prescribe the most medications? | Provider → Prescription (count) |
| Which severe diagnoses have no treatment yet? | Diagnosis (severity=severe) with no → Prescription |
| Which specialists diagnose conditions they also prescribe for? | Provider → Diagnosis AND Provider → Prescription |

## GQL query example

Find patients with severe diagnoses whose prescriptions are running out:

```gql
MATCH (p:Patient)-[:diagnosed_with]->(d:Diagnosis)-[:treated_by]->(rx:Prescription)
WHERE d.severity = 'severe' AND rx.refillsRemaining <= 1
RETURN p.patientId, d.description, rx.medication, rx.refillsRemaining
```

## What we built

| Step | Entities added | Cumulative | Key concept |
|---|---|---|---|
| 1 | Patient, Provider, Appointment | 3 | Shared entities, scheduling |
| 2 | Diagnosis | 4 | Standardized codes, dual connections |
| 3 | Prescription | 5 | Care chains, treatment tracking |

## Key takeaways

1. **Shared entities** (Appointment, Diagnosis) connect multiple actors
2. **Standardized codes** (ICD, Rx) enable cross-system interoperability
3. **Care chains** (Patient → Diagnosis → Prescription) model clinical workflows
4. **Provider connects at every stage** — reflecting the central role in healthcare delivery
5. **Integer properties** (refillsRemaining, duration) enable operational queries

```quiz
Q: How does the Provider entity connect across the complete healthcare ontology?
- Provider only connects to Appointment
- Provider connects to Appointment, Diagnosis, and Prescription — reflecting their role at every stage of care [correct]
- Provider connects to Patient directly
- Provider connects to Prescription only
> Provider is the most connected entity in this ontology — they see appointments, make diagnoses, and write prescriptions. This reflects the real-world workflow where healthcare providers are involved at every stage of the care delivery chain.
```

You've completed the Healthcare System learning path! Load any step from the [catalogue](#/catalogue) to explore it interactively.
