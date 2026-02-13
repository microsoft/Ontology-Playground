# Ontology Playground ☕

An interactive demo application showcasing **Microsoft Fabric IQ Ontology** through the fictional "Cosmic Coffee Company" ontology.

![Microsoft Fabric](https://img.shields.io/badge/Microsoft-Fabric-0078D4?style=flat-square&logo=microsoft)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)

## Features

- **Interactive Graph Visualization** - Explore entity types and relationships using Cytoscape.js
- **Quest System** - Gamified learning with 5 progressive quests and achievement badges
- **NL Query Playground** - Demonstrate NL2Ontology natural language queries
- **Data Bindings View** - See how ontology concepts connect to OneLake sources
- **Microsoft Fluent Design** - Dark/light themes with Microsoft branding

## Sample Ontology

The demo includes a complete "Cosmic Coffee Company" ontology with:

| Entity Type | Description |
|-------------|-------------|
| Customer    | Coffee shop customers with loyalty tiers |
| Order       | Purchase transactions |
| Product     | Coffee products with origins |
| Store       | Physical locations |
| Supplier    | Bean and goods suppliers |
| Shipment    | Supply chain deliveries |

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm 9+

### Installation

```bash
cd ontology-quest
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

Output is in the `build/` folder.

### Running Tests

```bash
npm test            # single run
npm run test:watch  # watch mode
```

## Deployment

### Azure Static Web Apps (primary)

The repo ships with a GitHub Actions workflow that deploys to Azure SWA on every
push to `main`.

1. Create a Static Web App in the Azure Portal
2. Connect to your GitHub repository
3. Copy the deployment token and add it as the GitHub secret
   `AZURE_STATIC_WEB_APPS_API_TOKEN_GREEN_PLANT_0BB1D2910`
4. Push to `main` — the workflow at
   `.github/workflows/azure-static-web-apps-green-plant-0bb1d2910.yml` handles
   the rest
5. PR preview environments are created automatically for pull requests

### GitHub Pages (for forks)

A separate workflow deploys to GitHub Pages, ideal for forks:

1. Fork this repo
2. Go to **Settings → Pages → Source** and select **GitHub Actions**
3. Push to `main` — the workflow at `.github/workflows/deploy-ghpages.yml`
   builds and deploys to `https://<username>.github.io/<repo-name>/`

The `VITE_BASE_PATH` env var is set automatically to `/<repo-name>/` during the
GitHub Pages build so asset paths resolve correctly.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_ENABLE_AI_BUILDER` | `false` | Enable the Azure OpenAI ontology builder |
| `VITE_ENABLE_LEGACY_FORMATS` | `false` | Enable JSON/YAML/CSV import/export formats |
| `VITE_BASE_PATH` | `/` | Base path for the app (set automatically for GitHub Pages) |
| `VITE_GITHUB_CLIENT_ID` | *(empty)* | GitHub OAuth App client ID for one-click catalogue PRs ([setup guide](docs/github-oauth-setup.md)) |

## Project Structure

```
ontology-quest/
├── src/
│   ├── components/       # React components
│   │   ├── OntologyGraph.tsx
│   │   ├── InspectorPanel.tsx
│   │   ├── QuestPanel.tsx
│   │   ├── QueryPlayground.tsx
│   │   └── ...
│   ├── data/
│   │   ├── ontology.ts   # Cosmic Coffee ontology model
│   │   └── quests.ts     # Quest definitions & NL responses
│   ├── store/
│   │   └── appStore.ts   # Zustand state management
│   └── styles/
│       └── app.css       # Microsoft Fluent-inspired styles
├── staticwebapp.config.json  # Azure SWA routing config
└── .github/workflows/    # CI/CD workflow
```

## Technologies

- **React 18** + TypeScript
- **Cytoscape.js** - Graph visualization
- **Framer Motion** - Animations
- **Zustand** - State management
- **Lucide Icons** - Icon library
- **Vite** - Build tool

## Learn More

- [Microsoft Fabric IQ Ontology Documentation](https://learn.microsoft.com/en-us/fabric/iq/ontology/overview)
- [Azure Static Web Apps](https://docs.microsoft.com/azure/static-web-apps/)

## License

MIT
