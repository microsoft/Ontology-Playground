# Ontology School Skill

This repository ships a reusable GitHub Copilot Skill for building Ontology School tutorials from ontology source material.

- Skill path: `.github/skills/ontology-school-tutorializer/SKILL.md`
- Companion docs: `.github/skills/ontology-school-tutorializer/README.md`

## What it helps generate

- Progressive ontology steps in `catalogue/official/<course>-step-*`
- Learning course content in `content/learn/<course>/`
- Quiz blocks and embed wiring compatible with this project

## Guide: Where To Look By Need

- Need to model entities/properties/relationships correctly:
	- Start at `docs/authoring-guide.md`
- Need to write course markdown/frontmatter/quizzes:
	- Start at `docs/learn-content-guide.md`
- Need embeds or progressive graph diffs:
	- Start at `docs/embed-guide.md`
- Need examples of high-quality progressive labs:
	- Start at `content/learn/iq-lab-retail-supply-chain/`
	- Cross-check with `catalogue/official/iq-lab-retail-step-1/`

## Install in another repository

1. Copy the full folder:

```text
.github/skills/ontology-school-tutorializer/
```

2. Commit and push.

3. Ensure the target repo contains or adapts references in `SKILL.md`:
- ontology authoring guide
- learn content guide
- embed guide
- one existing course and one existing step ontology

4. Ask Copilot with natural prompts, for example:
- "Tutorialize this ontology into a 5-step Ontology School lab"
- "Create a course from these domain training materials"

## Suggested validation commands

```bash
npm run qa:tutorial-content
npx tsx scripts/compile-catalogue.ts
npx tsx scripts/compile-learn.ts
npm run build
```

## Pre-Ship QA Checklist

1. Compile gates pass.
- `npx tsx scripts/compile-catalogue.ts`
- `npx tsx scripts/compile-learn.ts`

2. Production build passes.
- `npm run build`

3. Manual smoke tests.
- Run `npm run dev`
- Verify new course appears in `/#/learn`
- Open every new article and check embed rendering
- Validate each `diff` embed against previous step
- Interact with one quiz per article and confirm feedback/explanation

4. Regression checks.
- Open one existing course (for example `iq-lab-retail-supply-chain`) to verify no regressions
- Load new catalogue IDs directly to ensure routes resolve

## CI Gate

Pull requests into `main` now run an explicit Ontology School validation step in CI:

- Workflow: `.github/workflows/ci.yml`
- Step: `Validate Ontology School submissions`
- Command: `npm run qa:tutorial-content`

This ensures school/tutorial submissions are validated before merge.
