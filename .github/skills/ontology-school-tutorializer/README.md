# Ontology School Tutorializer Skill

Reusable GitHub Copilot Skill for generating Ontology School courses and progressive ontology lab steps from existing ontology or training material.

## What it does

- Transforms source ontology/course materials into progressive tutorial steps
- Produces `catalogue/official/...` step ontologies with metadata
- Produces `content/learn/...` course markdown with embeds and quizzes
- Enforces this repo's authoring and embed constraints

## Where the agent should look

Use this quick map when invoking the skill in a new repo:

- Tutorial modeling rules: `docs/authoring-guide.md`
- Course/article + quiz rules: `docs/learn-content-guide.md`
- Embed and diff rules: `docs/embed-guide.md`
- Best in-repo exemplar: `content/learn/iq-lab-retail-supply-chain/`
- Step ontology exemplar: `catalogue/official/iq-lab-retail-step-1/`

## Install in another repository

1. Copy this folder into the target repo:

```text
.github/skills/ontology-school-tutorializer/
```

2. Commit the skill files.

3. Ensure the target repo has equivalent guides, or update `SKILL.md` paths.

4. In Copilot Chat, invoke it naturally, for example:
- "Tutorialize this ontology into a 5-step lab"
- "Create an Ontology School path from these domain docs"

## Recommended companion docs in target repo

- Ontology authoring guide
- Learn content guide
- Embed guide
- At least one existing course and one step ontology as exemplar

## Notes

- The skill is repository-local and shareable through normal git workflows.
- Keep frontmatter `name` in `SKILL.md` aligned with folder name.

## Test Before Shipping

Run these checks before merging tutorialized content:

```bash
npm run qa:tutorial-content
npx tsx scripts/compile-catalogue.ts
npx tsx scripts/compile-learn.ts
npm run build
```

Manual smoke checks:

1. `npm run dev` and open `/#/learn`.
2. Verify the new course appears.
3. Open each article and verify embed renders.
4. Verify `diff` embeds highlight changes from the prior step.
5. Answer at least one quiz in each article to confirm feedback UI works.
