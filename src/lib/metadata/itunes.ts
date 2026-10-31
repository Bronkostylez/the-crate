import type { AlbumSearchResult, MetadataProvider } from './provider'

const API = 'https://itunes.apple.com'

interface ItunesAlbum {
  collectionId: number
  artistName: string
  collectionName: string
  releaseDate?: string
  primaryGenreName?: string
  artworkUrl100?: string
}

/** iTunes serves any size by rewriting the path suffix; 600x600 looks sharp in the archive grid. */
function upgradeArtwork(url: string | undefined): string | null {
  return url ? url.replace(/\/100x100bb\.jpg$/, '/600x600bb.jpg') : null
}

export const itunesProvider: MetadataProvider = {
  id: 'itunes',

  async searchAlbums(query: string): Promise<AlbumSearchResult[]> {
    const url = `${API}/search?term=${encodeURIComponent(query)}&entity=album&limit=8`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Metadaten-Suche fehlgeschlagen (HTTP ${res.status})`)
    const data = (await res.json()) as { results: ItunesAlbum[] }
    return data.results.map((r) => ({
      providerId: String(r.collectionId),
      artist: r.artistName,
      title: r.collectionName,
      releaseYear: r.releaseDate ? new Date(r.releaseDate).getFullYear() : null,
      genre: r.primaryGenreName ?? null,
      artworkUrl: upgradeArtwork(r.artworkUrl100),
      source: 'Apple Music / iTunes',
    }))
  },

  async getTracklist(providerId: string): Promise<string[]> {
    const res = await fetch(`${API}/lookup?id=${encodeURIComponent(providerId)}&entity=song`)
    if (!res.ok) throw new Error(`Trackliste konnte nicht geladen werden (HTTP ${res.status})`)
    const data = (await res.json()) as { results: Array<{ wrapperType: string; trackName?: string }> }
    return data.results.filter((r) => r.wrapperType === 'track' && r.trackName).map((r) => r.trackName as string)
  },
}
