/**
 * MusicBrainz — the community-run open music encyclopedia. Keyless and
 * CORS-enabled, strong on exactly the catalog the commercial APIs miss
 * (90s hip-hop, mixtapes). Rate limit: 1 request/second, so calls are
 * queued with a gap instead of fired in parallel. Last fallback in the
 * chain behind Spotify and iTunes.
 */
import type { AlbumSearchResult, MetadataProvider } from './provider'

const API = 'https://musicbrainz.org/ws/2'
const COVERS = 'https://coverartarchive.org/release-group'

let lastCall = 0
async function throttled(url: string): Promise<Response> {
  const gap = () => new Promise((r) => setTimeout(r, Math.max(0, 1100 - (Date.now() - lastCall))))
  await gap()
  lastCall = Date.now()
  let res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (res.status === 503) {
    // over the 1 req/s budget — back off and retry once
    await new Promise((r) => setTimeout(r, 2500))
    lastCall = Date.now()
    res = await fetch(url, { headers: { Accept: 'application/json' } })
  }
  return res
}

interface MbReleaseGroup {
  id: string
  title: string
  'first-release-date'?: string
  'primary-type'?: string
  'artist-credit'?: Array<{ name: string }>
}

export const musicbrainzProvider: MetadataProvider = {
  id: 'musicbrainz',

  async searchAlbums(query: string): Promise<AlbumSearchResult[]> {
    const q = encodeURIComponent(`${query} AND (primarytype:album OR primarytype:ep)`)
    const res = await throttled(`${API}/release-group/?query=${q}&fmt=json&limit=12`)
    if (!res.ok) throw new Error(`MusicBrainz-Suche fehlgeschlagen (HTTP ${res.status})`)
    const data = (await res.json()) as { 'release-groups': MbReleaseGroup[] }
    return data['release-groups'].map((rg) => ({
      providerId: rg.id,
      artist: (rg['artist-credit'] ?? []).map((a) => a.name).join(''),
      title: rg.title,
      releaseYear: rg['first-release-date'] ? Number(rg['first-release-date'].slice(0, 4)) || null : null,
      genre: null,
      artworkUrl: `${COVERS}/${rg.id}/front-250`,
      source: 'MusicBrainz',
      kind: rg['primary-type'],
    }))
  },

  async getTracklist(providerId: string): Promise<string[]> {
    // release-group → pick the first proper release → its recordings
    const relRes = await throttled(`${API}/release?release-group=${encodeURIComponent(providerId)}&fmt=json&limit=10`)
    if (!relRes.ok) throw new Error(`MusicBrainz-Releases fehlgeschlagen (HTTP ${relRes.status})`)
    const relData = (await relRes.json()) as { releases: Array<{ id: string; status?: string }> }
    const release = relData.releases.find((r) => r.status === 'Official') ?? relData.releases[0]
    if (!release) return []
    const trkRes = await throttled(`${API}/release/${release.id}?inc=recordings&fmt=json`)
    if (!trkRes.ok) throw new Error(`MusicBrainz-Trackliste fehlgeschlagen (HTTP ${trkRes.status})`)
    const trkData = (await trkRes.json()) as { media?: Array<{ tracks?: Array<{ title: string }> }> }
    return (trkData.media ?? []).flatMap((m) => (m.tracks ?? []).map((t) => t.title))
  },
}
