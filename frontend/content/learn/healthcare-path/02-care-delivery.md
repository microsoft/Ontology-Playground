---
title: "Care Delivery"
slug: care-delivery
description: "Define Patient, Provider, and Appointment — the core entities that power healthcare scheduling and care delivery."
order: 2
embed: official/healthcare-step-1
---

## The care delivery foundation

Healthcare delivery revolves around three concepts:

- **Patient** — who is receiving care?
- **Provider** — who is delivering care?
- **Appointment** — when and where does the care happen?

These three entities capture the scheduling and delivery of healthcare. Every diagnosis and treatment flows from an appointment.

## Defining the entities

### Patient

| Property | Type | Identifier? |
|---|---|---|
| `patientId` | string | ✓ |
| `mrn` | string | |
| `dateOfBirth` | date | |
| `bloodType` | string | |
| `allergies` | string | |

The `mrn` (Medical Record Number) is the hospital's internal identifier. The `patientId` is used as the ontology identifier, while `mrn` is a domain-specific property that maps to the EHR system.

### Provider

| Property | Type | Identifier? |
|---|---|---|
| `providerId` | string | ✓ |
| `name` | string | |
| `specialty` | string | |
| `licenseNumber` | string | |
| `department` | string | |

The `specialty` and `department` properties enable filtering providers by clinical domain — essential for referral and routing queries.

### Appointment

| Property | Type | Identifier? |
|---|---|---|
| `appointmentId` | string | ✓ |
| `scheduledTime` | datetime | |
| `duration` | integer (minutes) | |
| `type` | string | |
| `status` | string | |

The `duration` property uses an integer with a minutes unit — enabling scheduling calculations and utilization analysis.

## Relationships

- **has_appointment** — `Patient` → `Appointment` (one-to-many)
  A patient can have many appointments over time.

- **sees** — `Provider` → `Appointment` (one-to-many)
  A provider handles many appointments.

> **Shared entity pattern:** Appointment connects to *both* Patient and Provider. It's the meeting point where two independent entities interact. This pattern is common whenever two actors participate in the same event.

## The graph so far

<ontology-embed id="official/healthcare-step-1" height="350px"></ontology-embed>

*Patient and Provider both connect to Appointment — the meeting point of care delivery.*

## What we learned

- **Shared entities** (Appointment) connect two independent actors (Patient, Provider)
- **Duration properties** use integers with units (minutes, hours, days)
- **Domain-specific identifiers** (MRN) coexist with ontology identifiers (patientId)
- The scheduling triangle (Patient–Appointment–Provider) is the healthcare foundation

```quiz
Q: Why is Appointment connected to both Patient and Provider instead of just one?
- To make the graph look more complete
- Because Appointment is a shared entity — it represents the interaction point between the two actors [correct]
- Because every entity must have at least two relationships
- Because Patient and Provider have the same properties
> An appointment is inherently a collaborative event involving both a patient and a provider. Modelling both relationships captures the full scheduling picture and enables queries from either perspective: "When is the patient's next visit?" or "How many patients does this provider see per day?"
```

Next, we'll add Diagnosis to track medical conditions.
