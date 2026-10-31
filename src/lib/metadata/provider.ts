/**
 * Album metadata providers.
 *
 * The editor uses this abstraction so providers can take over without
 * touching the UI. Routing: Spotify first once an account is connected
 * (covers albums iTunes misses), iTunes as fallback and for everything
 * stored before Spotify existed. Provider ids carry their namespace
 * ("spotify:<id>" / "itunes:<id>") so a stored id always routes back to
 * the right catalog; legacy bare ids are iTunes collectionIds.
 */

import { getConfigValue } from '../config'
import { itunesProvider } from './itunes'
import { spotifyProvider } from '../spotify/api'
import { spotifyConnected } from '../spotify/auth'

export interface AlbumSearchResult {
  /** namespaced provider album id ("itunes:856131729", "spotify:4LH4…") */
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

function spotifyReady(): boolean {
  return spotifyConnected() && getConfigValue('spotifyClientId') !== ''
}

const compositeProvider: MetadataProvider = {
  id: 'auto',

  async searchAlbums(query: string): Promise<AlbumSearchResult[]> {
    if (spotifyReady()) {
      try {
        const found = await spotifyProvider.searchAlbums(query)
        if (found.length > 0) return found.map((r) => ({ ...r, providerId: `spotify:${r.providerId}` }))
      } catch {
        // fall through to iTunes — a Spotify hiccup must never block the editor
      }
    }
    const found = await itunesProvider.searchAlbums(query)
    return found.map((r) => ({ ...r, providerId: `itunes:${r.providerId}` }))
  },

  async getTracklist(providerId: string): Promise<string[]> {
    const colon = providerId.indexOf(':')
    const ns = colon > 0 ? providerId.slice(0, colon) : 'itunes' // legacy ids are bare iTunes collectionIds
    const id = colon > 0 ? providerId.slice(colon + 1) : providerId
    if (ns === 'spotify' && spotifyReady()) return spotifyProvider.getTracklist(id)
    if (ns === 'spotify') throw new Error('Spotify ist nicht mehr verbunden — in den Einstellungen neu verbinden.')
    return itunesProvider.getTracklist(id)
  },
}

export function getMetadataProvider(): MetadataProvider {
  return compositeProvider
}

export function activeMetadataLabel(): string {
  return spotifyReady() ? 'Spotify (iTunes als Fallback)' : 'Apple Music / iTunes'
}
