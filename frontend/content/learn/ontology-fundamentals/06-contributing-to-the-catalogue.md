---
title: Contributing to the Catalogue
slug: contributing-to-the-catalogue
description: How to share your ontology with the community — fork, add your RDF and metadata, submit a PR, and see it published in the catalogue.
order: 6
embed: official/university
---

## The community catalogue

The Ontology Playground includes a [catalogue](#/catalogue) of ontologies — some maintained by the project team ("official") and others contributed by the community. Anyone can submit an ontology by opening a pull request.

## Two ways to contribute

### Option A: One-click PR from the designer

The fastest way to contribute:

1. Open the [Designer](#/designer) and build your ontology (or load an existing one)
2. Click **Submit to Catalogue** in the toolbar
3. Fill in the metadata: name, description, category, and tags
4. Sign in with GitHub (device flow — no passwords stored)
5. The tool automatically forks the repo, creates a branch, commits your RDF and metadata, and opens a pull request

That's it. The CI pipeline validates your RDF, checks the metadata schema, and runs tests. A maintainer reviews and merges.

### Option B: Manual PR

If you prefer working with Git directly:

1. **Fork** the repository on GitHub
2. Create a directory under `catalogue/community/<your-github-username>/<ontology-slug>/`
3. Add two files:
   - `ontology.rdf` — your RDF/OWL file
   - `metadata.json` — describes your ontology

## The metadata format

```json
{
  "name": "Library System",
  "description": "A public library with books, authors, members, and loans.",
  "icon": "📚",
  "category": "education",
  "tags": ["library", "books", "lending"],
  "author": "your-github-username"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Display name for the catalogue |
| `description` | Yes | One-sentence summary |
| `category` | Yes | One of: `retail`, `healthcare`, `finance`, `manufacturing`, `education`, `general` |
| `icon` | No | Single emoji for the card |
| `tags` | No | Array of lowercase keywords for search |
| `author` | No | GitHub username (auto-filled by the one-click flow) |

## Validation rules

Your PR will be automatically validated against these rules:

- **Valid RDF/OWL** — must parse without errors
- **Round-trip fidelity** — `parse(serialize(ontology))` must produce equivalent output
- **Metadata schema** — all required fields present, category is valid
- **Directory naming** — lowercase alphanumeric, hyphens, and underscores only
- **No symlinks** — for security, symbolic links in the catalogue are rejected

## What happens after merge?

Once merged, the build pipeline:

1. Runs `npm run catalogue:build` — compiles all RDF files into `catalogue.json`
2. Deploys the updated site — your ontology appears in the [Gallery](#/catalogue)
3. It's immediately available for embedding, deep-linking, and loading in the playground

<ontology-embed id="official/university" height="400px"></ontology-embed>

*The University System ontology is one of the official catalogue entries. Community contributions follow the same format — your ontology will look just like this in the gallery.*

## Tips for a smooth review

- **Write a good description** — explain what domain your ontology models and who it's for
- **Add meaningful tags** — helps users find your ontology in search
- **Test locally** — run `npm run validate -- catalogue/community/<you>/<slug>/ontology.rdf` before pushing
- **Keep it focused** — a well-scoped ontology with 3-8 entity types is more useful than a sprawling one with 30+

## Key takeaways

- Anyone can contribute an ontology via the one-click PR flow or a manual pull request
- Each submission needs an RDF file and a `metadata.json`
- CI validates your RDF automatically — fix any errors before the review
- Merged ontologies appear in the live catalogue immediately after deployment

```quiz
Q: What two files must every catalogue contribution include?
- ontology.json and README.md
- schema.rdf and config.yaml
- ontology.rdf and metadata.json [correct]
- index.html and style.css
> Each catalogue entry requires an ontology.rdf file (the RDF/OWL ontology) and a metadata.json file (name, description, category, and tags for the catalogue listing).
```
