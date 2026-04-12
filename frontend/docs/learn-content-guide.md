# Learning Content Authoring Guide

How to create courses and articles for the **Ontology School** section of the Ontology
Playground. This covers the directory structure, frontmatter format, markdown
features (including quizzes), the compilation pipeline, and presentation mode.

---

## Directory layout

All learning content lives under `content/learn/`. Each course is a
subdirectory containing a `_meta.md` file and one or more numbered markdown
articles:

```
content/learn/
  ontology-fundamentals/          ← course directory
    _meta.md                      ← course metadata
    01-what-is-an-ontology.md     ← article (order 1)
    02-understanding-rdf.md       ← article (order 2)
    ...
  iq-lab-retail-supply-chain/     ← another course
    _meta.md
    01-scenario-overview.md
    02-core-commerce.md
    ...
```

Prefix filenames with a number (`01-`, `02-`) to keep them sorted in the
filesystem. The actual display order comes from the `order` frontmatter field.

---

## Course metadata (`_meta.md`)

Each course directory must contain a `_meta.md` with YAML-style frontmatter:

```markdown
---
title: Ontology Fundamentals
slug: ontology-fundamentals
description: From first principles to hands-on design — everything you need to understand and build ontologies.
type: path
icon: 📚
---
```

| Field | Required | Description |
|-------|----------|-------------|
| `title` | Yes | Display name shown on course cards and headers |
| `slug` | Yes | URL slug — used in routes like `/#/learn/<slug>` |
| `description` | Yes | One-sentence summary for the course card |
| `type` | Yes | `path` (conceptual learning track) or `lab` (hands-on step-by-step) |
| `icon` | Yes | Emoji shown on the course card |

The body of `_meta.md` (after the frontmatter) is currently ignored but
reserved for future use (e.g., a course introduction page).

---

## Article frontmatter

Each article starts with frontmatter:

```markdown
---
title: "Step 1: Core Commerce"
slug: core-commerce
description: Define Customer, Order, and Product — the three foundational entities.
order: 2
embed: official/iq-lab-retail-step-1
---
```

| Field | Required | Description |
|-------|----------|-------------|
| `title` | Yes | Article heading |
| `slug` | Yes | URL slug — used in `/#/learn/<course>/<slug>` |
| `description` | Yes | One-line description shown in the course table of contents |
| `order` | Yes | Integer that controls display order within the course |
| `embed` | No | Catalogue ontology ID to show as a live interactive graph |

---

## Writing article content

Articles are standard markdown compiled by [marked](https://marked.js.org/).
You can use all the usual syntax: headings, paragraphs, lists, tables, code
blocks, bold, italic, links, and images.

### Trust model and sanitization

Learning content under `content/learn/` is treated as **trusted, reviewed
repository content** (not user-generated runtime input). Even so, the build
pipeline sanitizes compiled HTML before writing `public/learn.json`.

- Disallowed tags/attributes (for example `<script>`, inline event handlers,
  and `javascript:` links) are stripped during compilation.
- Safe subsets of HTML are preserved (headings, lists, tables, code blocks,
  links, images, quiz blocks, and `<ontology-embed>` tags).
- CI validates this path by running `npm run learn:build` in the main workflow.

### Headings and presentation slides

In **presentation mode**, the article is split into slides at every `<h2>`
boundary. An `<hr>` (`---`) within a section also creates a slide break.
Keep this in mind when structuring content:

- `## Section Title` → starts a new slide
- `---` → splits the current section into two slides
- Content before the first `<h2>` becomes the **title slide**

### Ontology embeds

To render a live interactive ontology graph from the catalogue, use the
`<ontology-embed>` custom element:

```html
<ontology-embed id="official/cosmic-coffee" height="400px"></ontology-embed>
```

With a diff highlight (shows which entities/relationships are new compared to
a previous step):

```html
<ontology-embed id="official/iq-lab-retail-step-2" diff="official/iq-lab-retail-step-1" height="400px"></ontology-embed>
```

**Important:** Always use a proper closing tag (`</ontology-embed>`). Do
**not** use self-closing syntax (`<ontology-embed ... />`). HTML does not
auto-close custom elements, so the self-closing form causes the browser to
treat all subsequent content as children of the embed, hiding it.

---

## Quizzes

Add interactive multiple-choice quizzes using fenced code blocks with the
`quiz` language tag. Quizzes render as interactive cards in both article view
and presentation mode.

### Syntax

````markdown
```quiz
Q: What role does the Shipment entity play in the ontology?
- It replaces the Order entity
- It acts as a hub connecting the logistics layer to the commerce layer [correct]
- It stores customer addresses
- It defines the cardinality between Warehouse and Carrier
> Shipment is a hub entity that connects multiple domains: it links Order to the logistics infrastructure (Carrier, Warehouse), enabling cross-domain queries without modifying existing entities.
```
````

### Format rules

| Line prefix | Meaning |
|-------------|---------|
| `Q:` | The question text (required, exactly one) |
| `- ` | An answer option (at least 2 required) |
| `[correct]` | Appended to the correct option (at least one required) |
| `>` | Explanation text shown after the user answers (optional, can span multiple lines) |

### How quizzes render

- **Article view:** Quiz appears inline between content sections as an
  interactive card with clickable option buttons.
- **Presentation mode:** Quiz gets its own dedicated slide. The presenter
  clicks an option to reveal correct/wrong feedback and the explanation.
- **Before JS loads:** A fallback line ("❓ Question text") is visible so
  the content isn't blank.

### Tips for good quizzes

- Place quizzes at the **end of a section** or **end of the article**, after
  the content that teaches the concept being tested.
- Write **4 options** for a good balance — 2 feels too easy, 6 is overwhelming.
- Keep the question **specific and testable** — avoid opinion-based questions.
- Write a brief **explanation** that reinforces the learning point.
- Make **wrong options plausible** — they should be things a learner might
  reasonably confuse, not obviously silly.

---

## Compilation

Articles are compiled at build time into `public/learn.json` by the script
`scripts/compile-learn.ts`. Run it with:

```bash
npx tsx scripts/compile-learn.ts
```

This is also run automatically by `npm run build`. The output is a JSON
manifest containing all courses and their articles with pre-rendered HTML.

### What the compiler checks

- Every course directory has a `_meta.md` with all required fields
- Every article has all required frontmatter fields
- `order` is a valid number
- `type` is either `path` or `lab`
- Quiz blocks have a `Q:` line, at least 2 options, and at least one
  `[correct]` option

If any check fails, the compiler prints an error and exits with code 1.

---

## Local development workflow

```bash
# 1. Create or edit markdown files under content/learn/<course>/

# 2. Compile the content
npx tsx scripts/compile-learn.ts

# 3. Start the dev server
npm run dev

# 4. Navigate to /#/learn to see your changes

# 5. Run tests to verify quiz compilation
npm test
```

The dev server serves `public/learn.json` directly, so you just need to
recompile and refresh the browser after editing content.

---

## Creating a new course

1. Create a directory under `content/learn/` with a kebab-case name
2. Add a `_meta.md` with the course frontmatter (title, slug, description,
   type, icon)
3. Add numbered article markdown files (`01-intro.md`, `02-details.md`, etc.)
4. If the articles reference catalogue ontologies via `<ontology-embed>`,
   make sure those ontologies exist in `catalogue/`
5. Run `npx tsx scripts/compile-learn.ts` to compile
6. Verify in the browser at `/#/learn`

---

## Checklist for new articles

- [ ] Frontmatter has all required fields (title, slug, description, order)
- [ ] Content uses `##` headings for logical sections (and slide breaks)
- [ ] `<ontology-embed>` tags use proper closing tags, not self-closing
- [ ] At least one quiz block per article
- [ ] Quiz has `Q:`, 2+ options, one `[correct]`, and an explanation
- [ ] `npx tsx scripts/compile-learn.ts` succeeds without errors
- [ ] `npm test` passes (the compile integration tests validate quiz JSON)
- [ ] Content reads well in both article view and presentation mode
