import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowRight, Check, ExternalLink, ListMusic, Pencil, Search, Trash2, X } from 'lucide-react'
import { db } from '../db/local'
import {
  computePlaylistStats,
  deleteSnapshot,
  diffTrackLists,
  playlistTracksToCsv,
  playlistTracksToJson,
  renameSnapshot,
  snapshotDiff,
  type PlaylistStats,
} from '../db/playlists'
import { StatCard } from '../components/StatCard'
import { EmptyState } from '../components/EmptyState'
import { downloadFile, formatDate } from '../lib/utils'
import { getPlaylistLink } from '../lib/playlistLink'
import { formatDuration } from '../db/plays'
import type { PlaylistSnapshot, PlaylistTrack, SnapshotDiff } from '../types'

const tooltipStyle = {
  backgroundColor: '#1D1A15',
  border: '1px solid #3B342A',
  borderRadius: 2,
  fontSize: 12,
  color: '#EFE7D7',
}

const SOURCE_LABELS: Record<PlaylistSnapshot['source'], string> = {
  spotify_account_export: 'Spotify-Datenexport',
  exportify_csv: 'Exportify-CSV',
  csv_template: 'CSV-Template',
}

export function PlaylistPage() {
  const snapshots = useLiveQuery(() => db.playlistSnapshots.orderBy('importedAt').toArray(), [])
  const latest = snapshots?.[snapshots.length - 1]
  const tracks = useLiveQuery(
    () => (latest ? db.playlistTracks.where('snapshotId').equals(latest.id).sortBy('position') : Promise.resolve([] as PlaylistTrack[])),
    [latest?.id],
  )
  const [query, setQuery] = useState('')

  const stats: PlaylistStats | null = useMemo(() => (tracks && tracks.length > 0 ? computePlaylistStats(tracks) : null), [tracks])

  const visibleTracks = useMemo(() => {
    if (!tracks) return []
    const q = query.trim().toLowerCase()
    if (!q) return tracks
    return tracks.filter((t) => [t.trackName, t.artistName, t.albumName ?? ''].join(' ').toLowerCase().includes(q))
  }, [tracks, query])

  if (!snapshots || !tracks) return null

  if (snapshots.length === 0) {
    return (
      <div className="space-y-8">
        <header>
          <p className="kicker">Die Playlist</p>
          <h1 className="mt-1 font-display text-3xl">Deine Playlist, seziert.</h1>
        </header>
        <EmptyState
          icon={ListMusic}
          title="Noch keine Playlist importiert"
          body="Importiere deine Playlist aus Spotifys Datenexport (Playlist-JSON in den Kontodaten) oder als CSV. Der Name kommt aus deiner Datei — hier wird nichts hart verdrahtet. Daraus entstehen Verteilungen, Kollaborationen, Fundstücke und eine durchsuchbare Tabelle."
          action={
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link to="/import" className="crate-btn-primary">
                Zum Import <ArrowRight className="h-4 w-4" />
              </Link>
              <a href={getPlaylistLink()} target="_blank" rel="noreferrer" className="crate-btn-ghost">
                Deine Playlist auf Spotify <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">Die Playlist</p>
          <h1 className="mt-1 font-display text-3xl">{latest!.name}</h1>
          <p className="mt-1 text-sm text-cream-500">
            {latest!.trackCount.toLocaleString('de-DE')} Tracks · Stand: Import vom {formatDate(latest!.importedAt)} · Quelle: {SOURCE_LABELS[latest!.source]}
          </p>
          <p className="mt-0.5 text-xs text-cream-600">Playlist-Platzierung ist kein Hören — Zahlen hier beschreiben die Zusammenstellung, nicht dein Hörverhalten.</p>
        </div>
        <a href={latest!.spotifyUrl ?? getPlaylistLink()} target="_blank" rel="noreferrer" className="crate-btn-ghost">
          Auf Spotify öffnen <ExternalLink className="h-4 w-4" />
        </a>
      </header>

      {stats && (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Tracks" value={stats.trackCount.toLocaleString('de-DE')} />
            <StatCard label="Artists" value={stats.artistCount.toLocaleString('de-DE')} />
            <StatCard label="Alben" value={stats.albumCount.toLocaleString('de-DE')} />
            <StatCard label="Mehrfach enthalten" value={stats.repeatedCount.toLocaleString('de-DE')} sub={stats.repeatedCount > 0 ? 'gleicher Track, mehrere Positionen' : undefined} />
          </section>

          <section className="crate-card p-5">
            <p className="kicker rule">Jahrzehnte</p>
            {stats.yearsKnown === 0 ? (
              <p className="mt-3 text-sm text-cream-500">
                Dein Export enthält keine Erscheinungsjahre — die Playlist-JSON aus Spotifys Kontodaten liefert leider keine.
                Mit einem Exportify-CSV (oder später der Spotify-API) füllt sich dieses Chart.
              </p>
            ) : (
              <>
                <div className="mt-4 h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.decades} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                      <XAxis dataKey="decade" stroke="#7D7260" fontSize={11} fontFamily="IBM Plex Mono" tickLine={false} axisLine={{ stroke: '#2A251E' }} />
                      <YAxis stroke="#7D7260" fontSize={11} fontFamily="IBM Plex Mono" tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#2A251E55' }} formatter={(v) => [`${v} Tracks`, 'Jahrzehnt']} />
                      <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                        {stats.decades.map((d) => (
                          <Cell key={d.decade} fill="#C05B24" />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-xs text-cream-600">{stats.yearsKnown.toLocaleString('de-DE')} von {stats.trackCount.toLocaleString('de-DE')} Tracks mit bekanntem Jahr.</p>
              </>
            )}
          </section>

          {(stats.oldest || stats.newest) && (
            <section className="grid gap-3 md:grid-cols-2">
              {stats.oldest && (
                <div className="crate-card px-4 py-3">
                  <p className="kicker">Ältestes Release</p>
                  <p className="mt-1 text-sm text-cream-100">{stats.oldest.track}</p>
                  <p className="text-xs text-cream-500">{stats.oldest.artist} · {stats.oldest.year}</p>
                </div>
              )}
              {stats.newest && (
                <div className="crate-card px-4 py-3">
                  <p className="kicker">Neustes Release</p>
                  <p className="mt-1 text-sm text-cream-100">{stats.newest.track}</p>
                  <p className="text-xs text-cream-500">{stats.newest.artist} · {stats.newest.year}</p>
                </div>
              )}
            </section>
          )}

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="crate-card p-5">
              <p className="kicker rule">Meistvertretene Artists</p>
              <ol className="mt-3 divide-y divide-ink-700">
                {stats.topArtists.map((a, i) => (
                  <li key={a.name} className="flex items-center gap-3 py-2">
                    <span className="w-6 font-mono text-xs text-rust-400">{String(i + 1).padStart(2, '0')}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-cream-100">{a.name}</span>
                    <span className="w-16 text-right font-mono text-xs text-cream-600">{a.count} Tracks</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="crate-card p-5">
              <p className="kicker rule">Meistvertretene Alben</p>
              {stats.topAlbums.length === 0 ? (
                <p className="mt-3 text-sm text-cream-500">Keine Album-Namen im Export enthalten.</p>
              ) : (
                <ol className="mt-3 divide-y divide-ink-700">
                  {stats.topAlbums.map((a, i) => (
                    <li key={`${a.name}-${a.artist}`} className="flex items-center gap-3 py-2">
                      <span className="w-6 font-mono text-xs text-rust-400">{String(i + 1).padStart(2, '0')}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-cream-100">{a.name}</span>
                        <span className="block truncate text-xs text-cream-500">{a.artist}</span>
                      </span>
                      <span className="w-16 text-right font-mono text-xs text-cream-600">{a.count} Tracks</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="crate-card p-5">
              <p className="kicker rule">Kollaborationen <span className="normal-case tracking-normal">({stats.collabs.length})</span></p>
              {stats.collabs.length === 0 ? (
                <p className="mt-3 text-sm text-cream-500">Keine Tracks mit mehreren Artists oder Features gefunden.</p>
              ) : (
                <ol className="mt-3 divide-y divide-ink-700">
                  {stats.collabs.slice(0, 10).map((c, i) => (
                    <li key={`${c.track}-${i}`} className="py-2">
                      <span className="block truncate text-sm text-cream-100">{c.track}</span>
                      <span className="block truncate text-xs text-cream-500">{c.artists.join(' × ')}</span>
                    </li>
                  ))}
                </ol>
              )}
              {stats.collabs.length > 10 && <p className="mt-2 text-xs text-cream-600">… und {stats.collabs.length - 10} weitere — Suchfeld nutzen.</p>}
            </div>
            <div className="crate-card p-5">
              <p className="kicker rule">Mehrfach enthalten <span className="normal-case tracking-normal">({stats.repeated.length})</span></p>
              {stats.repeated.length === 0 ? (
                <p className="mt-3 text-sm text-cream-500">Kein Track kommt doppelt vor.</p>
              ) : (
                <ol className="mt-3 divide-y divide-ink-700">
                  {stats.repeated.slice(0, 10).map((r) => (
                    <li key={`${r.track}-${r.artist}`} className="flex items-center gap-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-cream-100">{r.track}</span>
                        <span className="block truncate text-xs text-cream-500">{r.artist}</span>
                      </span>
                      <span className="font-mono text-xs text-cream-600">{r.count}×</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-600" />
              <input
                className="crate-input pl-9"
                placeholder="Track, Artist oder Album in der Playlist suchen…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="crate-card divide-y divide-ink-700">
              {visibleTracks.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-cream-500">Nichts gefunden.</p>
              ) : (
                visibleTracks.slice(0, 200).map((t) => (
                  <div key={t.id} className="flex items-center gap-4 px-4 py-2.5">
                    <span className="w-10 shrink-0 font-mono text-xs text-cream-600">{String(t.position).padStart(3, '0')}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-cream-100">{t.trackName}</span>
                      <span className="block truncate text-xs text-cream-500">{t.artistName}{t.albumName ? ` · ${t.albumName}` : ''}</span>
                    </span>
                    {t.durationMs !== null && <span className="hidden w-16 text-right font-mono text-xs text-cream-600 sm:block">{formatDuration(t.durationMs)}</span>}
                    {t.addedAt && <span className="hidden w-24 text-right font-mono text-xs text-cream-600 md:block">{formatDate(t.addedAt)}</span>}
                  </div>
                ))
              )}
            </div>
            {visibleTracks.length > 200 && <p className="text-center text-xs text-cream-600">Die ersten 200 Treffer — Suche eingrenzen für mehr.</p>}
          </section>
        </>
      )}

      <SnapshotHistory snapshots={snapshots} />
    </div>
  )
}

function SnapshotHistory({ snapshots }: { snapshots: PlaylistSnapshot[] }) {
  const [diffs, setDiffs] = useState<Record<string, SnapshotDiff | null>>({})
  const [openDiff, setOpenDiff] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const out: Record<string, SnapshotDiff | null> = {}
      for (const s of snapshots) out[s.id] = await snapshotDiff(s.id)
      if (!cancelled) setDiffs(out)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [snapshots])

  async function exportSnapshot(s: PlaylistSnapshot, format: 'json' | 'csv') {
    const tracks = await db.playlistTracks.where('snapshotId').equals(s.id).sortBy('position')
    const base = `the-crate-playlist-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${s.importedAt.slice(0, 10)}`
    if (format === 'json') downloadFile(`${base}.json`, playlistTracksToJson(tracks), 'application/json')
    else downloadFile(`${base}.csv`, playlistTracksToCsv(tracks), 'text/csv')
  }

  const ordered = [...snapshots].reverse()

  return (
    <section className="space-y-3">
      <p className="kicker rule">Importe & Veränderungen</p>
      <p className="text-xs text-cream-600">Jeder Import ist ein Schnappschuss. Neuere Schnappschüsse zeigen, was seit dem letzten dazukam oder verschwand.</p>
      <div className="space-y-3">
        {ordered.map((s, i) => {
          const diff = diffs[s.id]
          return (
            <div key={s.id} className="crate-card p-4">
              <div className="flex flex-wrap items-center gap-3">
                {renamingId === s.id ? (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={async (e) => {
                      e.preventDefault()
                      if (renameValue.trim()) await renameSnapshot(s.id, renameValue)
                      setRenamingId(null)
                    }}
                  >
                    <input className="crate-input py-1 text-sm" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
                    <button type="submit" className="crate-btn-ghost px-2 py-1" aria-label="Speichern"><Check className="h-4 w-4" /></button>
                    <button type="button" className="crate-btn-ghost px-2 py-1" onClick={() => setRenamingId(null)} aria-label="Abbrechen"><X className="h-4 w-4" /></button>
                  </form>
                ) : (
                  <p className="font-display text-cream-100">{s.name}</p>
                )}
                <span className="font-mono text-xs text-cream-600">{formatDate(s.importedAt)} · {s.trackCount.toLocaleString('de-DE')} Tracks · {SOURCE_LABELS[s.source]}</span>
                <span className="flex-1" />
                {renamingId !== s.id && (
                  <button className="crate-btn-ghost px-2 py-1" onClick={() => { setRenamingId(s.id); setRenameValue(s.name) }} aria-label="Umbenennen"><Pencil className="h-4 w-4" /></button>
                )}
                <button className="crate-btn-ghost px-2 py-1 text-xs" onClick={() => exportSnapshot(s, 'json')}>JSON</button>
                <button className="crate-btn-ghost px-2 py-1 text-xs" onClick={() => exportSnapshot(s, 'csv')}>CSV</button>
                <button
                  className="crate-btn-ghost px-2 py-1 text-rust-400"
                  aria-label="Löschen"
                  onClick={async () => {
                    if (window.confirm(`Schnappschuss „${s.name}" vom ${formatDate(s.importedAt)} wirklich löschen?`)) await deleteSnapshot(s.id)
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {i < ordered.length - 1 && diff && (
                <div className="mt-3 border-t border-ink-700 pt-3">
                  <button className="text-xs text-cream-500 hover:text-cream-300" onClick={() => setOpenDiff(openDiff === s.id ? null : s.id)}>
                    Gegenüber dem vorherigen Import: <span className="text-cream-100">+{diff.added.length} neu</span> · <span className="text-cream-100">−{diff.removed.length} entfernt</span> {openDiff === s.id ? '▴' : '▾'}
                  </button>
                  {openDiff === s.id && (
                    <div className="mt-2 grid gap-4 md:grid-cols-2">
                      <DiffList title="Dazugekommen" items={diff.added} empty="Nichts Neues." />
                      <DiffList title="Verschwunden" items={diff.removed} empty="Nichts entfernt." />
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function DiffList({ title, items, empty }: { title: string; items: Array<Pick<PlaylistTrack, 'trackName' | 'artistName'>>; empty: string }) {
  // a track can sit on several positions; show each removed/added track once with its count
  const grouped = new Map<string, { trackName: string; artistName: string; count: number }>()
  for (const t of items) {
    const key = `${t.trackName.toLowerCase()}::${t.artistName.toLowerCase()}`
    const cur = grouped.get(key)
    if (cur) cur.count++
    else grouped.set(key, { ...t, count: 1 })
  }
  const unique = [...grouped.values()]
  return (
    <div>
      <p className="kicker">{title}</p>
      {unique.length === 0 ? (
        <p className="mt-1 text-xs text-cream-600">{empty}</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {unique.slice(0, 20).map((t) => (
            <li key={`${t.trackName}-${t.artistName}`} className="truncate text-xs text-cream-300">
              {t.trackName} <span className="text-cream-600">· {t.artistName}</span>
              {t.count > 1 && <span className="text-cream-600"> ({t.count}×)</span>}
            </li>
          ))}
          {unique.length > 20 && <li className="text-xs text-cream-600">… und {unique.length - 20} weitere</li>}
        </ul>
      )}
    </div>
  )
}

// re-export for the import page diff display
export { diffTrackLists }
