import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowRight, History, RefreshCw, Search } from 'lucide-react'
import { db } from '../db/local'
import { computeHistoryStats, formatDuration } from '../db/plays'
import { StatCard } from '../components/StatCard'
import { EmptyState } from '../components/EmptyState'
import { formatDate } from '../lib/utils'
import { spotifyConnected } from '../lib/spotify/auth'
import { lastHistorySync, SpotifySyncError, syncRecentlyPlayed } from '../lib/spotify/sync'

const RANGES = [
  { days: 7, label: '7 Tage' },
  { days: 30, label: '30 Tage' },
  { days: 365, label: '12 Monate' },
  { days: null, label: 'Gesamt' },
] as const

const tooltipStyle = {
  backgroundColor: '#181924',
  border: '1px solid rgba(239,233,220,0.2)',
  borderRadius: 12,
  fontSize: 12,
  color: '#EFE9DC',
}

export function HistoryPage() {
  const plays = useLiveQuery(() => db.plays.toArray(), [])
  const [rangeDays, setRangeDays] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncNote, setSyncNote] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<string | null>(() => lastHistorySync())
  const autoSyncDone = useRef(false)
  const connected = spotifyConnected()

  async function runSync() {
    setSyncing(true)
    setSyncNote(null)
    try {
      const r = await syncRecentlyPlayed()
      setLastSync(r.syncedAt)
      setSyncNote(
        r.added > 0
          ? `${r.added} neue Plays von Spotify geholt.`
          : 'Alles aktuell — keine neuen Plays seit der letzten Synchronisierung.',
      )
    } catch (e) {
      if (e instanceof SpotifySyncError && e.needsReconnect) {
        setSyncNote(`${e.message}`)
      } else {
        setSyncNote(e instanceof Error ? e.message : 'Sync fehlgeschlagen.')
      }
    } finally {
      setSyncing(false)
    }
  }

  // auto-sync once per visit when Spotify is connected
  useEffect(() => {
    if (connected && !autoSyncDone.current) {
      autoSyncDone.current = true
      void runSync()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected])

  const stats = useMemo(() => (plays ? computeHistoryStats(plays, rangeDays) : null), [plays, rangeDays])

  const visiblePlays = useMemo(() => {
    if (!plays) return []
    const q = query.trim().toLowerCase()
    const cutoff = rangeDays === null ? null : Date.now() - rangeDays * 24 * 3600 * 1000
    return plays
      .filter((p) => {
        if (cutoff !== null && new Date(p.playedAt).getTime() < cutoff) return false
        if (q && ![p.trackName, p.artistName, p.albumName ?? ''].join(' ').toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt))
      .slice(0, 100)
  }, [plays, query, rangeDays])

  if (!plays || !stats) return null

  if (plays.length === 0) {
    return (
      <div className="space-y-8">
        <header>
          <p className="kicker">Hörverlauf</p>
          <h1 className="mt-1 font-display text-3xl">Was wirklich gelaufen ist.</h1>
        </header>
        <EmptyState
          icon={History}
          title="Noch kein Hörverlauf"
          body={
            connected
              ? 'Du hörst schon, aber hier ist noch nichts angekommen? Hol deine letzten 50 Plays direkt von Spotify — sofort, ohne Export. Für die komplette Historie mit echten Hörzeiten forderst du zusätzlich die Extended Streaming History an (Konto → Datenschutz → Daten herunterladen) und importierst sie hier.'
              : 'Fordere bei Spotify deine Extended Streaming History an (Konto → Datenschutz → Daten herunterladen) und importiere die JSON-Dateien hier. Jede Statistik kommt dann aus deinen echten Plays — Quelle ist immer am Import erkennbar.'
          }
          action={
            connected ? (
              <button className="crate-btn-primary" onClick={() => void runSync()} disabled={syncing}>
                <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Synchronisiere…' : 'Letzte 50 Plays von Spotify holen'}
              </button>
            ) : (
              <Link to="/import" className="crate-btn-primary">
                Zum Import <ArrowRight className="h-4 w-4" />
              </Link>
            )
          }
        />
        {syncNote && <p className="text-center text-xs text-rust-400">{syncNote}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">Hörverlauf</p>
          <h1 className="mt-1 font-display text-3xl">Was wirklich gelaufen ist.</h1>
          <p className="mt-1 text-sm text-cream-500">
            {plays.length.toLocaleString('de-DE')} Plays · Quelle:{' '}
            {plays.some((p) => p.source === 'spotify_api') ? 'Spotify-Export + Live-Sync' : 'Spotify-Export'}
          </p>
          {connected && (
            <p className="mt-1 text-xs text-cream-600">
              {lastSync
                ? `Zuletzt synchronisiert: ${formatDate(lastSync)} ${new Date(lastSync).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} · `
                : ''}
              Live-Sync holt die letzten 50 Plays — ohne Hörzeit, die gibt Spotify nicht heraus. Die volle
              Historie mit Minuten kommt weiterhin aus dem Extended-Export (Import).
            </p>
          )}
          {syncNote && <p className="mt-1 text-xs text-rust-400">{syncNote}</p>}
        </div>
        {connected && (
          <button className="crate-btn" onClick={() => void runSync()} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Synchronisiere…' : 'Von Spotify aktualisieren'}
          </button>
        )}
        <div className="flex overflow-hidden rounded-lg border border-ink-600">
          {RANGES.map((r) => (
            <button
              key={r.label}
              className={`px-3 py-2 text-xs ${rangeDays === r.days ? 'bg-ink-700 text-cream-100' : 'text-cream-500 hover:text-cream-300'}`}
              onClick={() => setRangeDays(r.days)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Hörzeit" value={formatDuration(stats.totalMs)} />
        <StatCard label="Plays" value={stats.totalPlays.toLocaleString('de-DE')} />
        <StatCard label="Artists" value={stats.artists.toLocaleString('de-DE')} />
        <StatCard label="Tracks" value={stats.tracks.toLocaleString('de-DE')} />
      </section>

      <section className="crate-card p-5">
        <p className="kicker rule">Minuten pro Tag</p>
        <div className="mt-4 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.minutesPerDay} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <XAxis dataKey="day" stroke="#8B8578" fontSize={10} fontFamily="IBM Plex Mono" tickLine={false} axisLine={{ stroke: '#3A3D4C' }} interval="preserveStartEnd" minTickGap={40} />
              <YAxis stroke="#8B8578" fontSize={11} fontFamily="IBM Plex Mono" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(239,233,220,0.06)' }} formatter={(v) => [`${v} Min`, 'Hörzeit']} />
              <Bar dataKey="minutes" radius={[2, 2, 0, 0]}>
                {stats.minutesPerDay.map((d) => (
                  <Cell key={d.day} fill="#E04424" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="crate-card p-5">
          <p className="kicker rule">Top Artists <span className="normal-case tracking-normal">(nach Hörzeit)</span></p>
          <ol className="mt-3 divide-y divide-ink-700">
            {stats.topArtists.map((a, i) => (
              <li key={a.name} className="flex items-center gap-3 py-2">
                <span className="w-6 font-mono text-xs text-rust-400">{String(i + 1).padStart(2, '0')}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-cream-100">{a.name}</span>
                <span className="font-mono text-xs text-cream-500">{formatDuration(a.ms)}</span>
                <span className="w-14 text-right font-mono text-xs text-cream-600">{a.plays}×</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="crate-card p-5">
          <p className="kicker rule">Top Tracks <span className="normal-case tracking-normal">(nach Hörzeit)</span></p>
          <ol className="mt-3 divide-y divide-ink-700">
            {stats.topTracks.map((t, i) => (
              <li key={`${t.name}-${t.artist}`} className="flex items-center gap-3 py-2">
                <span className="w-6 font-mono text-xs text-rust-400">{String(i + 1).padStart(2, '0')}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-cream-100">{t.name}</span>
                  <span className="block truncate text-xs text-cream-500">{t.artist}</span>
                </span>
                <span className="font-mono text-xs text-cream-500">{formatDuration(t.ms)}</span>
                <span className="w-14 text-right font-mono text-xs text-cream-600">{t.plays}×</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-600" />
          <input
            className="crate-input pl-9"
            placeholder="Track, Artist oder Album im Verlauf suchen…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="crate-card divide-y divide-ink-700">
          {visiblePlays.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-cream-500">Nichts gefunden in diesem Zeitraum.</p>
          ) : (
            visiblePlays.map((p) => (
              <div key={p.id} className="flex items-center gap-4 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-cream-100">{p.trackName}</span>
                  <span className="block truncate text-xs text-cream-500">{p.artistName}{p.albumName ? ` · ${p.albumName}` : ''}</span>
                </span>
                <span className="hidden w-20 text-right font-mono text-xs text-cream-600 sm:block" title={p.source === 'spotify_api' ? 'Live-Sync: Spotify liefert keine Hörzeit' : undefined}>
                  {p.source === 'spotify_api' ? '–' : formatDuration(p.msPlayed)}
                </span>
                <span className="w-28 text-right font-mono text-xs text-cream-600">
                  {formatDate(p.playedAt)} {new Date(p.playedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))
          )}
        </div>
        {visiblePlays.length === 100 && <p className="text-center text-xs text-cream-600">Die letzten 100 Treffer — Suche eingrenzen für mehr.</p>}
      </section>
    </div>
  )
}
