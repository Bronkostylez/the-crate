/**
 * Spotify Web API metadata provider: album search + real tracklists.
 * Covers albums the iTunes catalog misses (e.g. Yeezus). Needs a connected
 * account (PKCE login) — search/albums are not user data, but Spotify
 * requires a token for everything.
 */
import { getConfigValue } from '../config'
import type { AlbumSearchResult, MetadataProvider } from '../metadata/provider'
import { getAccessToken } from './auth'

interface SpotifyImage {
  url: string
  width: number | null
}

async function spotifyGet<T>(path: string): Promise<T> {
  const clientId = getConfigValue('spotifyClientId')
  const token = clientId ? await getAccessToken(clientId) : null
  if (!token) throw new Error('Spotify ist nicht verbunden.')
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Spotify-Anfrage fehlgeschlagen (HTTP ${res.status})`)
  return (await res.json()) as T
}

function pickImage(images: SpotifyImage[] | undefined): string | null {
  if (!images?.length) return null
  return (images.find((i) => i.width === 300) ?? images[0]).url
}

export const spotifyProvider: MetadataProvider = {
  id: 'spotify',

  async searchAlbums(query: string): Promise<AlbumSearchResult[]> {
    const data = await spotifyGet<{
      albums: {
        items: Array<{
          id: string
          name: string
          artists: Array<{ name: string }>
          release_date?: string
          images?: SpotifyImage[]
        }>
      }
    }>(`/search?type=album&limit=12&q=${encodeURIComponent(query)}`)
    return data.albums.items.map((a) => ({
      providerId: a.id,
      artist: a.artists.map((x) => x.name).join(', '),
      title: a.name,
      releaseYear: a.release_date ? Number(a.release_date.slice(0, 4)) || null : null,
      // Spotify album objects carry no genre — honest null, genres stay Tyler's taxonomy
      genre: null,
      artworkUrl: pickImage(a.images),
      source: 'Spotify',
    }))
  },

  async getTracklist(providerId: string): Promise<string[]> {
    const names: string[] = []
    let path: string | null = `/albums/${providerId}/tracks?limit=50`
    while (path) {
      const page: { items: Array<{ name: string }>; next: string | null } = await spotifyGet(path)
      names.push(...page.items.map((t) => t.name))
      // `next` is a full URL; strip back to the path for spotifyGet
      path = page.next ? page.next.replace(/^https:\/\/api\.spotify\.com\/v1/, '') : null
    }
    return names
  },
}
