# Embedding Ontology Widgets

Add interactive ontology visualizations to any web page with a single script tag.

## Quick Start

Replace `YOUR_SITE_URL` with the URL where your Ontology Playground app is deployed.

```html
<div class="ontology-embed"
     data-catalogue-id="official/cosmic-coffee"
     data-catalogue-base-url="YOUR_SITE_URL/"
     data-theme="dark"
     data-height="500px">
</div>
<script src="YOUR_SITE_URL/embed/ontology-embed.js"></script>
```

That's it! The widget loads the lightweight catalogue index, fetches only the
selected ontology's content-addressed payload, verifies its hash, and renders
an interactive graph. It also lazily fetches and verifies that entry's
content-addressed RDF source for the **Complete RDF source** tab. Concurrent
widgets for the same entry share cached catalogue requests. The graph remains a
visual projection, while the RDF tab displays and copies the complete decoded
source, including source-only SHACL and unsupported statements. The widget
pins that lazy source request to the same catalogue entry whose verified
payload rendered the graph; it never substitutes a source from a newer index
version. The widget never fetches `owl:imports` or executes SHACL. If the
optional immutable source cannot be loaded, the verified graph remains
interactive and the RDF tab reports the source error while retaining generated
RDF as an explicit fallback.

## Available Ontologies

| Catalogue ID | Name | Entities | Relationships |
|---|---|---|---|
| `official/cosmic-coffee` | Fourth Coffee | 6 | 7 |
| `official/ecommerce` | E-Commerce Platform | 5 | 6 |
| `official/finance` | Banking & Finance | 5 | 6 |
| `official/healthcare` | Healthcare System | 5 | 6 |
| `official/manufacturing` | Smart Manufacturing | 5 | 5 |
| `official/university` | University System | 5 | 6 |

## Examples

### E-Commerce (Dark Theme)

```html
<div class="ontology-embed"
     data-catalogue-id="official/ecommerce"
     data-catalogue-base-url="YOUR_SITE_URL/"
     data-theme="dark"
     data-height="500px">
</div>
<script src="YOUR_SITE_URL/embed/ontology-embed.js"></script>
```

### Healthcare (Light Theme)

```html
<div class="ontology-embed"
     data-catalogue-id="official/healthcare"
     data-catalogue-base-url="YOUR_SITE_URL/"
     data-theme="light"
     data-height="500px">
</div>
<script src="YOUR_SITE_URL/embed/ontology-embed.js"></script>
```

### Multiple Embeds on One Page

Include the script **once** at the bottom, then add as many embed divs as you want:

```html
<div class="ontology-embed"
     data-catalogue-id="official/finance"
     data-catalogue-base-url="YOUR_SITE_URL/"
     data-theme="dark"
     data-height="400px">
</div>

<div class="ontology-embed"
     data-catalogue-id="official/manufacturing"
     data-catalogue-base-url="YOUR_SITE_URL/"
     data-theme="dark"
     data-height="400px">
</div>

<!-- Load the script once -->
<script src="YOUR_SITE_URL/embed/ontology-embed.js"></script>
```

## Loading Methods

### From Catalogue (recommended)

```html
<div class="ontology-embed"
     data-catalogue-id="official/university"
     data-catalogue-base-url="YOUR_SITE_URL/"
     data-theme="dark"
     data-height="500px">
</div>
```

### From a URL (RDF/XML or JSON)

```html
<div class="ontology-embed"
     data-ontology-url="https://example.com/my-ontology.rdf"
     data-theme="dark"
     data-height="500px">
</div>
```

For an RDF/XML URL, the widget retains the fetched source text for its complete
RDF tab and uses the URL as the document base when resolving relative IRIs.
JSON URLs and inline JSON have no source graph, so their RDF tab uses the
Playground-generated visual-model profile.

URL responses are limited to 8 MiB. The widget checks a declared content length,
reads streaming responses with the same bound, and cancels a stream as soon as
it exceeds the limit. RDF/XML URLs then use the complete import pipeline:
`DOCTYPE` is rejected before visual parsing, unique statements are limited to
250,000, and imports, external entities, XInclude, SHACL, and referenced IRIs
remain inert.

The complete RDF parser runs in a worker packaged inside
`ontology-embed.js`. No separately emitted worker script is required, so the
embed bundle can be hosted on a different HTTPS origin from the consuming page.
If the page uses Content Security Policy, its `worker-src` policy must include
`blob:` for the worker created by the self-contained bundle.

### Inline (base64-encoded JSON)

Encode your ontology JSON as base64 and pass it directly:

```html
<div class="ontology-embed"
     data-ontology-inline="eyJuYW1lIjoiTXkgT250b2xvZ3kiLC4uLn0="
     data-theme="light"
     data-height="400px">
</div>
```

## Configuration Options

| Attribute | Required | Default | Description |
|---|---|---|---|
| `data-catalogue-id` | One of three sources | — | Ontology ID from the catalogue |
| `data-ontology-url` | One of three sources | — | URL to an RDF/XML or JSON ontology file |
| `data-ontology-inline` | One of three sources | — | Base64-encoded ontology JSON |
| `data-catalogue-base-url` | No | Current page origin | Base URL where `catalogue.json`, `catalogue-payloads/`, and the gallery's `catalogue-sources/` are hosted |
| `data-theme` | No | `dark` | Color theme: `dark` or `light` |
| `data-height` | No | `500px` | Widget height (any CSS value) |

When publishing a new self-hosted catalogue version, retain the existing
`catalogue-payloads/` and `catalogue-sources/` files and add the newly
generated artifacts before replacing `catalogue.json`. Both file sets are
immutable and content-addressed; keeping prior hashes prevents open pages with
an older index from breaking during a deployment.

## Dynamic Mounting

If you add embed containers after page load (e.g., in a SPA), call:

```js
window.OntologyEmbed.init();
```

This scans the DOM for new `.ontology-embed` elements and mounts widgets on any that haven't been initialized yet.

## Features

- **Interactive graph** — pan, zoom, click nodes and edges
- **Adaptive large-ontology view** — massive ontologies open as a bounded
  semantic overview with search, adjustable hierarchy depth, and incremental
  `+N` boundary expansion that can be hidden again from the overview controls;
  expansions never evict entities already on screen, and the controls explain
  when the 180-entity limit requires hiding a shown neighborhood first;
  changing hierarchy depth clears the current selection and focus, while
  off-thumb track clicks, dragging, touch, and arrow-key adjustments are all
  supported
- **Inspector overlay** — click any entity or relationship to see its properties
- **Complete/source-aware RDF tab** — catalogue and RDF/XML URL embeds view and
  copy complete source RDF; JSON and inline authored embeds show generated RDF.
  Multi-megabyte sources render as bounded plain text rather than an
  unbounded syntax-highlight token tree
- **Dark & light themes** — match your site's design
- **Self-contained** — single JS file, no external CSS needed

## Live Demo

See the [sample embed page](https://microsoft.github.io/Ontology-Playground/embed/samples.html) on the deployed site for working examples.
