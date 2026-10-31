import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react'
import { createReview, deleteReview, getReview, updateReview } from '../db/reviews'
import { RatingBadge } from '../components/RatingBadge'
import { SleeveArtwork } from '../components/SleeveArtwork'
import { emptyDraft } from '../types'
import { formatDate, splitList } from '../lib/utils'
import type { ReviewDraft } from '../types'

/** Create + edit + read one review. /archive/new starts blank, /archive/:id loads. */
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
      return
    }
    getReview(id).then((r) => {
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

  const set = <K extends keyof ReviewDraft>(key: K, value: ReviewDraft[K]) => setDraft({ ...draft, [key]: value })
  const canSave = draft.artist.trim() !== '' && draft.albumTitle.trim() !== ''

  async function save() {
    if (!draft || !canSave) return
    setSaving(true)
    const finalDraft: ReviewDraft = {
      ...draft,
      genres: splitList(genresText),
      tags: splitList(tagsText),
      bestTracks: splitList(bestText),
      worstTracks: splitList(worstText),
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
          <h1 className="mt-1 font-display text-3xl">
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

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <div className="space-y-3">
          <div className="crate-card overflow-hidden">
            <SleeveArtwork artist={draft.artist || '?'} albumTitle={draft.albumTitle || 'Ohne Titel'} artworkUrl={draft.artworkUrl} />
          </div>
          <label className="block space-y-1">
            <span className="kicker">Artwork-URL</span>
            <input className="crate-input font-mono text-xs" placeholder="https://…" value={draft.artworkUrl ?? ''} onChange={(e) => set('artworkUrl', e.target.value || null)} />
          </label>
        </div>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
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
                  className={`h-9 w-9 rounded-sm border font-mono text-sm transition-colors ${
                    draft.rating !== null && n <= draft.rating
                      ? 'border-rust-500 bg-rust-500 text-ink-950'
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

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="kicker">Beste Tracks <span className="normal-case tracking-normal text-cream-600">(mit ; trennen)</span></span>
              <input className="crate-input" value={bestText} onChange={(e) => setBestText(e.target.value)} placeholder="The World Is Yours; Memory Lane" />
            </label>
            <label className="block space-y-1">
              <span className="kicker">Schwächste Tracks <span className="normal-case tracking-normal text-cream-600">(mit ; trennen)</span></span>
              <input className="crate-input" value={worstText} onChange={(e) => setWorstText(e.target.value)} />
            </label>
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
