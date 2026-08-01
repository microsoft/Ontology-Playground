# Organization Pack Guide

Organization packs turn the organization dashboard into a reusable middle
layer. RDF/XML is the source of truth; the build compiles profiles and graph
data into `public/organization-packs.json` for the static application.

## Architecture

```text
organization-pack.rdf
  └─ references an organization graph RDF/XML file
       ├─ stable organization and time snapshots
       ├─ research questions and search aliases
       └─ GitHub / Slack / Notion / other source routes
                  ↓ npm run organization-packs:build
public/organization-packs.json
                  ↓
default interactive Cytoscape dashboard
```

The shared vocabularies are:

- `catalogue/organization-packs/organization-pack-schema.rdf` for dashboard
  configuration.
- `catalogue/organization-packs/organization-graph-schema.rdf` for portable
  organization, evidence, research-question, claim, and provenance concepts.

## Add an organization

1. Create `catalogue/organization-packs/<pack-id>/organization-pack.rdf`.
2. Create the organization's graph RDF/XML anywhere inside the repository.
3. Set `pack:dataFile` to that repository-relative RDF path.
4. Run `npm run organization-packs:build`.
5. Open `/#/organization-dashboard/<pack-id>`.

The directory name and `pack:packId` must match and use lowercase letters,
digits, and hyphens. Exactly one pack may set `pack:isDefault` to `true`.

## Profile example

```xml
<pack:OrganizationPack rdf:about="https://example.org/packs/example#profile">
  <pack:packId>example</pack:packId>
  <rdfs:label>Example Corporation</rdfs:label>
  <rdfs:comment>Example organization knowledge graph.</rdfs:comment>
  <pack:dataFile>catalogue/external/example/organization/example.rdf</pack:dataFile>
  <pack:dashboardTitle>Organization &amp; evidence graph</pack:dashboardTitle>
  <pack:dashboardSubtitle>組織構造と探索動線を統合</pack:dashboardSubtitle>
  <pack:disclaimer>Internal working data. Verify claims at their sources.</pack:disclaimer>
  <pack:defaultView>all</pack:defaultView>
  <pack:isDefault rdf:datatype="http://www.w3.org/2001/XMLSchema#boolean">false</pack:isDefault>
</pack:OrganizationPack>
```

## Graph conventions

Use the standard local class names (`Organization`, `OrganizationSnapshot`,
`OrganizationalUnit`, `ResearchQuestion`, `InformationArtifact`, `Claim`, and
the other classes in the graph schema). The dashboard is namespace-agnostic
and renders these local names with its default visual language.

- Connect hierarchy with `hasSnapshot`, `hasUnit`, and `parentUnit`.
- Add aliases as repeated `searchTerm` values.
- Connect a `ResearchQuestion` to its source route with `retrievesFrom`.
- Give source artifacts a `platform` and `artifactUrl`. Platform names are not
  limited to GitHub, Slack, and Notion.
- Preserve provenance with `publishedAt`, `retrievedAt`, `status`,
  `confidence`, and `supportedBy`.
- Use comma-separated `observedYears` values. The dashboard derives its period
  filters and legend from the RDF instead of assuming fixed years.

The dashboard graph, filters, node inspector, hierarchy path, research-route
buttons, source links, and organization selector are supplied by the middle
layer. Organization packs provide data and labels, not custom React code.
