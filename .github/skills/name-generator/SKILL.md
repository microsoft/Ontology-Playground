---
name: name-generator
description: "Generate approved person names for examples, demos, quests, tests, docs, and sample data. Use when a task needs fictional person names, customer names, employee names, patient names, student names, instructor names, or other human names."
---

# Name Generator Skill

## Goal

Generate person names for this repository from the approved local name fixture:

```text
data/reference/FNF-2026-06-01-01002-0268.csv
```

Do not invent person names. Every person name used in examples, sample data,
quests, tests, demos, docs, or generated ontology content must come from the
CSV `FullName` column.

## Source File

CSV columns:

```text
FirstName,LastName,FullName,FirstNameNative,LastNameNative,FullNameNative,Gender,Language
```

Use `FullName` by default. Use `FullNameNative` only when the user explicitly
asks for native-script names or locale-specific display text.

## Workflow

### 1. Decide how many names are needed

Identify the role and quantity from the task, for example:

- sample customers
- employees or managers
- patients or clinicians
- students or instructors
- reviewers, approvers, assignees, or contributors

If the task does not specify quantity, use the minimum number needed for the
example or test.

### 2. Read names from the CSV

Use the CSV fixture as the only source. A quick shell-friendly way to inspect
the first approved names is:

```bash
awk -F, 'NR > 1 { print $3 }' data/reference/FNF-2026-06-01-01002-0268.csv | head
```

For random sampling:

```bash
awk -F, 'NR > 1 { print rand() "\t" $3 }' data/reference/FNF-2026-06-01-01002-0268.csv | sort -n | cut -f2- | head -n 5
```

If names with commas or quotes are ever added to the CSV, use a proper CSV
parser instead of field splitting.

### 3. Fit names to the scenario

- Choose distinct names for distinct entities.
- Keep the selected names stable within a scenario so queries, expected results,
  docs, and sample instances stay consistent.
- Do not alter spellings unless the surrounding file has a strict ASCII-only
  convention. If ASCII is required, choose names from the CSV that are already
  ASCII-compatible.
- Email addresses and IDs may be generic (`customer001@example.com`) and do not
  need to use the person's name.

### 4. Update all dependent examples

When replacing a name in code or content, update every coupled surface:

- sample instances
- query prompts and curated query matches
- expected test strings
- rendered docs or generated content source files
- catalogue examples or learning materials

Regenerate compiled artifacts when source content changes:

```bash
npm run catalogue:build
npm run learn:build
```

## Validation

Before finishing a name-generation or name-replacement task:

1. Verify each selected name appears in the CSV `FullName` column.
2. Search for removed placeholder names to ensure no stale references remain.
3. Run focused tests for touched code paths.
4. Run `npm run build` when generated catalogue or learning output changes.

## Done Criteria

- [ ] All person names used by the task come from `data/reference/FNF-2026-06-01-01002-0268.csv`.
- [ ] No invented placeholder names remain in the touched examples.
- [ ] Related prompts, sample data, expected results, and tests are consistent.
- [ ] Relevant tests or build commands have passed, or any skipped validation is clearly reported.