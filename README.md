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

## Supabase Setup

The app works locally without Supabase, but public share links require a Supabase project.

1. Create a Supabase project.
2. Run `supabase.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local`.
4. Set:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

The app stores public tournament data in the `tournaments` table. Public links are read-only. Edit links include a private token; only the SHA-256 hash is stored in Supabase.

## GitHub Pages

The Vite base path is `/tourneylab/`. The included workflow deploys `main` to GitHub Pages.

Add these repository secrets before publishing if shared links should work in production:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The target URL is:

```text
https://devtmack.github.io/tourneylab/
```
