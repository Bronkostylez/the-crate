-- ─────────────────────────────────────────────────────────────────────────
-- THE CRATE — Etappe 2: 24/7 live tracking + cloud sync
-- Run AFTER 0001_init.sql. Paste into Supabase → SQL Editor → Run.
--
-- Adds: duration_ms on listening_history (basis of the honest "ca." estimate
-- for API-sourced plays), the spotify_connection table that hands the hourly
-- edge function a refresh token, and a plain unique constraint so upserts
-- from app and function dedupe on the same key.
-- ─────────────────────────────────────────────────────────────────────────

-- exact-vs-estimated listening time: API rows carry the track length, exports
-- carry real ms_played
alter table public.listening_history
  add column if not exists duration_ms integer;

-- the app's simple account export is a third source
alter table public.listening_history
  drop constraint if exists listening_history_source_check;
alter table public.listening_history
  add constraint listening_history_source_check
  check (source in ('spotify_extended', 'spotify_simple', 'spotify_api', 'manual'));

-- upsert needs a real unique constraint, not an expression index
drop index if exists public.listening_history_dedupe_key;
alter table public.listening_history
  drop constraint if exists listening_history_dedupe_key;
alter table public.listening_history
  add constraint listening_history_dedupe_key
  unique (user_id, played_at, track_name, artist_name);

-- ── spotify_connection ───────────────────────────────────────────────────
-- One row per user: everything the hourly edge function needs to pull
-- recently-played on its own. The refresh token lives here (RLS: owner only)
-- instead of a function secret so the app can hand it over after login —
-- and the function writes rotated refresh tokens back to the same row.
create table if not exists public.spotify_connection (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  client_id     text not null,
  updated_at    timestamptz not null default now()
);

alter table public.spotify_connection enable row level security;
create policy "spotify_connection: owner all" on public.spotify_connection
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger spotify_connection_updated_at before update on public.spotify_connection
  for each row execute function public.set_updated_at();
