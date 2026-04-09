---
title: What is an Ontology?
slug: what-is-an-ontology
description: A beginner-friendly introduction to ontologies — what they are, why they matter, and how they help us model the real world as connected data.
order: 1
embed: official/cosmic-coffee
---

## Thinking in graphs

Imagine you're describing a coffee shop. You'd talk about **things** — stores, products, customers, orders — and the **connections** between them: a customer *places* an order, an order *contains* products, a store *stocks* products.

An **ontology** is a formal way of describing exactly that: the types of things in a domain and how they relate to each other. It's a blueprint for your data — not the data itself, but the *shape* of the data.

## Entities, properties, and relationships

Every ontology is built from three building blocks:

| Concept | What it means | Example |
|---------|--------------|---------|
| **Entity type** | A category of thing | `Customer`, `Product`, `Store` |
| **Property** | A fact about an entity | `Customer.name`, `Product.price` |
| **Relationship** | A connection between entities | `Customer → places → Order` |

Properties have **types** — text, numbers, dates, booleans — and every entity needs at least one **identifier property** (like a customer ID) that uniquely distinguishes each instance.

## Why ontologies matter

Without an ontology, your data is just tables and columns. With one, a system can understand that "revenue" is the sum of `Order.totalAmount` grouped by `Store.city` — because the ontology tells it how those concepts connect.

This is the foundation of **semantic data models**: instead of writing SQL by hand, you describe what you want in plain language and the system uses the ontology to generate the right query.

<ontology-embed id="official/cosmic-coffee" height="400px"></ontology-embed>

*The Cosmic Coffee Company ontology above models a coffee shop chain. Click any node to inspect its properties, or click an edge to see the relationship details.*

## From concept to code

Ontologies are typically represented in **RDF/OWL** — an XML-based standard for describing classes, properties, and relationships. You don't need to write XML by hand, though: tools like the [Ontology Designer](#/designer) let you build one visually and export valid RDF.

## Key takeaways

- An ontology defines the **types of things** in a domain and **how they relate**
- It's a schema, not data — it describes the shape, not the content
- It enables semantic querying: ask questions in natural language, get structured answers
- The standard format is **RDF/OWL**, but you can also work with JSON representations

```quiz
Q: Which of the following is NOT a building block of an ontology?
- Entity type
- Property
- SQL query [correct]
- Relationship
> Ontologies are built from entity types, properties, and relationships. SQL queries are how you retrieve data — they are not part of the ontology definition itself.
```

```quiz
Q: What is the purpose of an identifier property?
- To store the entity's colour
- To uniquely distinguish each instance of an entity [correct]
- To connect two entities together
- To define the data format
> An identifier property (like a customer ID) uniquely identifies each instance within an entity type, allowing the system to count, group, and join correctly.
```

Ready to see how RDF works under the hood? Continue to the next article.
