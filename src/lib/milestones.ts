import type { Play, Review } from '../types'
import { countedPlays } from '../db/plays'

/**
 * Milestones, computed only from real data. A milestone's reachedAt is the
 * timestamp of the exact event that crossed the line (the 100th play's
 * playedAt, the 25th review's createdAt) — never an invented date.
 */

export interface Milestone {
  id: string
  /** e.g. "Illmatic", "Nas", "Gesamt", "Perfekte 10en" */
  subject: string
  /** what is counted, e.g. "Plays", "Reviews", "Stunden" */
  verb: string
  target: number
  current: number
  /** ISO timestamp of the crossing event; null while unreached */
  reachedAt: string | null
  /** true when the current value mixes in ca.-estimates (live-sync minutes) */
  estimated?: boolean
}

const norm = (s: string) => s.trim().toLowerCase()

const ENTITY_THRESHOLDS = [10, 25, 50, 100, 250, 500, 1000]
const TOTAL_PLAY_THRESHOLDS = [100, 250, 500, 1000, 2500, 5000, 10000]
const REVIEW_THRESHOLDS = [10, 25, 50, 75, 100, 150, 200, 300]
const PERFECT_TEN_THRESHOLDS = [5, 10, 25, 50]
const HOUR_THRESHOLDS = [5, 10, 24, 50, 100, 250, 500, 1000]

function entityMilestones(
  kind: string,
  groups: Map<string, { label: string; dates: string[] }>,
): Milestone[] {
  const out: Milestone[] = []
  for (const [key, g] of groups) {
    const dates = [...g.dates].sort()
    for (const t of ENTITY_THRESHOLDS) {
      out.push({
        id: `${kind}:${key}:${t}`,
        subject: g.label,
        verb: 'Plays',
        target: t,
        current: dates.length,
        reachedAt: dates.length >= t ? dates[t - 1] : null,
      })
      if (dates.length < t) break // only the nearest unreached per entity
    }
  }
  return out
}

export function computeMilestones(reviews: Review[], plays: Play[]): Milestone[] {
  const out: Milestone[] = []

  // play milestones count only real plays — skips (< 30 s, export only) are
  // filtered. Listening hours below keep every second, skips included.
  const counted = countedPlays(plays)

  // per album / artist / track
  const albums = new Map<string, { label: string; dates: string[] }>()
  const artists = new Map<string, { label: string; dates: string[] }>()
  const tracks = new Map<string, { label: string; dates: string[] }>()
  const add = (map: Map<string, { label: string; dates: string[] }>, key: string, label: string, at: string) => {
    const g = map.get(key) ?? { label, dates: [] }
    g.dates.push(at)
    map.set(key, g)
  }
  for (const p of counted) {
    add(artists, norm(p.artistName), p.artistName, p.playedAt)
    add(tracks, `${norm(p.artistName)}|${norm(p.trackName)}`, `${p.trackName} — ${p.artistName}`, p.playedAt)
    if (p.albumName) add(albums, `${norm(p.artistName)}|${norm(p.albumName)}`, p.albumName, p.playedAt)
  }
  out.push(...entityMilestones('album', albums))
  out.push(...entityMilestones('artist', artists))
  out.push(...entityMilestones('track', tracks))

  // total plays
  const playDates = counted.map((p) => p.playedAt).sort()
  for (const t of TOTAL_PLAY_THRESHOLDS) {
    out.push({
      id: `total:${t}`,
      subject: 'Gesamt',
      verb: 'Plays',
      target: t,
      current: counted.length,
      reachedAt: counted.length >= t ? playDates[t - 1] : null,
    })
    if (counted.length < t) break
  }

  // archive size (createdAt = wann die Review ins Archiv kam; importierte
  // Reviews fallen ehrlich auf den Import-Tag)
  const reviewDates = reviews.map((r) => r.createdAt).sort()
  for (const t of REVIEW_THRESHOLDS) {
    out.push({
      id: `reviews:${t}`,
      subject: 'Reviews im Archiv',
      verb: 'Reviews',
      target: t,
      current: reviews.length,
      reachedAt: reviews.length >= t ? reviewDates[t - 1] : null,
    })
    if (reviews.length < t) break
  }

  // perfect tens
  const tenDates = reviews.filter((r) => r.rating === 10).map((r) => r.createdAt).sort()
  for (const t of PERFECT_TEN_THRESHOLDS) {
    out.push({
      id: `tens:${t}`,
      subject: 'Perfekte 10en',
      verb: 'Reviews',
      target: t,
      current: tenDates.length,
      reachedAt: tenDates.length >= t ? tenDates[t - 1] : null,
    })
    if (tenDates.length < t) break
  }

  // listening hours — real ms where exported, ca. from durationMs elsewhere
  const totalMs = plays.reduce((s, p) => s + (p.msPlayed > 0 ? p.msPlayed : (p.durationMs ?? 0)), 0)
  const estimated = plays.some((p) => p.msPlayed === 0 && (p.durationMs ?? 0) > 0)
  const hours = totalMs / 3_600_000
  const hourDates = (() => {
    // cumulative listening time over time, to date each crossed hour line
    let acc = 0
    const marks: Array<{ hours: number; at: string }> = []
    for (const p of [...plays].sort((a, b) => a.playedAt.localeCompare(b.playedAt))) {
      acc += p.msPlayed > 0 ? p.msPlayed : (p.durationMs ?? 0)
      marks.push({ hours: acc / 3_600_000, at: p.playedAt })
    }
    return marks
  })()
  for (const t of HOUR_THRESHOLDS) {
    const cross = hourDates.find((m) => m.hours >= t)
    out.push({
      id: `hours:${t}`,
      subject: 'Hörzeit gesamt',
      verb: 'Stunden',
      target: t,
      current: hours,
      reachedAt: hours >= t && cross ? cross.at : null,
      estimated,
    })
    if (hours < t) break
  }

  return out
}

export function splitMilestones(all: Milestone[]): { reached: Milestone[]; upcoming: Milestone[] } {
  const reached = all
    .filter((m) => m.reachedAt !== null)
    .sort((a, b) => (b.reachedAt ?? '').localeCompare(a.reachedAt ?? ''))
  // only the nearest unreached milestone per series, best progress first
  const upcoming = all
    .filter((m) => m.reachedAt === null)
    .sort((a, b) => b.current / b.target - a.current / a.target)
  return { reached, upcoming }
}
