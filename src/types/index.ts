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

/** One recorded play from the listening history. */
export interface Play {
  id: string
  trackName: string
  artistName: string
  albumName: string | null
  /** ISO timestamp of when the track ended (Spotify export semantics) */
  playedAt: string
  msPlayed: number
  source: 'spotify_extended' | 'spotify_simple' | 'manual'
  /** which import batch added this row */
  importId: string
}

export interface PlayImportPreview {
  fileNames: string[]
  rowsRead: number
  validPlays: ParsedPlay[]
  skippedNonMusic: number
  skippedInvalid: number
  duplicates: number
  firstPlay: string | null
  lastPlay: string | null
  topArtists: Array<{ artist: string; plays: number }>
}

export interface ParsedPlay {
  trackName: string
  artistName: string
  albumName: string | null
  playedAt: string
  msPlayed: number
}

/** One full-state snapshot of a playlist import (THE PLAYLIST section). */
export interface PlaylistSnapshot {
  id: string
  name: string
  importedAt: string
  source: 'spotify_account_export' | 'exportify_csv' | 'csv_template'
  fileName: string
  trackCount: number
  /** optional link to the live playlist on Spotify — the app references it, never copies branding */
  spotifyUrl: string | null
}

export interface PlaylistTrack {
  id: string
  snapshotId: string
  position: number
  trackName: string
  /** as written in the export; may contain several artists */
  artistName: string
  albumName: string | null
  addedAt: string | null
  durationMs: number | null
  releaseDate: string | null
  spotifyUri: string | null
}

export type ParsedPlaylistTrack = Omit<PlaylistTrack, 'id' | 'snapshotId'>

/** One playlist found inside an import file (a file can hold several). */
export interface PlaylistCandidate {
  name: string
  tracks: ParsedPlaylistTrack[]
  skipped: number
}

export interface PlaylistImportPreview {
  fileName: string
  source: PlaylistSnapshot['source']
  candidate: PlaylistCandidate
  duplicateRows: number
  /** vs the newest existing snapshot, null on the first import */
  diff: { added: number; removed: number } | null
}

export interface SnapshotDiff {
  added: PlaylistTrack[]
  removed: PlaylistTrack[]
}
