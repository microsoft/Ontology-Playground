---
title: Building Your First Ontology
slug: building-your-first-ontology
description: A step-by-step tutorial to create an ontology from scratch using the visual designer — add entities, define properties, connect with relationships, and export to RDF.
order: 4
embed: official/cosmic-coffee
---

## What we'll build

In this tutorial, you'll create a simple **Library** ontology with three entity types: `Book`, `Author`, and `Member` — connected by relationships. By the end, you'll have a valid RDF file ready for use with Microsoft Fabric IQ or any semantic tool.

## Step 1: Open the designer

Click the **Designer** button in the top navigation bar, or go directly to [/#/designer](#/designer). You'll see a blank canvas: an entity form on the left, a live graph preview on the right.

## Step 2: Create entity types

Add three entities using the **+ Add Entity** button:

**Book**
- Name: `Book`
- Icon: `📚`
- Color: pick a blue
- Properties:
  - `isbn` — string, **identifier** ✓
  - `title` — string
  - `publishedYear` — integer

**Author**
- Name: `Author`
- Icon: `✍️`
- Color: pick a green
- Properties:
  - `authorId` — string, **identifier** ✓
  - `name` — string
  - `nationality` — string

**Member**
- Name: `Member`
- Icon: `👤`
- Color: pick a purple
- Properties:
  - `memberId` — string, **identifier** ✓
  - `name` — string
  - `joinDate` — date

As you add each entity, watch the graph preview update in real-time.

## Step 3: Add relationships

Switch to the **Relationships** tab and add:

| Relationship | From | To | Cardinality |
|-------------|------|-----|-------------|
| `writtenBy` | Book | Author | Many-to-one |
| `borrowedBy` | Book | Member | Many-to-many |

The `writtenBy` relationship is many-to-one because many books can share one author, but each book has one primary author. The `borrowedBy` relationship is many-to-many because a book can be borrowed by many members, and a member can borrow many books.

## Step 4: Validate

Click the **Validate** button in the toolbar. If everything is correct, you'll see a green "No issues found" banner. Otherwise, fix any reported issues:

- Every entity must have at least one identifier property
- Relationships must reference existing entity types
- No duplicate IDs

## Step 5: Preview the RDF

Click the **RDF** tab in the preview pane. You'll see the live RDF/OWL output with syntax highlighting. This is the exact file that tools like Fabric IQ consume.

<ontology-embed id="official/cosmic-coffee" height="400px"></ontology-embed>

*The Cosmic Coffee ontology was built using the same workflow. Your Library ontology will look similar — entities as colourful nodes, relationships as directed edges.*

## Step 6: Export

You have three options:

1. **Download RDF** — saves a `.rdf` file to your Downloads folder
2. **Submit to Catalogue** — opens a one-click PR flow to contribute your ontology to the community catalogue (requires GitHub sign-in)
3. **Copy JSON** — copies the JSON representation for use in apps

## What's next?

- Explore the [Catalogue](#/catalogue) to see how other ontologies are structured
- Read [Ontology Design Patterns](#/learn/ontology-design-patterns) for naming conventions and best practices
- Try the **Query Playground** on the home page to ask natural-language questions against your ontology

## Key takeaways

- The designer provides a visual, code-free workflow for building ontologies
- Every entity needs a name, at least one property, and one identifier
- Relationships connect entities with a name and cardinality
- The live graph and RDF previews give instant feedback as you design
- Export to RDF for Fabric IQ, or submit directly to the community catalogue

```quiz
Q: Why is the borrowedBy relationship between Book and Member set to many-to-many?
- A book can only be borrowed once
- Each member borrows exactly one book at a time
- A book can be borrowed by many members over time, and a member can borrow many books [correct]
- Many-to-many is the default cardinality for all relationships
> A single book can be borrowed by different members at different times, and each member can borrow multiple books simultaneously — this bidirectional multiplicity is what makes it many-to-many.
```
