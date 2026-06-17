---
title: "Core Entities & Properties"
slug: core-entities
description: "Learn the 7 entity types and 40 properties that model supply chain disruptions, from suppliers and components to risk assessments and mitigation actions."
order: 2
---

## The 7 entity types

Your ontology captures the full lifecycle of a supply chain disruption, from the triggering event through detection, assessment, and response.

### Tier 1: The network

**Supplier**
- Represents external companies providing raw materials or components
- Key properties: `supplierId` (unique), `name`, `country`, `tier` (Tier 1/2/3), `reliabilityScore` (0-100), `singleSourced` (boolean)
- Use case: Identify critical single-source suppliers that are risk amplifiers

**Component**
- A part, material, or sub-assembly sourced from one or more suppliers
- Key properties: `componentId`, `name`, `category` (Electronic/Mechanical/Chemical/Packaging/Raw Material), `daysOfSupplyOnHand`, `criticalityLevel` (Critical/High/Medium/Low)
- Use case: Track which components can survive supplier interruptions based on safety stock

**ProductLine**
- A group of finished products sharing common components
- Key properties: `productLineId`, `name`, `annualRevenue`, `marketSegment`, `productionStatus` (Active/At Risk/Halted/Discontinued)
- Use case: Calculate revenue exposure and production timeline impact

### Tier 2: The disruption

**DisruptionEvent**
- An event interrupting or threatening normal supply from one or more suppliers
- Key properties: `eventId`, `type` (Natural Disaster/Geopolitical/Financial/Logistics/Quality Recall/Pandemic/Cyber Attack), `severity` (Critical/High/Medium/Low), `startDate`, `estimatedDurationDays`, `region`
- Use case: Classification and severity determine escalation level and response timeline

### Tier 3: The analysis

**RiskAssessment**
- An analysis of business impact when a disruption affects the supply chain
- Key properties: `assessmentId`, `assessedDate` (datetime), `revenueAtRisk` (USD), `timeToImpactDays`, `confidenceLevel` (High/Medium/Low), `recommendedAction`
- Use case: Quantify impact in business terms (money and time) to prioritize response

**MitigationAction**
- A concrete step to reduce or eliminate disruption impact
- Key properties: `actionId`, `type` (Activate Alternative Supplier/Increase Safety Stock/Redesign Component/Reduce Production/Expedite Shipment/Customer Communication), `status` (Proposed/Approved/In Progress/Completed/Cancelled), `estimatedCost` (USD), `leadTimeSavedDays`
- Use case: Track which actions have been taken and their actual vs. estimated effectiveness

### Tier 4: The backup

**AlternativeSupplier**
- A qualified backup supplier capable of substituting for a primary supplier
- Key properties: `altSupplierId`, `name`, `country`, `qualificationStatus` (Pre-qualified/Approved/Pending Audit/Not Qualified), `capacityAvailable` (units/month), `pricePremiumPercent` (%))
- Use case: Rapidly activate backups with known capacity and cost impact

## Property types and validations

Each property has a type that shapes how AI agents and dashboards work with it:

| Type | Example | Use in agents |
|------|---------|---------------|
| `string` | Supplier name, Component category | Search, filtering, reporting |
| `integer` | Days of supply, capacity, units | Threshold-based alerts |
| `decimal` | Revenue, price premium, reliability score | Cost-benefit calculations |
| `date` | Disruption start date | Timeline comparisons |
| `datetime` | Risk assessment timestamp | Audit trails, trending |
| `enum` | Supplier tier, disruption type, severity | Classification, decision trees |
| `boolean` | Single-sourced flag | Risk flagging |

## Identifier properties

Each entity has a unique identifier:

```
Supplier → supplierId (e.g., "SUPP-00456")
Component → componentId (e.g., "COMP-SEM-0821")
ProductLine → productLineId (e.g., "PL-LAP-2024")
DisruptionEvent → eventId (e.g., "DISR-202405-TAIWAN-001")
RiskAssessment → assessmentId (e.g., "RA-20240501-SEM-001")
MitigationAction → actionId (e.g., "MA-20240501-ALT-SUPP")
AlternativeSupplier → altSupplierId (e.g., "ALTSUPP-00789")
```

These IDs are how you and your agents refer to specific instances in queries and reports.

## Cardinality and relationships

Entities connect via relationships with defined cardinality:

- **One-to-many**: A supplier provides many components; a disruption affects many suppliers
- **Many-to-many**: Components are used in many product lines; mitigation actions activate many alternative suppliers
- **Many-to-one**: Alternative suppliers can replace one primary supplier

We'll explore the full relationship map next.
