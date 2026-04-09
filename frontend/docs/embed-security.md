# Embed Widget Security Analysis

## Threat Model

The embed widget loads ontology data from the catalogue and renders it on third-party sites.
Community users can submit ontologies to the catalogue via pull requests.

**Question:** Can a malicious catalogue submission inject code into sites that use the embed widget?

**Answer:** No. The embed widget is safe by design.

> Scope note: this document covers the **embed widget** threat model. Learn
> article markdown rendering (`/#/learn`) has a separate sanitization boundary
> in the compile pipeline (`scripts/compile-learn.ts`) and is not part of the
> embed runtime attack surface.

## Data Flow

Ontology data (entity names, descriptions, icons, colors, property names, relationship names) flows through three rendering paths:

1. **React JSX** — entity names, descriptions, property badges, relationship details
2. **Cytoscape Canvas** — graph node labels, edge labels, node colors
3. **RDF serializer** — XML output shown in the RDF Source tab

## Why Each Path Is Safe

### 1. React JSX Escaping

All user-controlled strings are rendered via JSX interpolation (`{variable}`), which automatically escapes HTML entities. There is **no use of `dangerouslySetInnerHTML`** anywhere in the embed widget.

A malicious entity name like `<script>alert(1)</script>` renders as literal text:

```
&lt;script&gt;alert(1)&lt;/script&gt;
```

### 2. Cytoscape Canvas Rendering

Cytoscape.js renders graph labels using the HTML5 Canvas `fillText()` API, which draws text as pixels — it does not parse HTML or execute scripts. A malicious label string appears as literal text on the canvas.

### 3. RDF Serializer XML Escaping

The `serializeToRDF()` function passes all ontology values through `escapeXml()` before interpolation, which replaces `&`, `<`, `>`, `"`, and `'` with their XML entities. The escaped output is then rendered inside a `<pre>` tag via JSX interpolation — providing double escaping.

## Additional Protections

| Layer | Protection |
|---|---|
| **Catalogue build** | Directory names validated against `SAFE_SLUG_RE` (alphanumeric + hyphens only), symlinks rejected |
| **RDF validation** | `validate-rdf.ts` script validates ontology structure during CI |
| **PR review** | Community submissions require human review before merge |
| **No unsafe DOM sinks** | No `dangerouslySetInnerHTML`, `innerHTML`, `document.write`, or `eval` in embed code |

## Color Field

Entity `color` values are consumed only by Cytoscape's canvas renderer as `background-color` data. An invalid or malicious color value produces a blank or default-colored circle — there is no CSS injection vector since canvas does not process CSS.

## `data-ontology-url` Consideration

The `data-ontology-url` attribute allows loading an ontology from an arbitrary URL. This is specified by the **page author** (the person writing the HTML), not by catalogue submitters. The fetched data goes through the same safe React/Canvas rendering paths described above. The embed widget does not execute or eval any fetched content — it only parses JSON or RDF/XML and renders the resulting ontology structure.

## Summary

| Attack Vector | Mitigated? | How |
|---|---|---|
| XSS via entity/relationship names | Yes | React JSX auto-escaping |
| XSS via graph labels | Yes | Canvas `fillText()` doesn't parse HTML |
| XSS via RDF output | Yes | `escapeXml()` + JSX escaping |
| CSS injection via colors | Yes | Canvas renderer, not DOM CSS |
| Path traversal via catalogue IDs | Yes | `SAFE_SLUG_RE` validation |
| Code injection via `data-ontology-url` | N/A | URL set by page author, data rendered safely |
