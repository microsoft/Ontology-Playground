---
title: "Mitigation Execution & Automation"
slug: mitigation-execution
description: "Transform your ontology into operational action — how to use it with Fabric IQ agents, real-time dashboards, and automation to reduce disruption impact from days to minutes."
order: 4
---

## From model to action

Your ontology is now ready to power real-time decision automation. Here's how it flows from disruption detection to mitigation execution:

### Phase 1: Detection (minute 0)

**Input**: External signal (supplier goes offline, natural disaster alert, quality issue reported)

**Your ontology enables**:
```
Data Agent Query:
  "Which suppliers are affected by the Taiwan earthquake?"
  ↓
  Matches: Supplier.country="Taiwan" + DisruptionEvent.region="Taiwan" 
           + DisruptionEvent.type="Natural Disaster"
  ↓
  Result: 3 critical suppliers identified
```

### Phase 2: Trace impact (minute 5)

**Input**: List of affected suppliers

**Your ontology enables**:
```
Data Agent Query:
  "For these 3 suppliers, show me all components they supply"
  ↓
  Follows: Supplier → supplies → Component
  ↓
  Result: 47 components identified
  
Then: "For these 47 components, which product lines use them?"
  ↓
  Follows: Component → usedIn → ProductLine
  ↓
  Result: 12 product lines exposed
```

### Phase 3: Quantify impact (minute 15)

**Input**: List of exposed product lines

**Your ontology enables**:
```
Calculation Engine:
  For each exposed ProductLine:
    revenue_at_risk = annualRevenue / 365 * daysOfSupplyOnHand
    urgency = 100 - (daysOfSupplyOnHand * 10)
  
  Aggregate:
    total_revenue_at_risk = SUM(revenue_at_risk)
    critical_product_lines = WHERE urgency > 70
    
  Result: 
    Total at risk: $127M
    Critical timeline: 3 days
    Affected customers: 450,000+
```

### Phase 4: Recommend actions (minute 20)

**Input**: Risk assessment results

**Your ontology enables**:
```
Recommendation Engine:
  For each component in each affected product line:
    1. Find AlternativeSupplier records where:
       - qualificationStatus="Approved"
       - capacityAvailable >= demand
       - country NOT IN earthquake_region
    
    2. Score each alternative by:
       - Lead time saved (leadTimeSavedDays)
       - Cost impact (pricePremiumPercent)
       - Reliability (reliabilityScore)
    
    3. Recommend top 3 actions with ROI:
       - Action A: Activate ChipX Europe (save 2 days, cost +$2M)
       - Action B: Increase safety stock (cost $500K, cover 2 weeks)
       - Action C: Redesign component (lead time unknown)
```

### Phase 5: Execute (minute 25)

**Your ontology triggers automated workflows**:

```
IF RiskAssessment.revenueAtRisk > $50M AND 
   RiskAssessment.timeToImpactDays < 5:
   
   THEN:
     1. Create PurchaseOrder for recommended AlternativeSupplier
     2. Update ProductionSchedule with new timeline
     3. Send email to:
        - Procurement team (execute purchase)
        - Operations (adjust schedules)
        - Finance (forecast $2M additional cost)
        - CEO/Board (update on exposure)
     4. Create Activator alerts with escalation policy
     5. Start monitoring MitigationAction.status
```

## Real-world workflow: End-to-end

### Day 1: Disruption detected

```
10:30 AM: Taiwan earthquake magnitude 6.8
          ↓
10:45 AM: Your system detects: DisruptionEvent created
          ├─ type = "Natural Disaster"
          ├─ severity = "Critical"
          ├─ region = "Taiwan"
          ├─ estimatedDurationDays = 7
          
10:46 AM: Data Agent traces impact
          ├─ 3 critical suppliers affected
          ├─ 47 components halted
          ├─ 12 product lines exposed
          ├─ $127M revenue at risk
          ├─ 3 days to production stoppage
          
10:47 AM: RiskAssessment created
          ├─ assesses impact for each product line
          ├─ recommends actions ranked by ROI
          
10:48 AM: MitigationActions auto-created
          ├─ PO issued to ChipX Europe (approved alternative)
          ├─ Safety stock orders placed
          ├─ Alerts sent to procurement, ops, finance
          
10:50 AM: Activator triggered
          ├─ Real-time dashboard shows impact + actions
          ├─ Escalation policy notifies leadership
          ├─ Procurement team acknowledges + confirms receipt
          
11:30 AM: MitigationAction.status = "In Progress"
          ├─ Purchase order in progress
          ├─ ChipX Europe confirms 48-hour shipment
          ├─ Production impact reduced from 7 days → 3 days
```

### Day 2-4: Monitoring and adjustment

```
Every 4 hours:
  - Check DisruptionEvent.estimatedDurationDays (update if recovery changes)
  - Monitor MitigationAction progress
  - Recalculate RiskAssessment with latest inventory data
  - Alert if leadTimeSavedDays slips (alternative supplier delays)
  - Recommend contingency actions if needed
  
Day 3: ChipX Europe shipment received
  ├─ MitigationAction.status = "Completed"
  ├─ Inventory restored for 47 components
  ├─ Production resumes (3-day delay, not 7-day)
  ├─ Actual cost: $2.1M (estimated $2M)
  ├─ Revenue protected: ~$100M of $127M exposure
```

## Connecting to Fabric IQ

Your ontology integrates seamlessly with Fabric IQ data agents:

```
User: "What's our supply chain risk exposure right now?"
  ↓
Data Agent grounds query against your ontology:
  1. Find all Supplier records with singleSourced=true
  2. For each, find Components they supply
  3. Trace to ProductLines using those components
  4. Calculate revenueAtRisk for each ProductLine
  5. Return ranked list by revenueAtRisk
  
Agent Response:
  "You have 3 critical single-source suppliers. 
   If any are disrupted, you lose ~$180M in 
   4-9 days. We recommend pre-qualifying 
   8 alternative suppliers (list attached)."

User: "Which alternatives are approved for ChipX?"
  ↓
Agent Query:
  AlternativeSupplier WHERE:
    canReplace.Supplier.name = "ChipX Corp"
    AND qualificationStatus = "Approved"
  ↓
Result:
  - ChipX Europe (capacity: 50K/month, +12% cost)
  - SemiCorp Japan (capacity: 30K/month, +18% cost)
  - Semiconductor Direct USA (capacity: 25K/month, +15% cost)
```

## Continuous improvement

Track the effectiveness of your mitigation model:

| Metric | Calculation | Goal |
|--------|-------------|------|
| Detection speed | Hours from disruption to RiskAssessment | < 1 hour |
| Trace accuracy | % of actual affected components identified | > 95% |
| Impact estimate accuracy | Estimated vs. actual revenue at risk | ±10% |
| Time to mitigation | Hours from assessment to MitigationAction execution | < 2 hours |
| Cost efficiency | Actual cost vs. estimated cost of actions | ±5% |
| Revenue protection rate | % of at-risk revenue protected by actions | > 80% |

Each disruption event becomes a training opportunity. Your agents learn which alternative suppliers actually perform, which lead times hold up, and which product lines are most resilient.

## Summary

Your Supply Chain Disruption & Risk Propagation ontology is production-ready:

✅ **7 entity types** capture the full disruption lifecycle  
✅ **40 properties** provide rich context for decision-making  
✅ **7 relationships** model realistic impact cascades  
✅ **Fabric IQ compatible** for natural-language agents  
✅ **Automation-ready** with enum classifications and timestamps  
✅ **Measurable outcomes** — reduce disruption impact from days to hours  

Deploy it, monitor it, and watch your supply chain resilience transform.
