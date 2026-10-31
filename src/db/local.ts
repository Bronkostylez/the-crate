import Dexie, { type Table } from 'dexie'
import type { Play, Review } from '../types'

/**
 * Local-first storage (IndexedDB via Dexie).
 *
 * Stage 1 source of truth. The table shape mirrors the `reviews` table in
 * supabase/migrations/0001_init.sql so a later sync layer can map rows
 * one-to-one without a data migration.
 */
export class CrateDB extends Dexie {
  reviews!: Table<Review, string>
  plays!: Table<Play, string>

  constructor() {
    super('the-crate')
    this.version(1).stores({
      reviews: 'id, artist, rating, releaseYear, reviewDate, updatedAt, *genres, *tags',
    })
    // v2 adds the listening history; the compound index is the dedupe key
    this.version(2).stores({
      reviews: 'id, artist, rating, releaseYear, reviewDate, updatedAt, *genres, *tags',
      plays: 'id, playedAt, artistName, trackName, [playedAt+trackName+artistName]',
    })
  }
}

export const db = new CrateDB()
