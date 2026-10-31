/**
 * Live history sync over the Spotify Web API: GET /v1/me/player/recently-played
 * (scope user-read-recently-played — open to development-mode apps; the Nov
 * 2024 restrictions cover audio features/analysis/recommendations, not this
 * endpoint). Limit is 50 plays per call, so this covers "what ran lately",
 * not the full archive — the Extended Streaming History import remains the
 * way for the complete history with real listening time.
 *
 * recently-played carries no ms_played, so synced rows store msPlayed: 0.
 * The play is real, the minutes are unknown — the UI says so instead of
 * inventing listening time.
 */
import { db } from '../../db/local'
import { importPlays } from '../../db/plays'
import type { ParsedPlay } from '../../types'
import { getConfigValue } from '../config'
import { getAccessToken } from './auth'

const LAST_SYNC_KEY = 'crate.spotify.lastHistorySync'
const API = 'https://api.spotify.com/v1'
/** export and API timestamp the same play slightly differently — window dedupe */
const WINDOW_MS = 180_000

interface RecentlyPlayedItem {
  played_at?: unknown
  track?: {
    name?: unknown
    artists?: Array<{ name?: unknown }>
    album?: { name?: unknown }
  } | null
}

export interface SyncResult {
  fetched: number
  added: number
  duplicates: number
  syncedAt: string
}

export class SpotifySyncError extends Error {
  readonly needsReconnect: boolean

  constructor(message: string, needsReconnect = false) {
    super(message)
    this.needsReconnect = needsReconnect
  }
}

export function lastHistorySync(): string | null {
  return localStorage.getItem(LAST_SYNC_KEY)
}

const keyOf = (p: { playedAt: string; trackName: string; artistName: string }) =>
  `${p.playedAt}::${p.trackName.toLowerCase()}::${p.artistName.toLowerCase()}`

function samePlayWindow(a: { playedAt: string; trackName: string; artistName: string }, b: { playedAt: string; trackName: string; artistName: string }): boolean {
  return (
    a.trackName.toLowerCase() === b.trackName.toLowerCase() &&
    a.artistName.toLowerCase() === b.artistName.toLowerCase() &&
    Math.abs(new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime()) < WINDOW_MS
  )
}

export async function syncRecentlyPlayed(): Promise<SyncResult> {
  const clientId = getConfigValue('spotifyClientId')
  const token = clientId ? await getAccessToken(clientId) : null
  if (!token) throw new SpotifySyncError('Spotify ist nicht verbunden.', true)

  const existing = await db.plays.toArray()
  // incremental cursor: only plays after the newest one already stored
  const newest = existing.reduce((max, p) => Math.max(max, new Date(p.playedAt).getTime()), 0)
  const params = new URLSearchParams({ limit: '50' })
  if (newest > 0) params.set('after', String(newest))

  const res = await fetch(`${API}/me/player/recently-played?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 403) {
    throw new SpotifySyncError(
      'Dem Login fehlt das neue Hörverlauf-Recht — einmal in den Einstellungen trennen und neu verbinden, dann klappt der Sync.',
      true,
    )
  }
  if (!res.ok) throw new SpotifySyncError(`Spotify-Sync fehlgeschlagen (HTTP ${res.status}).`)
  const data = (await res.json()) as { items?: RecentlyPlayedItem[] }

  const parsed: ParsedPlay[] = []
  for (const item of data.items ?? []) {
    const track = item.track && typeof item.track.name === 'string' ? item.track.name.trim() : ''
    const artists = (item.track?.artists ?? [])
      .map((a) => (typeof a.name === 'string' ? a.name.trim() : ''))
      .filter(Boolean)
    if (!track || artists.length === 0 || typeof item.played_at !== 'string') continue
    const playedAt = new Date(item.played_at)
    if (Number.isNaN(playedAt.getTime())) continue
    // second precision, matching the Extended export's ts, so overlapping
    // rows dedupe by exact key when the export is imported later
    playedAt.setMilliseconds(0)
    parsed.push({
      trackName: track,
      artistName: artists.join(', '),
      albumName: typeof item.track?.album?.name === 'string' && item.track.album.name.trim() ? item.track.album.name.trim() : null,
      playedAt: playedAt.toISOString(),
      msPlayed: 0, // unknown, not zero — shown as "–" in the UI
    })
  }

  const existingKeys = new Set(existing.map(keyOf))
  const fresh = parsed.filter((p) => !existingKeys.has(keyOf(p)) && !existing.some((e) => samePlayWindow(e, p)))

  const added = fresh.length > 0 ? await importPlays(fresh, 'spotify_api') : 0
  const syncedAt = new Date().toISOString()
  localStorage.setItem(LAST_SYNC_KEY, syncedAt)
  return { fetched: parsed.length, added, duplicates: parsed.length - added, syncedAt }
}
