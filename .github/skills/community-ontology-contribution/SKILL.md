---
name: community-ontology-contribution
description: "Add a contributor ontology to catalogue/community/. Use when a community member submits an RDF/OWL file and wants it listed in the Playground catalogue under their GitHub username."
---

# Community Ontology Contribution Skill

## Goal

Place a contributor's ontology under the correct catalogue path and produce
a valid, compilable community entry.

Accept only submissions that are new or materially different from existing
catalogue entries and that contribute reusable community value. A good community
ontology models a domain, workflow, teaching scenario, or reusable pattern that
others can inspect, learn from, or adapt. Do not accept vanity-only entries,
placeholder ontologies, duplicates, or profiles of a person or organization with
no meaningful domain model.

---

## CRITICAL: Directory Structure

The catalogue compiler scans **exactly three levels deep**:

```
catalogue/community/<github-username>/<slug>/
```

Both the `<github-username>` folder **and** the `<slug>` subfolder are
**required**. Files placed directly in `catalogue/community/<github-username>/`
will be **silently skipped** by the compiler and the ontology will never appear
in the catalogue.

### ✅ Correct

```
catalogue/community/jane-doe/supply-chain/
├── metadata.json
└── ontology.rdf        ← or ontology.owl
```

### ❌ Wrong — silently skipped

```
catalogue/community/jane-doe/
├── metadata.json       ← wrong depth
└── ontology.rdf        ← wrong depth
```

---

## Step-by-Step Workflow

### 1. Determine the username and slug

- `<github-username>` — the contributor's GitHub username (lowercased, as-is)
- `<slug>` — short kebab-case name for this ontology (e.g. `supply-chain`, `hr-system`)

### 2. Create the directory

```bash
mkdir -p catalogue/community/<github-username>/<slug>/
```

### 3. Place the RDF/OWL file

Copy the file in and rename it `ontology.rdf` (or `ontology.owl`):

```bash
cp <source-file> catalogue/community/<github-username>/<slug>/ontology.rdf
```

### 4. Create `metadata.json`

Required fields (`name`, `description`, `category`) — missing any one causes a
compile error:

```json
{
  "name": "Human-Readable Ontology Name",
  "description": "One-sentence description of the domain.",
  "category": "general",
  "icon": "🏭",
  "tags": ["tag1", "tag2"],
  "author": "<github-username>"
}
```

**`category` must be one of:**
`retail` | `healthcare` | `finance` | `manufacturing` | `education` | `food` | `media` | `events` | `general` | `school` | `fibo`

No extra fields are allowed (`additionalProperties: false` in the schema).
The catalogue ID is derived from the filesystem path, so do **not** add an
`id` field. The `fabric_forum_user_name` and `author_linkedin` fields are also
not in the schema — omit them unless the schema is updated first.

### 4a. Person names in examples or sample data

If you create, repair, or normalize sample instances, examples, docs, quests, or
RDF/OWL literals that need person names, first use the `name-generator` skill.
Do not invent customer, employee, patient, student, instructor, reviewer, or
other human names.

All new person names must come from the `FullName` column in:

```text
data/reference/FNF-2026-06-01-01002-0268.csv
```

### 5. Validate

```bash
npm run catalogue:build
```

Look for:

```
✔ community/<slug>
```

If you see a compile error or the entry is absent, re-check:
- Directory depth (username folder + slug subfolder both present?)
- All three required fields in `metadata.json` (`name`, `description`, `category`)
- Valid `category` value
- No extra fields in `metadata.json`
- Whether the submission is genuinely new and useful for the wider community

### 6. Full build check

```bash
npm run build
```

---

## Common Mistakes (from real PRs)

| Mistake | Effect | Fix |
|---------|--------|-----|
| Files at `community/<username>/` with no slug subfolder | Silently skipped — entry never appears | Add `<slug>/` subfolder |
| Missing `name` field in `metadata.json` | Compile error | Add `"name": "..."` |
| Invalid `category` value | Compile error | Use one of the allowed values |
| Extra fields (`id`, `fabric_forum_user_name`, etc.) | Compile error (`additionalProperties`) | Remove the extra fields |
| Ontology file named something other than `ontology.rdf/.owl` | Inconsistent with repo convention | Rename to `ontology.rdf` or `ontology.owl` |
| Vanity-only or duplicate submission | Not accepted in review | Ask for a reusable domain model or reject |

---

## Done Criteria

- [ ] `npm run catalogue:build` outputs a successful community catalogue entry
- [ ] `npm run build` passes with no TypeScript or Vite errors
- [ ] Entry appears in `public/catalogue.json` with correct `name`, `description`, `category`
- [ ] `source` field in compiled entry is `"community"`
- [ ] Submission is new or materially different from existing catalogue entries
- [ ] Submission has a clear reusable domain, workflow, or teaching value
- [ ] Any person names introduced while preparing the contribution came from the
  `name-generator` skill / approved CSV fixture
