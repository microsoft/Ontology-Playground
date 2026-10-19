# Ontology Playground (Preview) ☕

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

> Note: This project was developed with AI-assisted coding.

**[Try it live &#x2192; microsoft.github.io/Ontology-Playground](https://microsoft.github.io/Ontology-Playground/)**

[![Ontology Playground screenshot](public/og-image.png)](https://microsoft.github.io/Ontology-Playground/)

A free, open-source web application for learning about ontologies and
**Microsoft Fabric IQ**. Explore pre-built ontologies, design your own in a
visual editor, export as RDF/XML, and share interactive diagrams — all from a
fully static site with zero backend dependencies.

![Microsoft Fabric](https://img.shields.io/badge/Microsoft-Fabric-0078D4?style=flat-square&logo=microsoft)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

## Features

Text and icons use theme-aware foreground colors, including yellow accents in
the welcome, help, data-source, and quest panels. Automated contrast checks
cover the supported theme palettes.

### Interactive Graph Exploration

Cytoscape.js-powered graph that renders any ontology as an interactive
node-and-edge diagram. Pan, zoom, click nodes to inspect properties, and use
the live search bar to filter entities and relationships.
The graph has an accessible text summary naming the ontology and its entity
and relationship totals; semantic overviews also identify the visible counts.
Zoom, fit, reset, and PNG download controls have explicit accessible names,
while the legend and semantic-view controls remain independently accessible.
This summary does not provide keyboard navigation of canvas nodes.

### Ontology Catalogue

A curated library of official and community-contributed ontologies spanning six
domains (Retail, E-Commerce, Healthcare, Finance, Manufacturing, Education).
Browse by category, search by name or tags, load any ontology with one click,
and inspect or download its exact reviewed RDF source.
Catalogue cards preserve and display available license, upstream source, and
version attribution for external standards and adapted community entries. The
gallery downloads a lightweight metadata index; each versioned graph payload
and original source is published separately at an immutable,
content-addressed URL and verified by SHA-256 when requested. Original files
remain byte-for-byte intact, including source-only SHACL rules and unsupported
triples. The graph is a visual projection; opening a catalogue entry in the
Designer carries the complete verified source with it. Every ontology has a
shareable deep link
(`/#/catalogue/official/cosmic-coffee`).

### Visual Ontology Designer

A full-screen, split-pane editor for creating ontologies from scratch or
editing existing ones. Add entity types with icons, colors, and typed
properties; define relationships with cardinalities; see a live graph preview
that updates as you work, including reconnecting edges when a relationship's
From or To entity changes without repositioning existing nodes.
Includes undo/redo (50 levels), real-time validation,
and export to RDF/XML or JSON. Source-backed RDF uses a bounded editing mode:
only unambiguous existing labels, comments, and direct named-class
`rdfs:subClassOf` edges can be changed. Unsupported controls stay read-only,
and undo/redo updates both the graph projection and RDF statement patches
atomically.

### RDF Import & Export

RDF/XML imports retain the exact original bytes and a complete semantic graph
alongside the Playground's visual projection. Untouched downloads are
byte-for-byte identical, including BOM, encoding, formatting, and unsupported
statements. After a supported edit, export serializes the complete patched
graph rather than regenerating only the visible subset; all unrelated
statements remain present. Undoing every net edit restores exact-original
download eligibility.

The complete parser retains named and blank nodes, arbitrary predicates,
literal lexical forms, language tags, datatypes, OWL restrictions, RDF lists,
and SHACL statements. Standalone RDF/XML node roots retain their subject,
unknown `rdf:parseType` values follow XML-literal fallback semantics, and
valid XML 1.0 Unicode predicate names remain serializable. Imports and SHACL
remain inert: external resources are never fetched and rules are never
executed. RDF/XML `DOCTYPE` input and named graph output are rejected
explicitly. Current resource limits are 8 MiB and 250,000 unique statements.
File imports reject the declared file size before allocating its contents and
abort obsolete reads. Async download paths verify the initiating document and
component lifetime before exposing output. Large complete-source views fall
back to one plain text node instead of constructing an unbounded syntax-token
tree; copy and download still use the complete source.
RDF/XML loaded by URL embeds uses the same preflight and complete-graph parser;
oversized response streams are cancelled before projection.

For ontologies created in the Playground, exports can use either the
Playground round-trip profile or a standards-oriented OWL + SHACL profile. The
standards profile represents property order, enums, identifiers, relationship
cardinality, and relationship attributes with interoperable vocabulary instead
of treating Playground metadata as Fabric vocabulary. These generated profiles
are not offered for source-backed documents. Modified source exports are
labelled as derived, report source/export statement counts and patch counts,
and can optionally add an explicit `prov:wasDerivedFrom` source-hash statement.
The current Fabric API accepts only the visual projection, so direct Fabric
push is disabled for source-backed documents rather than silently omitting
preserved statements. Download the complete RDF for those documents instead.

Graph rendering graduates automatically with ontology size: small ontologies
remain complete, dense ontologies retain all data with reduced label noise, and
massive ontologies open as a bounded semantic hierarchy overview. Search,
adjustable hop depth, and `+N` boundary expansion keep every hidden entity
reachable without drawing the entire ontology at once. Selecting an entity does
not move the graph; selecting a `+N` entity exposes a neighbor action beside
that node. Expansion keeps existing entities and the viewport anchored while
placing newly revealed hierarchy branches to avoid crossings where possible.
The Semantic overview can hide the selected entity's shown neighborhood again.
When its 180-entity view limit is full it explains which neighbors remain
hidden and asks you to hide a shown neighborhood before expanding another. The
entity legend can be collapsed and automatically starts collapsed when it would
obscure a larger graph. PNG downloads export the currently visible graph within
browser-safe image limits and report failures instead of saving an empty file.
Automated catalogue PR previews wait for the requested graph's completed layout,
independent of whether its legend is collapsed or absent. All node-specific
expansions and the current selection/focus clear when the detail
slider changes, so each hop level starts as an unfocused hierarchy projection
while independent query and path highlights remain visible. Clicking anywhere
clearly to either side of the slider thumb moves to another hop even when the
browser would otherwise round back to the current step; thumb dragging and
arrow keys continue to work normally. Relationship labels stay out of the
overview until an entity is selected, which labels its visible connections, or
an individual relationship is hovered or selected.

Massive graph projections are scheduled and use an interruptible layout so
users can change the semantic view or cancel before or during layout. The Brick
reference case is enforced in a real Chromium run with one initial layout, no
main-thread task or interaction over 200 ms, at most 60 initially rendered
entities, and less than 40 MiB retained JavaScript heap after garbage
collection. Run `npm run build && npm run test:performance` to reproduce the
budget report locally.

Turtle input is not currently supported. See the
[RDF export profiles guide](docs/rdf-export-profiles.md) for the exact
contracts and limitations.

### One-Click Catalogue PR

Sign in with GitHub (device flow) and submit your ontology to the community
catalogue directly from the designer — the app forks the repo, creates a
branch, commits the RDF + metadata, and opens a pull request automatically.
This projection-oriented submission flow is available for Playground-authored
documents; source-backed documents must first be exported and reviewed as a
deliberate derived artifact.

### Embeddable Widget

A self-contained JavaScript file (`ontology-embed.js`) that renders an
interactive ontology viewer on any web page with a single `<script>` tag.
Supports dark/light themes, multiple loading methods (catalogue ID, URL,
inline base64), click-to-inspect, and complete source RDF display/copy for
catalogue and RDF/XML URL sources. URL sources are read with an 8 MiB bound;
RDF/XML URLs also receive the same `DOCTYPE`, statement-count, and inert
resource protections as file imports. The RDF worker is packaged inside the
self-contained embed bundle, so a widget hosted on another HTTPS origin does
not attempt to launch a cross-origin worker script. See the
[Embedding Guide](docs/embed-guide.md) for details.

### Ontology School

A structured learning hub (`/#/learn`) with **9 courses** spanning conceptual
learning paths and hands-on labs:

- **Ontology Fundamentals** — 6 articles covering core concepts (What is an
  Ontology? → RDF/OWL → Fabric IQ → Build Your First → Design Patterns →
  Contributing)
- **7 Domain Learning Paths** — Fourth Coffee, E-Commerce, Finance, Healthcare,
  Manufacturing, University, and HR System. Each path has 4 progressive articles
  that build an ontology step-by-step, with live embedded graphs showing new
  entities at each stage.
- **IQ Lab: Retail Supply Chain** — A 7-step hands-on lab that builds a 15-entity
  ontology from scratch (3 → 15 entities across 6 progressive catalogue entries).

Every article supports **presentation mode** (slides split at `##` headings)
and includes **interactive quizzes** with instant feedback. Ontology embeds
load live graphs from the catalogue with optional diff highlighting.

### Quest System

Five progressive quests that guide users through ontology concepts with
multi-step instructions, hints, progress bars, and achievement badges.

### Natural Language Query Playground

Type natural language questions ("Which customers placed orders?") and see how
they map to ontology entities and relationships — a preview of Fabric IQ's
NL2Ontology capability.

### Command Palette & Keyboard Shortcuts

Press `⌘K` / `Ctrl+K` anywhere to open a searchable command palette. Jump
to the Catalogue, Designer, Ontology School, Import/Export, Help, and more without
leaving the keyboard. Press `?` for quick help access. Arrow keys + Enter to
navigate the palette.

### Starter Templates

The designer offers five domain templates (Retail, Healthcare, Finance, IoT,
Education) so new users never face a blank page. Each template creates 3
entities with properties and 2 relationships, ready to customise.

### Interactive Onboarding Tour

First-time visitors get a 5-step guided tour with a spotlight overlay that
highlights the Header, Graph, Quests, Inspector, and Designer in sequence.
Dismissable with a "don't show again" option persisted to `localStorage`.

### Deep Linking & URL Routing

Client-side hash routing with shareable URLs for every page:

| Route | Page |
|-------|------|
| `/#/` | Home (default ontology) |
| `/#/catalogue` | Ontology gallery |
| `/#/catalogue/<source>/<slug>` | Specific ontology (e.g. `/#/catalogue/official/cosmic-coffee`) |
| `/#/designer` | Visual designer |
| `/#/designer/<source>/<slug>` | Designer with catalogue ontology (e.g. `/#/designer/official/cosmic-coffee`) |
| `/#/learn` | Ontology School — course catalogue |
| `/#/learn/<course>` | Course detail — article list |
| `/#/learn/<course>/<article>` | Article view (with presentation mode) |

## Official Ontologies

| Domain | Ontology | Entities | Relationships |
|--------|----------|----------|---------------|
| Retail | Fourth Coffee | 6 | 7 |
| E-Commerce | Online Retail | 5 | 6 |
| Healthcare | Clinical System | 5 | 6 |
| Finance | Banking & Finance | 5 | 6 |
| Manufacturing | Industry 4.0 | 5 | 5 |
| Education | University System | 5 | 6 |

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Installation

```bash
cd Ontology-Playground
npm install
```

### Development

```bash
npm run dev
```

Visit http://localhost:5173

### Production Build

```bash
npm run build
```

The build pipeline compiles the catalogue, compiles learning content markdown,
type-checks, bundles the app, and builds the embed widget. Output is in
`build/`. The static catalogue output includes `catalogue.json`, lazy graph
payloads under `catalogue-payloads/`, and byte-preserving originals under
`catalogue-sources/`.

### Running Tests

```bash
npm test            # single run
npm run test:watch  # watch mode
```

### Validating RDF

```bash
npm run validate
npm run validate -- catalogue/external/brick-schema/brick/ontology.rdf
npm run validate -- --profile external path/to/standalone.rdf
```

Validation discovers all official, community, and external catalogue entries.
Official and community entries use the strict Designer profile. External
standards use structural, safety, provenance, and resource checks while
reporting incompatible Designer conventions as aggregated warnings. Standalone
external files require a companion `metadata.json`; validation never fetches or
dereferences external resources.

## Deployment

### GitHub Pages (official)

The public Ontology Playground is deployed from `main` to GitHub Pages by
`.github/workflows/deploy-ghpages.yml`. The workflow publishes only the static
`build/` output; it does not deploy the optional `api/` package.

Fork owners can use GitHub Pages by changing the workflow's repository guard,
then selecting **GitHub Actions** under **Settings → Pages → Source**. The
`VITE_BASE_PATH` environment variable is set to `/<repo-name>/` during the
build so asset paths resolve correctly. Deployments must retain prior
content-addressed files from both `catalogue-payloads/` and
`catalogue-sources/` before replacing the catalogue index so open pages with
an older index keep working.

### Azure Static Web Apps (optional)

Fork owners may instead host the static frontend with Azure Static Web Apps:

1. Create a Static Web App in the Azure Portal.
2. Connect it to your fork.
3. Add its deployment token as
   `AZURE_STATIC_WEB_APPS_API_TOKEN_GREEN_PLANT_0BB1D2910`.
4. Push to `main`.

The supplied Azure Static Web Apps workflows also publish static assets only.
They do not deploy managed Azure Functions.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_ENABLE_AI_BUILDER` | `false` | Show the opt-in connector-based AI builder; requires a protected generation gateway |
| `VITE_ENABLE_LEGACY_FORMATS` | `false` | Enable JSON/YAML/CSV import/export formats |
| `VITE_BASE_PATH` | `/` | Base path for the app (set automatically for GitHub Pages) |
| `VITE_GITHUB_CLIENT_ID` | *(empty)* | GitHub OAuth App client ID for one-click catalogue PRs ([setup guide](docs/github-oauth-setup.md)) |
| `VITE_GITHUB_OAUTH_BASE` | *(empty)* | External OAuth proxy URL for GitHub Pages deployments (e.g. Cloudflare Worker URL) |
| `VITE_API_BASE` | `/api` | Base URL for separately deployed API routes; AI requests must use an authenticated, quota-enforcing gateway |

### Optional Azure Functions API

The backend in `api/` uses the Azure Functions Node.js v4 programming model.
It provides the AI ontology builder and the GitHub device-flow OAuth proxy.
Azure Functions remains a supported opt-in hosting choice, but it is not part
of the official GitHub Pages deployment or any repository-provided deployment
workflow. Operators who need these features deploy the Functions app with
their own infrastructure and configure the frontend to use that endpoint.

```bash
cp api/local.settings.json.template api/local.settings.json
# Replace only the local placeholder values; never commit local.settings.json.
npm --prefix api ci
npm --prefix api run build
npm --prefix api test
npm --prefix api start
```

AI generation uses an explicit deployment-time connector registry. Azure
OpenAI is the reference adapter; operators can add reviewed server-side
adapters without changing the builder or core orchestration. There are no
remote plugins, request-supplied endpoints, or automatic provider fallbacks.

**Generation is disabled by default on both frontend and backend.** Both AI
Functions now require function keys, intentionally replacing the former
anonymous generation route. A function key is not end-user authentication:
before enabling this feature, deploy an authenticated, generation-authorizing,
quota-enforcing gateway with server-side key injection and block direct
backend bypass. Never put function keys or provider secrets in Vite variables,
URLs, or browser storage. The repository does not provision this gateway or
enable a public AI service.

| API route | Method | Access |
|-----------|--------|--------|
| `/api/generation-connector` | GET | Protected connector disclosure, no provider invocation |
| `/api/generate-ontology` | POST | Protected, identity/revision-pinned generation |

Configure `AI_CONNECTORS_ENABLED=true`, `AI_ALLOWED_ORIGIN` (one exact frontend
origin), and optionally `AI_CONNECTOR` (default `azure-openai`) only after the
gateway's authentication, CSRF, distributed quotas, and spending controls have
been verified. Azure retains `AZURE_OPENAI_ENDPOINT`,
`AZURE_OPENAI_API_KEY`, and `AZURE_OPENAI_DEPLOYMENT` (default `gpt-4o-mini`).
The reference adapter accepts only HTTPS resource endpoints under
`openai.azure.com` and rejects credential-bearing redirects.

Set `VITE_API_BASE` to the protected gateway's `/api` base and
`VITE_ENABLE_AI_BUILDER=true` to display the builder. Users see the configured
provider and processing destination and must consent before a description is
submitted. Do not submit secrets or sensitive personal information. Generated
output receives server-side shape, size, graph, and Fabric IQ validation;
the builder retains preview/edit/apply validation and human review. Generation
and edited JSON also require nonempty, Fabric-valid property names unique within
each entity. The same name and type may be reused across different entities;
incomplete Designer draft editing remains unchanged.

Keep `FUNCTIONS_NODE_BLOCK_ON_ENTRY_POINT_ERROR=true` so registration failures
stop the host. The API compiles the same dependency-free ontology schema and
validation helpers used by the frontend; its entry point is
`dist/api/src/functions/*.js`. GitHub OAuth remains separately configured via
`VITE_GITHUB_OAUTH_BASE`; the connector changes do not change its access policy.
See [Connector authoring and secure deployment](docs/generation-connectors.md)
for the extension contract, request limits, and mandatory launch checks.

## Project Structure

```
Ontology-Playground/
├── src/
│   ├── components/       # React components (graph, designer, modals, learn page)
│   ├── data/             # Ontology model, query engine, quest definitions
│   ├── lib/              # Router, RDF parser/serializer, catalogue helpers
│   ├── store/            # Zustand stores (app state, designer state)
│   ├── styles/           # CSS (Microsoft Fluent-inspired dark/light themes)
│   └── types/            # TypeScript type definitions
├── catalogue/            # Official + community ontology RDF files
├── content/learn/        # Course directories with markdown articles, quizzes, and metadata
├── scripts/              # Build-time compilers (catalogue, learning content)
├── api/                  # Azure Functions v4 backend (optional)
├── docs/                 # Guides and documentation
├── public/               # Static assets (catalogue index/payloads, learn.json)
└── .github/workflows/    # CI/CD (Azure SWA + GitHub Pages)
```

## Documentation

The table below lists the main end-user and contributor guides. Internal planning notes (for example, `docs/TODO-*.md`) are intentionally not part of the published documentation set.

| Guide | Description |
|-------|-------------|
| [Ontology Authoring Guide](docs/authoring-guide.md) | How to create ontologies that work well in the Playground — field-by-field reference, best practices, and a step-by-step walkthrough |
| [RDF Export Profiles](docs/rdf-export-profiles.md) | When to use the lossless Playground round-trip profile or the standards-oriented OWL + SHACL profile |
| [Contribute an Ontology: From Design to GitHub](docs/contributing-ontology-from-design-to-github.md) | End-to-end contributor workflow: design, RDF export, metadata, local validation, and pull request |
| [Embedding Guide](docs/embed-guide.md) | How to embed interactive ontology widgets on any web page |
| [Generating RDF from External Tools](docs/external-rdf-generators.md) | Current RDF/XML import subset, typed descriptions, native subclass axioms, and source-artifact versus generated-subset limits for external generators |
| [GitHub OAuth Setup](docs/github-oauth-setup.md) | How to configure GitHub OAuth for one-click catalogue PRs |
| [Embed Security](docs/embed-security.md) | Security model for the embeddable widget |
| [Learning Content Guide](docs/learn-content-guide.md) | How to author courses, articles, quizzes, and ontology embeds for the Ontology School |
| [Ontology School Review Workflow](docs/ontology-school-review-workflow.md) | Human review and approval flow for school lesson content |
| [Theme Authoring Guide](docs/theme-authoring-guide.md) | How to plug a new color theme into the Playground — token contract, the appStore + CSS steps, and contrast gotchas |

## AI Agent Quickstart

This repository includes Copilot customization files so agents can reliably:

- import customer RDF/OWL into catalogue-ready format
- generate progressive Ontology School modules
- route lesson content through human review workflows

Included assets:

- Skills:
   - `.github/skills/ontology-catalog-import/` — import external/customer RDF/OWL into catalogue format
   - `.github/skills/ontology-school-path-generator/` — generate progressive Ontology School modules
   - `.github/skills/community-ontology-contribution/` — add a contributor ontology under `catalogue/community/` with the correct directory structure, metadata, and validation
   - `.github/skills/name-generator/` — generate person names for examples, demos, quests, tests, and sample data from the approved CSV fixture
- RDF intake instruction:
   - `.github/instructions/rdf-intake.instructions.md`
- Reusable prompts:
   - `.github/prompts/import-rdf-to-catalog.prompt.md`
   - `.github/prompts/generate-ontology-school-module.prompt.md`

Recommended validation before merge:

```bash
npm run qa:tutorial-content
npm run build
```

## Technologies

- **React 19** + TypeScript 5
- **Cytoscape.js** — Graph visualization (fcose layout)
- **Zustand** — State management
- **Vite** — Build tool
- **Framer Motion** — Animations
- **Lucide Icons** — Icon library
- **marked** — Markdown compilation (build-time)

## Learn More

- [Microsoft Fabric IQ Ontology Documentation](https://learn.microsoft.com/en-us/fabric/iq/ontology/overview)
- [Azure Static Web Apps](https://docs.microsoft.com/azure/static-web-apps/)

## License

MIT

## Trademark Notice

Trademarks This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft trademarks or logos is subject to and must follow Microsoft’s Trademark & Brand Guidelines. Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship. Any use of third-party trademarks or logos are subject to those third-party’s policies.
