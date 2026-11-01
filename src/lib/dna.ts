import type { Play, Review } from '../types'
import { countedPlays, playEffectiveMs, playIsEstimated } from '../db/plays'

/**
 * THE DNA — the musical identity engine.
 *
 * Every number here is computed from the user's own imported data only:
 * review genres/ratings/years, listening history, playlist snapshots.
 * What the data cannot answer (producers, lyrical styles, labels) is
 * surfaced as "waiting for the metadata stage" — never estimated.
 * Small samples are shown with their n, correlation is never sold as
 * causation.
 */

export interface GenreStat {
  genre: string
  count: number
  avgRating: number | null
  share: number
}

export interface EraStat {
  decade: string
  count: number
  avgRating: number | null
}

export interface SceneStat {
  scene: string
  count: number
  avgRating: number | null
}

export interface ArtistBehavior {
  artist: string
  minutes: number
  avgRating: number | null
  reviewCount: number
}

export interface MonthPoint {
  month: string
  minutes: number
  topArtist: string | null
  topArtistMinutes: number
}

export interface DnaResult {
  coverage: { reviews: number; ratedReviews: number; plays: number; skippedPlays: number; matchedPlayMs: number; totalPlayMs: number; estimatedPlayMs: number }
  genres: GenreStat[]
  genresByListening: Array<{ genre: string; minutes: number }>
  eras: EraStat[]
  scenes: SceneStat[]
  coastSplit: { scene: string; minutes: number }[]
  heardNotRated: ArtistBehavior[]
  ratedNotHeard: ArtistBehavior[]
  monthly: MonthPoint[]
  tasteShift: { recent: Array<{ artist: string; minutes: number }>; before: Array<{ artist: string; minutes: number }>; hasEnough: boolean } | null
  jazzShare: { inTopRated: number; overall: number; topRatedN: number } | null
  topRatedCoast: { topRated: Record<string, number>; overall: Record<string, number>; topRatedN: number } | null
}

function norm(s: string): string {
  return s.toLowerCase().trim()
}

function primaryArtist(artistName: string): string {
  return artistName.split(/,\s*|\s+&\s+/)[0].trim()
}

/** Scene buckets derived only from the user's own genre tags. */
const SCENE_RULES: Array<[RegExp, string]> = [
  [/east\s*coast/i, 'East Coast'],
  [/west\s*coast/i, 'West Coast'],
  [/southern|dirty south|atlanta|houston|memphis/i, 'Southern'],
  [/midwest|chicago|detroit/i, 'Midwest'],
  [/\buk\b|british|london/i, 'UK'],
  [/deutsch|german/i, 'Deutschland'],
  [/french|französisch/i, 'Frankreich'],
]

export function sceneOfGenres(genres: string[]): string | null {
  for (const g of genres) {
    for (const [re, scene] of SCENE_RULES) {
      if (re.test(g)) return scene
    }
  }
  return null
}

function decadeOf(year: number): string {
  return `${Math.floor(year / 10) * 10}er`
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
}

export function computeDna(reviews: Review[], plays: Play[]): DnaResult {
  // ── genre profile from the review archive (rating-weighted) ──
  const genreRatings = new Map<string, { count: number; ratings: number[] }>()
  for (const r of reviews) {
    for (const g of r.genres) {
      const cur = genreRatings.get(g) ?? { count: 0, ratings: [] }
      cur.count++
      if (r.rating !== null) cur.ratings.push(r.rating)
      genreRatings.set(g, cur)
    }
  }
  const totalGenreTags = [...genreRatings.values()].reduce((s, g) => s + g.count, 0)
  const genres: GenreStat[] = [...genreRatings.entries()]
    .map(([genre, v]) => ({ genre, count: v.count, avgRating: avg(v.ratings), share: totalGenreTags ? v.count / totalGenreTags : 0 }))
    .sort((a, b) => b.count - a.count || (b.avgRating ?? 0) - (a.avgRating ?? 0))

  // ── eras from review release years ──
  const eraMap = new Map<string, { count: number; ratings: number[] }>()
  for (const r of reviews) {
    if (!r.releaseYear) continue
    const d = decadeOf(r.releaseYear)
    const cur = eraMap.get(d) ?? { count: 0, ratings: [] }
    cur.count++
    if (r.rating !== null) cur.ratings.push(r.rating)
    eraMap.set(d, cur)
  }
  const eras: EraStat[] = [...eraMap.entries()]
    .map(([decade, v]) => ({ decade, count: v.count, avgRating: avg(v.ratings) }))
    .sort((a, b) => a.decade.localeCompare(b.decade))

  // ── scenes from the user's own genre tags ──
  const sceneMap = new Map<string, { count: number; ratings: number[] }>()
  for (const r of reviews) {
    const scene = sceneOfGenres(r.genres)
    if (!scene) continue
    const cur = sceneMap.get(scene) ?? { count: 0, ratings: [] }
    cur.count++
    if (r.rating !== null) cur.ratings.push(r.rating)
    sceneMap.set(scene, cur)
  }
  const scenes: SceneStat[] = [...sceneMap.entries()]
    .map(([scene, v]) => ({ scene, count: v.count, avgRating: avg(v.ratings) }))
    .sort((a, b) => b.count - a.count)

  // ── listening matched to archive albums (for genre/coast listening) ──
  const reviewByAlbum = new Map<string, Review>()
  for (const r of reviews) reviewByAlbum.set(`${norm(r.artist)}::${norm(r.albumTitle)}`, r)
  const genreMinutes = new Map<string, number>()
  const sceneMinutes = new Map<string, number>()
  let matchedPlayMs = 0
  let totalPlayMs = 0
  let estimatedPlayMs = 0
  for (const p of plays) {
    const ms = playEffectiveMs(p)
    if (playIsEstimated(p)) estimatedPlayMs += ms
    totalPlayMs += ms
    if (!p.albumName) continue
    const review = reviewByAlbum.get(`${norm(p.artistName)}::${norm(p.albumName)}`)
    if (!review) continue
    matchedPlayMs += ms
    for (const g of review.genres) genreMinutes.set(g, (genreMinutes.get(g) ?? 0) + ms)
    const scene = sceneOfGenres(review.genres)
    if (scene) sceneMinutes.set(scene, (sceneMinutes.get(scene) ?? 0) + ms)
  }
  const genresByListening = [...genreMinutes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([genre, ms]) => ({ genre, minutes: ms / 60000 }))
  const coastSplit = [...sceneMinutes.entries()].sort((a, b) => b[1] - a[1]).map(([scene, ms]) => ({ scene, minutes: ms / 60000 }))

  // ── contradictions: listening vs ratings per artist ──
  const artistMinutes = new Map<string, number>()
  for (const p of plays) {
    const a = primaryArtist(p.artistName)
    artistMinutes.set(a, (artistMinutes.get(a) ?? 0) + playEffectiveMs(p))
  }
  const artistRatings = new Map<string, number[]>()
  for (const r of reviews) {
    const cur = artistRatings.get(r.artist) ?? []
    if (r.rating !== null) cur.push(r.rating)
    artistRatings.set(r.artist, cur)
  }
  const behavior: ArtistBehavior[] = [...new Set([...artistMinutes.keys(), ...artistRatings.keys()])].map((artist) => ({
    artist,
    minutes: (artistMinutes.get(artist) ?? 0) / 60000,
    avgRating: avg(artistRatings.get(artist) ?? []),
    reviewCount: (artistRatings.get(artist) ?? []).length,
  }))
  const heardNotRated = behavior
    .filter((b) => b.minutes > 0 && (b.avgRating === null || b.avgRating < 7))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 8)
  const ratedNotHeard = behavior
    .filter((b) => b.avgRating !== null && b.avgRating >= 8 && b.minutes === 0)
    .sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0))
    .slice(0, 8)

  // ── development: monthly listening + top artist per month ──
  const byMonth = new Map<string, { ms: number; artists: Map<string, number> }>()
  for (const p of plays) {
    const m = p.playedAt.slice(0, 7)
    const cur = byMonth.get(m) ?? { ms: 0, artists: new Map() }
    const ms = playEffectiveMs(p)
    cur.ms += ms
    const a = primaryArtist(p.artistName)
    cur.artists.set(a, (cur.artists.get(a) ?? 0) + ms)
    byMonth.set(m, cur)
  }
  const monthly: MonthPoint[] = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]) => {
      const top = [...v.artists.entries()].sort((a, b) => b[1] - a[1])[0]
      return { month, minutes: Math.round(v.ms / 60000), topArtist: top?.[0] ?? null, topArtistMinutes: top ? Math.round(top[1] / 60000) : 0 }
    })

  // ── taste shift: second half vs first half of the imported range ──
  let tasteShift: DnaResult['tasteShift'] = null
  if (plays.length > 0) {
    const sorted = [...plays].sort((a, b) => a.playedAt.localeCompare(b.playedAt))
    const mid = sorted[Math.floor(sorted.length / 2)].playedAt
    const half = (lo: string, hi: string) => {
      const m = new Map<string, number>()
      for (const p of sorted) {
        if (p.playedAt < lo || p.playedAt >= hi) continue
        const a = primaryArtist(p.artistName)
        m.set(a, (m.get(a) ?? 0) + playEffectiveMs(p))
      }
      return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([artist, ms]) => ({ artist, minutes: Math.round(ms / 60000) }))
    }
    tasteShift = {
      before: half(sorted[0].playedAt, mid),
      recent: half(mid, '9999'),
      hasEnough: sorted.length >= 100,
    }
  }

  // ── example questions with real answers ──
  const isJazz = (r: Review) => r.genres.some((g) => /jazz/i.test(g))
  const rated = reviews.filter((r) => r.rating !== null)
  const topRated = rated.filter((r) => (r.rating ?? 0) >= 8)
  const jazzShare = rated.length >= 5
    ? {
        inTopRated: topRated.length ? topRated.filter(isJazz).length / topRated.length : 0,
        overall: rated.filter(isJazz).length / rated.length,
        topRatedN: topRated.length,
      }
    : null

  let topRatedCoast: DnaResult['topRatedCoast'] = null
  if (scenes.length > 0 && topRated.length >= 3) {
    const countScene = (list: Review[]) => {
      const out: Record<string, number> = {}
      for (const r of list) {
        const s = sceneOfGenres(r.genres)
        if (s) out[s] = (out[s] ?? 0) + 1
      }
      return out
    }
    topRatedCoast = { topRated: countScene(topRated), overall: countScene(rated), topRatedN: topRated.length }
  }

  return {
    coverage: {
      reviews: reviews.length,
      ratedReviews: rated.length,
      // skips (< 30 s, export only) count in listening minutes, not as plays
      plays: countedPlays(plays).length,
      skippedPlays: plays.length - countedPlays(plays).length,
      matchedPlayMs,
      totalPlayMs,
      estimatedPlayMs,
    },
    genres,
    genresByListening,
    eras,
    scenes,
    coastSplit,
    heardNotRated,
    ratedNotHeard,
    monthly,
    tasteShift,
    jazzShare,
    topRatedCoast,
  }
}
