---
applyTo: "**/*.{rdf,owl}"
description: "When an RDF/OWL file is in scope, guide the user through import options (catalogue-ready entry and/or ontology school module) and execute the selected workflow."
---

When an RDF/OWL file appears in user context, do this before any deep implementation:

1. Ask whether they want:
- `Catalogue import` (external/community entry),
- `Ontology School module` (progressive lessons + step ontologies),
- or `Both`.

2. If they choose catalogue import, use skill `ontology-catalog-import`.

3. If they choose school module, use skill `ontology-school-path-generator`.

4. If they choose both, perform catalogue import first, then tutorialization.

5. Always run validation commands before finishing:
- `npm run qa:tutorial-content` (if school content touched)
- `npx tsx scripts/compile-catalogue.ts`
- `npm run validate`
- `npm run build` (when substantial changes made)

6. Never push to `main`; use branch + PR workflow.
