import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowRight, Disc3 } from 'lucide-react'
import { db } from '../db/local'
import { StatCard } from '../components/StatCard'
import { RatingBadge } from '../components/RatingBadge'
import { SleeveArtwork } from '../components/SleeveArtwork'
import { EmptyState } from '../components/EmptyState'
import { formatDate } from '../lib/utils'

const tooltipStyle = {
  backgroundColor: '#F7F0DE',
  border: '2px solid #241C0E',
  borderRadius: 2,
  fontSize: 12,
  color: '#211A0E',
}

export function OverviewPage() {
  const reviews = useLiveQuery(() => db.reviews.toArray(), [])

  if (!reviews) return null

  if (reviews.length === 0) {
    return (
      <div className="space-y-8">
        <header>
          <p className="kicker">Überblick</p>
          <h1 className="mt-1 font-display text-3xl md:text-4xl">Dein Hip-Hop-Universum, in Zahlen.</h1>
        </header>
        <EmptyState
          icon={Disc3}
          title="Die Crate ist noch leer"
          body="Hörstatistiken, Charts und Meilensteine erscheinen hier, sobald echte Daten existieren — hier wird nie etwas erfunden. Fang mit deinen 30 Album-Reviews an; Spotify-Verlauf und Playlist-Importe kommen in den nächsten Etappen."
          action={
            <Link to="/import" className="crate-btn-primary">
              Reviews importieren <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />
        <Roadmap />
      </div>
    )
  }

  const rated = reviews.filter((r) => r.rating !== null)
  const avg = rated.length ? rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length : null
  const tens = rated.filter((r) => r.rating === 10).length
  const artistCount = new Set(reviews.map((r) => r.artist.toLowerCase())).size
  const genreCount = new Set(reviews.flatMap((r) => r.genres.map((g) => g.toLowerCase()))).size

  const distribution = Array.from({ length: 10 }, (_, i) => ({
    rating: `${i + 1}`,
    count: rated.filter((r) => r.rating === i + 1).length,
  }))

  const topRated = [...rated].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 5)
  const recent = [...reviews].sort((a, b) => (b.reviewDate ?? b.createdAt).localeCompare(a.reviewDate ?? a.createdAt)).slice(0, 5)

  return (
    <div className="space-y-8">
      <header>
        <p className="kicker">Überblick</p>
        <h1 className="mt-1 font-display text-3xl md:text-4xl">Dein Hip-Hop-Universum, in Zahlen.</h1>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Rezensierte Alben" value={reviews.length} />
        <StatCard label="Ø Bewertung" value={avg === null ? '—' : avg.toFixed(1)} sub={rated.length ? `aus ${rated.length} bewerteten Alben` : undefined} />
        <StatCard label="Perfekte 10en" value={tens} />
        <StatCard label="Artists im Archiv" value={artistCount} sub={`${genreCount} Genres getaggt`} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="crate-card p-5">
          <p className="kicker rule">Bewertungs-Verteilung</p>
          <div className="mt-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distribution} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <XAxis dataKey="rating" stroke="#827452" fontSize={11} fontFamily="IBM Plex Mono" tickLine={false} axisLine={{ stroke: '#D3C5A0' }} />
                <YAxis stroke="#827452" fontSize={11} fontFamily="IBM Plex Mono" tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(36,28,14,0.08)' }} />
                <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                  {distribution.map((d) => (
                    <Cell key={d.rating} fill={d.count > 0 ? '#9C4420' : '#DCCFB0'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="crate-card p-5">
          <p className="kicker rule">Am besten bewertet</p>
          <ul className="mt-3 divide-y divide-ink-700">
            {topRated.map((r) => (
              <li key={r.id}>
                <Link to={`/archive/${r.id}`} className="flex items-center gap-3 py-2.5 hover:bg-ink-800">
                  <span className="w-12 shrink-0 overflow-hidden rounded-sm"><SleeveArtwork artist={r.artist} albumTitle={r.albumTitle} artworkUrl={r.artworkUrl} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-cream-100">{r.albumTitle}</span>
                    <span className="block truncate text-xs text-cream-500">{r.artist}{r.releaseYear ? ` · ${r.releaseYear}` : ''}</span>
                  </span>
                  <RatingBadge rating={r.rating} size="sm" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="crate-card p-5">
        <p className="kicker rule">Zuletzt rezensiert</p>
        <ul className="mt-3 divide-y divide-ink-700">
          {recent.map((r) => (
            <li key={r.id}>
              <Link to={`/archive/${r.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-ink-800">
                <span className="min-w-0">
                  <span className="block truncate text-sm text-cream-100">{r.artist} — {r.albumTitle}</span>
                  <span className="block text-xs text-cream-500">{formatDate(r.reviewDate ?? r.createdAt)}</span>
                </span>
                <RatingBadge rating={r.rating} size="sm" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Roadmap />
    </div>
  )
}

function Roadmap() {
  const stages = [
    { n: '01', title: 'Archiv + Importe', state: 'dieser build', done: true },
    { n: '02', title: 'Hörverlauf (Spotify Extended Streaming History)', state: 'dieser build', done: true },
    { n: '03', title: 'Playlist-Analyse', state: 'dieser build', done: true },
    { n: '04', title: 'The DNA — deine musikalische Identität', state: 'dieser build', done: true },
    { n: '05', title: 'Recaps + PWA', state: 'dieser build', done: true },
    { n: '06', title: 'Supabase-Cloud-Sync', state: 'später' },
  ]
  return (
    <section className="crate-card p-5">
      <p className="kicker rule">Bauplan</p>
      <ol className="mt-3 space-y-2">
        {stages.map((s) => (
          <li key={s.n} className="flex items-baseline gap-3 text-sm">
            <span className="font-mono text-xs text-rust-400">{s.n}</span>
            <span className={s.done ? 'text-cream-100' : 'text-cream-500'}>{s.title}</span>
            <span className="ml-auto font-mono text-[11px] uppercase tracking-kicker text-cream-600">{s.state}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
