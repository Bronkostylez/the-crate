/** One album review — the heart of the archive. */
export interface Review {
  id: string
  artist: string
  albumTitle: string
  releaseYear: number | null
  genres: string[]
  /** 1–10, null when unrated */
  rating: number | null
  reviewText: string
  bestTracks: string[]
  worstTracks: string[]
  /** ISO date (yyyy-mm-dd) of when the review was written */
  reviewDate: string | null
  tags: string[]
  notes: string
  artworkUrl: string | null
  createdAt: string
  updatedAt: string
}

export type ReviewDraft = Omit<Review, 'id' | 'createdAt' | 'updatedAt'>

export function emptyDraft(): ReviewDraft {
  return {
    artist: '',
    albumTitle: '',
    releaseYear: null,
    genres: [],
    rating: null,
    reviewText: '',
    bestTracks: [],
    worstTracks: [],
    reviewDate: null,
    tags: [],
    notes: '',
    artworkUrl: null,
  }
}

/** One parsed row from a review import file, before validation. */
export interface ImportRow {
  rowNumber: number
  raw: Record<string, unknown>
}

export interface ImportIssue {
  rowNumber: number
  field: string
  message: string
}

export interface ValidatedImportRow {
  rowNumber: number
  draft: ReviewDraft | null
  issues: ImportIssue[]
  /** true when artist+album already exists in the archive */
  isDuplicate: boolean
}

export type DuplicateStrategy = 'skip' | 'update'
