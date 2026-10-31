import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CheckCircle2, CircleDashed, Trash2 } from 'lucide-react'
import { db } from '../db/local'
import { clearAllReviews } from '../db/reviews'
import { getConfig, isValidHttpUrl, setConfigValue } from '../lib/config'
import { resetSupabaseClient } from '../lib/supabase'

export function SettingsPage() {
  const reviews = useLiveQuery(() => db.reviews.toArray(), [])
  const [fields, setFields] = useState(getConfig())
  const [saved, setSaved] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  function update(key: string, value: string) {
    setSaved(false)
    setFields(fields.map((f) => (f.key === key ? { ...f, value, source: value.trim() ? 'settings' : f.source === 'settings' ? 'missing' : f.source } : f)))
  }

  function save() {
    for (const f of fields) setConfigValue(f.key, f.value)
    resetSupabaseClient()
    setFields(getConfig())
    setSaved(true)
  }

  const urlField = fields.find((f) => f.key === 'supabaseUrl')
  const urlInvalid = urlField && urlField.value.trim() !== '' && !isValidHttpUrl(urlField.value)

  const sourceLabel = { missing: 'nicht gesetzt', env: 'aus dem Build', settings: 'hier gespeichert' } as const

  return (
    <div className="space-y-6">
      <header>
        <p className="kicker">Einstellungen</p>
        <h1 className="mt-1 font-display text-3xl">Verbindungen</h1>
        <p className="mt-1 max-w-2xl text-sm text-cream-500">
          Trag deine Zugangsdaten hier ein, sobald die Konten existieren. Alles unten ist bewusst frontend-sicher —
          die Werte liegen nur in diesem Browser und wären im Seitenquelltext ohnehin sichtbar. Die App läuft auch
          komplett offline, ganz ohne all das.
        </p>
      </header>

      <section className="crate-card space-y-5 p-5">
        {fields.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <div className="flex items-center gap-2">
              {f.source === 'missing' ? (
                <CircleDashed className="h-4 w-4 text-cream-600" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-rust-400" />
              )}
              <span className="text-sm font-medium text-cream-100">{f.label}</span>
              <span className="font-mono text-[10px] uppercase tracking-kicker text-cream-600">{sourceLabel[f.source]}</span>
            </div>
            <input
              className="crate-input font-mono text-xs"
              value={f.value}
              placeholder={f.envName}
              onChange={(e) => update(f.key, e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
            <p className="text-xs text-cream-600">{f.hint}</p>
            {f.key === 'supabaseUrl' && urlInvalid && <p className="text-xs text-rust-300">Das sieht nicht nach einer URL aus.</p>}
          </div>
        ))}
        <div className="flex items-center gap-3 pt-1">
          <button className="crate-btn-primary" onClick={save} disabled={urlInvalid}>Speichern</button>
          {saved && <p className="text-sm text-rust-300">In diesem Browser gespeichert.</p>}
        </div>
      </section>

      <section className="crate-card space-y-3 p-5">
        <p className="kicker rule">Was hier niemals reingehört</p>
        <p className="text-sm leading-relaxed text-cream-500">
          Der Supabase-<span className="font-mono text-cream-300">service_role</span>-Key und das Spotify-
          <span className="font-mono text-cream-300">Client-Secret</span> gehören nie in diese App — nicht in die
          Einstellungen, nicht in eine .env, nicht ins Repo. Die Architektur braucht sie schlicht nicht: Der
          Spotify-Login läuft über PKCE (öffentlicher Client), und die Datenbank ist über Row Level Security
          geschützt statt über einen versteckten Schlüssel. Wenn dich irgendeine Anleitung oder ein Tool bittet,
          einen der beiden Werte in eine Website zu pasten: stopp.
        </p>
      </section>

      <section className="crate-card space-y-3 p-5">
        <p className="kicker rule">Gefahrenzone</p>
        <p className="text-sm text-cream-500">Löscht jede Review, die in diesem Browser gespeichert ist ({reviews?.length ?? 0} Einträge). Vorher ein Backup exportieren, wenn sie dir was bedeuten.</p>
        {confirmClear ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-rust-300">Wirklich alles löschen?</p>
            <button className="crate-btn" onClick={() => setConfirmClear(false)}>Abbrechen</button>
            <button
              className="crate-btn-primary"
              onClick={async () => {
                await clearAllReviews()
                setConfirmClear(false)
              }}
            >
              Ja, alles löschen
            </button>
          </div>
        ) : (
          <button className="crate-btn text-cream-500 hover:border-rust-600 hover:text-rust-300" onClick={() => setConfirmClear(true)}>
            <Trash2 className="h-4 w-4" /> Lokales Archiv löschen
          </button>
        )}
      </section>
    </div>
  )
}
