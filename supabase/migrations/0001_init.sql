-- ─────────────────────────────────────────────────────────────────────────
-- THE CRATE — initial schema
-- Run order: this file first. Paste into Supabase → SQL Editor → Run.
-- Single-user private app: every private table carries user_id and is locked
-- down with Row Level Security so only the authenticated owner can touch it.
-- No service role key is ever used by the frontend.
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

-- updated_at maintenance
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── profiles ─────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "profiles: owner read"   on public.profiles for select using (auth.uid() = id);
create policy "profiles: owner write"  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles: owner insert" on public.profiles for insert with check (auth.uid() = id);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- auto-create a profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── user_settings ────────────────────────────────────────────────────────
create table if not exists public.user_settings (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  settings    jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.user_settings enable row level security;
create policy "settings: owner all" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger user_settings_updated_at before update on public.user_settings
  for each row execute function public.set_updated_at();

-- ── artists ──────────────────────────────────────────────────────────────
create table if not exists public.artists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name        text not null,
  scene       text,                -- e.g. 'East Coast', 'West Coast', 'Queensbridge'
  country     text,
  spotify_id  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- dedupe: one artist row per name per user, case-insensitive
create unique index if not exists artists_user_name_key
  on public.artists (user_id, lower(name));

alter table public.artists enable row level security;
create policy "artists: owner all" on public.artists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger artists_updated_at before update on public.artists
  for each row execute function public.set_updated_at();

-- ── albums ───────────────────────────────────────────────────────────────
create table if not exists public.albums (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade default auth.uid(),
  artist_id     uuid references public.artists (id) on delete set null,
  title         text not null,
  release_year  smallint check (release_year between 1900 and 2100),
  label         text,
  artwork_url   text,
  spotify_id    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists albums_user_artist_title_key
  on public.albums (user_id, coalesce(artist_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(title));
create index if not exists albums_release_year_idx on public.albums (user_id, release_year);

alter table public.albums enable row level security;
create policy "albums: owner all" on public.albums
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger albums_updated_at before update on public.albums
  for each row execute function public.set_updated_at();

-- ── tracks ───────────────────────────────────────────────────────────────
create table if not exists public.tracks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  album_id     uuid references public.albums (id) on delete set null,
  artist_id    uuid references public.artists (id) on delete set null,
  title        text not null,
  duration_ms  integer,
  track_number smallint,
  isrc         text,
  spotify_id   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- dedupe on Spotify id when present, otherwise artist+title
create unique index if not exists tracks_user_spotify_key
  on public.tracks (user_id, spotify_id) where spotify_id is not null;
create unique index if not exists tracks_user_artist_title_key
  on public.tracks (user_id, coalesce(artist_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(title));

alter table public.tracks enable row level security;
create policy "tracks: owner all" on public.tracks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger tracks_updated_at before update on public.tracks
  for each row execute function public.set_updated_at();

-- ── playlists + playlist_tracks ──────────────────────────────────────────
create table if not exists public.playlists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name        text not null,
  spotify_id  text,
  snapshot_at timestamptz,          -- when this dataset was exported/imported
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists playlists_user_name_key
  on public.playlists (user_id, lower(name));

alter table public.playlists enable row level security;
create policy "playlists: owner all" on public.playlists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger playlists_updated_at before update on public.playlists
  for each row execute function public.set_updated_at();

create table if not exists public.playlist_tracks (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  track_id    uuid not null references public.tracks (id) on delete cascade,
  position    integer,
  added_at    timestamptz,
  primary key (playlist_id, track_id)
);

alter table public.playlist_tracks enable row level security;
create policy "playlist_tracks: owner all" on public.playlist_tracks
  for all
  using (exists (select 1 from public.playlists p where p.id = playlist_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.playlists p where p.id = playlist_id and p.user_id = auth.uid()));

-- ── listening_history ────────────────────────────────────────────────────
create table if not exists public.listening_history (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade default auth.uid(),
  track_id      uuid references public.tracks (id) on delete set null,
  -- denormalized names: import rows do not always resolve to a track row
  track_name    text not null,
  artist_name   text not null,
  album_name    text,
  played_at     timestamptz not null,
  ms_played     integer not null default 0 check (ms_played >= 0),
  source        text not null default 'manual' check (source in ('spotify_extended', 'spotify_api', 'manual')),
  import_job_id uuid,
  created_at    timestamptz not null default now()
);

create index if not exists listening_history_played_at_idx on public.listening_history (user_id, played_at desc);
create index if not exists listening_history_artist_idx on public.listening_history (user_id, lower(artist_name));
-- dedupe: same track at the same moment from the same source imports once
create unique index if not exists listening_history_dedupe_key
  on public.listening_history (user_id, played_at, lower(track_name), lower(artist_name));

alter table public.listening_history enable row level security;
create policy "listening_history: owner all" on public.listening_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── reviews + review_tags ────────────────────────────────────────────────
create table if not exists public.reviews (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade default auth.uid(),
  album_id      uuid references public.albums (id) on delete set null,
  -- denormalized so a review survives even without catalog rows
  artist        text not null,
  album_title   text not null,
  release_year  smallint check (release_year between 1900 and 2100),
  genres        text[] not null default '{}',
  rating        smallint check (rating between 1 and 10),
  review_text   text not null default '',
  best_tracks   text[] not null default '{}',
  worst_tracks  text[] not null default '{}',
  review_date   date,
  notes         text not null default '',
  artwork_url   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists reviews_user_album_key
  on public.reviews (user_id, lower(artist), lower(album_title));
create index if not exists reviews_rating_idx on public.reviews (user_id, rating);
create index if not exists reviews_genres_idx on public.reviews using gin (genres);

alter table public.reviews enable row level security;
create policy "reviews: owner all" on public.reviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger reviews_updated_at before update on public.reviews
  for each row execute function public.set_updated_at();

create table if not exists public.review_tags (
  review_id uuid not null references public.reviews (id) on delete cascade,
  tag       text not null,
  primary key (review_id, tag)
);

alter table public.review_tags enable row level security;
create policy "review_tags: owner all" on public.review_tags
  for all
  using (exists (select 1 from public.reviews r where r.id = review_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.reviews r where r.id = review_id and r.user_id = auth.uid()));

-- ── recaps ───────────────────────────────────────────────────────────────
create table if not exists public.recaps (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  period       text not null check (period in ('monthly', 'yearly')),
  period_start date not null,
  payload      jsonb not null default '{}'::jsonb,   -- computed stats + observations
  created_at   timestamptz not null default now(),
  unique (user_id, period, period_start)
);

alter table public.recaps enable row level security;
create policy "recaps: owner all" on public.recaps
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── import_jobs ──────────────────────────────────────────────────────────
create table if not exists public.import_jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  kind        text not null check (kind in ('reviews', 'spotify_extended_history', 'playlist', 'csv', 'json', 'manual')),
  filename    text,
  status      text not null default 'pending' check (status in ('pending', 'validating', 'preview', 'importing', 'done', 'failed', 'reverted')),
  stats       jsonb not null default '{}'::jsonb,     -- rows read/imported/skipped/failed
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.import_jobs enable row level security;
create policy "import_jobs: owner all" on public.import_jobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger import_jobs_updated_at before update on public.import_jobs
  for each row execute function public.set_updated_at();
