---
description: "Import an RDF/OWL file into the ontology catalogue with metadata and validation."
---

Import the provided RDF/OWL into this repository's catalogue structure.

Requirements:
- Ask user whether destination is `external` or `community`
- Create slugged folder and metadata
- Validate with:
  - `npx tsx scripts/compile-catalogue.ts`
  - `npm run validate`
- Report final catalogue ID and changed files
