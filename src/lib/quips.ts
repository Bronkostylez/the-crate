import type { Play, Review } from '../types'
import { computeMilestones, splitMilestones } from './milestones'

/**
 * Personal quips — one cheeky line, computed from real data only, rotating
 * every few hours. The rotation is deterministic: the current time window
 * picks the quip, no server, no storage. Same window, same line; the next
 * window deals a new one. Tone: hip-hop swagger with a wink — the jokes
 * poke at the listener, never at the music.
 */

export type QuipSpot = 'overview' | 'tagging' | 'milestones'

const WINDOW_MS = 3 * 60 * 60 * 1000 // a new quip every 3 hours

/** cheap string hash → stable per window + spot */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export interface QuipData {
  reviews: Review[]
  plays: Play[]
  /** tagging only: the album currently on the table */
  current?: Review
  /** tagging only: albums still waiting for a genre */
  untagged?: number
}

interface Candidate {
  when: (d: QuipData) => boolean
  lines: (d: QuipData) => string[]
}

const topArtist = (d: QuipData) => {
  const c = new Map<string, number>()
  for (const p of d.plays) c.set(p.artistName, (c.get(p.artistName) ?? 0) + 1)
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]
}
const hoursHeard = (d: QuipData) => d.plays.reduce((s, p) => s + (p.msPlayed || (p.durationMs ?? 0)), 0) / 3600000
const rated = (d: QuipData) => d.reviews.filter((r) => r.rating !== null)
const avg = (d: QuipData) => {
  const r = rated(d)
  return r.length ? r.reduce((s, x) => s + (x.rating ?? 0), 0) / r.length : 0
}
const tens = (d: QuipData) => d.reviews.filter((r) => r.rating === 10).length
const genreCount = (d: QuipData) => new Set(d.reviews.flatMap((r) => r.genres)).size
const unratedCount = (d: QuipData) => d.reviews.filter((r) => r.rating === null).length
const lowest = (d: QuipData) => [...rated(d)].sort((a, b) => (a.rating ?? 99) - (b.rating ?? 99))[0]
const newest = (d: QuipData) =>
  [...d.reviews].sort((a, b) => (b.reviewDate ?? b.createdAt).localeCompare(a.reviewDate ?? a.createdAt))[0]
const topTrack = (d: QuipData) => {
  const c = new Map<string, number>()
  for (const p of d.plays) c.set(p.trackName, (c.get(p.trackName) ?? 0) + 1)
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]
}

const POOLS: Record<QuipSpot, Candidate[]> = {
  overview: [
    { when: (d) => tens(d) >= 5, lines: (d) => [
      `${tens(d)} perfekte 10en. Deine Messlatte hat offiziell aufgegeben.`,
      `${tens(d)} Alben mit 10/10. Entweder Kanon, oder du verteilst Noten wie Flyer.`,
    ] },
    { when: (d) => avg(d) >= 8.5 && rated(d).length > 0, lines: (d) => [
      `Ø ${avg(d).toFixed(1)}. Entweder Geschmack, oder du traust dich nicht, ehrlich zu sein.`,
      `Dein Schnitt ist ${avg(d).toFixed(1)}. Das Regal kuscht vor dir.`,
    ] },
    { when: (d) => rated(d).length >= 5 && avg(d) < 8.5, lines: (d) => [
      `Ø ${avg(d).toFixed(1)}. Da ist noch Luft nach oben, Champ.`,
    ] },
    { when: (d) => d.plays.length > 0 && topArtist(d) !== undefined, lines: (d) => [
      `${topArtist(d)![1]} Plays ${topArtist(d)![0]}. Suchtberatung gibt es woanders.`,
      `${topArtist(d)![0]} auf Platz 1. Die Überraschung des Jahrhunderts.`,
      `${topArtist(d)![0]} läuft bei dir öfter als die Tagesschau.`,
    ] },
    { when: (d) => d.reviews.some((r) => r.albumTitle === 'Illmatic' && r.rating === 10), lines: () => [
      'Illmatic 10/10. Mutig. Ungefähr so mutig wie Wasser nass zu nennen.',
    ] },
    { when: (d) => genreCount(d) >= 5, lines: (d) => [
      `${genreCount(d)} Genres im Regal. The DNA kennt dich besser als dein Umfeld.`,
    ] },
    { when: (d) => hoursHeard(d) >= 5, lines: (d) => [
      `${Math.round(hoursHeard(d))} Stunden Hip-Hop. Hätte auch ein Studium sein können. War besser so.`,
      `${Math.round(hoursHeard(d))} Stunden gehört. Die Nachbarn kennen jeden Beat mit.`,
    ] },
    { when: (d) => topTrack(d) !== undefined && topTrack(d)![1] >= 10, lines: (d) => [
      `„${topTrack(d)![0]}" — ${topTrack(d)![1]} Mal. Wir wissen beide, dass du den Song suchtest.`,
    ] },
    { when: (d) => unratedCount(d) > 0, lines: (d) => [
      `${unratedCount(d)} ${unratedCount(d) === 1 ? 'Album' : 'Alben'} ohne Bewertung. Feigling-Modus aktiv.`,
    ] },
    { when: (d) => lowest(d) !== undefined && (lowest(d).rating ?? 10) <= 7, lines: (d) => [
      `„${lowest(d).albumTitle}" mit ${lowest(d).rating}/10. Aua. Aber ehrlich.`,
    ] },
    { when: (d) => newest(d) !== undefined, lines: (d) => [
      `Zuletzt rezensiert: ${newest(d).albumTitle}. Das Regal wächst, die Reue bleibt aus.`,
    ] },
  ],
  tagging: [
    { when: (d) => (d.untagged ?? 0) > 3, lines: (d) => [
      `Noch ${d.untagged} ohne Genre. Das Regal taggt sich nicht von selbst, Chef.`,
      `${d.untagged} Alben warten auf ihr Genre. Sie warten sehr höflich.`,
    ] },
    { when: (d) => (d.untagged ?? 0) >= 1 && (d.untagged ?? 0) <= 3, lines: (d) => [
      `Nur noch ${d.untagged}. Die Ziellinie winkt schon.`,
    ] },
    { when: (d) => !!d.current && d.reviews.filter((r) => r.artist === d.current!.artist).length >= 2, lines: (d) => [
      `${d.current!.artist} schon wieder. Man könnte fast meinen, du bist Fan.`,
    ] },
    { when: (d) => !!d.current && d.current!.genres.length === 0, lines: (d) => [
      `„${d.current!.albumTitle}" trägt noch kein Genre. Es wartet. Geduldig. Schon eine Weile.`,
    ] },
    { when: (d) => !!d.current && d.current!.rating === 10, lines: () => [
      'Eine 10/10 taggst du gerade. Handle mit Respekt.',
    ] },
    { when: (d) => genreCount(d) >= 5, lines: (d) => [
      `${genreCount(d)} Genres in deiner Taxonomie. Ordnung muss sein, auch im Chaos.`,
    ] },
  ],
  milestones: [
    { when: (d) => d.reviews.some((r) => r.albumTitle === 'Illmatic') && d.plays.filter((p) => p.albumName === 'Illmatic').length >= 100, lines: () => [
      'Über 100 Plays Illmatic. Nas würde nicken. Kurz, aber er würde nicken.',
    ] },
    { when: (d) => splitMilestones(computeMilestones(d.reviews, d.plays)).reached.length > 0, lines: (d) => [
      `${splitMilestones(computeMilestones(d.reviews, d.plays)).reached.length} Meilensteine geknackt. Die Vitrine staubt nicht.`,
    ] },
    { when: (d) => splitMilestones(computeMilestones(d.reviews, d.plays)).upcoming.length > 0, lines: (d) => {
      const next = [...splitMilestones(computeMilestones(d.reviews, d.plays)).upcoming].sort((a, b) => a.target - a.current - (b.target - b.current))[0]
      return [
        `Nächstes Ziel: ${next.subject} — noch ${next.target - next.current} ${next.verb}. Fast. Sehr fast.`,
        `${next.subject}: noch ${next.target - next.current} ${next.verb} bis zum nächsten Pokal. Du schaffst das. Wahrscheinlich.`,
      ]
    } },
    { when: (d) => hoursHeard(d) >= 24, lines: (d) => [
      `Über ${Math.floor(hoursHeard(d))} Stunden gehört. Ein kompletter Tag deines Lebens. Gut investiert.`,
    ] },
  ],
}

/**
 * The line for a spot right now. Deterministic per 3-hour window and spot:
 * same window → same line, next window → the hash deals a new candidate and
 * variant. Returns null when nothing fits (e.g. no data yet) — callers
 * render nothing then, calm screens stay calm.
 */
export function pickQuip(spot: QuipSpot, data: QuipData, now: number = Date.now()): string | null {
  if (data.reviews.length === 0) return null
  const eligible = POOLS[spot].filter((c) => c.when(data))
  if (eligible.length === 0) return null
  const window = Math.floor(now / WINDOW_MS)
  const h = hash(`${spot}:${window}`)
  const candidate = eligible[h % eligible.length]
  const lines = candidate.lines(data)
  return lines[Math.floor(h / eligible.length) % lines.length]
}
