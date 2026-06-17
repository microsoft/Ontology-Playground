---
title: "Risk Propagation Model"
slug: risk-propagation-model
description: "Understand how disruptions cascade — the 7 relationships that model supplier impact → component risk → product exposure → mitigation action."
order: 3
---

## The cascade: 7 relationships

The power of your ontology lies in its relationships — they encode how impact flows through your supply chain. A data agent follows these paths to answer questions like "How many product lines are exposed to this supplier failure?"

### 1. **Supplier supplies Component** (one-to-many)

```
Supplier "ChipX Corp" 
  supplies→ Component "GPU Module"
         → Component "Memory Board"
         → Component "Power Supply"
```

- **Why it matters**: Disrupting one supplier affects all its dependent components
- **Query example**: "Show me all components from suppliers in Taiwan"

### 2. **Component used in ProductLine** (many-to-many)

```
Component "GPU Module"
  usedIn→ ProductLine "Gaming Laptop 2024"
       → ProductLine "Workstation Pro"
       → ProductLine "Tablet Plus"
```

- **Why it matters**: A single component failure can halt multiple product lines
- **Query example**: "How many product lines depend on this component?"

### 3. **DisruptionEvent affects Supplier** (many-to-many)

```
DisruptionEvent "Taiwan Power Outage 2024-05-01"
  affects→ Supplier "ChipX Corp"
        → Supplier "Memory Inc"
```

- **Why it matters**: One disaster can hit multiple suppliers simultaneously
- **Query example**: "Which suppliers are in the flood zone?"

### 4. **DisruptionEvent triggers RiskAssessment** (one-to-many)

```
DisruptionEvent "Taiwan Power Outage"
  triggers→ RiskAssessment "Gaming Laptop - Impact Analysis"
         → RiskAssessment "Workstation - Impact Analysis"
```

- **Why it matters**: Each disruption triggers detailed impact analysis for affected product lines
- **Query example**: "What's the total revenue at risk from this disruption?"

### 5. **RiskAssessment recommends MitigationAction** (one-to-many)

```
RiskAssessment "Gaming Laptop - Impact Analysis"
  recommends→ MitigationAction "Activate Alt Supplier X"
           → MitigationAction "Increase Safety Stock"
           → MitigationAction "Redesign Component"
```

- **Why it matters**: Each impact analysis produces a prioritized action list
- **Query example**: "What's the best action to minimize disruption impact?"

### 6. **MitigationAction activates AlternativeSupplier** (many-to-many)

```
MitigationAction "Activate Alt Supplier X"
  activates→ AlternativeSupplier "ChipX Europe"
          → AlternativeSupplier "SemiCorp Japan"
```

- **Why it matters**: One action can bring multiple backups online simultaneously
- **Query example**: "Which pre-qualified suppliers can take over?"

### 7. **AlternativeSupplier canReplace Supplier** (many-to-one)

```
AlternativeSupplier "ChipX Europe"
  canReplace→ Supplier "ChipX Corp"

AlternativeSupplier "SemiCorp Japan"  
  canReplace→ Supplier "ChipX Corp"
```

- **Why it matters**: Multiple approved backups exist for critical suppliers
- **Query example**: "Is there an approved backup for this supplier?"

## The complete cascade example

Let's trace impact through a real scenario:

```
DISRUPTION
│
├─ Taiwan Power Outage (2024-05-01, Critical severity)
│
├─ AFFECTS
│  └─ Supplier "ChipX Corp" (singleSourced=true)
│     ├─ SUPPLIES
│     │  ├─ Component "GPU Module" (daysOfSupplyOnHand=3)
│     │  │  ├─ USED IN
│     │  │  │  ├─ ProductLine "Gaming Laptop 2024" ($50M annual revenue)
│     │  │  │  ├─ ProductLine "Workstation Pro" ($30M annual revenue)
│     │  │  │
│     │  │  └─ TRIGGERS RiskAssessment
│     │  │     ├─ revenueAtRisk=$80M
│     │  │     ├─ timeToImpactDays=3
│     │  │     │
│     │  │     └─ RECOMMENDS
│     │  │        ├─ MitigationAction "Activate ChipX Europe"
│     │  │        │  ├─ estimatedCost=$2M
│     │  │        │  ├─ leadTimeSavedDays=2
│     │  │        │  │
│     │  │        │  └─ ACTIVATES
│     │  │        │     ├─ AlternativeSupplier "ChipX Europe" 
│     │  │        │     │  ├─ qualificationStatus=Approved
│     │  │        │     │  ├─ capacityAvailable=50,000 units/month
│     │  │        │     │  ├─ pricePremiumPercent=12%
│     │  │        │     │  │
│     │  │        │     │  └─ CAN REPLACE
│     │  │        │     │     └─ Supplier "ChipX Corp"
│     │  │        │     │
│     │  │        │     └─ AlternativeSupplier "SemiCorp Japan"
│     │  │        │        └─ (secondary option)
│     │  │        │
│     │  │        └─ MitigationAction "Increase Safety Stock"
│     │  │           └─ estimatedCost=$500K
│     │  │
│     │  └─ Component "Memory Board"
│     │     └─ (similar cascade...)
```

## Why this structure enables automation

Your data agent can now:

1. **Detect** — "Monitor these suppliers and this region"
2. **Trace** — "When ChipX Corp has issues, automatically trace to all 14 affected product lines"
3. **Quantify** — "Calculate total revenue at risk ($80M) and time to impact (3 days)"
4. **Recommend** — "Activate pre-qualified alternatives that save 2 days and cost $2M vs. $80M loss"
5. **Act** — "Send procurement alerts, update production schedules, notify stakeholders"
6. **Learn** — "Track which actions actually worked and their real vs. estimated impact"

## Cardinality rules

| Relationship | Cardinality | Why |
|---|---|---|
| Supplier → Component | 1:N | One supplier may provide many components |
| Component → ProductLine | M:N | Components reused; products share components |
| Disruption → Supplier | M:N | One disaster hits multiple suppliers; supplier faces multiple threats |
| Disruption → Assessment | 1:N | Each disruption spawns assessments for each affected product line |
| Assessment → Action | 1:N | Each assessment recommends multiple actions |
| Action → Alternative | M:N | One action activates multiple backups; backups handle multiple situations |
| Alternative → Supplier | M:1 | Multiple pre-qualified backups exist for one primary supplier |

Next, we'll see how to use this model to execute mitigation workflows in practice.
