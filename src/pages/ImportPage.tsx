import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { CheckCircle2, Download, FileUp, History, ListMusic, TriangleAlert, Upload } from 'lucide-react'
import { db } from '../db/local'
import { buildPlayPreview, formatDuration, importPlays } from '../db/plays'
import { formatDate } from '../lib/utils'
import type { PlayImportPreview } from '../types'
import { parseCsv, reviewsToCsv, reviewsToJson, runImport, validateImport, type ImportResult } from '../db/reviews'
import { buildPlaylistPreview, importPlaylistSnapshot, parsePlaylistFile } from '../db/playlists'
import { getPlaylistLink, sanitizeSpotifyUrl, setPlaylistLink } from '../lib/playlistLink'
import type { PlaylistCandidate, PlaylistImportPreview } from '../types'
import { TEMPLATE_CSV, TEMPLATE_JSON } from '../db/template'
import { EmptyState } from '../components/EmptyState'
import { RatingBadge } from '../components/RatingBadge'
import { downloadFile } from '../lib/utils'
import type { DuplicateStrategy, ValidatedImportRow } from '../types'

type Phase =
  | { step: 'pick' }
  | { step: 'preview'; fileName: string; rows: ValidatedImportRow[] }
  | { step: 'done'; result: ImportResult }

export function ImportPage() {
  const reviews = useLiveQuery(() => db.reviews.toArray(), [])
  const [phase, setPhase] = useState<Phase>({ step: 'pick' })
  const [strategy, setStrategy] = useState<DuplicateStrategy>('skip')
  const [parseError, setParseError] = useState('')
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setParseError('')
    setBusy(true)
    try {
      const text = await file.text()
      let rawRows: Array<Record<string, unknown>>
      if (file.name.toLowerCase().endsWith('.csv')) {
        rawRows = parseCsv(text)
      } else {
        const parsed: unknown = JSON.parse(text)
        if (!Array.isArray(parsed)) throw new Error('Die JSON-Datei muss ein Array aus Review-Objekten enthalten.')
        rawRows = parsed as Array<Record<string, unknown>>
      }
      if (rawRows.length === 0) throw new Error('In dieser Datei wurden keine Review-Zeilen gefunden.')
      const rows = await validateImport(rawRows.map((raw, i) => ({ rowNumber: i + 1, raw })))
      setPhase({ step: 'preview', fileName: file.name, rows })
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Diese Datei konnte nicht gelesen werden.')
    } finally {
      setBusy(false)
    }
  }

  async function confirmImport(rows: ValidatedImportRow[]) {
    setBusy(true)
    const result = await runImport(rows, strategy)
    setBusy(false)
    setPhase({ step: 'done', result })
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="kicker">Import & Export</p>
        <h1 className="mt-1 font-display text-3xl">Hol deine Reviews rein</h1>
        <p className="mt-1 max-w-2xl text-sm text-cream-500">
          Füll das Template mit deinen 30 bestehenden Reviews, zieh die Datei hier rein, prüf die Vorschau,
          bestätige. Dein Original-Wortlaut wird wortgleich importiert — nichts wird umgeschrieben, nichts erfunden.
        </p>
      </header>

      {/* templates + export */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="crate-card space-y-3 p-5">
          <p className="kicker rule">1 · Template</p>
          <p className="text-sm text-cream-500">
            Eine Zeile pro Album. Listen (Genres, beste Tracks, Tags) trennst du mit Semikolons. Pflicht sind nur
            Artist und Albumtitel.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="crate-btn" onClick={() => downloadFile('reviews-template.json', TEMPLATE_JSON, 'application/json')}>
              <Download className="h-4 w-4" /> JSON-Template
            </button>
            <button className="crate-btn" onClick={() => downloadFile('reviews-template.csv', TEMPLATE_CSV, 'text/csv')}>
              <Download className="h-4 w-4" /> CSV-Template
            </button>
          </div>
        </div>
        <div className="crate-card space-y-3 p-5">
          <p className="kicker rule">Export / Backup</p>
          <p className="text-sm text-cream-500">
            Alles, was gerade im Archiv liegt ({reviews?.length ?? 0} Reviews), als komplettes Backup — überall wieder importierbar.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="crate-btn" disabled={!reviews?.length} onClick={() => reviews && downloadFile(`the-crate-reviews-${new Date().toISOString().slice(0, 10)}.json`, reviewsToJson(reviews), 'application/json')}>
              <Download className="h-4 w-4" /> Export JSON
            </button>
            <button className="crate-btn" disabled={!reviews?.length} onClick={() => reviews && downloadFile(`the-crate-reviews-${new Date().toISOString().slice(0, 10)}.csv`, reviewsToCsv(reviews), 'text/csv')}>
              <Download className="h-4 w-4" /> Export CSV
            </button>
          </div>
        </div>
      </section>

      {phase.step === 'pick' && (
        <section className="crate-card space-y-3 p-5">
          <p className="kicker rule">2 · Datei importieren</p>
          <button
            className="flex w-full flex-col items-center gap-2 rounded-sm border border-dashed border-ink-600 px-6 py-12 text-center transition-colors hover:border-rust-500"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
          >
            <FileUp className="h-7 w-7 text-cream-600" strokeWidth={1.5} />
            <span className="text-sm text-cream-300">{busy ? 'Datei wird gelesen…' : 'Dein ausgefülltes Template wählen (.json oder .csv)'}</span>
            <span className="text-xs text-cream-600">Erst validiert. Du siehst alles in der Vorschau, bevor irgendwas geschrieben wird.</span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,.csv,application/json,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleFile(f)
              e.target.value = ''
            }}
          />
          {parseError && (
            <p className="flex items-center gap-2 text-sm text-rust-300">
              <TriangleAlert className="h-4 w-4" /> {parseError}
            </p>
          )}
        </section>
      )}

      {phase.step === 'preview' && (
        <PreviewSection
          fileName={phase.fileName}
          rows={phase.rows}
          strategy={strategy}
          setStrategy={setStrategy}
          busy={busy}
          onCancel={() => setPhase({ step: 'pick' })}
          onConfirm={() => void confirmImport(phase.rows)}
        />
      )}

      <StreamingImport />

      <PlaylistImport />

      {phase.step === 'done' && (
        <section className="crate-card space-y-3 p-5">
          <p className="kicker rule">Import abgeschlossen</p>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-rust-400" />
            <div className="text-sm text-cream-300">
              <p>{phase.result.imported} neue {phase.result.imported === 1 ? 'Review' : 'Reviews'} importiert.</p>
              {phase.result.updated > 0 && <p>{phase.result.updated} bestehende {phase.result.updated === 1 ? 'Review' : 'Reviews'} aktualisiert.</p>}
              {phase.result.skippedDuplicates > 0 && <p>{phase.result.skippedDuplicates} {phase.result.skippedDuplicates === 1 ? 'Duplikat' : 'Duplikate'} übersprungen.</p>}
              {phase.result.failed > 0 && <p className="text-rust-300">{phase.result.failed} Zeilen hatten Fehler und wurden nicht importiert.</p>}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Link to="/archive" className="crate-btn-primary">Archiv öffnen</Link>
            <button className="crate-btn" onClick={() => setPhase({ step: 'pick' })}>Weitere Datei importieren</button>
          </div>
        </section>
      )}
    </div>
  )
}

function PreviewSection({
  fileName, rows, strategy, setStrategy, busy, onCancel, onConfirm,
}: {
  fileName: string
  rows: ValidatedImportRow[]
  strategy: DuplicateStrategy
  setStrategy: (s: DuplicateStrategy) => void
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const valid = rows.filter((r) => r.draft)
  const invalid = rows.filter((r) => !r.draft)
  const dupes = valid.filter((r) => r.isDuplicate)
  const fresh = valid.filter((r) => !r.isDuplicate)
  const willWrite = strategy === 'skip' ? fresh.length : valid.length

  return (
    <section className="space-y-4">
      <div className="crate-card space-y-3 p-5">
        <p className="kicker rule">3 · Vorschau — {fileName}</p>
        <div className="flex flex-wrap gap-2 font-mono text-xs">
          <span className="crate-chip">{rows.length} Zeilen gelesen</span>
          <span className="crate-chip">{fresh.length} neu</span>
          <span className="crate-chip">{dupes.length} Duplikate</span>
          {invalid.length > 0 && <span className="crate-chip border-rust-600 text-rust-300">{invalid.length} mit Fehlern</span>}
        </div>

        {invalid.length > 0 && (
          <div className="rounded-sm border border-rust-700 bg-ink-900 p-3">
            <p className="mb-2 flex items-center gap-2 text-sm text-rust-300">
              <TriangleAlert className="h-4 w-4" /> Diese Zeilen musst du in der Datei korrigieren — sie werden nicht importiert:
            </p>
            <ul className="space-y-1 font-mono text-xs text-cream-500">
              {invalid.flatMap((r) => r.issues.map((i, j) => (
                <li key={`${r.rowNumber}-${j}`}>Zeile {i.rowNumber}: {i.field} — {translateIssue(i.message)}</li>
              )))}
            </ul>
          </div>
        )}

        {dupes.length > 0 && (
          <label className="flex flex-wrap items-center gap-2 text-sm text-cream-300">
            Wenn zu Artist + Album schon eine Review existiert:
            <select className="crate-input w-auto" value={strategy} onChange={(e) => setStrategy(e.target.value as DuplicateStrategy)}>
              <option value="skip">bestehende behalten (überspringen)</option>
              <option value="update">mit der Datei überschreiben</option>
            </select>
          </label>
        )}
      </div>

      <div className="crate-card max-h-96 overflow-auto">
        {valid.length === 0 ? (
          <EmptyState icon={Upload} title="Nichts importierbar" body="Jede Zeile hat Fehler. Korrigiere die Datei und versuch es nochmal." />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-ink-800">
              <tr className="kicker">
                <th className="px-3 py-2 font-normal">#</th>
                <th className="px-3 py-2 font-normal">Artist</th>
                <th className="px-3 py-2 font-normal">Album</th>
                <th className="px-3 py-2 font-normal">Jahr</th>
                <th className="px-3 py-2 font-normal">Bewertung</th>
                <th className="px-3 py-2 font-normal">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700">
              {valid.map((r) => (
                <tr key={r.rowNumber} className="text-cream-300">
                  <td className="px-3 py-2 font-mono text-xs text-cream-600">{r.rowNumber}</td>
                  <td className="px-3 py-2">{r.draft!.artist}</td>
                  <td className="px-3 py-2">{r.draft!.albumTitle}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.draft!.releaseYear ?? '—'}</td>
                  <td className="px-3 py-2"><RatingBadge rating={r.draft!.rating} size="sm" /></td>
                  <td className="px-3 py-2 font-mono text-[11px] uppercase tracking-wider">
                    {r.isDuplicate ? <span className="text-rust-300">Duplikat</span> : <span className="text-cream-500">neu</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="crate-btn-primary" disabled={willWrite === 0 || busy} onClick={onConfirm}>
          {busy ? 'Importiert…' : `${willWrite} ${willWrite === 1 ? 'Review' : 'Reviews'} importieren`}
        </button>
        <button className="crate-btn" onClick={onCancel}>Zurück</button>
        <p className="text-xs text-cream-600">Geschrieben wird erst, wenn du hier bestätigst.</p>
      </div>
    </section>
  )
}

/** Validation messages are produced in English by the parser; translate for display. */
function translateIssue(message: string): string {
  if (message === 'missing artist') return 'Artist fehlt'
  if (message === 'missing album title') return 'Albumtitel fehlt'
  const year = message.match(/^implausible year "(.*)"$/)
  if (year) return `unplausibles Jahr "${year[1]}"`
  const rating = message.match(/^rating must be 1–10, got "(.*)"$/)
  if (rating) return `Bewertung muss 1–10 sein, gefunden: "${rating[1]}"`
  const date = message.match(/^unreadable date "(.*)"$/)
  if (date) return `Datum nicht lesbar: "${date[1]}"`
  return message
}


// ── Spotify Extended Streaming History ──────────────────────────────────

function StreamingImport() {
  const plays = useLiveQuery(() => db.plays.count(), [])
  const [preview, setPreview] = useState<PlayImportPreview | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [doneCount, setDoneCount] = useState<number | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList) {
    setError('')
    setDoneCount(null)
    setBusy(true)
    try {
      const read = await Promise.all([...files].map(async (f) => ({ name: f.name, text: await f.text() })))
      setPreview(await buildPlayPreview(read))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Datei konnte nicht gelesen werden.')
    } finally {
      setBusy(false)
    }
  }

  async function confirm() {
    if (!preview) return
    setBusy(true)
    const n = await importPlays(preview.validPlays, 'spotify_extended')
    setBusy(false)
    setPreview(null)
    setDoneCount(n)
  }

  return (
    <section className="crate-card space-y-3 p-5">
      <p className="kicker rule">Hörverlauf — Spotify Extended Streaming History</p>
      <p className="text-sm text-cream-500">
        {plays !== undefined && plays > 0
          ? `Aktuell ${plays.toLocaleString('de-DE')} Plays im Verlauf. Neue Dateien importieren ergänzt nur, was fehlt — doppelte Plays werden erkannt.`
          : 'Die JSON-Dateien aus Spotifys Datenexport („Streaming_History_Audio_…"), gern mehrere auf einmal. Podcasts und Videos werden übersprungen, Duplikate erkannt — auch beim erneuten Import derselben Datei.'}
      </p>

      <button
        className="flex w-full flex-col items-center gap-2 rounded-sm border border-dashed border-ink-600 px-6 py-10 text-center transition-colors hover:border-rust-500"
        onClick={() => fileInput.current?.click()}
        disabled={busy}
      >
        <History className="h-6 w-6 text-cream-600" strokeWidth={1.5} />
        <span className="text-sm text-cream-300">{busy ? 'Dateien werden gelesen…' : 'Streaming-History-Dateien wählen (.json, Mehrfachauswahl möglich)'}</span>
      </button>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
      {error && (
        <p className="flex items-center gap-2 text-sm text-rust-300">
          <TriangleAlert className="h-4 w-4" /> {error}
        </p>
      )}

      {preview && (
        <div className="space-y-3 rounded-sm border border-ink-600 bg-ink-900 p-4">
          <p className="kicker">Vorschau — {preview.fileNames.join(', ')}</p>
          <div className="flex flex-wrap gap-2 font-mono text-xs">
            <span className="crate-chip">{preview.rowsRead.toLocaleString('de-DE')} Einträge gelesen</span>
            <span className="crate-chip">{preview.validPlays.length.toLocaleString('de-DE')} neue Plays</span>
            {preview.duplicates > 0 && <span className="crate-chip">{preview.duplicates.toLocaleString('de-DE')} Duplikate</span>}
            {preview.skippedNonMusic > 0 && <span className="crate-chip">{preview.skippedNonMusic.toLocaleString('de-DE')} Podcasts/Videos</span>}
            {preview.skippedInvalid > 0 && <span className="crate-chip border-rust-600 text-rust-300">{preview.skippedInvalid} ungültig</span>}
          </div>
          {preview.firstPlay && preview.lastPlay && (
            <p className="text-sm text-cream-300">
              Zeitraum: {formatDate(preview.firstPlay)} bis {formatDate(preview.lastPlay)} · {formatDuration(preview.validPlays.reduce((s, p) => s + p.msPlayed, 0))} Hörzeit
            </p>
          )}
          {preview.topArtists.length > 0 && (
            <p className="text-xs text-cream-500">
              Meistgehört darin: {preview.topArtists.map((a) => `${a.artist} (${a.plays}×)`).join(', ')}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button className="crate-btn-primary" disabled={preview.validPlays.length === 0 || busy} onClick={() => void confirm()}>
              {busy ? 'Importiert…' : `${preview.validPlays.length.toLocaleString('de-DE')} Plays importieren`}
            </button>
            <button className="crate-btn" onClick={() => setPreview(null)}>Verwerfen</button>
          </div>
        </div>
      )}

      {doneCount !== null && (
        <p className="flex items-center gap-2 text-sm text-cream-300">
          <CheckCircle2 className="h-4 w-4 text-rust-400" /> {doneCount.toLocaleString('de-DE')} Plays importiert.{' '}
          <Link to="/history" className="text-rust-300 underline underline-offset-2">Zum Hörverlauf</Link>
        </p>
      )}
    </section>
  )
}

function PlaylistImport() {
  const snapshotCount = useLiveQuery(() => db.playlistSnapshots.count(), [])
  const [fileName, setFileName] = useState('')
  const [source, setSource] = useState<PlaylistImportPreview['source']>('spotify_account_export')
  const [candidates, setCandidates] = useState<PlaylistCandidate[]>([])
  const [preview, setPreview] = useState<PlaylistImportPreview | null>(null)
  const [name, setName] = useState('')
  const [spotifyUrl, setSpotifyUrl] = useState(() => getPlaylistLink())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [doneId, setDoneId] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setError('')
    setDoneId(null)
    setBusy(true)
    try {
      const text = await file.text()
      const parsed = parsePlaylistFile(file.name, text)
      setFileName(file.name)
      setSource(parsed.source)
      setCandidates(parsed.candidates)
      await pick(parsed.candidates[0], parsed.source, file.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Datei konnte nicht gelesen werden.')
      setCandidates([])
      setPreview(null)
    } finally {
      setBusy(false)
    }
  }

  async function pick(candidate: PlaylistCandidate, src: PlaylistImportPreview['source'], file: string) {
    const p = await buildPlaylistPreview(file, src, candidate)
    setPreview(p)
    setName(candidate.name)
  }

  async function confirm() {
    if (!preview) return
    setBusy(true)
    const cleanUrl = spotifyUrl.trim() ? sanitizeSpotifyUrl(spotifyUrl) : null
    if (spotifyUrl.trim() && !cleanUrl) {
      setError('Das sieht nicht nach einem Spotify-Link aus — Format: https://open.spotify.com/playlist/…')
      setBusy(false)
      return
    }
    if (cleanUrl) setPlaylistLink(cleanUrl)
    const id = await importPlaylistSnapshot(preview, name, cleanUrl)
    setBusy(false)
    setPreview(null)
    setCandidates([])
    setDoneId(id)
  }

  return (
    <section className="crate-card space-y-3 p-5">
      <p className="kicker rule">Die Playlist — Spotify-Playlist-Export</p>
      <p className="text-sm text-cream-500">
        {snapshotCount !== undefined && snapshotCount > 0
          ? `Bereits ${snapshotCount} ${snapshotCount === 1 ? 'Schnappschuss' : 'Schnappschüsse'} importiert. Ein neuer Import wird als neuer Stand gespeichert — die App zeigt dir, was dazukam und was verschwand.`
          : 'Die Playlist-JSON aus Spotifys Kontodaten-Export (Konto → Datenschutz → Daten herunterladen) oder eine CSV (z. B. von Exportify). Der Name kommt aus deiner Datei — hier ist nichts hart verdrahtet. Jeder Import ist ein Schnappschuss, nichts wird überschrieben.'}
      </p>

      <button
        className="flex w-full flex-col items-center gap-2 rounded-sm border border-dashed border-ink-600 px-6 py-10 text-center transition-colors hover:border-rust-500"
        onClick={() => fileInput.current?.click()}
        disabled={busy}
      >
        <ListMusic className="h-6 w-6 text-cream-600" strokeWidth={1.5} />
        <span className="text-sm text-cream-300">{busy ? 'Datei wird gelesen…' : 'Playlist-Datei wählen (.json oder .csv)'}</span>
      </button>
      <input
        ref={fileInput}
        type="file"
        accept=".json,.csv,application/json,text/csv"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void handleFile(e.target.files[0])
          e.target.value = ''
        }}
      />
      {error && (
        <p className="flex items-center gap-2 text-sm text-rust-300">
          <TriangleAlert className="h-4 w-4" /> {error}
        </p>
      )}

      {preview && (
        <div className="space-y-3 rounded-sm border border-ink-600 bg-ink-900 p-4">
          <p className="kicker">Vorschau — {fileName}</p>
          {candidates.length > 1 && (
            <label className="block text-xs text-cream-500">
              Diese Datei enthält {candidates.length} Playlists — welche soll importiert werden?
              <select
                className="crate-input mt-1"
                value={preview.candidate.name}
                onChange={(e) => {
                  const c = candidates.find((x) => x.name === e.target.value)
                  if (c) void pick(c, source, fileName)
                }}
              >
                {candidates.map((c) => (
                  <option key={c.name} value={c.name}>{c.name} ({c.tracks.length} Tracks)</option>
                ))}
              </select>
            </label>
          )}
          <div className="flex flex-wrap gap-2 font-mono text-xs">
            <span className="crate-chip">{preview.candidate.tracks.length.toLocaleString('de-DE')} Tracks</span>
            {preview.candidate.skipped > 0 && <span className="crate-chip">{preview.candidate.skipped} übersprungen (Episoden/lokale Dateien)</span>}
            {preview.duplicateRows > 0 && <span className="crate-chip">{preview.duplicateRows} mehrfach enthalten</span>}
            {preview.diff && <span className="crate-chip">ggü. letztem Import: +{preview.diff.added} / −{preview.diff.removed}</span>}
          </div>
          <label className="block text-xs text-cream-500">
            Name der Playlist (aus der Datei übernommen, änderbar)
            <input className="crate-input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block text-xs text-cream-500">
            Spotify-Link zur Playlist (optional — die App verweist dann darauf)
            <input className="crate-input mt-1" placeholder="https://open.spotify.com/playlist/…" value={spotifyUrl} onChange={(e) => setSpotifyUrl(e.target.value)} />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button className="crate-btn-primary" disabled={preview.candidate.tracks.length === 0 || busy || !name.trim()} onClick={() => void confirm()}>
              {busy ? 'Importiert…' : `${preview.candidate.tracks.length.toLocaleString('de-DE')} Tracks importieren`}
            </button>
            <button className="crate-btn" onClick={() => { setPreview(null); setCandidates([]) }}>Verwerfen</button>
          </div>
        </div>
      )}

      {doneId !== null && (
        <p className="flex items-center gap-2 text-sm text-cream-300">
          <CheckCircle2 className="h-4 w-4 text-rust-400" /> Schnappschuss importiert.{' '}
          <Link to="/playlist" className="text-rust-300 underline underline-offset-2">Zur Playlist-Analyse</Link>
        </p>
      )}
    </section>
  )
}
