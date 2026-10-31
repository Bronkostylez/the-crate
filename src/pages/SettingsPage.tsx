import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CheckCircle2, CircleDashed, CloudUpload, Music2, Trash2 } from 'lucide-react'
import { db } from '../db/local'
import { clearAllReviews } from '../db/reviews'
import { getConfig, getConfigValue, isValidHttpUrl, setConfigValue } from '../lib/config'
import { resetSupabaseClient } from '../lib/supabase'
import { disconnectSpotify, spotifyConnected, spotifyDisplayName, startSpotifyAuth, takeSpotifyError } from '../lib/spotify/auth'
import { cloudSession, signInCloud, signOutCloud, syncCloud, type CloudSyncResult, type CloudUser } from '../lib/cloud'
import { scheduleFullSync, type AutoSyncEvent } from '../lib/autosync'

export function SettingsPage() {
  const reviews = useLiveQuery(() => db.reviews.toArray(), [])
  const [fields, setFields] = useState(getConfig())
  const [saved, setSaved] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [spotifyError] = useState(takeSpotifyError)
  const [connected, setConnected] = useState(spotifyConnected)
  const [cloudUser, setCloudUser] = useState<CloudUser | null>(null)
  const [cloudEmail, setCloudEmail] = useState('')
  const [cloudPassword, setCloudPassword] = useState('')
  const [cloudBusy, setCloudBusy] = useState(false)
  const [cloudError, setCloudError] = useState('')
  const [cloudResult, setCloudResult] = useState<CloudSyncResult | null>(null)

  const [autoSync, setAutoSync] = useState<AutoSyncEvent | null>(null)

  useEffect(() => {
    void cloudSession().then(setCloudUser)
    const onAuto = (e: Event) => setAutoSync((e as CustomEvent<AutoSyncEvent>).detail)
    window.addEventListener('crate:autosync', onAuto)
    return () => window.removeEventListener('crate:autosync', onAuto)
  }, [])

  async function cloudSignIn() {
    setCloudBusy(true)
    setCloudError('')
    try {
      setCloudUser(await signInCloud(cloudEmail, cloudPassword))
      setCloudPassword('')
      scheduleFullSync()
    } catch (e) {
      setCloudError(e instanceof Error ? e.message : String(e))
    } finally {
      setCloudBusy(false)
    }
  }

  async function cloudSync() {
    setCloudBusy(true)
    setCloudError('')
    try {
      setCloudResult(await syncCloud())
    } catch (e) {
      setCloudError(e instanceof Error ? e.message : String(e))
    } finally {
      setCloudBusy(false)
    }
  }

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
        <p className="kicker rule">Spotify</p>
        {spotifyError && <p className="text-sm text-rust-300">{spotifyError}</p>}
        {connected ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex items-center gap-2 text-sm text-cream-100">
              <CheckCircle2 className="h-4 w-4 text-rust-400" />
              Verbunden{spotifyDisplayName() ? ` als ${spotifyDisplayName()}` : ''} — Album-Suche und Tracklisten laufen jetzt über Spotify.
            </p>
            <button
              className="crate-btn text-cream-500 hover:border-rust-600 hover:text-rust-300"
              onClick={() => {
                disconnectSpotify()
                setConnected(false)
              }}
            >
              Trennen
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-cream-500">
              {getConfigValue('spotifyClientId')
                ? 'Client ID ist gespeichert. Ein Klick, Spotify-Login, fertig — danach kommen Album-Suche und Tracklisten von Spotify (findet auch Alben, die iTunes nicht kennt).'
                : 'Trag oben deine Spotify Client ID ein und speichere — dann erscheint hier der Verbinden-Knopf.'}
            </p>
            {getConfigValue('spotifyClientId') && (
              <button className="crate-btn-primary" onClick={() => void startSpotifyAuth(getConfigValue('spotifyClientId'))}>
                <Music2 className="h-4 w-4" /> Mit Spotify verbinden
              </button>
            )}
          </div>
        )}
      </section>

      <section className="crate-card space-y-3 p-5">
        <p className="kicker rule">Cloud-Sync + 24/7-Tracking</p>
        {!getConfigValue('supabaseUrl') || !getConfigValue('supabaseAnonKey') ? (
          <p className="text-sm text-cream-500">
            Trag oben deine Supabase Project URL und den anon key ein und speichere — dann erscheint hier der
            Cloud-Login. Anleitung: docs/SETUP.md im Repo.
          </p>
        ) : cloudUser ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm text-cream-100">
              <CheckCircle2 className="h-4 w-4 text-rust-400" />
              Verbunden{cloudUser.email ? ` als ${cloudUser.email}` : ''}.
            </p>
            <p className="text-sm text-cream-500">
              Ein Sync lädt alle Plays und Reviews in deine Cloud und holt zurück, was der stündliche Tracker (oder
              ein anderes Gerät) inzwischen gesammelt hat. Sobald Spotify UND die Cloud verbunden sind, bekommt der
              Tracker automatisch dein aktuelles Login — ab dann läuft die Erfassung rund um die Uhr, auch wenn die
              App zu ist.
            </p>
            <p className="text-sm text-cream-500">
              <span className="text-cream-100">Auto-Sync ist an:</span> Reviews fliegen beim Speichern, Importieren
              und Löschen von selbst in die Cloud — der Knopf unten bleibt für den kompletten Abgleich in beide
              Richtungen.
              {autoSync?.ok && (
                <>
                  {' '}
                  Zuletzt automatisch gesichert:{' '}
                  {new Date(autoSync.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}{' '}
                  Uhr.
                </>
              )}
              {autoSync && !autoSync.ok && (
                <span className="text-rust-300">
                  {' '}
                  Auto-Sync gerade fehlgeschlagen ({autoSync.error}) — nichts geht verloren, der nächste Speicher-
                  oder Sync-Versuch holt es nach.
                </span>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button className="crate-btn-primary" disabled={cloudBusy} onClick={() => void cloudSync()}>
                <CloudUpload className="h-4 w-4" /> {cloudBusy ? 'Synchronisiere …' : 'Jetzt synchronisieren'}
              </button>
              <button
                className="crate-btn text-cream-500 hover:border-rust-600 hover:text-rust-300"
                onClick={() => {
                  void signOutCloud().then(() => {
                    setCloudUser(null)
                    setCloudResult(null)
                  })
                }}
              >
                Abmelden
              </button>
            </div>
            {cloudError && <p className="text-sm text-rust-300">{cloudError}</p>}
            {cloudResult && (
              <p className="text-sm text-rust-300">
                Fertig: {cloudResult.playsPushed} Plays hoch, {cloudResult.playsPulled} neu aus der Cloud,{' '}
                {cloudResult.reviewsPushed} Reviews hoch, {cloudResult.reviewsPulled} übernommen.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-cream-500">
              Melde dich mit dem Konto an, das du in Supabase unter Authentication → Users angelegt hast. Danach
              sichert die App deine Plays und Reviews in der Cloud — und der 24/7-Tracker kann deine Spotify-Plays
              stündlich abholen, auch wenn die App nicht offen ist.
            </p>
            <input
              className="crate-input font-mono text-xs"
              type="email"
              placeholder="E-Mail"
              value={cloudEmail}
              onChange={(e) => setCloudEmail(e.target.value)}
              autoComplete="off"
            />
            <input
              className="crate-input font-mono text-xs"
              type="password"
              placeholder="Passwort"
              value={cloudPassword}
              onChange={(e) => setCloudPassword(e.target.value)}
              autoComplete="off"
            />
            {cloudError && <p className="text-sm text-rust-300">{cloudError}</p>}
            <button
              className="crate-btn-primary"
              disabled={cloudBusy || !cloudEmail.trim() || !cloudPassword}
              onClick={() => void cloudSignIn()}
            >
              {cloudBusy ? 'Melde an …' : 'Mit der Cloud verbinden'}
            </button>
          </div>
        )}
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
