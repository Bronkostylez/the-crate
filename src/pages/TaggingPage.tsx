import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, ArrowRight, Check, Dna, Plus, Tags } from 'lucide-react'
import { db } from '../db/local'
import { updateReview } from '../db/reviews'
import { SleeveArtwork } from '../components/SleeveArtwork'
import { EmptyState } from '../components/EmptyState'
import { cx, formatRating } from '../lib/utils'
import { pickQuip } from '../lib/quips'
import { Quip } from '../components/Quip'
import type { Review, ReviewDraft } from '../types'

function draftOf(r: Review): ReviewDraft {
  const { id: _id, createdAt: _c, updatedAt: _u, ...draft } = r
  return draft
}

const norm = (s: string) => s.trim().toLowerCase()

function chipClass(selected: boolean): string {
  return cx(
    'inline-flex min-h-10 items-center rounded-full border px-3.5 py-1.5 text-sm transition-all active:scale-95',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust-500/60',
    selected
      ? '-rotate-1 border-rust-600 bg-rust-500 font-semibold text-[#FFF3E2] shadow-[0_2px_0_rgba(0,0,0,0.45)]'
      : 'border-[#EFE9DC]/15 bg-ink-800 text-cream-300 hover:-translate-y-0.5 hover:border-[#EFE9DC]/35 hover:text-cream-100',
  )
}

export function TaggingPage() {
  const reviews = useLiveQuery(() => db.reviews.toArray(), [])
  const plays = useLiveQuery(() => db.plays.toArray(), [])

  // frozen queue order: untagged first, then most recently edited — re-sorting
  // mid-flow while chips get toggled would yank albums out from under the thumb
  const [queueIds, setQueueIds] = useState<string[] | null>(null)
  const [index, setIndex] = useState(0)
  const [newGenre, setNewGenre] = useState('')
  const [appliedNote, setAppliedNote] = useState<string | null>(null)

  useEffect(() => {
    if (queueIds === null && reviews) {
      const sorted = [...reviews].sort(
        (a, b) => Number(a.genres.length > 0) - Number(b.genres.length > 0) || b.updatedAt.localeCompare(a.updatedAt),
      )
      setQueueIds(sorted.map((r) => r.id))
      setIndex(0)
    }
  }, [reviews, queueIds])

  const byId = useMemo(() => new Map((reviews ?? []).map((r) => [r.id, r])), [reviews])
  const queue = useMemo(
    () => (queueIds ?? []).map((id) => byId.get(id)).filter((r): r is Review => !!r),
    [queueIds, byId],
  )

  // the taxonomy is his: only genres he already used, most-used first
  const taxonomy = useMemo(() => {
    const freq = new Map<string, number>()
    for (const r of reviews ?? []) for (const g of r.genres) freq.set(g, (freq.get(g) ?? 0) + 1)
    return [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de')).map(([g]) => g)
  }, [reviews])

  const untaggedTotal = useMemo(() => (reviews ?? []).filter((r) => r.genres.length === 0).length, [reviews])
  const current: Review | undefined = queue[index]
  const siblings = useMemo(
    () => (current ? (reviews ?? []).filter((r) => r.id !== current.id && norm(r.artist) === norm(current.artist)) : []),
    [reviews, current],
  )

  async function toggleGenre(review: Review, genre: string) {
    const has = review.genres.some((g) => norm(g) === norm(genre))
    const genres = has ? review.genres.filter((g) => norm(g) !== norm(genre)) : [...review.genres, genre]
    await updateReview(review.id, { ...draftOf(review), genres })
  }

  async function addNewGenre() {
    const g = newGenre.trim()
    if (!g || !current) return
    if (!current.genres.some((x) => norm(x) === norm(g))) await toggleGenre(current, g)
    setNewGenre('')
  }

  async function applyToArtist() {
    if (!current || current.genres.length === 0 || siblings.length === 0) return
    let changed = 0
    for (const r of siblings) {
      const merged = [...r.genres]
      for (const g of current.genres) if (!merged.some((x) => norm(x) === norm(g))) merged.push(g)
      if (merged.length !== r.genres.length) {
        await updateReview(r.id, { ...draftOf(r), genres: merged })
        changed++
      }
    }
    setAppliedNote(
      changed > 0
        ? `Übernommen für ${changed} ${changed === 1 ? 'weiteres Album' : 'weitere Alben'} von ${current.artist} — deren eigene Genres bleiben erhalten.`
        : `Die anderen Alben von ${current.artist} tragen diese Genres schon.`,
    )
  }

  function restart() {
    setQueueIds(null)
    setAppliedNote(null)
  }

  if (!reviews) return null

  if (reviews.length === 0) {
    return (
      <div className="space-y-8">
        <header>
          <p className="kicker">Genre-Runde</p>
          <h1 className="page-title">Tagg dein Regal.</h1>
        </header>
        <EmptyState
          icon={Tags}
          title="Noch keine Reviews im Archiv"
          body="Erst wenn Alben im Regal stehen, gibt es hier was zu taggen."
          action={<Link to="/archive/new" className="crate-btn-primary">Erste Review anlegen</Link>}
        />
      </div>
    )
  }

  const done = queue.length > 0 && index >= queue.length

  return (
    <div className="space-y-6">
      <header>
        <p className="kicker">Genre-Runde</p>
        <h1 className="page-title">Tagg dein Regal.</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-cream-500">
          Deine Genres, deine Taxonomie — nichts wird automatisch befüllt. Alles, was du hier setzt, fließt direkt in
          The DNA.
        </p>
        {reviews && plays && pickQuip('tagging', { reviews, plays, current, untagged: untaggedTotal }) && (
          <div className="mt-3">
            <Quip text={pickQuip('tagging', { reviews, plays, current, untagged: untaggedTotal })!} />
          </div>
        )}
      </header>

      {done || (queueIds !== null && queue.length === 0) ? (
        <div className="space-y-6">
          <EmptyState
            icon={untaggedTotal === 0 ? Check : Tags}
            title={untaggedTotal === 0 ? 'Alles getaggt.' : `Runde vorbei — noch ${untaggedTotal} ohne Genre`}
            body={
              untaggedTotal === 0
                ? 'Jedes Album im Regal trägt mindestens ein Genre. The DNA rechnet schon damit.'
                : 'Übersprungene Alben warten noch. Noch eine Runde?'
            }
            action={
              <div className="flex flex-wrap items-center justify-center gap-3">
                {untaggedTotal > 0 && (
                  <button className="crate-btn-primary" onClick={restart}>
                    Weiter taggen
                  </button>
                )}
                <Link to="/dna" className={untaggedTotal === 0 ? 'crate-btn-primary' : 'crate-btn'}>
                  <Dna className="h-4 w-4" /> Zu The DNA
                </Link>
              </div>
            }
          />
        </div>
      ) : current ? (
        <>
          {/* progress */}
          <div className="space-y-1.5">
            <p className="font-mono text-[11px] uppercase tracking-kicker text-cream-500">
              Album {index + 1} von {queue.length}
              {untaggedTotal > 0 && <> · {untaggedTotal} noch ohne Genre</>}
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
              <div
                className="h-full rounded-full bg-rust-500 transition-all duration-300"
                style={{ width: `${Math.round((index / queue.length) * 100)}%` }}
              />
            </div>
          </div>

          {/* remount per album => the card animates in on every step */}
          <div key={current.id} className="animate-page-enter space-y-6">
            <div className="crate-card halftone-corner flex items-center gap-4 p-4">
              <div className="w-24 shrink-0 -rotate-2 overflow-hidden rounded-xl shadow-[0_3px_0_rgba(0,0,0,0.4)] sm:w-28">
                <SleeveArtwork artist={current.artist} albumTitle={current.albumTitle} artworkUrl={current.artworkUrl} />
              </div>
              <div className="min-w-0">
                <p className="kicker">{current.artist}</p>
                <h2 className="mt-1 font-block text-lg uppercase leading-tight text-cream-100" style={{ textShadow: '2px 2px 0 rgba(201,48,24,0.6)' }}>{current.albumTitle}</h2>
                <p className="mt-1 text-sm text-cream-500">
                  {current.releaseYear ?? 'Jahr unbekannt'}
                  {current.rating != null && <> · {formatRating(current.rating)}</>}
                </p>
              </div>
            </div>

            <section className="space-y-3">
              <p className="kicker">Deine Genres</p>
              {taxonomy.length === 0 && (
                <p className="text-sm text-cream-500">
                  Noch keine Genres angelegt — unten das erste eintippen. Es wird ab sofort überall als Chip angeboten.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {taxonomy.map((g) => (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={current.genres.some((x) => norm(x) === norm(g))}
                    className={chipClass(current.genres.some((x) => norm(x) === norm(g)))}
                    onClick={() => void toggleGenre(current, g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  void addNewGenre()
                }}
              >
                <input
                  className="crate-input"
                  placeholder="Neues Genre eintippen …"
                  value={newGenre}
                  onChange={(e) => setNewGenre(e.target.value)}
                  aria-label="Neues Genre"
                />
                <button type="submit" className="crate-btn shrink-0" disabled={!newGenre.trim()} aria-label="Genre hinzufügen">
                  <Plus className="h-4 w-4" />
                </button>
              </form>
            </section>

            {siblings.length > 0 && (
              <section className="space-y-2">
                <button className="crate-btn-ghost" onClick={() => void applyToArtist()} disabled={current.genres.length === 0}>
                  Diese Genres für alle {siblings.length + 1} Alben von {current.artist} übernehmen
                </button>
                {appliedNote && <p className="text-xs text-cream-500">{appliedNote}</p>}
              </section>
            )}

            <div className="flex items-center gap-3">
              <button
                className="crate-btn-ghost"
                onClick={() => {
                  setIndex((i) => Math.max(0, i - 1))
                  setAppliedNote(null)
                }}
                disabled={index === 0}
              >
                <ArrowLeft className="h-4 w-4" /> Zurück
              </button>
              <button
                className="crate-btn-ghost"
                onClick={() => {
                  setIndex((i) => i + 1)
                  setAppliedNote(null)
                }}
              >
                Überspringen
              </button>
              <button
                className="crate-btn-primary ml-auto"
                onClick={() => {
                  setIndex((i) => i + 1)
                  setAppliedNote(null)
                }}
              >
                {index === queue.length - 1 ? 'Fertig' : 'Weiter'} <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
