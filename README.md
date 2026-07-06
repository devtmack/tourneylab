# TourneyLab

TourneyLab is a polished tournament and bracket maker for creating, scoring, and sharing tournaments.

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

## Google Sheets Setup

The easiest database option is Google Sheets with Apps Script. GitHub Pages still hosts the app, and the Sheet stores tournaments.

1. Create a new Google Sheet.
2. Open Extensions -> Apps Script.
3. Paste `google-apps-script.js` into the script editor.
4. Deploy -> New deployment -> Web app.
5. Set "Execute as" to yourself.
6. Set "Who has access" to anyone.
7. Copy the web app URL.
8. Add this env var locally or as a GitHub repository secret:

```bash
VITE_GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/your-deployment-id/exec
```

Public links use `/#/t/:slug`. Spectator pages poll the Sheet every 10 seconds, so score changes saved from the private edit link show up while the tournament is happening.

## Supabase Setup

Supabase is still supported if you prefer it over Google Sheets.

1. Create a Supabase project.
2. Run `supabase.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local`.
4. Set:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

The app stores public tournament data in the `tournaments` table. Public links are read-only. Edit links include a private token; only the SHA-256 hash is stored.

## GitHub Pages

The Vite base path is `/tourneylab/`. The included workflow deploys `main` to GitHub Pages.

Add one of these database options as repository secrets before publishing if shared links should work in production.

Google Sheets:

- `VITE_GOOGLE_APPS_SCRIPT_URL`

Supabase:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The target URL is:

```text
https://devtmack.github.io/tourneylab/
```
