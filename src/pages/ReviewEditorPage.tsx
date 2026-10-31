import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Trash2, X } from 'lucide-react'
import { createReview, deleteReview, getReview, updateReview } from '../db/reviews'
import { RatingBadge } from '../components/RatingBadge'
import { SleeveArtwork } from '../components/SleeveArtwork'
import { AlbumSearch } from '../components/AlbumSearch'
import { emptyDraft } from '../types'
import { cx, formatDate, splitList } from '../lib/utils'
import { getMetadataProvider, type AlbumSearchResult } from '../lib/metadata/provider'
import type { ReviewDraft } from '../types'

/** Create + edit + read one review. /archive/new starts blank, /archive/:id loads. */

/** Base name without "(feat. …)" / "(Radio Edit)" etc. for fuzzy pick mapping. */
function trackBase(name: string): string {
  return name.replace(/\s*\(.*$/, '').trim().toLowerCase()
}

/**
 * Map imported freetext picks onto the provider tracklist: a pick that
 * matches exactly one track's base name becomes that canonical track.
 * Ambiguous picks stay untouched (rendered as dashed extras).
 */
function mapPicksToTracklist(picks: string[], tracks: string[]): string[] {
  return picks.map((pick) => {
    if (tracks.includes(pick)) return pick
    const candidates = tracks.filter((t) => trackBase(t) === trackBase(pick))
    return candidates.length === 1 ? candidates[0] : pick
  })
}
export function ReviewEditorPage() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const [draft, setDraft] = useState<ReviewDraft | null>(null)
  const [createdAt, setCreatedAt] = useState<string | null>(null)
  const [genresText, setGenresText] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [bestText, setBestText] = useState('')
  const [worstText, setWorstText] = useState('')
  const [albumTracks, setAlbumTracks] = useState<string[]>([])
  const [loadingTracks, setLoadingTracks] = useState(false)
  const [seedQuery, setSeedQuery] = useState('')
  const [metaSource, setMetaSource] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (isNew) {
      const d = emptyDraft()
      setDraft(d)
      setGenresText('')
      setTagsText('')
      setBestText('')
      setWorstText('')
      setAlbumTracks([])
      setSeedQuery('')
      setMetaSource('')
      return
    }
    getReview(id!).then((r) => {
      if (!r) {
        setMissing(true)
        return
      }
      setDraft({ ...r })
      setCreatedAt(r.createdAt)
      setGenresText(r.genres.join('; '))
      setTagsText(r.tags.join('; '))
      setBestText(r.bestTracks.join('; '))
      setWorstText(r.worstTracks.join('; '))
      setMetaSource(r.metadataSource ?? '')
      if (r.artist.trim() && r.albumTitle.trim()) {
        setSeedQuery(`${r.artist} ${r.albumTitle}`)
      }
      // a review that was matched once reloads its real tracklist on every edit
      if (r.metadataProviderId) {
        setLoadingTracks(true)
        getMetadataProvider()
          .getTracklist(r.metadataProviderId)
          .then((tracks) => {
            setAlbumTracks(tracks)
            setDraft((d) =>
              d
                ? { ...d, bestTracks: mapPicksToTracklist(d.bestTracks, tracks), worstTracks: mapPicksToTracklist(d.worstTracks, tracks) }
                : d,
            )
          })
          .catch(() => setAlbumTracks([]))
          .finally(() => setLoadingTracks(false))
      }
    })
  }, [id, isNew])

  if (missing) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-cream-500">Diese Review existiert nicht (mehr).</p>
        <Link to="/archive" className="crate-btn"><ArrowLeft className="h-4 w-4" /> Zurück zum Archiv</Link>
      </div>
    )
  }
  if (!draft) return null

  // functional update: a batched click right after a chip pick must not stomp it
  const set = <K extends keyof ReviewDraft>(key: K, value: ReviewDraft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d))
  const canSave = draft.artist.trim() !== '' && draft.albumTitle.trim() !== ''

  function onAlbumPicked(album: AlbumSearchResult, tracks: string[]) {
    if (!draft) return
    setDraft((d) =>
      d
        ? {
            ...d,
            artist: album.artist,
            albumTitle: album.title,
            releaseYear: album.releaseYear,
            artworkUrl: album.artworkUrl,
            metadataProviderId: album.providerId,
            metadataSource: album.source,
          }
        : d,
    )
    setAlbumTracks(tracks)
    setMetaSource(album.source)
    // fold freetext picks (e.g. from imports) into the real tracklist where unambiguous
    setDraft((d) =>
      d
        ? { ...d, bestTracks: mapPicksToTracklist(d.bestTracks, tracks), worstTracks: mapPicksToTracklist(d.worstTracks, tracks) }
        : d,
    )
  }

  function toggleTrack(list: 'bestTracks' | 'worstTracks', name: string) {
    // functional update: rapid chip clicks must not lose each other's picks
    setDraft((d) =>
      d ? { ...d, [list]: d[list].includes(name) ? d[list].filter((t) => t !== name) : [...d[list], name] } : d,
    )
  }

  function clearTracklist() {
    setBestText(draft!.bestTracks.join('; '))
    setWorstText(draft!.worstTracks.join('; '))
    setAlbumTracks([])
  }

  async function save() {
    if (!draft || !canSave) return
    setSaving(true)
    const finalDraft: ReviewDraft = {
      ...draft,
      genres: splitList(genresText),
      tags: splitList(tagsText),
      bestTracks: albumTracks.length ? draft.bestTracks : splitList(bestText),
      worstTracks: albumTracks.length ? draft.worstTracks : splitList(worstText),
    }
    if (isNew) {
      const created = await createReview(finalDraft)
      navigate(`/archive/${created.id}`, { replace: true })
    } else {
      await updateReview(id!, finalDraft)
    }
    setSaving(false)
  }

  async function remove() {
    if (!id) return
    await deleteReview(id)
    navigate('/archive')
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/archive" className="kicker inline-flex items-center gap-1 hover:text-cream-300">
            <ArrowLeft className="h-3 w-3" /> Das Archiv
          </Link>
          <h1 className="page-title">
            {isNew ? 'Neue Review' : draft.albumTitle || 'Ohne Titel'}
          </h1>
          {!isNew && (
            <p className="mt-1 text-sm text-cream-500">
              {draft.artist}
              {createdAt ? ` · hinzugefügt am ${formatDate(createdAt)}` : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <RatingBadge rating={draft.rating} size="lg" />
          {!isNew && (
            <button className="crate-btn text-cream-500 hover:border-rust-600 hover:text-rust-300" onClick={() => setConfirmingDelete(true)} aria-label="Review löschen">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {confirmingDelete && (
        <div className="crate-card flex flex-wrap items-center justify-between gap-3 border-rust-700 p-4">
          <p className="text-sm text-cream-300">Diese Review endgültig löschen? Das lässt sich nicht rückgängig machen.</p>
          <div className="flex gap-2">
            <button className="crate-btn" onClick={() => setConfirmingDelete(false)}>Behalten</button>
            <button className="crate-btn-primary" onClick={remove}>Löschen</button>
          </div>
        </div>
      )}

      <AlbumSearch onPick={onAlbumPicked} initialQuery={seedQuery} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
        <div className="space-y-3">
          <div className="crate-card mx-auto max-w-60 overflow-hidden lg:mx-0 lg:max-w-none">
            <SleeveArtwork artist={draft.artist || '?'} albumTitle={draft.albumTitle || 'Ohne Titel'} artworkUrl={draft.artworkUrl} />
          </div>
          {metaSource && <p className="font-mono text-[10px] uppercase tracking-wider text-cream-600">Metadaten: {metaSource}</p>}
          <label className="block space-y-1">
            <span className="kicker">Artwork-URL</span>
            <input className="crate-input font-mono text-xs" placeholder="https://…" value={draft.artworkUrl ?? ''} onChange={(e) => set('artworkUrl', e.target.value || null)} />
          </label>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="kicker">Artist *</span>
              <input className="crate-input" value={draft.artist} onChange={(e) => set('artist', e.target.value)} placeholder="Gang Starr" />
            </label>
            <label className="block space-y-1">
              <span className="kicker">Album *</span>
              <input className="crate-input" value={draft.albumTitle} onChange={(e) => set('albumTitle', e.target.value)} placeholder="Moment of Truth" />
            </label>
            <label className="block space-y-1">
              <span className="kicker">Release-Jahr</span>
              <input className="crate-input" type="number" min={1900} max={2100} value={draft.releaseYear ?? ''} onChange={(e) => set('releaseYear', e.target.value ? Number(e.target.value) : null)} placeholder="1998" />
            </label>
            <label className="block space-y-1">
              <span className="kicker">Review-Datum</span>
              <input className="crate-input" type="date" value={draft.reviewDate ?? ''} onChange={(e) => set('reviewDate', e.target.value || null)} />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="kicker">Bewertung</span>
            <span className="flex flex-wrap gap-1.5">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => set('rating', draft.rating === n ? null : n)}
                  className={`h-9 w-9 rounded-lg border font-mono text-sm transition-colors ${
                    draft.rating !== null && n <= draft.rating
                      ? 'border-rust-500 bg-rust-500 text-cream-100'
                      : 'border-ink-600 text-cream-500 hover:border-rust-600 hover:text-cream-100'
                  }`}
                >
                  {n}
                </button>
              ))}
            </span>
          </label>

          <label className="block space-y-1">
            <span className="kicker">Deine Review</span>
            <textarea
              className="crate-input min-h-40 leading-relaxed"
              value={draft.reviewText}
              onChange={(e) => set('reviewText', e.target.value)}
              placeholder="Deine Worte, dein Urteil. Importierte Reviews bleiben wortgleich — hier wird nie etwas für dich umgeschrieben."
            />
          </label>

          {loadingTracks ? (
            <p className="flex items-center gap-2 text-sm text-cream-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Trackliste wird geladen…
            </p>
          ) : albumTracks.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="kicker">Trackliste des Albums ({albumTracks.length})</p>
                <button type="button" className="inline-flex items-center gap-1 text-xs text-cream-600 hover:text-cream-300" onClick={clearTracklist}>
                  <X className="h-3 w-3" /> Freitext statt Liste
                </button>
              </div>
              <TrackPicker label="Beste Tracks" tracks={albumTracks} selected={draft.bestTracks} onToggle={(t) => toggleTrack('bestTracks', t)} accent />
              <TrackPicker label="Schwächste Tracks" tracks={albumTracks} selected={draft.worstTracks} onToggle={(t) => toggleTrack('worstTracks', t)} />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="kicker">Beste Tracks <span className="normal-case tracking-normal text-cream-600">(mit ; trennen)</span></span>
                <input className="crate-input" value={bestText} onChange={(e) => setBestText(e.target.value)} placeholder="The World Is Yours; Memory Lane" />
              </label>
              <label className="block space-y-1">
                <span className="kicker">Schwächste Tracks <span className="normal-case tracking-normal text-cream-600">(mit ; trennen)</span></span>
                <input className="crate-input" value={worstText} onChange={(e) => setWorstText(e.target.value)} />
              </label>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="kicker">Genres <span className="normal-case tracking-normal text-cream-600">(mit ; trennen)</span></span>
              <input className="crate-input" value={genresText} onChange={(e) => setGenresText(e.target.value)} placeholder="East Coast Hip-Hop; Jazz Rap" />
            </label>
            <label className="block space-y-1">
              <span className="kicker">Tags <span className="normal-case tracking-normal text-cream-600">(mit ; trennen)</span></span>
              <input className="crate-input" value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="premo; klassiker" />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="kicker">Private Notizen</span>
            <textarea className="crate-input min-h-20" value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
          </label>

          <div className="flex items-center gap-3 pt-2">
            <button className="crate-btn-primary" disabled={!canSave || saving} onClick={save}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isNew ? 'In die Crate legen' : 'Änderungen speichern'}
            </button>
            {!canSave && <p className="text-xs text-cream-600">Artist und Albumtitel sind Pflicht.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

function TrackPicker({ label, tracks, selected, onToggle, accent }: { label: string; tracks: string[]; selected: string[]; onToggle: (t: string) => void; accent?: boolean }) {
  // own picks that are not on the provider tracklist (imports, bonus editions) stay visible and removable
  const extras = selected.filter((t) => !tracks.includes(t))
  return (
    <div className="space-y-1.5">
      <p className="kicker">{label}{selected.length > 0 ? ` (${selected.length})` : ''}</p>
      <div className="flex flex-wrap gap-1.5">
        {[...tracks, ...extras].map((t) => {
          const isExtra = extras.includes(t)
          const active = selected.includes(t)
          return (
            <button
              key={t}
              type="button"
              onClick={() => onToggle(t)}
              title={isExtra ? 'Dein Eintrag — nicht in der gefundenen Trackliste, bleibt erhalten' : undefined}
              className={cx(
                'rounded-lg border px-2 py-1 text-xs transition-colors',
                active
                  ? accent
                    ? 'border-rust-500 bg-rust-500 text-cream-100'
                    : 'border-cream-500 bg-cream-300 text-ink-950'
                  : 'border-ink-600 text-cream-500 hover:border-rust-600 hover:text-cream-100',
                isExtra && 'border-dashed',
              )}
            >
              {t}
            </button>
          )
        })}
      </div>
    </div>
  )
}
