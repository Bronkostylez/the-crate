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
import { planReviewReconcile, nextWatermark } from './reviewReconcile'
import {
  getPlaysCreatedWatermark,
  getReviewWatermark,
  readPendingDeletes,
  removePendingDelete,
  setPlaysCreatedWatermark,
  setReviewWatermark,
} from './syncQueue'
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
  created_at?: string
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

/**
 * Remote rows minus everything already stored locally (exact key or 3-minute
 * window). One exception: a remote EXPORT row that only matches a local
 * live-sync estimate stays "fresh" — it is not a duplicate but the exact
 * replacement for the estimate, and importPlays performs that swap at the
 * seam (deletes the estimate, adds the exact row).
 */
export function freshRemotePlays(remote: CloudPlayRow[], local: Play[]): Array<ParsedPlay & { source: Play['source'] }> {
  const keys = new Set(local.map(keyOf))
  const parsed = remote.map(fromCloudPlay)
  const isExport = (p: { source: Play['source'] }) => p.source === 'spotify_extended' || p.source === 'spotify_simple'
  // normalized once — the 3-minute window scan below runs per remote row,
  // and lowercasing inside it would dominate a first pull on a phone
  const norm = (p: { trackName: string; artistName: string; playedAt: string; source: Play['source'] }) => ({
    t: p.trackName.toLowerCase(),
    a: p.artistName.toLowerCase(),
    ts: Date.parse(p.playedAt),
    source: p.source,
  })
  const windowHit = (e: ReturnType<typeof norm>, p: ReturnType<typeof norm>) =>
    e.t === p.t && e.a === p.a && Math.abs(e.ts - p.ts) < WINDOW_MS
  const localNorm = local.map(norm)
  // An export row beats a live-sync estimate wherever both describe the same
  // play — against local rows (existing swap at the import seam) AND inside
  // the pulled batch itself: the cloud keeps the hourly tracker's
  // spotify_api rows next to the later-imported export rows, and pulling
  // both would double-count the overlap days on every other device.
  const exportNorm = [...localNorm.filter(isExport), ...parsed.filter(isExport).map(norm)]
  return parsed.filter((p) => {
    if (keys.has(keyOf(p))) return false
    const pn = norm(p)
    if (!isExport(p) && exportNorm.some((e) => windowHit(e, pn))) return false
    return !localNorm.some((e) => windowHit(e, pn) && !(isExport(p) && e.source === 'spotify_api'))
  })
}

/** PostgREST caps one response (default 1000 rows) — every play pull pages. */
const PLAY_PAGE = 1000

/**
 * All cloud plays, paged by created_at (insert-only table, so the order is
 * stable while reading). An unpaginated select silently stalls at the
 * oldest page forever: every later sync re-fetches the same first page,
 * finds only duplicates and never advances.
 */
async function fetchAllCloudPlays(supabase: NonNullable<ReturnType<typeof getSupabase>>, sinceCreatedAt?: string): Promise<CloudPlayRow[]> {
  const rows: CloudPlayRow[] = []
  for (let from = 0; ; from += PLAY_PAGE) {
    let q = supabase
      .from('listening_history')
      .select('track_name, artist_name, album_name, played_at, ms_played, duration_ms, source, created_at')
      .order('created_at', { ascending: true })
      .range(from, from + PLAY_PAGE - 1)
    if (sinceCreatedAt) q = q.gte('created_at', sinceCreatedAt)
    const { data, error } = await q
    if (error) throw new Error(`Play-Download fehlgeschlagen: ${error.message}`)
    rows.push(...((data ?? []) as CloudPlayRow[]))
    if (!data || data.length < PLAY_PAGE) break
  }
  return rows
}

async function importFreshPlays(remote: CloudPlayRow[], local: Play[]): Promise<number> {
  const fresh = freshRemotePlays(remote, local)
  const bySource = new Map<Play['source'], ParsedPlay[]>()
  for (const p of fresh) {
    const { source, ...parsedPlay } = p
    bySource.set(source, [...(bySource.get(source) ?? []), parsedPlay])
  }
  for (const [source, plays] of bySource) await importPlays(plays, source)
  return fresh.length
}

function maxCreatedAt(rows: CloudPlayRow[], floor: string | null): string | null {
  let best = floor
  let bestMs = floor ? Date.parse(floor) : 0
  for (const r of rows) {
    if (!r.created_at) continue
    const ms = Date.parse(r.created_at)
    if (ms > bestMs) {
      bestMs = ms
      best = r.created_at
    }
  }
  return best
}

/** Small lookbehind so a slow-committing insert is never skipped; dedupe absorbs the overlap. */
const PLAYS_PULL_SLACK_MS = 60_000

/**
 * Pull-only plays sync for the auto-sync: fetch cloud rows created since the
 * last pull and import what is new. Never pushes — the hourly tracker and
 * the manual full sync own the upload direction. The watermark advances
 * only after a complete pass, so a failed run simply retries next time.
 */
export async function pullNewCloudPlays(): Promise<number> {
  const supabase = getSupabase()
  const user = await cloudSession()
  if (!supabase || !user) return 0
  const watermark = getPlaysCreatedWatermark()
  const since = watermark ? new Date(Date.parse(watermark) - PLAYS_PULL_SLACK_MS).toISOString() : undefined
  const remote = await fetchAllCloudPlays(supabase, since)
  const imported = await importFreshPlays(remote, await db.plays.toArray())
  const newWatermark = maxCreatedAt(remote, watermark)
  if (newWatermark && newWatermark !== watermark) setPlaysCreatedWatermark(newWatermark)
  return imported
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


const REVIEW_COLUMNS =
  'id, artist, album_title, release_year, genres, rating, review_text, best_tracks, worst_tracks, review_date, notes, metadata_provider_id, metadata_source, artwork_url, updated_at'

/** fetch full remote rows + their tags for the ids the reconcile plan wants applied */
async function fetchRemoteReviews(ids: string[]): Promise<{
  rows: CloudReviewRow[]
  tagsByReview: Map<string, string[]>
}> {
  const supabase = getSupabase()
  if (!supabase || ids.length === 0) return { rows: [], tagsByReview: new Map() }
  const { data, error } = await supabase.from('reviews').select(REVIEW_COLUMNS).in('id', ids)
  if (error) throw new Error(`Review-Download fehlgeschlagen: ${error.message}`)
  const { data: tags, error: tagError } = await supabase.from('review_tags').select('review_id, tag').in('review_id', ids)
  if (tagError) throw new Error(`Tag-Download fehlgeschlagen: ${tagError.message}`)
  const tagsByReview = new Map<string, string[]>()
  for (const t of tags ?? []) tagsByReview.set(t.review_id, [...(tagsByReview.get(t.review_id) ?? []), t.tag])
  return { rows: (data ?? []) as CloudReviewRow[], tagsByReview }
}

// ── the sync ─────────────────────────────────────────────────────────────

/**
 * Light pull for the auto-sync: apply remote rows whose content is newer
 * than the local row (out-of-app changes, other devices) without pushing
 * anything. Locally dirty rows only win when their content is the newer
 * one — a stale device can no longer clobber the cloud (reviewReconcile).
 * Returns the applied server timestamps so the caller can cover them in the
 * watermark AFTER the dirty push has run.
 */
export interface PulledReviews {
  applied: number
  appliedIds: string[]
  appliedTs: string[]
}

export async function pullNewerReviews(): Promise<PulledReviews> {
  const none: PulledReviews = { applied: 0, appliedIds: [], appliedTs: [] }
  const supabase = getSupabase()
  const user = await cloudSession()
  if (!supabase || !user) return none

  const localReviews = await db.reviews.toArray()
  const { data: remoteMeta, error } = await supabase.from('reviews').select('id, updated_at')
  if (error) throw new Error(`Review-Download fehlgeschlagen: ${error.message}`)
  const plan = planReviewReconcile(localReviews, remoteMeta ?? [], getReviewWatermark(), UPDATED_AT_TOLERANCE_MS)
  // rows queued for cloud deletion must not be resurrected by the pull
  const pendingDeletes = new Set(readPendingDeletes())
  const applyIds = plan.applyIds.filter((id) => !pendingDeletes.has(id))
  if (applyIds.length === 0) return none

  const { rows, tagsByReview } = await fetchRemoteReviews(applyIds)
  const appliedIds: string[] = []
  const appliedTs: string[] = []
  for (const row of rows) {
    await db.reviews.put(fromCloudReview(row, tagsByReview.get(row.id) ?? []))
    appliedIds.push(row.id)
    appliedTs.push(row.updated_at)
  }
  return { applied: rows.length, appliedIds, appliedTs }
}

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
  const remotePlays = await fetchAllCloudPlays(supabase)
  const freshCount = await importFreshPlays(remotePlays, localPlays)
  const playsWatermark = maxCreatedAt(remotePlays, getPlaysCreatedWatermark())
  if (playsWatermark) setPlaysCreatedWatermark(playsWatermark)

  // reviews: replay queued deletions first (auto-sync keeps this queue
  // for offline deletes), then push local state, then pull newer rows
  for (const id of readPendingDeletes()) {
    await supabase.from('review_tags').delete().eq('review_id', id)
    const { error } = await supabase.from('reviews').delete().eq('id', id)
    if (!error) removePendingDelete(id)
  }
  // reviews reconcile: pull newer remote rows FIRST so out-of-app changes
  // (other device, support edits) arrive here; the newer content wins every
  // conflict and only locally newer dirty rows are pushed — stale local
  // state never overwrites newer remote state.
  const localReviews = await db.reviews.toArray()
  const { data: remoteMeta, error: metaError } = await supabase.from('reviews').select('id, updated_at')
  if (metaError) throw new Error(`Review-Download fehlgeschlagen: ${metaError.message}`)
  const plan = planReviewReconcile(localReviews, remoteMeta ?? [], getReviewWatermark(), UPDATED_AT_TOLERANCE_MS)

  let reviewsPulled = 0
  const appliedTs: string[] = []
  if (plan.applyIds.length > 0) {
    const { rows, tagsByReview } = await fetchRemoteReviews(plan.applyIds)
    for (const row of rows) {
      await db.reviews.put(fromCloudReview(row, tagsByReview.get(row.id) ?? []))
      appliedTs.push(row.updated_at)
      reviewsPulled++
    }
  }

  const localById = new Map(localReviews.map((r) => [r.id, r]))
  let reviewsPushed = 0
  for (const id of plan.pushIds) {
    const r = localById.get(id)
    if (!r) continue
    const { error } = await supabase.from('reviews').upsert(toCloudReview(user.id, r))
    if (error) throw new Error(`Review-Upload fehlgeschlagen: ${error.message}`)
    await supabase.from('review_tags').delete().eq('review_id', r.id)
    if (r.tags.length > 0) {
      await supabase.from('review_tags').insert(r.tags.map((tag) => ({ review_id: r.id, tag })))
    }
    reviewsPushed++
  }
  // covers pushed rows AND rows just applied from remote (their updatedAt is
  // the server timestamp — without covering it they would look dirty forever)
  setReviewWatermark(nextWatermark(getReviewWatermark(), appliedTs))

  // the hourly tracker needs the current refresh token on every sync
  await pushSpotifyConnection()

  return {
    playsPushed,
    playsPulled: freshCount,
    reviewsPushed,
    reviewsPulled,
    syncedAt: new Date().toISOString(),
  }
}
