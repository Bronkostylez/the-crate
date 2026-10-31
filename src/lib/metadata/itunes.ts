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

async function rawSearch(query: string): Promise<AlbumSearchResult[]> {
  const url = `${API}/search?term=${encodeURIComponent(query)}&entity=album&limit=12`
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
}

export const itunesProvider: MetadataProvider = {
  id: 'itunes',

  async searchAlbums(query: string): Promise<AlbumSearchResult[]> {
    const first = await rawSearch(query)
    // "Artist Album" queries sometimes bury the album behind the artist's
    // popular records. If no result title appears in the query, retry with
    // leading words dropped ("Kanye West Yeezus" → "West Yeezus" → "Yeezus").
    const tokens = (t: string) => t.toLowerCase().split(/[^a-z0-9äöüß]+/).filter(Boolean)
    const titleInQuery = (r: AlbumSearchResult, q: string) => {
      const qt = tokens(q)
      const tt = tokens(r.title)
      if (tt.length === 0 || qt.length === 0) return false
      // title fully contained in the query ("Kanye West Yeezus" ∋ "Yeezus")
      for (let i = 0; i + tt.length <= qt.length; i++) {
        if (tt.every((t, j) => qt[i + j] === t)) return true
      }
      // or the query is the title's start ("Enter the Wu-Tang" ⊂ "Enter the Wu-Tang (36 Chambers) [Expanded]")
      return qt.length <= tt.length && qt.every((t, j) => tt[j] === t)
    }
    if (first.some((r) => titleInQuery(r, query))) return first
    const words = query.split(/\s+/).filter(Boolean)
    for (let i = 1; i < words.length && i <= 2; i++) {
      const sub = words.slice(i).join(' ')
      if (sub.length < 2) break
      const more = await rawSearch(sub)
      if (more.some((m) => titleInQuery(m, sub))) {
        // fallback hits go first — they match the album the user meant
        const merged = new Map<string, AlbumSearchResult>()
        more.forEach((r) => merged.set(r.providerId, r))
        first.forEach((r) => { if (!merged.has(r.providerId)) merged.set(r.providerId, r) })
        return [...merged.values()].slice(0, 12)
      }
    }
    return first
  },

  async getTracklist(providerId: string): Promise<string[]> {
    const res = await fetch(`${API}/lookup?id=${encodeURIComponent(providerId)}&entity=song`)
    if (!res.ok) throw new Error(`Trackliste konnte nicht geladen werden (HTTP ${res.status})`)
    const data = (await res.json()) as { results: Array<{ wrapperType: string; trackName?: string }> }
    return data.results.filter((r) => r.wrapperType === 'track' && r.trackName).map((r) => r.trackName as string)
  },
}
