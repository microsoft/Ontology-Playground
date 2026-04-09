---
title: Understanding RDF and OWL
slug: understanding-rdf-and-owl
description: Learn how ontologies are represented in RDF/OWL — the standard language for describing classes, properties, and relationships on the semantic web.
order: 2
embed: official/ecommerce
---

## What is RDF?

**RDF** (Resource Description Framework) is a W3C standard for describing information as a graph of connected resources. Everything in RDF is expressed as **triples**: subject → predicate → object.

```
:Customer  rdf:type       owl:Class .
:name      rdf:type       owl:DatatypeProperty .
:name      rdfs:domain    :Customer .
:name      rdfs:range     xsd:string .
```

The triple above says: "There is a class called Customer, and it has a property called name, which is a string."

## OWL builds on RDF

**OWL** (Web Ontology Language) extends RDF with richer modelling — cardinality constraints, class hierarchies, and logical axioms. For ontology design, the key OWL constructs are:

| OWL concept | Maps to | Example |
|-------------|---------|---------|
| `owl:Class` | Entity type | `Customer`, `Product` |
| `owl:DatatypeProperty` | Property with a primitive value | `name` (string), `price` (decimal) |
| `owl:ObjectProperty` | Relationship between entities | `placedBy` (Order → Customer) |
| `rdfs:domain` / `rdfs:range` | Which entity a property belongs to / its type | `price` belongs to `Product`, type `xsd:decimal` |

## Namespaces keep things unambiguous

Every resource in RDF has a globally unique **URI**. To avoid writing long URIs everywhere, RDF/XML uses **namespace prefixes**:

```xml
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns="https://mycompany.com/ontology/">
```

The `xmlns=` default namespace means that `<owl:Class rdf:about="Customer">` is really `https://mycompany.com/ontology/Customer`.

## Reading an RDF/OWL file

Here's a minimal ontology with one entity type and one property:

```xml
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:xsd="http://www.w3.org/2001/XMLSchema#"
         xmlns="https://example.com/shop/">

  <!-- Entity type: Product -->
  <owl:Class rdf:about="Product">
    <rdfs:label>Product</rdfs:label>
  </owl:Class>

  <!-- Property: productName (string, identifier) -->
  <owl:DatatypeProperty rdf:about="productName">
    <rdfs:domain rdf:resource="Product"/>
    <rdfs:range rdf:resource="http://www.w3.org/2001/XMLSchema#string"/>
    <rdfs:label>productName</rdfs:label>
  </owl:DatatypeProperty>
</rdf:RDF>
```

The Ontology Playground can import files like this directly — or you can design visually and export to RDF.

<ontology-embed id="official/ecommerce" height="400px"></ontology-embed>

*The E-Commerce ontology shows a richer example with multiple entity types and object properties connecting them.*

## JSON vs RDF — when to use which

| | JSON | RDF/OWL |
|---|------|---------|
| **Human readability** | Easy to read and edit | Verbose but precise |
| **Tooling** | Any text editor | Semantic web tools, SPARQL endpoints |
| **Interoperability** | Application-specific | W3C standard, universally understood |
| **Best for** | Quick prototyping, app configs | Formal data models, cross-system integration |

The Ontology Playground supports both formats: design in the visual editor, export as JSON for quick use or RDF/OWL for formal publication.

## Key takeaways

- RDF represents knowledge as **subject → predicate → object** triples
- OWL adds classes, data properties, and object properties on top of RDF
- Namespaces keep URIs short and unambiguous
- The Playground imports and exports standard RDF/OWL — no hand-coding required

```quiz
Q: In RDF, information is expressed as:
- Tables with rows and columns
- JSON key-value pairs
- Subject → predicate → object triples [correct]
- Binary data streams
> RDF uses triples — three-part statements where a subject is connected to an object through a predicate — to describe information as a graph of connected resources.
```

```quiz
Q: What does owl:ObjectProperty represent?
- A property with a primitive value like a string
- A relationship between two entity types [correct]
- The namespace of an ontology
- A constraint on data types
> In OWL, an ObjectProperty defines a relationship between two classes (entity types), such as "placedBy" connecting Order to Customer. DatatypeProperty is used for primitive values.
```
