# THE CRATE — Architecture

## Stack

- **React 19 + TypeScript + Vite** — static frontend, deployed to GitHub Pages.
- **Tailwind CSS 3** — design system lives in `tailwind.config.js` + `src/index.css`.
- **Dexie (IndexedDB)** — local-first storage; the app is fully usable offline.
- **Supabase** — Postgres + Auth + RLS for cloud sync (credentials plug into
  Settings; sync layer lands in a later stage).
- **Recharts** — charts. **Lucide** — icons. **No secrets anywhere.**

## Data flow

```
Spotify Extended History (JSON) ─┐
Review template (JSON/CSV)      ─┼─► validation + preview ─► IndexedDB ─► (later) Supabase sync
Playlist export                 ─┘         ▲                      │
                                           │                      ▼
                              import_jobs audit trail      UI (all stats computed
                                                            from real rows only)
```

Core rule: **no fabricated statistics.** Every number on screen is computed
from imported or entered rows. Empty data renders an honest empty state.

## Schema

`supabase/migrations/0001_init.sql`: profiles, user_settings, artists, albums,
tracks, playlists, playlist_tracks, listening_history, reviews, review_tags,
recaps, import_jobs. Every private table has `user_id` + RLS policies scoped to
`auth.uid()`; dedupe unique indexes prevent double artists/albums/tracks/listens
on re-import. The local Dexie `reviews` table mirrors the `reviews` SQL shape
one-to-one so sync needs no transformation.

## Security model

| Value | Where it lives | Why it's safe |
|---|---|---|
| Supabase Project URL | Settings (localStorage) / build env | publishable identifier |
| Supabase anon key | Settings / build env | publishable; RLS enforces access |
| Spotify Client ID | Settings / build env | public client, PKCE flow |
| Supabase service_role key | **nowhere in this app** | would bypass RLS |
| Spotify Client Secret | **nowhere in this app** | PKCE makes it unnecessary |

Single-user: public signup is disabled in Supabase; only the manually created
account can authenticate.

## Deploy

GitHub Actions (`.github/workflows/deploy.yml`): `npm ci` → build with
`VITE_BASE=/<repo>/` → publish `dist` to Pages. `npm run build` also copies
`index.html` to `404.html` so client-side routes survive a refresh on Pages.

## Stages

1. ✅ Scaffold, design system, review archive (grid/list/CRUD/search/filter/sort),
   import pipeline with validation + preview, SQL schema, deploy workflow.
2. Listening history: Spotify Extended Streaming History import + analytics.
3. Playlist analytics (name comes from the imported playlist, never hardcoded).
4. The DNA: musical identity engine (preferences vs. actual data).
5. Recaps (monthly/yearly), PWA service worker, Supabase cloud sync.
