/**
 * Cloud sync (Supabase) — backup, cross-device mirror and the handover that
 * enables 24/7 tracking.
 *
 * Everything here runs as the signed-in owner through Row Level Security;
 * the service role key never touches this app. Plays sync idempotently via
 * the listening_history unique constraint (ignoreDuplicates), reviews sync
 * last-write-wins on updatedAt with a small tolerance. The Spotify refresh
 * token is pushed to the owner's own spotify_connection row so the hourly
 * edge function can pull plays while the app is closed — it lands in a
 * table only the owner can read, never in code, secrets UI or the repo.
 */
import { db } from '../db/local'
import { importPlays } from '../db/plays'
import type { ParsedPlay, Play, Review } from '../types'
import { getConfigValue } from './config'
import { readPendingDeletes, removePendingDelete, setReviewWatermark } from './syncQueue'
import { getSupabase } from './supabase'

/** export and API timestamp the same play slightly differently — window dedupe */
const WINDOW_MS = 180_000
const PLAY_SOURCES = new Set<Play['source']>(['spotify_extended', 'spotify_simple', 'spotify_api', 'manual'])
/** pull ignores remote "newer" reviews within this slack — covers the push roundtrip's own updated_at bump */
const UPDATED_AT_TOLERANCE_MS = 2_000

export interface CloudUser {
  id: string
  email: string
}

export async function cloudSession(): Promise<CloudUser | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  const u = data.session?.user
  return u ? { id: u.id, email: u.email ?? '' } : null
}

export async function signInCloud(email: string, password: string): Promise<CloudUser> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase URL und anon key fehlen — oben eintragen und speichern.')
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error || !data.user) throw new Error(error?.message ?? 'Login fehlgeschlagen.')
  return { id: data.user.id, email: data.user.email ?? '' }
}

export async function signOutCloud(): Promise<void> {
  await getSupabase()?.auth.signOut()
}

/**
 * Hand the hourly edge function what it needs: refresh token + client id in
 * the owner's own row. No-op unless both Spotify and the cloud are connected.
 */
export async function pushSpotifyConnection(): Promise<boolean> {
  const supabase = getSupabase()
  const user = await cloudSession()
  const refreshToken = localStorage.getItem('crate.spotify.refreshToken')
  const clientId = getConfigValue('spotifyClientId')
  if (!supabase || !user || !refreshToken || !clientId) return false
  const { error } = await supabase
    .from('spotify_connection')
    .upsert({ user_id: user.id, refresh_token: refreshToken, client_id: clientId })
  return !error
}

// ── plays ────────────────────────────────────────────────────────────────

interface CloudPlayRow {
  track_name: string
  artist_name: string
  album_name: string | null
  played_at: string
  ms_played: number
  duration_ms: number | null
  source: string
}

function toCloudPlay(userId: string, p: Play): CloudPlayRow & { user_id: string } {
  return {
    user_id: userId,
    track_name: p.trackName,
    artist_name: p.artistName,
    album_name: p.albumName,
    played_at: p.playedAt,
    ms_played: p.msPlayed,
    duration_ms: p.durationMs ?? null,
    source: p.source,
  }
}

export function fromCloudPlay(r: CloudPlayRow): ParsedPlay & { source: Play['source'] } {
  return {
    trackName: r.track_name,
    artistName: r.artist_name,
    albumName: r.album_name,
    playedAt: new Date(r.played_at).toISOString(),
    msPlayed: r.ms_played ?? 0,
    durationMs: r.duration_ms ?? null,
    source: PLAY_SOURCES.has(r.source as Play['source']) ? (r.source as Play['source']) : 'manual',
  }
}

const keyOf = (p: { playedAt: string; trackName: string; artistName: string }) =>
  `${p.playedAt}::${p.trackName.toLowerCase()}::${p.artistName.toLowerCase()}`

function samePlayWindow(
  a: { playedAt: string; trackName: string; artistName: string },
  b: { playedAt: string; trackName: string; artistName: string },
): boolean {
  return (
    a.trackName.toLowerCase() === b.trackName.toLowerCase() &&
    a.artistName.toLowerCase() === b.artistName.toLowerCase() &&
    Math.abs(new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime()) < WINDOW_MS
  )
}

/**
 * Remote rows minus everything already stored locally (exact key or 3-minute
 * window). One exception: a remote EXPORT row that only matches a local
 * live-sync estimate stays "fresh" — it is not a duplicate but the exact
 * replacement for the estimate, and importPlays performs that swap at the
 * seam (deletes the estimate, adds the exact row).
 */
export function freshRemotePlays(remote: CloudPlayRow[], local: Play[]): Array<ParsedPlay & { source: Play['source'] }> {
  const keys = new Set(local.map(keyOf))
  return remote.map(fromCloudPlay).filter((p) => {
    if (keys.has(keyOf(p))) return false
    const isExport = p.source === 'spotify_extended' || p.source === 'spotify_simple'
    return !local.some(
      (e) => samePlayWindow(e, p) && !(isExport && e.source === 'spotify_api'),
    )
  })
}

// ── reviews ──────────────────────────────────────────────────────────────

interface CloudReviewRow {
  id: string
  artist: string
  album_title: string
  release_year: number | null
  genres: string[]
  rating: number | null
  review_text: string
  best_tracks: string[]
  worst_tracks: string[]
  review_date: string | null
  notes: string
  metadata_provider_id: string | null
  metadata_source: string | null
  artwork_url: string | null
  updated_at: string
}

export function toCloudReview(userId: string, r: Review): Omit<CloudReviewRow, 'updated_at'> & { user_id: string } {
  return {
    user_id: userId,
    id: r.id,
    artist: r.artist,
    album_title: r.albumTitle,
    release_year: r.releaseYear,
    genres: r.genres,
    rating: r.rating,
    review_text: r.reviewText,
    best_tracks: r.bestTracks,
    worst_tracks: r.worstTracks,
    review_date: r.reviewDate,
    notes: r.notes,
    metadata_provider_id: r.metadataProviderId,
    metadata_source: r.metadataSource,
    artwork_url: r.artworkUrl,
  }
}

function fromCloudReview(r: CloudReviewRow, tags: string[]): Review {
  return {
    id: r.id,
    artist: r.artist,
    albumTitle: r.album_title,
    releaseYear: r.release_year,
    genres: r.genres ?? [],
    rating: r.rating,
    reviewText: r.review_text,
    bestTracks: r.best_tracks ?? [],
    worstTracks: r.worst_tracks ?? [],
    reviewDate: r.review_date,
    tags,
    notes: r.notes,
    artworkUrl: r.artwork_url,
    metadataProviderId: r.metadata_provider_id,
    metadataSource: r.metadata_source,
    createdAt: r.updated_at,
    updatedAt: r.updated_at,
  }
}

// ── the sync ─────────────────────────────────────────────────────────────

export interface CloudSyncResult {
  playsPushed: number
  playsPulled: number
  reviewsPushed: number
  reviewsPulled: number
  syncedAt: string
}

export async function syncCloud(): Promise<CloudSyncResult> {
  const supabase = getSupabase()
  const user = await cloudSession()
  if (!supabase || !user) throw new Error('Nicht mit der Cloud verbunden.')

  // plays: push everything (the unique constraint makes it idempotent)…
  const localPlays = await db.plays.toArray()
  let playsPushed = 0
  for (let i = 0; i < localPlays.length; i += 500) {
    const chunk = localPlays.slice(i, i + 500).map((p) => toCloudPlay(user.id, p))
    const { error } = await supabase
      .from('listening_history')
      .upsert(chunk, { onConflict: 'user_id,played_at,track_name,artist_name', ignoreDuplicates: true })
    if (error) throw new Error(`Play-Upload fehlgeschlagen: ${error.message}`)
    playsPushed += chunk.length
  }

  // …then pull whatever the hourly tracker (or another device) added
  const { data: remotePlays, error: pullError } = await supabase
    .from('listening_history')
    .select('track_name, artist_name, album_name, played_at, ms_played, duration_ms, source')
    .order('played_at', { ascending: true })
  if (pullError) throw new Error(`Play-Download fehlgeschlagen: ${pullError.message}`)
  const fresh = freshRemotePlays((remotePlays ?? []) as CloudPlayRow[], localPlays)
  const bySource = new Map<Play['source'], ParsedPlay[]>()
  for (const p of fresh) {
    const { source, ...parsed } = p
    bySource.set(source, [...(bySource.get(source) ?? []), parsed])
  }
  for (const [source, plays] of bySource) await importPlays(plays, source)

  // reviews: replay queued deletions first (auto-sync keeps this queue
  // for offline deletes), then push local state, then pull newer rows
  for (const id of [...readPendingDeletes()]) {
    await supabase.from('review_tags').delete().eq('review_id', id)
    const { error } = await supabase.from('reviews').delete().eq('id', id)
    if (!error) removePendingDelete(id)
  }
  const localReviews = await db.reviews.toArray()
  let reviewsPushed = 0
  for (const r of localReviews) {
    const { error } = await supabase.from('reviews').upsert(toCloudReview(user.id, r))
    if (error) throw new Error(`Review-Upload fehlgeschlagen: ${error.message}`)
    await supabase.from('review_tags').delete().eq('review_id', r.id)
    if (r.tags.length > 0) {
      await supabase.from('review_tags').insert(r.tags.map((tag) => ({ review_id: r.id, tag })))
    }
    reviewsPushed++
  }
  // every local review was just pushed — the auto-sync watermark can jump here
  setReviewWatermark(Date.now())

  const { data: remoteReviews, error: reviewPullError } = await supabase
    .from('reviews')
    .select('id, artist, album_title, release_year, genres, rating, review_text, best_tracks, worst_tracks, review_date, notes, metadata_provider_id, metadata_source, artwork_url, updated_at')
  if (reviewPullError) throw new Error(`Review-Download fehlgeschlagen: ${reviewPullError.message}`)
  const remoteIds = ((remoteReviews ?? []) as CloudReviewRow[]).map((r) => r.id)
  const { data: remoteTags } = remoteIds.length
    ? await supabase.from('review_tags').select('review_id, tag').in('review_id', remoteIds)
    : { data: [] as Array<{ review_id: string; tag: string }> }
  const tagsByReview = new Map<string, string[]>()
  for (const t of remoteTags ?? []) tagsByReview.set(t.review_id, [...(tagsByReview.get(t.review_id) ?? []), t.tag])

  const pushedIds = new Set(localReviews.map((r) => r.id))
  const localById = new Map(localReviews.map((r) => [r.id, r]))
  let reviewsPulled = 0
  for (const row of (remoteReviews ?? []) as CloudReviewRow[]) {
    const local = localById.get(row.id)
    const remoteNewer =
      !local ||
      new Date(row.updated_at).getTime() - new Date(local.updatedAt).getTime() > UPDATED_AT_TOLERANCE_MS
    // rows we just pushed carry our own content; only the trigger-bumped
    // timestamp looks "newer" — skip them
    if (!remoteNewer || (local && pushedIds.has(row.id))) continue
    await db.reviews.put(fromCloudReview(row, tagsByReview.get(row.id) ?? []))
    reviewsPulled++
  }

  // the hourly tracker needs the current refresh token on every sync
  await pushSpotifyConnection()

  return {
    playsPushed,
    playsPulled: fresh.length,
    reviewsPushed,
    reviewsPulled,
    syncedAt: new Date().toISOString(),
  }
}
