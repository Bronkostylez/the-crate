import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, CalendarRange, Download, Sparkles } from 'lucide-react'
import html2canvas from 'html2canvas'
import { db } from '../db/local'
import { computeRecap, listPeriods, type PeriodOption } from '../lib/recap'
import { EmptyState } from '../components/EmptyState'
import { formatDuration } from '../db/plays'
import { formatDate } from '../lib/utils'

export function RecapPage() {
  const plays = useLiveQuery(() => db.plays.toArray(), [])
  const reviews = useLiveQuery(() => db.reviews.toArray(), [])
  const periods = useMemo(() => (plays ? listPeriods(plays) : []), [plays])
  const [selected, setSelected] = useState<PeriodOption | null>(null)
  const [exporting, setExporting] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const active = selected ?? periods[0] ?? null
  const recap = useMemo(
    () => (plays && reviews && active ? computeRecap(plays, reviews, active.year, active.month) : null),
    [plays, reviews, active],
  )

  async function exportPng() {
    if (!cardRef.current || !recap) return
    setExporting(true)
    try {
      const canvas = await html2canvas(cardRef.current, { backgroundColor: '#0C0D14', scale: 2 })
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = `the-crate-recap-${recap.label.toLowerCase().replace(/\s+/g, '-')}.png`
      a.click()
    } finally {
      setExporting(false)
    }
  }

  if (!plays || !reviews) return null

  if (plays.length === 0) {
    return (
      <div className="space-y-8">
        <header>
          <p className="kicker">Recaps</p>
          <h1 className="mt-1 font-display text-3xl">Dein Monat. Dein Jahr. Dein Sound.</h1>
        </header>
        <EmptyState
          icon={CalendarRange}
          title="Noch keine Recaps möglich"
          body="Recaps entstehen aus deinem Hörverlauf. Importiere deine Spotify Extended Streaming History — danach bekommst du jeden Monat und jedes Jahr deine persönliche Auswertung: Tops, Entdeckungen, Rekorde und ehrliche Kommentare."
          action={
            <Link to="/import" className="crate-btn-primary">
              Zum Import <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">Recaps</p>
          <h1 className="mt-1 font-display text-3xl">Dein Monat. Dein Jahr. Dein Sound.</h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="crate-input w-auto"
            value={active ? `${active.year}-${active.month ?? 'all'}` : ''}
            onChange={(e) => {
              const [y, m] = e.target.value.split('-')
              setSelected({ year: Number(y), month: m === 'all' ? null : Number(m), label: e.target.selectedOptions[0].text })
            }}
          >
            {periods.map((p) => (
              <option key={`${p.year}-${p.month ?? 'all'}`} value={`${p.year}-${p.month ?? 'all'}`}>{p.label}</option>
            ))}
          </select>
          <button className="crate-btn-ghost" onClick={() => void exportPng()} disabled={exporting || !recap}>
            <Download className="h-4 w-4" /> {exporting ? 'Exportiert…' : 'Als Bild'}
          </button>
        </div>
      </header>

      {recap && (
        <div ref={cardRef} className="space-y-6 rounded-lg bg-ink-950 p-1">
          <section className="crate-card border-rust-600 p-6">
            <p className="kicker text-rust-400">The Crate Recap</p>
            <h2 className="mt-1 font-display text-4xl">{recap.label}</h2>
            <div className="mt-4 grid grid-cols-3 gap-3 animate-stagger">
              <div>
                <p className="kicker">Hörzeit</p>
                <p className="mt-1 font-display text-xl leading-tight text-cream-100 sm:text-2xl">
                  {recap.estimatedMs > 0 ? 'ca. ' : ''}{formatDuration(recap.totalMs)}
                </p>
                {recap.estimatedMs > 0 && (
                  <p className="mt-0.5 text-[11px] text-cream-600">inkl. Schätzung aus Songlängen (Live-Sync)</p>
                )}
              </div>
              <div>
                <p className="kicker">Plays</p>
                <p className="mt-1 font-display text-xl leading-tight text-cream-100 sm:text-2xl">{recap.playCount.toLocaleString('de-DE')}</p>
              </div>
              <div>
                <p className="kicker">Aktive Tage</p>
                <p className="mt-1 font-display text-xl leading-tight text-cream-100 sm:text-2xl">{recap.activeDays}</p>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="crate-card p-5">
              <p className="kicker rule">Top Artists</p>
              <ol className="mt-3 divide-y divide-ink-700">
                {recap.topArtists.map((a, i) => (
                  <li key={a.name} className="flex items-center gap-3 py-2">
                    <span className="w-6 font-mono text-xs text-rust-400">{String(i + 1).padStart(2, '0')}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-cream-100">{a.name}</span>
                    <span className="font-mono text-xs text-cream-500">{formatDuration(a.ms)}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="crate-card p-5">
              <p className="kicker rule">Top Tracks</p>
              <ol className="mt-3 divide-y divide-ink-700">
                {recap.topTracks.map((t, i) => (
                  <li key={`${t.name}-${t.artist}`} className="flex items-center gap-3 py-2">
                    <span className="w-6 font-mono text-xs text-rust-400">{String(i + 1).padStart(2, '0')}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-cream-100">{t.name}</span>
                      <span className="block truncate text-xs text-cream-500">{t.artist}</span>
                    </span>
                    <span className="font-mono text-xs text-cream-600">{t.plays}×</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="crate-card p-5">
              <p className="kicker rule">Top Alben</p>
              {recap.topAlbums.length === 0 ? (
                <p className="mt-3 text-sm text-cream-500">Keine Album-Infos im Export.</p>
              ) : (
                <ol className="mt-3 divide-y divide-ink-700">
                  {recap.topAlbums.map((a, i) => (
                    <li key={`${a.name}-${a.artist}`} className="flex items-center gap-3 py-2">
                      <span className="w-6 font-mono text-xs text-rust-400">{String(i + 1).padStart(2, '0')}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-cream-100">{a.name}</span>
                        <span className="block truncate text-xs text-cream-500">{a.artist}</span>
                      </span>
                      <span className="font-mono text-xs text-cream-500">{formatDuration(a.ms)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>

          {(recap.topGenres.length > 0 || recap.newArtists.length > 0 || recap.bestDay) && (
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {recap.topGenres.length > 0 && (
                <div className="crate-card p-5">
                  <p className="kicker rule">Top Genres <span className="normal-case tracking-normal">(gematcht)</span></p>
                  <ol className="mt-3 divide-y divide-ink-700">
                    {recap.topGenres.map((g) => (
                      <li key={g.genre} className="flex items-center gap-3 py-2">
                        <span className="min-w-0 flex-1 truncate text-sm text-cream-100">{g.genre}</span>
                        <span className="font-mono text-xs text-cream-500">{formatDuration(g.ms)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {recap.newArtists.length > 0 && (
                <div className="crate-card p-5">
                  <p className="kicker rule">Entdeckungen <span className="normal-case tracking-normal">({recap.newArtists.length})</span></p>
                  <ul className="mt-3 space-y-1.5">
                    {recap.newArtists.slice(0, 8).map((a) => (
                      <li key={a} className="truncate text-sm text-cream-100">{a}</li>
                    ))}
                    {recap.newArtists.length > 8 && <li className="text-xs text-cream-600">… und {recap.newArtists.length - 8} weitere</li>}
                  </ul>
                </div>
              )}
              {(recap.bestDay || recap.comparison) && (
                <div className="crate-card p-5">
                  <p className="kicker rule">Rekorde & Vergleich</p>
                  <div className="mt-3 space-y-2 text-sm text-cream-300">
                    {recap.bestDay && <p>Bester Tag: {formatDate(recap.bestDay.date)} — {formatDuration(recap.bestDay.ms)}</p>}
                    {recap.comparison && (
                      <p>
                        {recap.comparison.deltaPct !== null && recap.comparison.deltaPct >= 0 ? '+' : ''}
                        {recap.comparison.deltaPct}% Hörzeit ggü. {recap.prevLabel}
                        {recap.comparison.prevTopArtist ? ` · Top dort: ${recap.comparison.prevTopArtist}` : ''}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          {recap.observations.length > 0 && (
            <section className="crate-card p-5">
              <p className="kicker rule flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-rust-400" /> Die Crate sagt</p>
              <ul className="mt-3 space-y-2">
                {recap.observations.map((o, i) => (
                  <li key={i} className="text-sm leading-relaxed text-cream-300">{o}</li>
                ))}
              </ul>
            </section>
          )}

          <p className="pb-2 text-center font-mono text-xs text-cream-600">THE CRATE · {recap.label} · aus {recap.playCount.toLocaleString('de-DE')} echten Plays</p>
        </div>
      )}
    </div>
  )
}
