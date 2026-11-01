import { db } from './local'
import type { ParsedPlay, Play, PlayImportPreview } from '../types'

/**
 * Minutes for stats: exact ms_played when an export recorded it, otherwise the
 * live-sync estimate — one full track length per play. Never silently mix the
 * two: playIsEstimated marks every row whose minutes are the estimate.
 */
export function playEffectiveMs(p: Play): number {
  if (p.msPlayed > 0) return p.msPlayed
  return p.source === 'spotify_api' ? (p.durationMs ?? 0) : p.msPlayed
}

export function playIsEstimated(p: Play): boolean {
  return p.source === 'spotify_api' && p.msPlayed === 0 && (p.durationMs ?? 0) > 0
}

/**
 * Skip-Filter (nur Anzeige, es wird nie etwas gelöscht): Ein Export-Play
 * unter 30 Sekunden ist ein Skip. Seine Sekunden bleiben in der Hörzeit —
 * 10 geskippte Sekunden sind 10 gehörte Sekunden — aber er zählt nicht als
 * Play: nicht in Zählern, Top-Listen, Meilensteinen oder Sprüchen.
 * Live-Sync-Plays (spotify_api) haben kein echtes ms_played; ein Skip ist
 * dort nicht erkennbar, also zählen sie immer als Play.
 */
export const SKIP_THRESHOLD_MS = 30_000

export function isSkipPlay(p: Play): boolean {
  if (p.source === 'spotify_api') return false
  return p.msPlayed < SKIP_THRESHOLD_MS
}

/** Die Plays, die als Plays zählen — Skips raus, Hörzeit unberührt. */
export function countedPlays(plays: Play[]): Play[] {
  return plays.filter((p) => !isSkipPlay(p))
}

// ── parsing: Spotify Extended Streaming History + the simple account export ──

interface ExtendedRow {
  ts?: unknown
  ms_played?: unknown
  master_metadata_track_name?: unknown
  master_metadata_album_artist_name?: unknown
  master_metadata_album_album_name?: unknown
}

interface SimpleRow {
  endTime?: unknown
  msPlayed?: unknown
  artistName?: unknown
  trackName?: unknown
}

function parseExtended(r: ExtendedRow): ParsedPlay | 'non-music' | 'invalid' {
  const track = typeof r.master_metadata_track_name === 'string' ? r.master_metadata_track_name.trim() : ''
  const artist = typeof r.master_metadata_album_artist_name === 'string' ? r.master_metadata_album_artist_name.trim() : ''
  // rows without a track name are podcast episodes, videos or ads — not music
  if (!track && r.ts) return 'non-music'
  if (!track || !artist || typeof r.ts !== 'string') return 'invalid'
  const playedAt = new Date(r.ts)
  if (Number.isNaN(playedAt.getTime())) return 'invalid'
  return {
    trackName: track,
    artistName: artist,
    albumName: typeof r.master_metadata_album_album_name === 'string' && r.master_metadata_album_album_name.trim() ? r.master_metadata_album_album_name.trim() : null,
    playedAt: playedAt.toISOString(),
    msPlayed: typeof r.ms_played === 'number' && r.ms_played >= 0 ? Math.round(r.ms_played) : 0,
  }
}

function parseSimple(r: SimpleRow): ParsedPlay | 'non-music' | 'invalid' {
  const track = typeof r.trackName === 'string' ? r.trackName.trim() : ''
  const artist = typeof r.artistName === 'string' ? r.artistName.trim() : ''
  if (!track || !artist || typeof r.endTime !== 'string') return 'invalid'
  // simple export uses "yyyy-mm-dd hh:mm" local time
  const playedAt = new Date(r.endTime.replace(' ', 'T'))
  if (Number.isNaN(playedAt.getTime())) return 'invalid'
  return {
    trackName: track,
    artistName: artist,
    albumName: null,
    playedAt: playedAt.toISOString(),
    msPlayed: typeof r.msPlayed === 'number' && r.msPlayed >= 0 ? Math.round(r.msPlayed) : 0,
  }
}

export function parseStreamingHistoryFile(text: string): { plays: ParsedPlay[]; skippedNonMusic: number; skippedInvalid: number; format: 'extended' | 'simple' } {
  const parsed: unknown = JSON.parse(text)
  if (!Array.isArray(parsed)) throw new Error('Die Datei muss ein Array aus Einträgen enthalten (Streaming_History_Audio_….json).')
  const first = parsed[0] as Record<string, unknown> | undefined
  const format = first && 'master_metadata_track_name' in first ? 'extended' : 'simple'
  const plays: ParsedPlay[] = []
  let skippedNonMusic = 0
  let skippedInvalid = 0
  for (const raw of parsed as Array<Record<string, unknown>>) {
    const row = format === 'extended' ? parseExtended(raw as ExtendedRow) : parseSimple(raw as SimpleRow)
    if (row === 'non-music') skippedNonMusic++
    else if (row === 'invalid') skippedInvalid++
    else plays.push(row)
  }
  return { plays, skippedNonMusic, skippedInvalid, format }
}

export async function buildPlayPreview(files: Array<{ name: string; text: string }>): Promise<PlayImportPreview> {
  const all: ParsedPlay[] = []
  let skippedNonMusic = 0
  let skippedInvalid = 0
  for (const f of files) {
    const p = parseStreamingHistoryFile(f.text)
    all.push(...p.plays)
    skippedNonMusic += p.skippedNonMusic
    skippedInvalid += p.skippedInvalid
  }
  // dedupe within the files themselves (exports can overlap)
  const seen = new Set<string>()
  const unique = all.filter((p) => {
    const k = playKey(p)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  // dedupe against what is already imported
  const existing = await db.plays.toArray()
  const existingKeys = new Set(existing.map((p) => playKey(p)))
  const exactFresh = unique.filter((p) => !existingKeys.has(playKey(p)))
  // the live sync (Spotify API) timestamps the same play up to seconds
  // differently than the export — catch those by song + a three-minute window.
  // these are not duplicates to drop: the export row REPLACES the estimated
  // live-sync row with the exact listening time (see importPlays).
  const apiPlays = existing.filter((p) => p.source === 'spotify_api')
  let replacesEstimates = 0
  const fresh = exactFresh.filter((p) => {
    const replaces = apiPlays.some(
      (e) =>
        e.trackName.toLowerCase() === p.trackName.toLowerCase() &&
        e.artistName.toLowerCase() === p.artistName.toLowerCase() &&
        Math.abs(new Date(e.playedAt).getTime() - new Date(p.playedAt).getTime()) < 180_000,
    )
    if (replaces) replacesEstimates++
    return true
  })

  const byArtist = new Map<string, number>()
  for (const p of fresh) byArtist.set(p.artistName, (byArtist.get(p.artistName) ?? 0) + 1)
  const topArtists = [...byArtist.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([artist, plays]) => ({ artist, plays }))
  const sorted = [...fresh].sort((a, b) => a.playedAt.localeCompare(b.playedAt))

  return {
    fileNames: files.map((f) => f.name),
    rowsRead: all.length,
    validPlays: fresh,
    skippedNonMusic,
    skippedInvalid,
    duplicates: all.length - fresh.length,
    replacesEstimates,
    firstPlay: sorted[0]?.playedAt ?? null,
    lastPlay: sorted[sorted.length - 1]?.playedAt ?? null,
    topArtists,
  }
}

function playKey(p: { playedAt: string; trackName: string; artistName: string }): string {
  return `${p.playedAt}::${p.trackName.toLowerCase()}::${p.artistName.toLowerCase()}`
}

export async function importPlays(plays: ParsedPlay[], source: Play['source']): Promise<number> {
  const importId = crypto.randomUUID()
  const rows: Play[] = plays.map((p) => ({ ...p, id: crypto.randomUUID(), source, importId }))
  if (source === 'spotify_extended' || source === 'spotify_simple') {
    // exact export rows replace the live sync's estimated rows for the same
    // play (song + three-minute window) — no double counting at the seam
    const apiRows = (await db.plays.toArray()).filter((p) => p.source === 'spotify_api')
    const replacedIds = apiRows
      .filter((e) =>
        rows.some(
          (p) =>
            e.trackName.toLowerCase() === p.trackName.toLowerCase() &&
            e.artistName.toLowerCase() === p.artistName.toLowerCase() &&
            Math.abs(new Date(e.playedAt).getTime() - new Date(p.playedAt).getTime()) < 180_000,
        ),
      )
      .map((e) => e.id)
    if (replacedIds.length > 0) await db.plays.bulkDelete(replacedIds)
  }
  await db.plays.bulkAdd(rows)
  return rows.length
}

// ── aggregates for the history page ──────────────────────────────────────

export interface HistoryStats {
  totalPlays: number
  /** export plays under 30s in range: no play count, but their seconds stay in totalMs */
  skippedPlays: number
  totalMs: number
  /** part of totalMs that comes from live-sync estimates (track length), not exact export minutes */
  estimatedMs: number
  artists: number
  tracks: number
  topArtists: Array<{ name: string; plays: number; ms: number }>
  topTracks: Array<{ name: string; artist: string; plays: number; ms: number }>
  minutesPerDay: Array<{ day: string; minutes: number }>
}

export function computeHistoryStats(plays: Play[], days: number | null): HistoryStats {
  const cutoff = days === null ? null : Date.now() - days * 24 * 3600 * 1000
  const inRange = cutoff === null ? plays : plays.filter((p) => new Date(p.playedAt).getTime() >= cutoff)

  const artistMap = new Map<string, { plays: number; ms: number }>()
  const trackMap = new Map<string, { name: string; artist: string; plays: number; ms: number }>()
  const dayMap = new Map<string, number>()
  let totalMs = 0
  let estimatedMs = 0

  let skippedPlays = 0
  for (const p of inRange) {
    const skip = isSkipPlay(p)
    if (skip) skippedPlays++
    const ms = playEffectiveMs(p)
    if (playIsEstimated(p)) estimatedMs += ms
    totalMs += ms
    const a = artistMap.get(p.artistName) ?? { plays: 0, ms: 0 }
    if (!skip) a.plays++
    a.ms += ms
    artistMap.set(p.artistName, a)
    const tk = `${p.trackName}::${p.artistName}`
    const t = trackMap.get(tk) ?? { name: p.trackName, artist: p.artistName, plays: 0, ms: 0 }
    if (!skip) t.plays++
    t.ms += ms
    trackMap.set(tk, t)
    const day = p.playedAt.slice(0, 10)
    dayMap.set(day, (dayMap.get(day) ?? 0) + ms)
  }

  const minutesPerDay = [...dayMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, ms]) => ({ day: day.slice(5), minutes: Math.round(ms / 60000) }))

  return {
    totalPlays: inRange.length - skippedPlays,
    skippedPlays,
    totalMs,
    estimatedMs,
    artists: artistMap.size,
    tracks: trackMap.size,
    topArtists: [...artistMap.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 10).map(([name, v]) => ({ name, ...v })),
    topTracks: [...trackMap.values()].sort((a, b) => b.ms - a.ms).slice(0, 10),
    minutesPerDay,
  }
}

export function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3600000)
  const minutes = Math.round((ms % 3600000) / 60000)
  if (hours === 0) return `${minutes}\u00A0Min`
  if (hours < 100) return `${hours} Std ${minutes}\u00A0Min`
  const days = Math.floor(hours / 24)
  return `${days} Tage ${hours % 24} Std`
}
