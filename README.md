# TourneyLab

TourneyLab is a polished tournament and bracket maker for creating, scoring, and sharing tournaments.

Deployment check: database variable rebuild.

## Formats

- Single elimination
- Double elimination
- Round robin
- Swiss
- Group stage into playoff

## Local Development

```bash
pnpm install
pnpm dev
```

## Tests and Build

```bash
pnpm test
pnpm build
```

## Google Sheets Database Setup

TourneyLab runs from GitHub Pages and uses Google Sheets as the database. No Supabase or separate backend is required.

1. Create a new Google Sheet.
2. Open Extensions -> Apps Script.
3. Paste `google-apps-script.js` into the script editor.
4. Deploy -> New deployment -> Web app.
5. Set "Execute as" to yourself.
6. Set "Who has access" to anyone.
7. Copy the web app URL.
8. Add this env var locally or as a GitHub repository variable:

```bash
VITE_GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/your-deployment-id/exec
```

Public links use `/#/t/:slug`. Spectator pages poll the Sheet every 10 seconds, so score changes saved from the private edit link show up while the tournament is happening.

## GitHub Pages

The Vite base path is `/tourneylab/`. The included workflow deploys `main` to GitHub Pages.

Add this repository variable before publishing if shared links should work in production:

- `VITE_GOOGLE_APPS_SCRIPT_URL`

The target URL is:

```text
https://devtmack.github.io/tourneylab/
```
