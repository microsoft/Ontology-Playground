---
title: "Factory Floor"
slug: factory-floor
description: "Define Machine and Sensor — the IoT foundation that monitors factory equipment in real time."
order: 2
embed: official/manufacturing-step-1
---

## The IoT foundation

Every smart factory starts with two concepts:

- **Machine** — what equipment is on the factory floor?
- **Sensor** — what data is it generating?

Machines and sensors form the telemetry backbone. Before tracking production or quality, you need to know what's running and what it's reporting.

## Defining the entities

### Machine

| Property | Type | Identifier? |
|---|---|---|
| `machineId` | string | ✓ |
| `name` | string | |
| `type` | string | |
| `status` | string | |
| `installDate` | date | |

The `status` property tracks operational state — `running`, `idle`, `maintenance`, or `offline`. This enables real-time dashboards and maintenance scheduling.

### Sensor

| Property | Type | Identifier? |
|---|---|---|
| `sensorId` | string | ✓ |
| `type` | string | |
| `unit` | string | |
| `lastReading` | float | |
| `threshold` | float | |

The `threshold` property defines the alert boundary. When `lastReading` exceeds `threshold`, the system triggers an alarm. This pattern is fundamental to predictive maintenance.

## Relationships

- **monitors** — `Sensor` → `Machine` (many-to-one)
  Multiple sensors monitor the same machine — one for temperature, another for vibration, etc.

> **Ownership hierarchy:** In IoT ontologies, sensors belong to machines. The direction matters: sensors monitor machines, not the other way around. This parent-child hierarchy is how IoT platforms organize telemetry data.

## The graph so far

<ontology-embed id="official/manufacturing-step-1" height="300px"></ontology-embed>

*A simple but meaningful start: machines monitored by sensors.*

## What we learned

- **IoT hierarchies** use parent-child relationships (Sensor → Machine)
- **Status properties** enable real-time operational tracking
- **Threshold properties** power predictive maintenance alerts
- Even two entities can form a useful telemetry backbone

```quiz
Q: Why does the Sensor entity have both lastReading and threshold properties?
- To store backup values in case one is wrong
- The threshold defines the alert boundary — when lastReading exceeds it, the system triggers an alarm for predictive maintenance [correct]
- Both values are required by all IoT standards
- The threshold is used to calculate the sensor's accuracy
> The threshold pattern is fundamental to predictive maintenance. By comparing the current reading against a known safe boundary, the system can automatically detect anomalies and alert operators before equipment failure occurs.
```

Next, we'll add production tracking with Work Orders and Parts.
