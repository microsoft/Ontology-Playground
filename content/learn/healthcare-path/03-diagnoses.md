---
title: "Diagnoses"
slug: diagnoses
description: "Add Diagnosis to track medical conditions — connecting patients to their clinical findings and providers to their assessments."
order: 3
embed: official/healthcare-step-2
---

## Recording clinical findings

An appointment produces clinical findings — what condition does the patient have? The **Diagnosis** entity captures these findings with standardized coding.

Adding Diagnosis enables:
- "Which patients have been diagnosed with diabetes?"
- "Which provider identified the most severe conditions last quarter?"
- "What are the most common diagnoses by department?"

## Diagnosis entity

| Property | Type | Identifier? |
|---|---|---|
| `diagnosisId` | string | ✓ |
| `icdCode` | string | |
| `description` | string | |
| `severity` | string | |
| `diagnosedDate` | date | |

The `icdCode` property holds the standardized ICD (International Classification of Diseases) code — a globally recognized coding system. This makes the ontology interoperable with insurance, billing, and research systems.

## New relationships

- **diagnosed_with** — `Patient` → `Diagnosis` (one-to-many)
  A patient can have multiple diagnoses over their medical history.

- **diagnoses** — `Provider` → `Diagnosis` (one-to-many)
  A provider records diagnoses based on their clinical assessment.

> **Dual authorship:** Diagnosis connects to both Patient (who has the condition) and Provider (who identified it). This dual connection enables both patient-centric views ("all of my conditions") and provider-centric views ("all conditions I've identified").

## The growing graph

<ontology-embed id="official/healthcare-step-2" diff="official/healthcare-step-1" height="400px"></ontology-embed>

*Diagnosis joins the graph with connections to both Patient and Provider. The diff highlights what's new.*

## What we learned

- **Standardized codes** (ICD) make ontologies interoperable with external systems
- **Dual-connected entities** (Patient → Diagnosis ← Provider) capture both perspectives
- **Severity properties** enable risk stratification and clinical prioritization
- The graph now supports both scheduling queries (via Appointment) and clinical queries (via Diagnosis)

```quiz
Q: Why is the ICD code property important for the Diagnosis entity?
- It makes the diagnosis identifier shorter
- It provides a globally standardized coding system that enables interoperability with insurance, billing, and research systems [correct]
- ICD codes are required by all ontology formats
- It prevents duplicate diagnoses from being recorded
> ICD (International Classification of Diseases) codes are the universal standard for classifying medical conditions. Including them in the ontology enables interoperability — the same code means the same condition across EHRs, insurance claims, clinical trials, and public health systems.
```

Next, we'll add Prescription to complete the treatment chain.
