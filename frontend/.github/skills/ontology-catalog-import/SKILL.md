---
name: ontology-catalog-import
description: "Import customer or external RDF/OWL into this repo's catalogue format. Use when user drops an RDF/OWL file and wants it catalogue-ready (metadata, category, validation, compile)."
---

# Ontology Catalog Import Skill

## Goal

Turn a source `.rdf` / `.owl` file into a valid catalogue entry under:

- `catalogue/external/<source>/<slug>/` or
- `catalogue/community/<author>/<slug>/`

## Read First

1. `docs/authoring-guide.md`
2. `scripts/compile-catalogue.ts` (validation expectations)
3. Existing examples:
- `catalogue/external/schema-org/`
- `catalogue/external/pizza-ontology/`

## Intake Questions

Ask user:

1. Is this entry `external` or `community`?
2. Desired slug and source folder?
3. Desired category?
4. Author display name?
5. Should this be tutorialized into Ontology School too?

## Required Outputs

- `<slug>.rdf` copied/adapted into target folder
- `metadata.json` with required fields
- Valid category value for catalogue compiler

## Validate

Run:

- `npx tsx scripts/compile-catalogue.ts`
- `npm run validate`

## Done Criteria

- Entry appears in `public/catalogue.json`
- No compile or validation errors
- Metadata is complete and user-readable
