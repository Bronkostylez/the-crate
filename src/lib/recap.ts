import type { Play, Review } from '../types'
import { playEffectiveMs, playIsEstimated } from '../db/plays'

/**
 * THE RECAP — monthly and yearly listening recaps.
 * Everything is computed from real plays; the humorous observations only
 * fire when their underlying numbers are real.
 */

export interface RecapTopArtist { name: string; ms: number; plays: number }
export interface RecapTopTrack { name: string; artist: string; ms: number; plays: number }
export interface RecapTopAlbum { name: string; artist: string; ms: number }

export interface Recap {
  label: string
  prevLabel: string | null
  playCount: number
  totalMs: number
  /** part of totalMs estimated from track lengths (live sync), not exact export minutes */
  estimatedMs: number
  activeDays: number
  topArtists: RecapTopArtist[]
  topTracks: RecapTopTrack[]
  topAlbums: RecapTopAlbum[]
  topGenres: Array<{ genre: string; ms: number }>
  newArtists: string[]
  bestDay: { date: string; ms: number } | null
  comparison: { prevMs: number; deltaPct: number | null; prevTopArtist: string | null } | null
  observations: string[]
}

const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

export interface PeriodOption {
  year: number
  month: number | null
  label: string
}

/** All periods that contain at least one play, newest first. */
export function listPeriods(plays: Play[]): PeriodOption[] {
  const years = new Set<number>()
  const months = new Set<string>()
  for (const p of plays) {
    const d = new Date(p.playedAt)
    years.add(d.getFullYear())
    months.add(`${d.getFullYear()}-${d.getMonth()}`)
  }
  const out: PeriodOption[] = []
  for (const y of [...years].sort((a, b) => b - a)) {
    out.push({ year: y, month: null, label: `Jahr ${y}` })
    for (const key of [...months].sort().reverse()) {
      const [my, mm] = key.split('-').map(Number)
      if (my === y) out.push({ year: y, month: mm, label: `${MONTH_NAMES[mm]} ${y}` })
    }
  }
  return out
}

function primaryArtist(artistName: string): string {
  return artistName.split(/,\s*|\s+&\s+/)[0].trim()
}

function inPeriod(p: Play, year: number, month: number | null): boolean {
  const d = new Date(p.playedAt)
  return d.getFullYear() === year && (month === null || d.getMonth() === month)
}

function prevPeriod(year: number, month: number | null): { year: number; month: number | null; label: string } {
  if (month === null) return { year: year - 1, month: null, label: `Jahr ${year - 1}` }
  if (month === 0) return { year: year - 1, month: 11, label: `Dezember ${year - 1}` }
  return { year, month: month - 1, label: `${MONTH_NAMES[month - 1]} ${year}` }
}

export function computeRecap(plays: Play[], reviews: Review[], year: number, month: number | null): Recap {
  const label = month === null ? `Jahr ${year}` : `${MONTH_NAMES[month]} ${year}`
  const prev = prevPeriod(year, month)
  const cur = plays.filter((p) => inPeriod(p, year, month))
  const prevPlays = plays.filter((p) => inPeriod(p, prev.year, prev.month))

  const totalMs = cur.reduce((s, p) => s + playEffectiveMs(p), 0)
  const prevMs = prevPlays.reduce((s, p) => s + playEffectiveMs(p), 0)
  const estimatedMs = cur.reduce((s, p) => s + (playIsEstimated(p) ? playEffectiveMs(p) : 0), 0)

  const days = new Map<string, number>()
  for (const p of cur) {
    const day = p.playedAt.slice(0, 10)
    days.set(day, (days.get(day) ?? 0) + playEffectiveMs(p))
  }
  const bestDayEntry = [...days.entries()].sort((a, b) => b[1] - a[1])[0]

  const artistMs = new Map<string, { ms: number; plays: number }>()
  const trackMs = new Map<string, { name: string; artist: string; ms: number; plays: number }>()
  const albumMs = new Map<string, { name: string; artist: string; ms: number }>()
  for (const p of cur) {
    const ms = playEffectiveMs(p)
    const a = primaryArtist(p.artistName)
    const ea = artistMs.get(a) ?? { ms: 0, plays: 0 }
    ea.ms += ms; ea.plays++; artistMs.set(a, ea)
    const tk = `${p.trackName}::${p.artistName}`
    const et = trackMs.get(tk) ?? { name: p.trackName, artist: p.artistName, ms: 0, plays: 0 }
    et.ms += ms; et.plays++; trackMs.set(tk, et)
    if (p.albumName) {
      const ak = `${p.albumName}::${a}`
      const el = albumMs.get(ak) ?? { name: p.albumName, artist: a, ms: 0 }
      el.ms += ms; albumMs.set(ak, el)
    }
  }

  const prevArtistMs = new Map<string, number>()
  for (const p of prevPlays) {
    const a = primaryArtist(p.artistName)
    prevArtistMs.set(a, (prevArtistMs.get(a) ?? 0) + playEffectiveMs(p))
  }
  const prevTopArtist = [...prevArtistMs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  // genres via album match against the review archive
  const reviewByAlbum = new Map<string, Review>()
  for (const r of reviews) reviewByAlbum.set(`${r.artist.toLowerCase()}::${r.albumTitle.toLowerCase()}`, r)
  const genreMs = new Map<string, number>()
  const decadeMs = new Map<string, number>()
  for (const p of cur) {
    if (!p.albumName) continue
    const review = reviewByAlbum.get(`${p.artistName.toLowerCase()}::${p.albumName.toLowerCase()}`)
    if (!review) continue
    const ms = playEffectiveMs(p)
    for (const g of review.genres) genreMs.set(g, (genreMs.get(g) ?? 0) + ms)
    if (review.releaseYear) {
      const d = `${Math.floor(review.releaseYear / 10) * 10}er`
      decadeMs.set(d, (decadeMs.get(d) ?? 0) + ms)
    }
  }

  // discoveries: artists whose first-ever play falls inside the period
  const firstPlay = new Map<string, string>()
  for (const p of [...plays].sort((a, b) => a.playedAt.localeCompare(b.playedAt))) {
    const a = primaryArtist(p.artistName)
    if (!firstPlay.has(a)) firstPlay.set(a, p.playedAt)
  }
  const newArtists = [...firstPlay.entries()]
    .filter(([, first]) => {
      const d = new Date(first)
      return d.getFullYear() === year && (month === null || d.getMonth() === month)
    })
    .map(([a]) => a)
    .sort()

  const topArtists = [...artistMs.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 5).map(([name, v]) => ({ name, ...v }))
  const topTracks = [...trackMs.values()].sort((a, b) => b.ms - a.ms).slice(0, 5)
  const topAlbums = [...albumMs.values()].sort((a, b) => b.ms - a.ms).slice(0, 5)
  const topGenres = [...genreMs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([genre, ms]) => ({ genre, ms }))

  // ── observations: every line needs its numbers ──
  const observations: string[] = []
  if (totalMs > 0 && topArtists.length > 0) {
    const top = topArtists[0]
    const share = top.ms / totalMs
    if (share >= 0.25) observations.push(`${top.name} ist praktisch bei dir eingezogen — ${Math.round(share * 100)}% deiner Hörzeit in diesem Zeitraum.`)
    else observations.push(`${top.name} führt deine Rotation an — ${Math.round(share * 100)}% deiner Hörzeit.`)
  }
  const matchedDecadeMs = [...decadeMs.values()].reduce((a, b) => a + b, 0)
  if (matchedDecadeMs > 0) {
    const [decade, ms] = [...decadeMs.entries()].sort((a, b) => b[1] - a[1])[0]
    const pct = Math.round((ms / matchedDecadeMs) * 100)
    if (decade === '1990er' && pct >= 50) observations.push(`Du hast eine ernsthafte Beziehung zu den 90ern: ${pct}% deiner matchbaren Hörzeit.`)
    else if (pct >= 50) observations.push(`${pct}% deiner matchbaren Hörzeit laufen in den ${decade}.`)
  }
  if (newArtists.length > 0) {
    observations.push(newArtists.length === 1
      ? `Ein neuer Artist im Universum: ${newArtists[0]}.`
      : `${newArtists.length} neue Artists entdeckt — unter anderem ${newArtists.slice(0, 3).join(', ')}.`)
  }
  if (bestDayEntry && days.size > 1) {
    observations.push(`Dein intensivster Tag: der ${new Date(bestDayEntry[0]).toLocaleDateString('de-DE')} mit ${formatMs(bestDayEntry[1])}.`)
  }
  if (prevMs > 0 && totalMs > 0) {
    const delta = Math.round(((totalMs - prevMs) / prevMs) * 100)
    if (delta >= 20) observations.push(`${delta}% mehr Hörzeit als im ${prev.label} — jemand war hungrig.`)
    else if (delta <= -20) observations.push(`${Math.abs(delta)}% weniger als im ${prev.label} — warst du etwa draußen?`)
  }
  if (prevTopArtist && topArtists.length > 0 && prevTopArtist !== topArtists[0].name) {
    observations.push(`Thronwechsel: ${prevTopArtist} übergibt an ${topArtists[0].name}.`)
  }

  return {
    label,
    prevLabel: prevPlays.length > 0 ? prev.label : null,
    playCount: cur.length,
    totalMs,
    estimatedMs,
    activeDays: days.size,
    topArtists,
    topTracks,
    topAlbums,
    topGenres,
    newArtists,
    bestDay: bestDayEntry ? { date: bestDayEntry[0], ms: bestDayEntry[1] } : null,
    comparison: prevPlays.length > 0 ? { prevMs, deltaPct: prevMs > 0 ? Math.round(((totalMs - prevMs) / prevMs) * 100) : null, prevTopArtist } : null,
    observations,
  }
}

function formatMs(ms: number): string {
  const mins = Math.round(ms / 60000)
  const h = Math.floor(mins / 60)
  return h > 0 ? `${h} Std ${mins % 60} Min` : `${mins} Min`
}

