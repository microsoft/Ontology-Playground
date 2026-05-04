# Ontology Playground — Deployment Guide

Deploy the Ontology Playground as a static web app so your team can design ontologies visually and push them directly to Microsoft Fabric.

---

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 18+ |
| npm | 9+ |
| Microsoft Fabric workspace | With active capacity (F2 or higher, Trial, or PPU) |
| Microsoft Entra ID tenant | With admin consent capabilities |

---

## Step 1 — Clone & Install

```bash
git clone <repo-url>
cd Ontology-Playground
npm install
```

Verify the setup:

```bash
npm test          # should pass all tests
npm run build     # should produce dist/
```

---

## Step 2 — Register a Microsoft Entra App

The app uses MSAL to authenticate users against Fabric APIs. Each customer deployment needs its own app registration.

1. Go to **[portal.azure.com](https://portal.azure.com)** → **Microsoft Entra ID** → **App registrations** → **New registration**
2. Set:
   - **Name**: `Ontology Playground` (or your preferred name)
   - **Supported account types**: *Accounts in this organizational directory only* (single-tenant) — or *Accounts in any organizational directory* (multi-tenant) if needed
   - **Redirect URI**: Select **Single-page application (SPA)** and enter your deployment URL (e.g., `https://ontology.yourcompany.com`)
3. After registration, go to **API permissions** → **Add a permission** → **APIs my organization uses** → search for `Microsoft Fabric` (or `Power BI Service`)
4. Add these **delegated** permissions:
   - `Workspace.ReadWrite.All`
   - `Item.ReadWrite.All`
5. Click **Grant admin consent for [your tenant]**
6. Copy the **Application (client) ID** from the Overview page

> **Tip:** For local development, add `http://localhost:5173` and `http://localhost:4173` as additional redirect URIs.

---

## Step 3 — Configure Environment

Create a `.env` file in the project root:

```env
# Required — your Entra app registration client ID
VITE_FABRIC_CLIENT_ID=your-client-id-here
```

### Optional Environment Variables

| Variable | Description | Default |
|---|---|---|
| `VITE_FABRIC_CLIENT_ID` | Entra app client ID for Fabric SSO. Leave empty to disable popup login and use the access-token paste flow only. | _empty_ (token-paste only) |
| `VITE_ENABLE_AI_BUILDER` | Enable AI-powered ontology builder (`true`/`false`) | `false` |
| `VITE_GITHUB_CLIENT_ID` | GitHub OAuth app client ID for import/export | Disabled |
| `VITE_GITHUB_OAUTH_BASE` | GitHub OAuth proxy URL | `/api/github-oauth` |
| `VITE_ENABLE_LEGACY_FORMATS` | Show legacy export formats (`true`/`false`) | `false` |
| `VITE_BASE_PATH` | Base path if not hosted at root (e.g., `/playground`) | `/` |

---

## Step 4 — Build

```bash
npm run build
```

This produces a `dist/` folder containing the fully static site. No server-side runtime is required.

---

## Step 5 — Deploy

Host the `dist/` folder on any static hosting provider:

### Azure Static Web Apps (Recommended)

```bash
# Install the SWA CLI
npm install -g @azure/static-web-apps-cli

# Deploy
swa deploy ./dist --env production
```

Or configure a GitHub Actions workflow with the `Azure/static-web-apps-deploy` action.

### Other Options

| Platform | Command / Notes |
|---|---|
| **GitHub Pages** | Push `dist/` to a `gh-pages` branch |
| **Nginx** | Copy `dist/` to your web root; add SPA fallback: `try_files $uri /index.html` |
| **Azure Blob Storage** | Enable static website hosting, upload `dist/` to `$web` container |
| **Vercel / Netlify** | Connect repo, set build command to `npm run build`, output dir to `dist` |

> **Important:** The app uses client-side hash routing (`/#/path`), so most hosts work without special rewrite rules. If you switch to browser-history routing in the future, add a fallback to `index.html` for all 404s.

---

## Step 6 — Fabric Workspace Setup

Before users can push ontologies, the target Fabric workspace must meet these requirements:

1. **Fabric capacity assigned** — The workspace must be backed by a Fabric capacity (F2+, Trial, or PPU). Without capacity, pushes fail with `CapacityNotActive`.
2. **User permissions** — Users need at least **Contributor** role on the workspace to create/update ontology items.
3. **Capacity must be active** — If using a paused capacity (e.g., dev/test F-SKU), resume it before pushing:

```bash
# Resume a paused capacity via Azure CLI
az resource invoke-action \
  --action resume \
  --ids "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Fabric/capacities/{name}" \
  --api-version 2023-11-01
```

---

## Verifying the Deployment

1. Open the deployed URL in a browser
2. Click **Push** in the header
3. Sign in with your Microsoft work account
4. Select a workspace — it should show workspaces with Fabric capacity
5. Choose **Create new** and push a sample ontology

If you see errors:
- **"CapacityNotActive"** — Resume or assign a Fabric capacity to the workspace
- **"InsufficientScopes"** — Ensure admin consent was granted for the API permissions
- **"AADSTS65001"** — The user hasn't consented; an admin must grant consent in Entra

---

## Architecture Overview

```
┌──────────────────────────────────┐
│   Browser (Static SPA)           │
│   React 19 + TypeScript + Vite   │
├──────────────────────────────────┤
│   MSAL.js v5 (auth)             │
│   ↓ Bearer token                │
├──────────────────────────────────┤
│   Fabric REST API                │
│   POST /ontologies               │
│   (creates Ontology + Lakehouse  │
│    + SQL Endpoint + GraphModel)  │
└──────────────────────────────────┘
```

- **No backend required** — all API calls go directly from the browser to Fabric REST APIs
- **Authentication** — MSAL redirect flow; tokens stored in `sessionStorage`
- **Ontology creation is async** — POST returns 202, the app polls until complete (~60-90s)

---

## Updating

Pull the latest code and rebuild:

```bash
git pull
npm install
npm run build
```

Re-deploy the updated `dist/` folder to your hosting provider.
