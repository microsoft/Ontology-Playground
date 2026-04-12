# GitHub OAuth Setup for Catalogue Submissions

The **Submit to Catalogue** button in the ontology designer lets users create a
pull request directly from the browser. It uses the
[GitHub Device Flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow)
so no server-side secret is needed — only a **client ID**.

> **Without a client ID** the feature still works: users see a "Download RDF"
> button and can submit a PR manually.

## 1. Create a GitHub OAuth App

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**
   (or visit https://github.com/settings/applications/new).
2. Fill in the form:

   | Field | Value |
   |-------|-------|
   | **Application name** | Ontology Playground (or anything you like) |
   | **Homepage URL** | Your deployed site URL, e.g. `https://yoursite.example.com` |
   | **Authorization callback URL** | `https://github.com/login/device` |

3. Click **Register application**.
4. On the next page, copy the **Client ID** (you do *not* need a client secret
   for the device flow).

## 2. Enable the Device Flow

By default, new OAuth Apps have the device flow disabled.

1. On the OAuth App settings page, scroll to **Device Flow**.
2. Check **Enable Device Flow**.
3. Save.

## 3. Set the Environment Variable

Add the client ID to your `.env` file:

```env
VITE_GITHUB_CLIENT_ID=Iv1.abc123def456
```

Or set it in your CI/CD environment (e.g. GitHub Actions secret, Azure SWA app
settings).

Restart the dev server after changing `.env`:

```bash
npm run dev
```

## How It Works

1. User clicks **Submit to Catalogue** in the designer.
2. The app starts a GitHub Device Flow: the user is shown a one-time code and a
   link to https://github.com/login/device.
3. The user enters the code on GitHub and authorises the app (scope: `public_repo`).
4. The app receives an access token (stored in `localStorage`).
5. The app forks the upstream repo, creates a branch, commits the RDF +
   metadata files, and opens a pull request — all via the GitHub REST API.

## Scope

The app requests the `public_repo` scope, which allows it to:

- Fork the upstream repository
- Create branches and commits on the fork
- Open pull requests against the upstream repo

It does **not** request access to private repositories or any other permissions.

## Revoking Access

Users can revoke the app's access at any time from
**GitHub → Settings → Applications → Authorized OAuth Apps**.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Download RDF" shown instead of "Sign in with GitHub" | `VITE_GITHUB_CLIENT_ID` is empty or not set. Check your `.env` file and restart the dev server. |
| Device flow returns 404 or error | Make sure **Enable Device Flow** is checked in the OAuth App settings. |
| "Resource not accessible by integration" on PR creation | The user's token may have expired. Sign out and re-authorise. |
| CORS errors on `github.com/login/device/code` | The device flow endpoint requires `Accept: application/json`. This is handled automatically by the app. |
