---
description: "Generate a full Ontology School module from source ontology material, including progressive step ontologies and lesson articles."
---

Create an Ontology School module from the provided ontology or course materials.

Requirements:
- 4-7 progressive steps
- Step ontologies under `catalogue/official/<slug>-step-N/`
- Step metadata must use `"category": "school"`
- Course under `content/learn/<course-slug>/`
- Include embed diffs and at least one quiz per article
- Validate with:
  - `npm run qa:tutorial-content`
  - `npm run build`
- If content is pending approval, add `reviewStatus: under-human-review` and open a review issue flow
