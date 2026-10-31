/**
 * Album metadata providers.
 *
 * The editor uses this abstraction so a future Spotify provider (once the
 * user's Client ID is configured) can take over without touching the UI.
 * Today: iTunes Search API — keyless, CORS-friendly, worldwide catalog.
 */

export interface AlbumSearchResult {
  /** provider-specific album id (iTunes: collectionId) */
  providerId: string
  artist: string
  title: string
  releaseYear: number | null
  genre: string | null
  /** square artwork, upgraded to 600x600 where the provider allows */
  artworkUrl: string | null
  /** which provider supplied this result, shown small in the UI */
  source: string
}

export interface MetadataProvider {
  id: string
  searchAlbums(query: string): Promise<AlbumSearchResult[]>
  getTracklist(providerId: string): Promise<string[]>
}

import { itunesProvider } from './itunes'

export function getMetadataProvider(): MetadataProvider {
  // Later: if a Spotify Client ID is configured, prefer a SpotifyProvider here.
  return itunesProvider
}
