# Contribute an Ontology: From Design to GitHub

This guide is a practical, demo-friendly path to contribute a new ontology to Ontology Playground, starting in the Designer and ending with a pull request on GitHub.

---

## What You Will Do

1. Design or refine your ontology in the Playground Designer.
2. Export RDF from the app.
3. Create a catalogue entry folder with RDF or OWL plus metadata.
4. Validate locally.
5. Open a pull request.

Community submissions should add reusable value to the catalogue. Good submissions model a real domain, workflow, or teaching scenario that other people can inspect, reuse, or learn from. Avoid vanity entries, duplicate submissions, placeholder examples, or ontologies that only exist to list a person, profile, or organization without a clear domain model.

---

## Prerequisites

- GitHub account
- Local clone of the repo
- Node.js 20+ and npm

Install dependencies once:

```bash
npm ci --ignore-scripts
```

---

## Step 1: Design in Ontology Playground

1. Open the app and go to Designer.
2. Create or edit an ontology.
3. Ensure each entity has:
   - a clear name
   - a description
   - at least one identifier property
4. Add meaningful relationship names and cardinalities.
5. Use validation feedback in the Designer before export.

Tip for demos: Start from an existing ontology in Catalogue and click Edit in Designer to speed up the walkthrough.

---

## Step 2: Export RDF

1. In the app, open Import / Export.
2. Export as RDF/XML.
3. Save the file as:

```text
ontology.rdf
```

Use `ontology.owl` if the source file is OWL. The compiler accepts any `.rdf` or `.owl` file in the entry folder, but `ontology.rdf` and `ontology.owl` are the repository conventions.

---

## Step 3: Choose the Contribution Type

Pick one:

- Community contribution:

```text
catalogue/community/<github-username>/<ontology-slug>/
```

  Use this for original contributor submissions. Both path segments are required: the GitHub username folder and the ontology slug folder.

- External source contribution:

```text
catalogue/external/<source-name>/<ontology-slug>/
```

  Use this only for ontologies imported from an external source with an appropriate license and clear provenance.

Create the folder and add two files:

1. `ontology.rdf` or `ontology.owl`
2. `metadata.json`

---

## Step 4: Create metadata.json

Use this starter template:

```json
{
  "name": "My Ontology",
  "description": "Short business-focused description",
  "category": "general",
  "icon": "🧭",
  "tags": ["demo", "ontology"],
  "author": "<github-username>"
}
```

Required fields are `name`, `description`, and `category`. The catalogue ID is derived from the folder path, so do not add an `id` field. No extra metadata fields are allowed unless they are first added to the schema.

Supported categories are:

```text
retail, healthcare, finance, manufacturing, education, food, media, events, technology, general, school, fibo
```

---

## Step 5: Validate Locally

Run:

```bash
npm run catalogue:build
npm run validate
```

Optional full checks:

```bash
npm test
npm run build
```

Success criteria:

- Catalogue compile succeeds.
- Validation/build has no errors.
- Entry appears in generated catalogue output.
- For pull requests, the ontology preview workflow should render a graph PNG on the PR discussion.

---

## Step 6: Commit and Open a Pull Request

1. Create a branch:

```bash
git checkout -b feature/add-ontology-<ontology-slug>
```

2. Commit files.
3. Push branch to your fork.
4. Open a PR to `main`.

Suggested PR title:

```text
feat: add community ontology <ontology-slug>
```

Include in PR description:

- Domain/use case
- Entity and relationship counts
- Why this ontology is useful for others
- Confirmation that it is new or materially different from existing catalogue entries

---

## Live Demo Script (5-7 minutes)

1. Open an ontology from Catalogue.
2. Click Edit in Designer.
3. Add one property and one relationship.
4. Export RDF/XML.
5. Show target folder structure in repo.
6. Add metadata.json.
7. Run compile command.
8. Show PR flow on GitHub and point out the generated ontology preview image.

---

## Related Docs and Skills

- Main contribution rules: [CONTRIBUTING.md](../CONTRIBUTING.md)
- Authoring reference: [docs/authoring-guide.md](authoring-guide.md)
- Metadata schema: [catalogue/metadata-schema.json](../catalogue/metadata-schema.json)
- Catalogue compiler: [scripts/compile-catalogue.ts](../scripts/compile-catalogue.ts)
- Skill: [ontology-catalog-import](../.github/skills/ontology-catalog-import/SKILL.md)
- Skill: [community-ontology-contribution](../.github/skills/community-ontology-contribution/SKILL.md)
- RDF intake instruction: [.github/instructions/rdf-intake.instructions.md](../.github/instructions/rdf-intake.instructions.md)

---

## Troubleshooting

- Entry not visible in Catalogue:
  - Check the folder path is exactly `catalogue/community/<github-username>/<ontology-slug>/` or `catalogue/external/<source-name>/<ontology-slug>/`.
  - Re-run catalogue compile.
- Validation errors:
  - Verify metadata against schema.
  - Remove unsupported metadata fields such as `id`.
  - Check RDF/OWL filename and path conventions.
- Missing PR preview image:
  - Confirm the PR changes a catalogue RDF, OWL, or metadata file.
  - Check the preview workflow logs for catalogue compile or render failures.
- PR checks failing:
  - Re-run local build and tests before pushing again.
