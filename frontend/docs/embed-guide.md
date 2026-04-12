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

That's it! The widget loads the ontology from the catalogue and renders an interactive graph.

## Available Ontologies

| Catalogue ID | Name | Entities | Relationships |
|---|---|---|---|
| `official/cosmic-coffee` | Cosmic Coffee Company | 6 | 7 |
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
| `data-catalogue-base-url` | No | Current page origin | Base URL where `catalogue.json` is hosted |
| `data-theme` | No | `dark` | Color theme: `dark` or `light` |
| `data-height` | No | `500px` | Widget height (any CSS value) |

## Dynamic Mounting

If you add embed containers after page load (e.g., in a SPA), call:

```js
window.OntologyEmbed.init();
```

This scans the DOM for new `.ontology-embed` elements and mounts widgets on any that haven't been initialized yet.

## Features

- **Interactive graph** — pan, zoom, click nodes and edges
- **Inspector overlay** — click any entity or relationship to see its properties
- **RDF Source tab** — view the generated RDF/XML with a Copy button
- **Dark & light themes** — match your site's design
- **Self-contained** — single JS file, no external CSS needed

## Live Demo

See the [sample embed page](embed/samples.html) on the deployed site for working examples.
