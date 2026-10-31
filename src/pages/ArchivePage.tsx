import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { LayoutGrid, Library, List, Plus, Search } from 'lucide-react'
import { db } from '../db/local'
import { RatingBadge } from '../components/RatingBadge'
import { SleeveArtwork } from '../components/SleeveArtwork'
import { EmptyState } from '../components/EmptyState'
import { formatDate } from '../lib/utils'
import type { Review } from '../types'

type View = 'grid' | 'list'
type SortKey = 'updated' | 'rating-desc' | 'rating-asc' | 'artist' | 'year-desc' | 'year-asc' | 'review-date'

const SORTS: Array<{ key: SortKey; label: string; fn: (a: Review, b: Review) => number }> = [
  { key: 'updated', label: 'Zuletzt bearbeitet', fn: (a, b) => b.updatedAt.localeCompare(a.updatedAt) },
  { key: 'rating-desc', label: 'Bewertung ↓', fn: (a, b) => (b.rating ?? -1) - (a.rating ?? -1) },
  { key: 'rating-asc', label: 'Bewertung ↑', fn: (a, b) => (a.rating ?? 99) - (b.rating ?? 99) },
  { key: 'artist', label: 'Artist A–Z', fn: (a, b) => a.artist.localeCompare(b.artist) },
  { key: 'year-desc', label: 'Neueste Releases', fn: (a, b) => (b.releaseYear ?? 0) - (a.releaseYear ?? 0) },
  { key: 'year-asc', label: 'Älteste Releases', fn: (a, b) => (a.releaseYear ?? 9999) - (b.releaseYear ?? 9999) },
  { key: 'review-date', label: 'Review-Datum', fn: (a, b) => (b.reviewDate ?? '').localeCompare(a.reviewDate ?? '') },
]

export function ArchivePage() {
  const reviews = useLiveQuery(() => db.reviews.toArray(), [])
  const [view, setView] = useState<View>('grid')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('updated')
  const [genre, setGenre] = useState('')
  const [minRating, setMinRating] = useState('')

  const allGenres = useMemo(
    () => [...new Set((reviews ?? []).flatMap((r) => r.genres))].sort((a, b) => a.localeCompare(b)),
    [reviews],
  )

  const visible = useMemo(() => {
    if (!reviews) return []
    const q = query.trim().toLowerCase()
    const min = minRating ? Number(minRating) : null
    const filtered = reviews.filter((r) => {
      if (q && ![r.artist, r.albumTitle, r.reviewText, ...r.tags, ...r.genres].join(' ').toLowerCase().includes(q)) return false
      if (genre && !r.genres.includes(genre)) return false
      if (min !== null && (r.rating === null || r.rating < min)) return false
      return true
    })
    return filtered.sort(SORTS.find((s) => s.key === sortKey)?.fn)
  }, [reviews, query, genre, minRating, sortKey])

  if (!reviews) return null

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">Das Archiv</p>
          <h1 className="mt-1 font-display text-3xl">Album-Reviews</h1>
          <p className="mt-1 text-sm text-cream-500">
            {reviews.length} {reviews.length === 1 ? 'Platte' : 'Platten'} im Regal
            {visible.length !== reviews.length ? ` · ${visible.length} angezeigt` : ''}
          </p>
        </div>
        <Link to="/archive/new" className="crate-btn-primary">
          <Plus className="h-4 w-4" /> Neue Review
        </Link>
      </header>

      {reviews.length === 0 ? (
        <EmptyState
          icon={Library}
          title="Noch keine Reviews"
          body="Schreib deine erste Review von Hand oder importiere deine 30 bestehenden mit dem Template — dein Original-Wortlaut bleibt wortgleich erhalten."
          action={
            <div className="flex gap-2">
              <Link to="/archive/new" className="crate-btn-primary"><Plus className="h-4 w-4" /> Selbst schreiben</Link>
              <Link to="/import" className="crate-btn">30 importieren</Link>
            </div>
          }
        />
      ) : (
        <>
          {/* toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-52 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-600" />
              <input
                className="crate-input pl-9"
                placeholder="Artist, Album, Review-Text, Tag suchen…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <select className="crate-input w-auto" value={genre} onChange={(e) => setGenre(e.target.value)} aria-label="Nach Genre filtern">
              <option value="">Alle Genres</option>
              {allGenres.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <select className="crate-input w-auto" value={minRating} onChange={(e) => setMinRating(e.target.value)} aria-label="Mindestbewertung">
              <option value="">Jede Bewertung</option>
              {[9, 8, 7, 6, 5].map((n) => (
                <option key={n} value={n}>{n}+ /10</option>
              ))}
            </select>
            <select className="crate-input w-auto" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} aria-label="Sortierung">
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
            <div className="flex overflow-hidden rounded-lg border border-ink-600">
              <button className={`px-2.5 py-2 ${view === 'grid' ? 'bg-ink-700 text-cream-100' : 'text-cream-500'}`} onClick={() => setView('grid')} aria-label="Rasteransicht">
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button className={`px-2.5 py-2 ${view === 'list' ? 'bg-ink-700 text-cream-100' : 'text-cream-500'}`} onClick={() => setView('list')} aria-label="Listenansicht">
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="py-10 text-center text-sm text-cream-500">Auf diese Filterkombination passt nichts.</p>
          ) : view === 'grid' ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {visible.map((r, i) => (
                <Link
                  key={r.id}
                  to={`/archive/${r.id}`}
                  className={`crate-card group transition-all hover:border-rust-600 ${i % 3 === 1 ? 'tilt-r' : i % 3 === 2 ? 'tilt-l' : ''}`}
                >
                  {/* masking tape holds the pasted cover down */}
                  <span className="tape z-10" />
                  <div className="overflow-hidden rounded-t-2xl">
                    <SleeveArtwork artist={r.artist} albumTitle={r.albumTitle} artworkUrl={r.artworkUrl} />
                  </div>
                  <div className="space-y-1 p-3">
                    <p className="truncate text-sm font-semibold text-cream-100 group-hover:text-rust-300">{r.albumTitle}</p>
                    <p className="truncate text-xs text-cream-500">{r.artist}{r.releaseYear ? ` · ${r.releaseYear}` : ''}</p>
                    <div className="flex items-center justify-between pt-1">
                      <RatingBadge rating={r.rating} size="sm" />
                      {r.genres[0] && <span className="truncate pl-2 font-mono text-[10px] uppercase tracking-wider text-cream-600">{r.genres[0]}</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="crate-card divide-y divide-ink-700">
              {visible.map((r) => (
                <Link key={r.id} to={`/archive/${r.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-ink-800">
                  <span className="w-10 shrink-0 overflow-hidden rounded-lg"><SleeveArtwork artist={r.artist} albumTitle={r.albumTitle} artworkUrl={r.artworkUrl} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-cream-100">{r.albumTitle}</span>
                    <span className="block truncate text-xs text-cream-500">{r.artist}</span>
                  </span>
                  <span className="hidden w-14 font-mono text-xs text-cream-500 sm:block">{r.releaseYear ?? '—'}</span>
                  <span className="hidden w-28 truncate text-xs text-cream-500 md:block">{r.genres.join(', ') || '—'}</span>
                  <span className="hidden w-24 text-right font-mono text-xs text-cream-600 lg:block">{formatDate(r.reviewDate)}</span>
                  <RatingBadge rating={r.rating} size="sm" />
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
