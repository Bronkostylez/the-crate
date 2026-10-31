import Dexie, { type Table } from 'dexie'
import type { Review } from '../types'

/**
 * Local-first storage (IndexedDB via Dexie).
 *
 * Stage 1 source of truth. The table shape mirrors the `reviews` table in
 * supabase/migrations/0001_init.sql so a later sync layer can map rows
 * one-to-one without a data migration.
 */
export class CrateDB extends Dexie {
  reviews!: Table<Review, string>

  constructor() {
    super('the-crate')
    this.version(1).stores({
      reviews: 'id, artist, rating, releaseYear, reviewDate, updatedAt, *genres, *tags',
    })
  }
}

export const db = new CrateDB()
