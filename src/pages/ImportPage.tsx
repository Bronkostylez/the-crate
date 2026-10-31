import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { CheckCircle2, Download, FileUp, TriangleAlert, Upload } from 'lucide-react'
import { db } from '../db/local'
import { parseCsv, reviewsToCsv, reviewsToJson, runImport, validateImport, type ImportResult } from '../db/reviews'
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
