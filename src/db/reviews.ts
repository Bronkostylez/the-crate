import { db } from './local'
import { normalizeKey } from '../lib/utils'
import type { Review, ReviewDraft, DuplicateStrategy, ValidatedImportRow, ImportIssue } from '../types'

function now(): string {
  return new Date().toISOString()
}

export async function createReview(draft: ReviewDraft): Promise<Review> {
  const review: Review = { ...draft, id: crypto.randomUUID(), createdAt: now(), updatedAt: now() }
  await db.reviews.add(review)
  return review
}

export async function updateReview(id: string, draft: ReviewDraft): Promise<void> {
  await db.reviews.update(id, { ...draft, updatedAt: now() })
}

export async function deleteReview(id: string): Promise<void> {
  await db.reviews.delete(id)
}

export async function getReview(id: string): Promise<Review | undefined> {
  return db.reviews.get(id)
}

export async function clearAllReviews(): Promise<void> {
  await db.reviews.clear()
}

// ── import ──────────────────────────────────────────────────────────────

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim())

function strList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(str).filter(Boolean)
  return str(v)
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Validate one raw row (already key-normalized) into a draft + issues. */
export function validateRow(rowNumber: number, raw: Record<string, unknown>): { draft: ReviewDraft | null; issues: ImportIssue[] } {
  const issues: ImportIssue[] = []
  const issue = (field: string, message: string) => issues.push({ rowNumber, field, message })

  const artist = str(raw.artist)
  const albumTitle = str(raw.album_title ?? raw.albumTitle ?? raw.album)
  if (!artist) issue('artist', 'missing artist')
  if (!albumTitle) issue('album_title', 'missing album title')

  const releaseYear = numOrNull(raw.release_year ?? raw.releaseYear ?? raw.year)
  if (releaseYear !== null && (releaseYear < 1900 || releaseYear > 2100)) issue('release_year', `implausible year "${str(raw.release_year ?? raw.year)}"`)

  const rating = numOrNull(raw.rating)
  if (rating !== null && (rating < 1 || rating > 10)) issue('rating', `rating must be 1–10, got "${str(raw.rating)}"`)

  const reviewDate = str(raw.review_date ?? raw.reviewDate) || null
  if (reviewDate && Number.isNaN(new Date(reviewDate).getTime())) issue('review_date', `unreadable date "${reviewDate}"`)

  if (issues.some((i) => i.field === 'artist' || i.field === 'album_title')) {
    return { draft: null, issues }
  }

  const draft: ReviewDraft = {
    artist,
    albumTitle,
    releaseYear,
    genres: strList(raw.genres ?? raw.genre),
    rating,
    // the review text is carried verbatim — never rewritten on import
    reviewText: str(raw.review ?? raw.review_text ?? raw.reviewText),
    bestTracks: strList(raw.best_tracks ?? raw.bestTracks ?? raw.best_track),
    worstTracks: strList(raw.worst_tracks ?? raw.worstTracks ?? raw.worst_track),
    reviewDate,
    tags: strList(raw.tags),
    notes: str(raw.notes),
    artworkUrl: str(raw.artwork_url ?? raw.artworkUrl) || null,
    metadataProviderId: str(raw.metadata_provider_id ?? raw.metadataProviderId) || null,
    metadataSource: str(raw.metadata_source ?? raw.metadataSource) || null,
  }
  return { draft, issues }
}

export async function validateImport(rows: Array<{ rowNumber: number; raw: Record<string, unknown> }>): Promise<ValidatedImportRow[]> {
  const existing = await db.reviews.toArray()
  const keys = new Set(existing.map((r) => normalizeKey(r.artist, r.albumTitle)))
  return rows.map(({ rowNumber, raw }) => {
    const { draft, issues } = validateRow(rowNumber, raw)
    const isDuplicate = draft ? keys.has(normalizeKey(draft.artist, draft.albumTitle)) : false
    return { rowNumber, draft, issues, isDuplicate }
  })
}

export interface ImportResult {
  imported: number
  updated: number
  skippedDuplicates: number
  failed: number
}

export async function runImport(rows: ValidatedImportRow[], strategy: DuplicateStrategy): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, updated: 0, skippedDuplicates: 0, failed: 0 }
  const existing = await db.reviews.toArray()
  const byKey = new Map(existing.map((r) => [normalizeKey(r.artist, r.albumTitle), r]))

  await db.transaction('rw', db.reviews, async () => {
    for (const row of rows) {
      if (!row.draft || row.issues.length > 0) {
        if (!row.draft) result.failed++
        continue
      }
      const key = normalizeKey(row.draft.artist, row.draft.albumTitle)
      const dupe = byKey.get(key)
      if (dupe) {
        if (strategy === 'skip') {
          result.skippedDuplicates++
          continue
        }
        await db.reviews.update(dupe.id, { ...row.draft, updatedAt: now() })
        result.updated++
        continue
      }
      await db.reviews.add({ ...row.draft, id: crypto.randomUUID(), createdAt: now(), updatedAt: now() })
      result.imported++
    }
  })
  return result
}

// ── export ──────────────────────────────────────────────────────────────

const EXPORT_FIELDS = [
  'artist', 'album_title', 'release_year', 'genres', 'rating', 'review',
  'best_tracks', 'worst_tracks', 'review_date', 'tags', 'notes', 'artwork_url',
] as const

export function reviewsToJson(reviews: Review[]): string {
  const rows = reviews.map((r) => ({
    artist: r.artist,
    album_title: r.albumTitle,
    release_year: r.releaseYear,
    genres: r.genres,
    rating: r.rating,
    review: r.reviewText,
    best_tracks: r.bestTracks,
    worst_tracks: r.worstTracks,
    review_date: r.reviewDate,
    tags: r.tags,
    notes: r.notes,
    artwork_url: r.artworkUrl,
  }))
  return JSON.stringify(rows, null, 2)
}

function csvCell(v: unknown): string {
  const s = Array.isArray(v) ? v.join('; ') : v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function reviewsToCsv(reviews: Review[]): string {
  const header = EXPORT_FIELDS.join(',')
  const lines = reviews.map((r) =>
    [
      r.artist, r.albumTitle, r.releaseYear, r.genres, r.rating, r.reviewText,
      r.bestTracks, r.worstTracks, r.reviewDate, r.tags, r.notes, r.artworkUrl,
    ]
      .map(csvCell)
      .join(','),
  )
  return [header, ...lines].join('\n')
}

// ── CSV parsing (quote-aware, no dependency) ────────────────────────────

export function parseCsv(text: string): Array<Record<string, unknown>> {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') {
        inQuotes = false
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((f) => f !== '')) rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  row.push(field)
  if (row.some((f) => f !== '')) rows.push(row)
  if (rows.length < 2) return []
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
  return rows.slice(1).map((cells) => {
    const obj: Record<string, unknown> = {}
    header.forEach((h, i) => {
      obj[h] = cells[i] ?? ''
    })
    return obj
  })
}
