-- ─────────────────────────────────────────────────────────────────────────
-- THE CRATE — track credits (producers/writers from MusicBrainz / Genius)
-- Derived reference data: fetched from external sources, cached here so all
-- devices share one backfill. Never user-authored, always replaceable —
-- upserts merge by (user, artist, album, track), nothing else is touched.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.track_credits (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade default auth.uid(),
  artist        text not null,          -- album artist as written in the review
  album_title   text not null,
  track_title   text not null,
  track_number  smallint,
  producers     text[] not null default '{}',
  writers       text[] not null default '{}',
  source        text not null check (source in ('musicbrainz', 'genius')),
  fetched_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create unique index if not exists track_credits_user_track_key
  on public.track_credits (user_id, artist, album_title, track_title);

alter table public.track_credits enable row level security;
create policy "track_credits: owner all" on public.track_credits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
