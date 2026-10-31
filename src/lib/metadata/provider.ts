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
import { musicbrainzProvider } from './musicbrainz'
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
  /** release kind when the provider knows it (MusicBrainz primary-type: Album, EP, Single) */
  kind?: string
}

export interface MetadataProvider {
  id: string
  searchAlbums(query: string): Promise<AlbumSearchResult[]>
  getTracklist(providerId: string): Promise<string[]>
}

function spotifyReady(): boolean {
  return spotifyConnected() && getConfigValue('spotifyClientId') !== ''
}

/** Why a search fell back below the best provider — shown in the search UI. */
let fallbackNote = ''
export function providerFallbackNote(): string {
  return fallbackNote
}

const tokens = (t: string) => t.toLowerCase().split(/[^a-z0-9äöüß]+/).filter(Boolean)

/** Title fully inside the query, or the query is the title's start. */
function titleMatchesQuery(title: string, query: string): boolean {
  const qt = tokens(query)
  const tt = tokens(title)
  if (tt.length === 0 || qt.length === 0) return false
  for (let i = 0; i + tt.length <= qt.length; i++) {
    if (tt.every((t, j) => qt[i + j] === t)) return true
  }
  return qt.length <= tt.length && qt.every((t, j) => tt[j] === t)
}

/** Normalized title equals the query exactly ("The Chronic (2008-2015)" ≠ "The Chronic"). */
function exactTitle(title: string, query: string): boolean {
  const qt = tokens(query)
  const tt = tokens(title)
  return tt.length > 0 && tt.length === qt.length && tt.every((t, j) => qt[j] === t)
}

/** Every artist token appears in the query — catches artist-only searches ("Gang Starr", "Big L"). */
function artistInQuery(artist: string, query: string): boolean {
  const at = tokens(artist)
  const qt = tokens(query)
  return at.length > 0 && at.every((t) => qt.includes(t))
}

/** At least one artist token in the query ("Nas Illmatic" ↔ artist "Nas"). */
function artistOverlap(artist: string, query: string): boolean {
  const qt = tokens(query)
  return tokens(artist).some((t) => qt.includes(t))
}

/** Singles/EPs must not satisfy an album search ("The Chronic - EP" by whoever ≠ The Chronic). */
const JUNK_SUFFIX = /\s-\s(Single|EP)(\s*\(.*\))?$/i

/**
 * iTunes answers the query by itself only on a real album hit: exact title,
 * or the title inside the query with an artist token to back it up. Anything
 * weaker (tribute albums, artist-only searches) goes to MusicBrainz too,
 * because iTunes has real gaps in the 90s catalog.
 */
function strongItunesHit(r: AlbumSearchResult, query: string): boolean {
  if (JUNK_SUFFIX.test(r.title)) return false
  if (exactTitle(r.title, query)) return true
  return titleMatchesQuery(r.title, query) && artistOverlap(r.artist, query)
}

/** A MusicBrainz hit worth merging on top: title match, or the searched artist's own release. */
function strongMusicbrainzHit(r: AlbumSearchResult, query: string): boolean {
  return titleMatchesQuery(r.title, query) || artistInQuery(r.artist, query)
}

const compositeProvider: MetadataProvider = {
  id: 'auto',

  async searchAlbums(query: string): Promise<AlbumSearchResult[]> {
    fallbackNote = ''
    if (spotifyReady()) {
      try {
        const found = await spotifyProvider.searchAlbums(query)
        if (found.length > 0) return found.map((r) => ({ ...r, providerId: `spotify:${r.providerId}` }))
      } catch (e) {
        fallbackNote = `Spotify-Fehler (${e instanceof Error ? e.message : 'unbekannt'}) — iTunes/MusicBrainz springen ein.`
      }
    }
    let itunesResults: AlbumSearchResult[] = []
    try {
      itunesResults = await itunesProvider.searchAlbums(query)
    } catch {
      if (!fallbackNote) fallbackNote = 'iTunes nicht erreichbar — MusicBrainz springt ein.'
    }
    if (itunesResults.some((r) => strongItunesHit(r, query))) {
      return itunesResults.map((r) => ({ ...r, providerId: `itunes:${r.providerId}` }))
    }
    // iTunes missed the actual album (90s catalog gaps, mixtapes) → MusicBrainz
    try {
      const mb = await musicbrainzProvider.searchAlbums(query)
      const rank = (r: AlbumSearchResult) => {
        if (exactTitle(r.title, query)) return 0 // "The Chronic" = The Chronic
        if (artistInQuery(r.artist, query)) return 1 // the searched artist's own albums
        if (tokens(r.title).length >= 2 && titleMatchesQuery(r.title, query)) return 2
        return 3 // one-word coincidence ("Starr" by Teeflii for "Gang Starr")
      }
      // Ties: real albums before EPs, then the oldest release first — the canonical
      // album is older than the tribute/bootleg reuses of its title (The Chronic 1992
      // vs a pile of 2017+ EPs, all with identical search scores).
      const strong = mb
        .filter((r) => strongMusicbrainzHit(r, query))
        .sort((a, b) =>
          rank(a) - rank(b) ||
          (a.kind === 'Album' ? 0 : 1) - (b.kind === 'Album' ? 0 : 1) ||
          (a.releaseYear ?? 9999) - (b.releaseYear ?? 9999),
        )
      if (strong.length > 0) {
        fallbackNote = fallbackNote || 'iTunes hat hier Lücken — die oberen Treffer kommen von MusicBrainz.'
        return [
          ...strong.map((r) => ({ ...r, providerId: `musicbrainz:${r.providerId}` })),
          ...itunesResults.map((r) => ({ ...r, providerId: `itunes:${r.providerId}` })),
        ].slice(0, 12)
      }
    } catch {
      if (!fallbackNote) fallbackNote = 'iTunes und MusicBrainz nicht erreichbar.'
    }
    return itunesResults.map((r) => ({ ...r, providerId: `itunes:${r.providerId}` }))
  },

  async getTracklist(providerId: string): Promise<string[]> {
    const colon = providerId.indexOf(':')
    const ns = colon > 0 ? providerId.slice(0, colon) : 'itunes' // legacy ids are bare iTunes collectionIds
    const id = colon > 0 ? providerId.slice(colon + 1) : providerId
    if (ns === 'spotify') {
      if (spotifyReady()) return spotifyProvider.getTracklist(id)
      throw new Error('Spotify ist nicht mehr verbunden — in den Einstellungen neu verbinden.')
    }
    if (ns === 'musicbrainz') return musicbrainzProvider.getTracklist(id)
    return itunesProvider.getTracklist(id)
  },
}

export function getMetadataProvider(): MetadataProvider {
  return compositeProvider
}

export function activeMetadataLabel(): string {
  return spotifyReady() ? 'Spotify (iTunes + MusicBrainz als Fallback)' : 'Apple Music / iTunes + MusicBrainz'
}
