---
name: ontology-school-tutorializer
description: "Create or update Ontology School courses from source ontology/course material. Use when asked to tutorialize an ontology, build step-by-step lab content, create progressive official catalogue entries, wire ontology-embed diffs, and author quizzes aligned with this repository's guides."
---

# Ontology School Tutorializer

## Purpose

Turn a source ontology or domain document set into a high-quality Ontology School course with:

- Progressive ontology steps in `catalogue/official/<course>-step-*`
- Course content in `content/learn/<course>/`
- Metadata and embeds compatible with this repo build pipeline

## Task Router (What To Read First)

Use this routing table to avoid searching blindly.

| If the request is about... | Read first | Then inspect examples in | Main output location |
|---|---|---|---|
| Ontology modeling quality (entities, properties, cardinalities) | `docs/authoring-guide.md` | `catalogue/official/finance-step-1/`, `catalogue/official/iq-lab-retail-step-1/` | `catalogue/official/<slug>-step-N/` |
| Course/article authoring and quizzes | `docs/learn-content-guide.md` | `content/learn/iq-lab-retail-supply-chain/` | `content/learn/<course-slug>/` |
| Embed syntax and runtime behavior | `docs/embed-guide.md` | `content/learn/finance-path/03-transactions.md`, `public/embed/samples.html` | `content/learn/<course-slug>/*.md` |
| External ontology onboarding | `scripts/compile-catalogue.ts` and `docs/authoring-guide.md` | `catalogue/external/schema-org/`, `catalogue/external/pizza-ontology/` | `catalogue/external/<source>/<slug>/` |
| Progressive step diffs in tutorials | `docs/learn-content-guide.md` (ontology-embed section) | `content/learn/iq-lab-retail-supply-chain/03-order-details-and-categories.md` | `content/learn/<course-slug>/*.md` |
| Build and release readiness | `README.md` (build scripts) and this file's validation sections | N/A | N/A |

## Required References

Read these first before authoring:

1. `docs/authoring-guide.md`
2. `docs/learn-content-guide.md`
3. `docs/embed-guide.md`
4. Existing examples:
- `content/learn/iq-lab-retail-supply-chain/`
- `catalogue/official/iq-lab-retail-step-1/`
- `catalogue/official/iq-lab-retail-step-2/`

## Workflow

1. Analyze source ontology material.
- Identify a teachable subset (5-12 entities for labs).
- Extract candidate entities, properties, and relationships.
- Preserve semantic intent; simplify only for pedagogy.

2. Plan progression.
- Step 1 should establish a meaningful core graph.
- Each next step must add a coherent concept slice.
- Prefer 4-7 steps.

3. Create official step ontologies.
- Add one folder per step under `catalogue/official/<slug>-step-N/`.
- Include `<slug>-step-N.rdf` and `metadata.json`.
- Use valid categories (`school` for learning steps).
- Keep IDs stable and predictable (`official/<slug>-step-N`) to support embed/diff wiring.

4. Create course files.
- Add `content/learn/<course-slug>/_meta.md`.
- Add ordered articles (`01-...md`, `02-...md`, ...).
- Use frontmatter fields exactly as required.
- Include at least one `quiz` block per article.
- Ensure each article has one clear learning objective and one graph state change.

5. Add embeds and diffs.
- Use `<ontology-embed id="official/<slug>-step-N">`.
- For progression articles, add `diff="official/<slug>-step-(N-1)"`.
- Never use self-closing `<ontology-embed />` tags.

6. Validate.
- Run `npx tsx scripts/compile-catalogue.ts`.
- Run `npx tsx scripts/compile-learn.ts`.
- Run `npm run build` if requested.

## File Map By Deliverable

- New external ontology subset:
	- `catalogue/external/<source>/<slug>/<slug>.rdf`
	- `catalogue/external/<source>/<slug>/metadata.json`
- Progressive school steps:
	- `catalogue/official/<course>-step-1/<course>-step-1.rdf`
	- `catalogue/official/<course>-step-1/metadata.json`
	- repeat for each step
- Learning course:
	- `content/learn/<course>/_meta.md`
	- `content/learn/<course>/01-*.md` ... `0N-*.md`
- Optional user-facing docs when behavior is new:
	- `README.md`
	- `docs/*.md`

## Pre-Ship Test Gate

Run this gate before calling work complete.

1. Static compilers.
- `npx tsx scripts/compile-catalogue.ts`
- `npx tsx scripts/compile-learn.ts`
- Preferred shortcut: `npm run qa:tutorial-content`

2. Full build.
- `npm run build`

3. Smoke-check key routes (manual).
- `npm run dev`
- Open `/#/learn` and verify the new course card appears.
- Open each article and confirm embeds render (no blank content).
- Verify each `diff` article visually highlights changes from previous step.
- Answer at least one quiz question per article and confirm feedback/explanation renders.

4. Regression spot checks.
- Load one existing course (for example `iq-lab-retail-supply-chain`) and verify no rendering regression.
- Open catalogue and confirm new IDs resolve (including external entry if added).

## Definition Of Done

- New files compile, build, and render in app
- Progressive steps are semantically coherent and visibly incremental
- Embeds and diff wiring are valid and non-self-closing
- Quizzes compile and interact correctly
- User-visible documentation is updated

## Authoring Rules

- Use domain-meaningful names and descriptions.
- Ensure each entity has one identifier property.
- Keep relationship names verb-oriented.
- Use explicit cardinalities.
- Keep article prose concise and practical.
- Add quizzes that test understanding, not memorization.

## Output Checklist

- [ ] New or updated external/official ontology files compile
- [ ] Course appears under `/#/learn`
- [ ] Article embeds resolve to valid catalogue IDs
- [ ] Diff embeds show progressive changes
- [ ] Quiz blocks compile successfully
- [ ] Documentation updated if behavior is user-visible
