import { db } from './local'
import { parseCsv } from './reviews'
import type {
  ParsedPlaylistTrack,
  PlaylistCandidate,
  PlaylistImportPreview,
  PlaylistSnapshot,
  PlaylistTrack,
  SnapshotDiff,
} from '../types'

// ── parsing: Spotify account export (Playlist JSON) + Exportify/simple CSV ──

interface AccountExportItem {
  addedDate?: unknown
  track?: {
    trackName?: unknown
    artistName?: unknown
    albumName?: unknown
    trackUri?: unknown
  } | null
  episode?: unknown
  localTrack?: unknown
}

interface AccountExportPlaylist {
  name?: unknown
  items?: unknown
}

function parseAccountExport(parsed: unknown): PlaylistCandidate[] {
  // the account export is an array of playlists; tolerate a {playlists:[...]} wrapper
  const list: unknown[] = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { playlists?: unknown }).playlists)
      ? ((parsed as { playlists: unknown[] }).playlists)
      : []
  if (list.length === 0) {
    throw new Error('Keine Playlist gefunden. Erwartet wird die Playlist-JSON aus Spotifys Datenexport (Kontodaten).')
  }
  return list.map((raw) => {
    const p = raw as AccountExportPlaylist
    const items = Array.isArray(p.items) ? (p.items as AccountExportItem[]) : []
    const tracks: ParsedPlaylistTrack[] = []
    let skipped = 0
    items.forEach((item, i) => {
      const t = item?.track
      const trackName = typeof t?.trackName === 'string' ? t.trackName.trim() : ''
      const artistName = typeof t?.artistName === 'string' ? t.artistName.trim() : ''
      if (!t || !trackName || !artistName) {
        // episodes and local files carry no usable metadata
        skipped++
        return
      }
      const addedRaw = typeof item.addedDate === 'string' ? item.addedDate : null
      const added = addedRaw && !Number.isNaN(new Date(addedRaw).getTime()) ? new Date(addedRaw).toISOString() : null
      tracks.push({
        position: i + 1,
        trackName,
        artistName,
        albumName: typeof t.albumName === 'string' && t.albumName.trim() ? t.albumName.trim() : null,
        addedAt: added,
        durationMs: null,
        releaseDate: null,
        spotifyUri: typeof t.trackUri === 'string' ? t.trackUri : null,
      })
    })
    return { name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : 'Unbenannte Playlist', tracks, skipped }
  })
}

function cellStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function parseCsvPlaylist(text: string): PlaylistCandidate[] {
  const rows = parseCsv(text)
  if (rows.length === 0) throw new Error('Die CSV-Datei enthält keine Zeilen.')
  const headers = Object.keys(rows[0]).map((h) => h.toLowerCase())
  const isExportify = headers.includes('track_name') && headers.some((h) => h.startsWith('artist_name'))
  const tracks: ParsedPlaylistTrack[] = []
  let skipped = 0
  rows.forEach((row, i) => {
    let trackName = ''
    let artistName = ''
    let albumName = ''
    let releaseDate: string | null = null
    let addedAt: string | null = null
    let durationMs: number | null = null
    let spotifyUri: string | null = null
    if (isExportify) {
      trackName = cellStr(row['track_name'])
      artistName = cellStr(row['artist_name(s)'])
      albumName = cellStr(row['album_name'])
      releaseDate = cellStr(row['album_release_date']) || null
      const dur = Number(cellStr(row['track_duration_(ms)']))
      durationMs = Number.isFinite(dur) && dur > 0 ? dur : null
      const addedRaw = cellStr(row['added_at'])
      addedAt = addedRaw && !Number.isNaN(new Date(addedRaw).getTime()) ? new Date(addedRaw).toISOString() : null
      spotifyUri = cellStr(row['track_uri']) || null
    } else {
      // simple template: track,artist,album,year,added_at
      trackName = cellStr(row['track'])
      artistName = cellStr(row['artist'])
      albumName = cellStr(row['album'])
      const year = Number(cellStr(row['year']))
      releaseDate = Number.isFinite(year) && year > 1900 ? `${year}` : null
      const addedRaw = cellStr(row['added_at'])
      addedAt = addedRaw && !Number.isNaN(new Date(addedRaw).getTime()) ? new Date(addedRaw).toISOString() : null
    }
    if (!trackName || !artistName) {
      skipped++
      return
    }
    tracks.push({
      position: i + 1,
      trackName,
      artistName,
      albumName: albumName || null,
      addedAt,
      durationMs,
      releaseDate,
      spotifyUri,
    })
  })
  return [
    {
      name: isExportify ? 'Exportify-Export' : 'CSV-Template',
      tracks,
      skipped,
    },
  ]
}

/** Parse one import file into the playlists it contains. */
export function parsePlaylistFile(fileName: string, text: string): { source: PlaylistSnapshot['source']; candidates: PlaylistCandidate[] } {
  if (fileName.toLowerCase().endsWith('.json')) {
    return { source: 'spotify_account_export', candidates: parseAccountExport(JSON.parse(text)) }
  }
  const candidates = parseCsvPlaylist(text)
  const firstRow = parseCsv(text)[0] ?? {}
  const headers = Object.keys(firstRow).map((h) => h.toLowerCase())
  const source = headers.includes('track_name') ? 'exportify_csv' : 'csv_template'
  return { source, candidates }
}

function trackKey(t: { trackName: string; artistName: string }): string {
  return `${t.trackName.toLowerCase()}::${t.artistName.toLowerCase()}`
}

/** Count repeated appearances of the same track inside one snapshot. */
export function countDuplicateRows(tracks: ParsedPlaylistTrack[]): number {
  const seen = new Map<string, number>()
  for (const t of tracks) {
    const k = trackKey(t)
    seen.set(k, (seen.get(k) ?? 0) + 1)
  }
  let dupes = 0
  for (const n of seen.values()) if (n > 1) dupes += n - 1
  return dupes
}

export function diffTrackLists<T extends { trackName: string; artistName: string }>(prev: T[], next: T[]): { added: T[]; removed: T[] } {
  const prevKeys = new Set(prev.map(trackKey))
  const nextKeys = new Set(next.map(trackKey))
  return {
    added: next.filter((t) => !prevKeys.has(trackKey(t))),
    removed: prev.filter((t) => !nextKeys.has(trackKey(t))),
  }
}

export async function buildPlaylistPreview(
  fileName: string,
  source: PlaylistSnapshot['source'],
  candidate: PlaylistCandidate,
): Promise<PlaylistImportPreview> {
  const latest = await latestSnapshot()
  let diff: PlaylistImportPreview['diff'] = null
  if (latest) {
    const prevTracks = await db.playlistTracks.where('snapshotId').equals(latest.id).toArray()
    const d = diffTrackLists(prevTracks, candidate.tracks)
    diff = { added: d.added.length, removed: d.removed.length }
  }
  return {
    fileName,
    source,
    candidate,
    duplicateRows: countDuplicateRows(candidate.tracks),
    diff,
  }
}

export async function importPlaylistSnapshot(preview: PlaylistImportPreview, name: string, spotifyUrl: string | null): Promise<string> {
  const snapshotId = crypto.randomUUID()
  const snapshot: PlaylistSnapshot = {
    id: snapshotId,
    name: name.trim() || preview.candidate.name,
    importedAt: new Date().toISOString(),
    source: preview.source,
    fileName: preview.fileName,
    trackCount: preview.candidate.tracks.length,
    spotifyUrl: spotifyUrl?.trim() || null,
  }
  const rows: PlaylistTrack[] = preview.candidate.tracks.map((t) => ({ ...t, id: crypto.randomUUID(), snapshotId }))
  await db.transaction('rw', db.playlistSnapshots, db.playlistTracks, async () => {
    await db.playlistSnapshots.add(snapshot)
    await db.playlistTracks.bulkAdd(rows)
  })
  return snapshotId
}

export async function deleteSnapshot(snapshotId: string): Promise<void> {
  await db.transaction('rw', db.playlistSnapshots, db.playlistTracks, async () => {
    await db.playlistTracks.where('snapshotId').equals(snapshotId).delete()
    await db.playlistSnapshots.delete(snapshotId)
  })
}

export async function renameSnapshot(snapshotId: string, name: string): Promise<void> {
  await db.playlistSnapshots.update(snapshotId, { name: name.trim() })
}

export async function setSnapshotSpotifyUrl(snapshotId: string, url: string | null): Promise<void> {
  await db.playlistSnapshots.update(snapshotId, { spotifyUrl: url?.trim() || null })
}

export async function latestSnapshot(): Promise<PlaylistSnapshot | undefined> {
  const all = await db.playlistSnapshots.orderBy('importedAt').toArray()
  return all[all.length - 1]
}

export async function snapshotDiff(currentId: string): Promise<SnapshotDiff | null> {
  const all = await db.playlistSnapshots.orderBy('importedAt').toArray()
  const idx = all.findIndex((s) => s.id === currentId)
  if (idx <= 0) return null
  const [prev, curr] = await Promise.all([
    db.playlistTracks.where('snapshotId').equals(all[idx - 1].id).toArray(),
    db.playlistTracks.where('snapshotId').equals(currentId).toArray(),
  ])
  return diffTrackLists(prev, curr)
}

// ── statistics ───────────────────────────────────────────────────────────────

/** Split a raw artist field into the individual acts, incl. "(feat. …)" in the title. */
export function splitArtists(track: { trackName: string; artistName: string }): string[] {
  const out = new Set<string>()
  for (const part of track.artistName.split(/,\s*|\s+&\s+|\s+[x×]\s+/i)) {
    const p = part.trim()
    if (p) out.add(p)
  }
  const feat = /[\(\[]\s*(?:f(?:ea)?t|with)\.?\s+([^\)\]]+)[\)\]]/i.exec(track.trackName)
  if (feat) {
    for (const part of feat[1].split(/,\s*|\s+&\s+|\s+[x×]\s+|\s+und\s+/i)) {
      const p = part.trim()
      if (p) out.add(p)
    }
  }
  return [...out]
}

export function primaryArtist(artistName: string): string {
  return artistName.split(/,\s*|\s+&\s+/)[0].trim()
}

export interface PlaylistStats {
  trackCount: number
  artistCount: number
  albumCount: number
  repeatedCount: number
  topArtists: Array<{ name: string; count: number }>
  topAlbums: Array<{ name: string; artist: string; count: number }>
  decades: Array<{ decade: string; count: number }>
  yearsKnown: number
  oldest: { year: number; track: string; artist: string } | null
  newest: { year: number; track: string; artist: string } | null
  repeated: Array<{ track: string; artist: string; count: number }>
  collabs: Array<{ track: string; artists: string[] }>
}

export function computePlaylistStats(tracks: PlaylistTrack[]): PlaylistStats {
  const artistCounts = new Map<string, number>()
  const albumCounts = new Map<string, { name: string; artist: string; count: number }>()
  const decadeCounts = new Map<string, number>()
  const trackCounts = new Map<string, { track: string; artist: string; count: number }>()
  const collabs: Array<{ track: string; artists: string[] }> = []
  let yearsKnown = 0
  let oldest: PlaylistStats['oldest'] = null
  let newest: PlaylistStats['newest'] = null

  for (const t of tracks) {
    const artists = splitArtists(t)
    for (const a of artists) artistCounts.set(a, (artistCounts.get(a) ?? 0) + 1)
    if (artists.length > 1) collabs.push({ track: t.trackName, artists })
    if (t.albumName) {
      const key = `${t.albumName.toLowerCase()}::${primaryArtist(t.artistName).toLowerCase()}`
      const cur = albumCounts.get(key)
      if (cur) cur.count++
      else albumCounts.set(key, { name: t.albumName, artist: primaryArtist(t.artistName), count: 1 })
    }
    const tk = trackKey(t)
    const cur = trackCounts.get(tk)
    if (cur) cur.count++
    else trackCounts.set(tk, { track: t.trackName, artist: t.artistName, count: 1 })
    const year = t.releaseDate ? Number.parseInt(t.releaseDate.slice(0, 4), 10) : NaN
    if (Number.isFinite(year) && year > 1900 && year < 2100) {
      yearsKnown++
      const decade = `${Math.floor(year / 10) * 10}er`
      decadeCounts.set(decade, (decadeCounts.get(decade) ?? 0) + 1)
      if (!oldest || year < oldest.year) oldest = { year, track: t.trackName, artist: t.artistName }
      if (!newest || year > newest.year) newest = { year, track: t.trackName, artist: t.artistName }
    }
  }

  const repeated = [...trackCounts.values()].filter((t) => t.count > 1).sort((a, b) => b.count - a.count)
  return {
    trackCount: tracks.length,
    artistCount: artistCounts.size,
    albumCount: albumCounts.size,
    repeatedCount: repeated.reduce((sum, t) => sum + t.count - 1, 0),
    topArtists: [...artistCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count })),
    topAlbums: [...albumCounts.values()].sort((a, b) => b.count - a.count).slice(0, 10),
    decades: [...decadeCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([decade, count]) => ({ decade, count })),
    yearsKnown,
    oldest,
    newest,
    repeated,
    collabs,
  }
}

// ── export ───────────────────────────────────────────────────────────────────

export function playlistTracksToJson(tracks: PlaylistTrack[]): string {
  return JSON.stringify(
    tracks.map((t) => ({
      track: t.trackName,
      artist: t.artistName,
      album: t.albumName,
      added_at: t.addedAt,
      release_date: t.releaseDate,
      duration_ms: t.durationMs,
      spotify_uri: t.spotifyUri,
    })),
    null,
    2,
  )
}

export function playlistTracksToCsv(tracks: PlaylistTrack[]): string {
  const esc = (v: string | null) => {
    const s = v ?? ''
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = ['track,artist,album,added_at,release_date,duration_ms,spotify_uri']
  for (const t of tracks) {
    lines.push([esc(t.trackName), esc(t.artistName), esc(t.albumName), esc(t.addedAt), esc(t.releaseDate), t.durationMs ?? '', esc(t.spotifyUri)].join(','))
  }
  return lines.join('\n')
}
