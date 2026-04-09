---
name: ontology-school-path-generator
description: "Generate Ontology School course paths/labs with progressive step ontologies from source ontology material. Use when user asks to tutorialize an ontology into school lessons and per-step builds."
---

# Ontology School Path Generator Skill

## Goal

Generate a complete Ontology School course with progressive ontology steps.

## Read First

1. `docs/authoring-guide.md`
2. `docs/learn-content-guide.md`
3. `docs/embed-guide.md`
4. Example lab:
- `content/learn/iq-lab-retail-supply-chain/`
- `catalogue/official/iq-lab-retail-step-1/`

## Workflow

1. Extract a teachable subset from source ontology.
2. Define step progression (4-7 steps).
3. Create step ontologies under `catalogue/official/<slug>-step-N/`.
4. Mark step ontologies with `"category": "school"`.
5. Create course under `content/learn/<course-slug>/`.
6. Add `<ontology-embed>` + `diff` for progressive steps.
7. Include at least one quiz per article.

## Validate

- `npm run qa:tutorial-content`
- `npm run build`

## Human Review Flow

If lesson content is not yet approved:

- Add `reviewStatus: under-human-review` to article frontmatter
- Open review issue via `.github/ISSUE_TEMPLATE/ontology-school-review.yml`

## Done Criteria

- Course renders in `/#/learn`
- Step ontologies are isolated in School category
- Builds and validators pass
