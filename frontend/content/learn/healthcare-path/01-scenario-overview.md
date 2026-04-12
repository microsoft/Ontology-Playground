---
title: "Scenario Overview"
slug: scenario-overview
description: "Meet the Healthcare System — a patient care platform that needs an ontology to connect patients, providers, diagnoses, and treatments."
order: 1
---

## The scenario

You are designing the data model for a **healthcare management system**. The hospital network tracks:

- **Patients** with medical records, blood types, and allergy information
- **Providers** (doctors, specialists) with licenses and departmental affiliations
- **Appointments** scheduling patient visits with specific providers
- **Diagnoses** recording medical conditions with ICD codes and severity levels
- **Prescriptions** tracking medication orders, dosages, and refills

Data is spread across electronic health records (EHR), scheduling systems, pharmacy databases, and billing platforms.

## Why an ontology?

A clinical question like **"Which patients diagnosed with severe conditions by cardiology providers still have prescriptions with zero refills remaining?"** crosses patient records, diagnosis history, provider specialties, and pharmacy data.

With an ontology, this maps to: `Patient → Diagnosis (severity=severe) ← Provider (specialty=Cardiology)` and `Diagnosis → Prescription (refillsRemaining=0)`.

## What we'll build

| Step | Entities | What you'll learn |
|---|---|---|
| 1 | Patient, Provider, Appointment | Core clinical entities, scheduling relationships |
| 2 | + Diagnosis | Medical conditions, multi-source relationships |
| 3 | + Prescription | Treatment chain, completing the care cycle |

By the end, you'll have a 5-entity, 6-relationship ontology covering the complete patient care journey from appointment to treatment.

## Key concepts

- **Clinical workflows** — appointment scheduling, diagnosis, treatment
- **Shared relationships** — both Patient and Provider connect to Appointment
- **Care chains** — Patient → Diagnosis → Prescription
- **Standardized identifiers** — MRN (Medical Record Number), ICD codes, Rx numbers

Let's start with the care delivery foundation.
