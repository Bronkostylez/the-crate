import { useEffect, useRef, useState } from 'react'
import { Disc3, Loader2, Search } from 'lucide-react'
import { getMetadataProvider, type AlbumSearchResult } from '../lib/metadata/provider'

/**
 * Album lookup for the review editor: debounced search, pick a result, the
 * editor fills artist/title/year/genre/artwork and loads the tracklist.
 */
export function AlbumSearch({ onPick }: { onPick: (album: AlbumSearchResult, tracks: string[]) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AlbumSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [loadingTracks, setLoadingTracks] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([])
      setOpen(false)
      return
    }
    const t = setTimeout(async () => {
      setSearching(true)
      setError('')
      try {
        const found = await getMetadataProvider().searchAlbums(query.trim())
        setResults(found)
        setOpen(true)
        if (found.length === 0) setError('Kein Album gefunden — Felder einfach per Hand ausfüllen.')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Suche fehlgeschlagen.')
      } finally {
        setSearching(false)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  async function pick(album: AlbumSearchResult) {
    setOpen(false)
    setLoadingTracks(album.providerId)
    setError('')
    try {
      const tracks = await getMetadataProvider().getTracklist(album.providerId)
      onPick(album, tracks)
      setQuery('')
      setResults([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Trackliste fehlgeschlagen.')
      onPick(album, [])
    } finally {
      setLoadingTracks(null)
    }
  }

  return (
    <div ref={boxRef} className="crate-card space-y-2 p-4">
      <p className="kicker">Album suchen — Rest füllt sich selbst</p>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-600" />
        <input
          className="crate-input pl-9"
          placeholder="z. B. Nas Illmatic, Gang Starr Moment of Truth…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-cream-600" />}
      </div>

      {open && results.length > 0 && (
        <ul className="divide-y divide-ink-700 overflow-hidden rounded-sm border border-ink-600 bg-ink-900">
          {results.map((r) => (
            <li key={r.providerId}>
              <button type="button" className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-ink-800" onClick={() => void pick(r)}>
                {r.artworkUrl ? (
                  <img src={r.artworkUrl} alt="" className="h-10 w-10 shrink-0 rounded-sm object-cover" loading="lazy" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-ink-700"><Disc3 className="h-4 w-4 text-cream-600" /></span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-cream-100">{r.title}</span>
                  <span className="block truncate text-xs text-cream-500">
                    {r.artist}{r.releaseYear ? ` · ${r.releaseYear}` : ''}{r.genre ? ` · ${r.genre}` : ''}
                  </span>
                </span>
                {loadingTracks === r.providerId && <Loader2 className="h-4 w-4 animate-spin text-rust-400" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-rust-300">{error}</p>}
      <p className="text-xs text-cream-600">Metadaten: Apple Music / iTunes. Spotify übernimmt später, sobald deine Client-ID drin ist.</p>
    </div>
  )
}
