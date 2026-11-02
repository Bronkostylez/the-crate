/**
 * Track credits — producers and writers from external sources.
 *
 * Sources: MusicBrainz (keyless, album-level: one release covers the whole
 * tracklist) and optionally Genius (per song, needs the user's client access
 * token from Settings). Every credit here is fetched from the source — never
 * guessed. A track without fetched credits simply has none; the UI says so
 * instead of estimating.
 *
 * MusicBrainz releases of the same album differ wildly in how completely the
 * community entered recording relationships (Hard to Earn: 3/17 tracks on one
 * release, full on another) — so we score up to 5 candidate releases and keep
 * the one with the best producer coverage.
 */
import type { Review, TrackCredit } from '../types'
import { albumKey, artistKey, normalizeName } from './artists'
import { db } from '../db/local'
import { getConfigValue } from './config'
import { getSupabase } from './supabase'
import { cloudSession } from './cloud'

const MB_API = 'https://musicbrainz.org/ws/2'
const GENIUS_API = 'https://api.genius.com'
const MB_UA = 'the-crate/1.0 (private music archive)'

/** deterministic credit id — same track re-fetched overwrites, never duplicates */
export function creditId(artist: string, albumTitle: string, trackTitle: string): string {
  return `${artistKey(artist)}::${albumKey(albumTitle)}::${normalizeName(trackTitle)}`
}

let lastMbCall = 0
async function mbThrottled(url: string): Promise<Response> {
  const gap = () => new Promise((r) => setTimeout(r, Math.max(0, 1100 - (Date.now() - lastMbCall))))
  await gap()
  lastMbCall = Date.now()
  let res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': MB_UA } })
  if (res.status === 503) {
    await new Promise((r) => setTimeout(r, 2500))
    lastMbCall = Date.now()
    res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': MB_UA } })
  }
  return res
}

let lastGeniusCall = 0
async function geniusThrottled(url: string, token: string): Promise<Response> {
  const gap = () => new Promise((r) => setTimeout(r, Math.max(0, 300 - (Date.now() - lastGeniusCall))))
  await gap()
  lastGeniusCall = Date.now()
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}

interface MbTrack {
  title: string
  number: number | null
  producers: string[]
  writers: string[]
}

interface MbRelease {
  id: string
  date?: string
  country?: string
  status?: string
}

/** best-coverage track credits for one MusicBrainz release-group id */
export async function fetchMbAlbumCredits(releaseGroupId: string, releaseYear: number | null): Promise<MbTrack[]> {
  const relRes = await mbThrottled(`${MB_API}/release?release-group=${encodeURIComponent(releaseGroupId)}&fmt=json&limit=25`)
  if (!relRes.ok) throw new Error(`MusicBrainz-Releases fehlgeschlagen (HTTP ${relRes.status})`)
  const relData = (await relRes.json()) as { releases: MbRelease[] }
  const official = relData.releases.filter((r) => r.status === 'Official')
  const candidates = (official.length > 0 ? official : relData.releases)
    .map((r) => {
      let score = 0
      if (releaseYear && r.date?.startsWith(String(releaseYear))) score += 4
      if (r.country && ['US', 'XW', 'GB', 'DE', 'EU'].includes(r.country)) score += 1
      return { r, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
  let best: MbTrack[] = []
  let bestWithProducer = -1
  for (const { r } of candidates) {
    const detRes = await mbThrottled(`${MB_API}/release/${r.id}?inc=recordings+recording-level-rels+artist-rels&fmt=json`)
    if (!detRes.ok) continue
    const det = (await detRes.json()) as {
      media?: Array<{ tracks?: Array<{ position?: number; title: string; recording?: { relations?: Array<{ type?: string; artist?: { name: string } }> } }> }>
    }
    const tracks: MbTrack[] = []
    for (const m of det.media ?? []) {
      for (const t of m.tracks ?? []) {
        const rels = t.recording?.relations ?? []
        tracks.push({
          title: t.title,
          number: t.position ?? null,
          producers: rels.filter((x) => x.type === 'producer' && x.artist?.name).map((x) => x.artist!.name),
          writers: rels.filter((x) => x.type === 'writer' && x.artist?.name).map((x) => x.artist!.name),
        })
      }
    }
    const withProducer = tracks.filter((t) => t.producers.length > 0).length
    if (withProducer > bestWithProducer || (withProducer === bestWithProducer && tracks.length > best.length)) {
      best = tracks
      bestWithProducer = withProducer
      if (tracks.length > 0 && withProducer === tracks.length) break // full coverage found
    }
  }
  return best
}

interface GeniusSongHit {
  id: number
  title: string
  primary_artist_names?: string
  primary_artist?: { name?: string }
}

/** producer/writer credits for one song from Genius (token from Settings) */
export async function fetchGeniusSongCredits(token: string, artist: string, trackTitle: string): Promise<{ producers: string[]; writers: string[] } | null> {
  const q = encodeURIComponent(`${artist} ${trackTitle}`)
  const searchRes = await geniusThrottled(`${GENIUS_API}/search?q=${q}&per_page=5`, token)
  if (!searchRes.ok) return null
  const search = (await searchRes.json()) as { response?: { hits?: Array<{ result: GeniusSongHit }> } }
  const hits = search.response?.hits ?? []
  const wanted = artistKey(artist)
  const hit = hits.find((h) => artistKey(h.result.primary_artist_names ?? h.result.primary_artist?.name ?? '') === wanted) ?? hits[0]
  if (!hit) return null
  const songRes = await geniusThrottled(`${GENIUS_API}/songs/${hit.result.id}`, token)
  if (!songRes.ok) return null
  const song = (await songRes.json()) as { response?: { song?: { producer_artists?: Array<{ name: string }>; writer_artists?: Array<{ name: string }> } } }
  const s = song.response?.song
  if (!s) return null
  return {
    producers: (s.producer_artists ?? []).map((a) => a.name),
    writers: (s.writer_artists ?? []).map((a) => a.name),
  }
}

export interface CreditsProgress {
  album: string
  done: number
  total: number
}

export interface CreditsSyncResult {
  albumsFetched: number
  tracksStored: number
  tracksWithProducer: number
  geniusFilled: number
  errors: string[]
}

/**
 * Fetch credits for every review that has none yet. MusicBrainz first
 * (album-level); Genius fills tracks still without producers when a token is
 * configured. Stored in Dexie, then pushed to the cloud when logged in.
 */
export async function syncCreditsForArchive(
  reviews: Review[],
  onProgress?: (p: CreditsProgress) => void,
): Promise<CreditsSyncResult> {
  const existing = new Set((await db.credits.toArray()).map((c) => `${artistKey(c.artist)}::${albumKey(c.albumTitle)}`))
  const pending = reviews.filter((r) => !existing.has(`${artistKey(r.artist)}::${albumKey(r.albumTitle)}`))
  const geniusToken = getConfigValue('geniusAccessToken')
  const result: CreditsSyncResult = { albumsFetched: 0, tracksStored: 0, tracksWithProducer: 0, geniusFilled: 0, errors: [] }
  const fetchedAt = new Date().toISOString()

  for (let i = 0; i < pending.length; i++) {
    const r = pending[i]
    onProgress?.({ album: `${r.artist} — ${r.albumTitle}`, done: i, total: pending.length })
    try {
      const rgId = r.metadataProviderId?.startsWith('musicbrainz:') ? r.metadataProviderId.slice('musicbrainz:'.length) : null
      if (!rgId) {
        result.errors.push(`${r.artist} — ${r.albumTitle}: keine MusicBrainz-ID am Review`)
        continue
      }
      const mbTracks = await fetchMbAlbumCredits(rgId, r.releaseYear)
      const credits: TrackCredit[] = []
      for (const t of mbTracks) {
        let producers = t.producers
        let writers = t.writers
        let source: TrackCredit['source'] = 'musicbrainz'
        if (producers.length === 0 && geniusToken) {
          const g = await fetchGeniusSongCredits(geniusToken, r.artist, t.title)
          if (g && g.producers.length > 0) {
            producers = g.producers
            if (writers.length === 0) writers = g.writers
            source = 'genius'
            result.geniusFilled++
          }
        }
        credits.push({
          id: creditId(r.artist, r.albumTitle, t.title),
          artist: r.artist,
          albumTitle: r.albumTitle,
          trackTitle: t.title,
          trackNumber: t.number,
          producers,
          writers,
          source,
          fetchedAt,
        })
      }
      if (credits.length > 0) {
        await db.credits.bulkPut(credits)
        result.albumsFetched++
        result.tracksStored += credits.length
        result.tracksWithProducer += credits.filter((c) => c.producers.length > 0).length
      }
    } catch (e) {
      result.errors.push(`${r.artist} — ${r.albumTitle}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  onProgress?.({ album: '', done: pending.length, total: pending.length })

  // push to the cloud so other devices share the backfill (merge, never delete)
  const user = await cloudSession()
  const supabase = getSupabase()
  if (user && supabase && result.tracksStored > 0) {
    const rows = (await db.credits.toArray()).map((c) => ({
      user_id: user.id,
      artist: c.artist,
      album_title: c.albumTitle,
      track_title: c.trackTitle,
      track_number: c.trackNumber,
      producers: c.producers,
      writers: c.writers,
      source: c.source,
      fetched_at: c.fetchedAt,
    }))
    for (let i = 0; i < rows.length; i += 200) {
      await supabase.from('track_credits').upsert(rows.slice(i, i + 200), { onConflict: 'user_id,artist,album_title,track_title' })
    }
  }
  return result
}

/** pull cloud credits missing locally (called from sync flows) */
export async function pullCreditsFromCloud(): Promise<number> {
  const user = await cloudSession()
  const supabase = getSupabase()
  if (!user || !supabase) return 0
  const { data, error } = await supabase.from('track_credits').select('artist, album_title, track_title, track_number, producers, writers, source, fetched_at').limit(5000)
  if (error || !data) return 0
  const local = new Set((await db.credits.toArray()).map((c) => c.id))
  const rows = data as Array<{ artist: string; album_title: string; track_title: string; track_number: number | null; producers: string[]; writers: string[]; source: TrackCredit['source']; fetched_at: string }>
  const missing: TrackCredit[] = rows
    .map((r) => ({
      id: creditId(r.artist, r.album_title, r.track_title),
      artist: r.artist,
      albumTitle: r.album_title,
      trackTitle: r.track_title,
      trackNumber: r.track_number,
      producers: r.producers ?? [],
      writers: r.writers ?? [],
      source: r.source,
      fetchedAt: r.fetched_at,
    }))
    .filter((c) => !local.has(c.id))
  if (missing.length > 0) await db.credits.bulkPut(missing)
  return missing.length
}

/** normalized producer key — same person across spellings */
function producerKey(name: string): string {
  const k = normalizeName(name)
  if (k === 'dj premiere') return 'dj premier'
  return k
}

export interface ProducerDna {
  coverage: { albumsWithCredits: number; albumsTotal: number; tracksWithCredits: number; tracksWithProducer: number }
  premier: {
    tracks: number
    shareOfCredited: number
    albums: string[]
    bestPickHits: number
    bestPickTotal: number
    avgRatingWith: number | null
    avgRatingWithout: number | null
    nWith: number
    nWithout: number
  }
  topFavorites: Array<{ name: string; tracks: number; share: number }>
  favoritesTrackN: number
  favoritesAlbumN: number
}

/** producer answers for The DNA — from fetched credits only, gaps shown as gaps */
export function computeProducerDna(reviews: Review[], credits: TrackCredit[]): ProducerDna | null {
  if (credits.length === 0) return null
  const byAlbum = new Map<string, TrackCredit[]>()
  for (const c of credits) {
    const k = `${artistKey(c.artist)}::${albumKey(c.albumTitle)}`
    const list = byAlbum.get(k) ?? []
    list.push(c)
    byAlbum.set(k, list)
  }
  const albumWithCredits = reviews.filter((r) => byAlbum.has(`${artistKey(r.artist)}::${albumKey(r.albumTitle)}`))

  const isPremier = (c: TrackCredit) => c.producers.some((p) => producerKey(p) === 'dj premier')
  const premierAlbums: string[] = []
  const ratingsWith: number[] = []
  const ratingsWithout: number[] = []
  let premierTracks = 0
  let creditedTracks = 0
  let premierBestPicks = 0
  let bestPickTotal = 0

  for (const r of albumWithCredits) {
    const list = byAlbum.get(`${artistKey(r.artist)}::${albumKey(r.albumTitle)}`) ?? []
    const albumPremierTracks = list.filter(isPremier)
    creditedTracks += list.filter((c) => c.producers.length > 0).length
    premierTracks += albumPremierTracks.length
    if (albumPremierTracks.length > 0) {
      premierAlbums.push(r.albumTitle)
      if (r.rating !== null) ratingsWith.push(r.rating)
    } else if (r.rating !== null) {
      ratingsWithout.push(r.rating)
    }
    const premierTrackKeys = new Set(albumPremierTracks.map((c) => normalizeName(c.trackTitle)))
    for (const pick of r.bestTracks) {
      bestPickTotal++
      if (premierTrackKeys.has(normalizeName(pick))) premierBestPicks++
    }
  }

  // producer ranking across the favorites (rating >= 8), per credited track
  const topRated = reviews.filter((r) => r.rating !== null && r.rating >= 8)
  const favCounts = new Map<string, { name: string; tracks: number }>()
  let favCreditedTracks = 0
  for (const r of topRated) {
    const list = byAlbum.get(`${artistKey(r.artist)}::${albumKey(r.albumTitle)}`) ?? []
    for (const c of list) {
      if (c.producers.length === 0) continue
      favCreditedTracks++
      for (const p of c.producers) {
        const k = producerKey(p)
        const cur = favCounts.get(k) ?? { name: p, tracks: 0 }
        cur.tracks++
        favCounts.set(k, cur)
      }
    }
  }
  const topFavorites = [...favCounts.values()]
    .sort((a, b) => b.tracks - a.tracks)
    .slice(0, 5)
    .map((x) => ({ ...x, share: favCreditedTracks ? x.tracks / favCreditedTracks : 0 }))

  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null)
  return {
    coverage: {
      albumsWithCredits: albumWithCredits.length,
      albumsTotal: reviews.length,
      tracksWithCredits: credits.length,
      tracksWithProducer: credits.filter((c) => c.producers.length > 0).length,
    },
    premier: {
      tracks: premierTracks,
      shareOfCredited: creditedTracks ? premierTracks / creditedTracks : 0,
      albums: premierAlbums,
      bestPickHits: premierBestPicks,
      bestPickTotal,
      avgRatingWith: avg(ratingsWith),
      avgRatingWithout: avg(ratingsWithout),
      nWith: ratingsWith.length,
      nWithout: ratingsWithout.length,
    },
    topFavorites,
    favoritesTrackN: favCreditedTracks,
    favoritesAlbumN: topRated.length,
  }
}
