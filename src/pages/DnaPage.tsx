import { Disclosure } from '../components/Disclosure'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowRight, CloudDownload, Dna, Loader2, Lock } from 'lucide-react'
import { db } from '../db/local'
import { computeDna } from '../lib/dna'
import { computeProducerDna, syncCreditsForArchive, type CreditsProgress } from '../lib/credits'
import { EmptyState } from '../components/EmptyState'
import { formatRating } from '../lib/utils'
import { formatDuration } from '../db/plays'

const tooltipStyle = {
  backgroundColor: '#181924',
  border: '1px solid rgba(239,233,220,0.2)',
  borderRadius: 12,
  fontSize: 12,
  color: '#EFE9DC',
}

export function DnaPage() {
  // secondary blocks start collapsed on the phone, open on the desktop
  const [desktopDefault] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768)
  const reviews = useLiveQuery(() => db.reviews.toArray(), [])
  const plays = useLiveQuery(() => db.plays.toArray(), [])
  const credits = useLiveQuery(() => db.credits.toArray(), [])
  const [creditsBusy, setCreditsBusy] = useState<CreditsProgress | null>(null)
  const [creditsError, setCreditsError] = useState('')

  const dna = useMemo(() => (reviews && plays ? computeDna(reviews, plays) : null), [reviews, plays])
  const producerDna = useMemo(() => (reviews && credits ? computeProducerDna(reviews, credits) : null), [reviews, credits])

  if (!reviews || !plays || !dna || !credits) return null

  async function loadCredits() {
    if (!reviews) return
    setCreditsError('')
    setCreditsBusy({ album: '', done: 0, total: 1 })
    try {
      await syncCreditsForArchive(reviews, setCreditsBusy)
    } catch (e) {
      setCreditsError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreditsBusy(null)
    }
  }

  if (reviews.length === 0 && plays.length === 0) {
    return (
      <div className="space-y-8">
        <header>
          <p className="kicker">The DNA</p>
          <h1 className="page-title">Deine musikalische Identität.</h1>
        </header>
        <EmptyState
          icon={Dna}
          title="Noch kein Material für die Analyse"
          body="Die DNA rechnet nur mit deinen echten Daten: Reviews, Hörverlauf, Playlist. Importiere zuerst deine Reviews und deine Streaming History — dann entstehen hier Genre-Profil, Äras, Szenen und die ehrlichen Widersprüche zwischen dem, was du sagst, und dem, was du hörst."
          action={
            <Link to="/import" className="crate-btn-primary">
              Zum Import <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />
      </div>
    )
  }

  const matchPct = dna.coverage.totalPlayMs > 0 ? Math.round((dna.coverage.matchedPlayMs / dna.coverage.totalPlayMs) * 100) : 0

  return (
    <div className="space-y-6">
      <header>
        <p className="kicker">The DNA</p>
        <h1 className="page-title">Deine musikalische Identität.</h1>
        <p className="mt-1 max-w-2xl text-sm text-cream-500">
          Gerechnet aus {dna.coverage.reviews} Reviews ({dna.coverage.ratedReviews} bewertet) und {dna.coverage.plays.toLocaleString('de-DE')} Plays.
          {' '}{matchPct}% deiner Hörzeit lassen sich auf Alben im Archiv matchen.
          {dna.coverage.estimatedPlayMs > 0 && ' Enthält ca.-Schätzungen aus dem Live-Sync (Songlänge × Play) — ein Extended-Export ersetzt sie durch exakte Minuten. '}
          {dna.coverage.skippedPlays > 0 && ` Davon ${dna.coverage.skippedPlays.toLocaleString('de-DE')} Skips unter 30 Sekunden: Sie zählen in deiner Hörzeit mit, aber nicht als Plays. `}
          Kleine Datenlage, ehrliche Zahlen: Das hier sind Korrelationen, keine Beweise — mit wachsendem Archiv wird das Bild schärfer.
        </p>
      </header>

      {credits.length === 0 && reviews.length > 0 && (
        <div className="crate-card flex flex-wrap items-center gap-3 px-4 py-3 text-sm text-cream-500">
          <p className="min-w-52 flex-1">
            Neu: Produzenten-Credits aus MusicBrainz (optional Genius) öffnen die gesperrten Fragen unten — geholt wird pro Album einmal, ehrlich ohne Schätzungen.
          </p>
          <button type="button" className="crate-btn-primary" disabled={creditsBusy !== null} onClick={() => void loadCredits()}>
            {creditsBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
            {creditsBusy ? `Lade Credits ${creditsBusy.done}/${creditsBusy.total}` : 'Credits laden'}
          </button>
          {creditsBusy && creditsBusy.album && <p className="w-full text-xs text-cream-600">{creditsBusy.album}</p>}
          {creditsError && <p className="w-full text-xs text-red-400">{creditsError}</p>}
        </div>
      )}
      {credits.length === 0 && reviews.length > 0 && false}
      {dna.genres.length === 0 && dna.coverage.plays > 0 && (
        <div className="crate-card flex flex-wrap items-center gap-3 px-4 py-3 text-sm text-cream-500">
          <p className="min-w-52 flex-1">
            Noch keine Genre-Tags im Archiv — Genre-, Ära- und Szenen-Profile entstehen, sobald deine Reviews Genres tragen. Der Hörverlauf fließt schon in die Entwicklungs-Charts ein.
          </p>
          <Link to="/tags" className="crate-btn-primary">Zur Genre-Runde <ArrowRight className="h-4 w-4" /></Link>
        </div>
      )}

      {dna.genres.length > 0 && (
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="crate-card p-5">
            <p className="kicker rule">Genre-Profil <span className="normal-case tracking-normal">(aus deinen Reviews)</span></p>
            <ol className="mt-3 divide-y divide-ink-700">
              {dna.genres.slice(0, 8).map((g, i) => (
                <li key={g.genre} className="flex items-center gap-3 py-2">
                  <span className="w-6 font-mono text-xs text-rust-400">{String(i + 1).padStart(2, '0')}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-cream-100">{g.genre}</span>
                  <span className="font-mono text-xs text-cream-600">{Math.round(g.share * 100)}%</span>
                  <span className="w-16 text-right font-mono text-xs text-cream-500">{g.avgRating !== null ? `Ø ${formatRating(g.avgRating)}` : 'unbew.'}</span>
                  <span className="w-12 text-right font-mono text-xs text-cream-600">{g.count}×</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="crate-card p-5">
            <p className="kicker rule">Hörzeit pro Genre <span className="normal-case tracking-normal">(gematchte Plays)</span></p>
            {dna.genresByListening.length === 0 ? (
              <p className="mt-3 text-sm text-cream-500">Noch keine Plays auf Alben aus deinem Archiv matchbar.</p>
            ) : (
              <ol className="mt-3 divide-y divide-ink-700">
                {dna.genresByListening.map((g, i) => (
                  <li key={g.genre} className="flex items-center gap-3 py-2">
                    <span className="w-6 font-mono text-xs text-rust-400">{String(i + 1).padStart(2, '0')}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-cream-100">{g.genre}</span>
                    <span className="font-mono text-xs text-cream-500">{formatDuration(g.minutes * 60000)}</span>
                  </li>
                ))}
              </ol>
            )}
            {dna.genresByListening.length > 0 && (
              <p className="mt-2 text-xs text-cream-600">Sagen vs. Hören: Weicht das vom Genre-Profil ab, ist das dein erster ehrlicher Widerspruch.</p>
            )}
          </div>
        </section>
      )}

      {dna.eras.length > 0 && (
        <section className="crate-card p-5">
          <p className="kicker rule">Deine Äras <span className="basis-full normal-case tracking-normal sm:basis-auto">(Reviews pro Jahrzehnt + Ø-Bewertung)</span></p>
          <div className="mt-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dna.eras} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <XAxis dataKey="decade" stroke="#8B8578" fontSize={11} fontFamily="IBM Plex Mono" tickLine={false} axisLine={{ stroke: '#3A3D4C' }} />
                <YAxis stroke="#8B8578" fontSize={11} fontFamily="IBM Plex Mono" tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: 'rgba(239,233,220,0.06)' }}
                  formatter={(v, name) => (name === 'count' ? [`${v} Reviews`, 'Anzahl'] : [`Ø ${formatRating(v as number)}`, 'Bewertung'])}
                />
                <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                  {dna.eras.map((d) => (
                    <Cell key={d.decade} fill={d.avgRating !== null && d.avgRating >= 8 ? '#E04424' : '#4A4D5E'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-cream-600">Orange = Jahrzehnte mit Ø-Bewertung 8 oder höher.</p>
        </section>
      )}

      {dna.scenes.length > 0 && (
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="crate-card p-5">
            <p className="kicker rule">Szenen <span className="normal-case tracking-normal">(aus deinen eigenen Genre-Tags)</span></p>
            <ol className="mt-3 divide-y divide-ink-700">
              {dna.scenes.map((s) => (
                <li key={s.scene} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-cream-100">{s.scene}</span>
                  <span className="w-16 text-right font-mono text-xs text-cream-500">{s.avgRating !== null ? `Ø ${formatRating(s.avgRating)}` : '—'}</span>
                  <span className="w-12 text-right font-mono text-xs text-cream-600">{s.count}×</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="crate-card p-5">
            <p className="kicker rule">Szenen nach Hörzeit</p>
            {dna.coastSplit.length === 0 ? (
              <p className="mt-3 text-sm text-cream-500">Noch keine Hörzeit auf Alben mit Szenen-Tags matchbar.</p>
            ) : (
              <ol className="mt-3 divide-y divide-ink-700">
                {dna.coastSplit.map((s) => (
                  <li key={s.scene} className="flex items-center gap-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-cream-100">{s.scene}</span>
                    <span className="font-mono text-xs text-cream-500">{formatDuration(s.minutes * 60000)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      )}

      {(dna.heardNotRated.length > 0 || dna.ratedNotHeard.length > 0) && (
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="crate-card p-5">
            <p className="kicker rule">Viel gehört, (fast) nicht bewertet</p>
            {dna.heardNotRated.length === 0 ? (
              <p className="mt-3 text-sm text-cream-500">Alles Vielgehörte ist auch bewertet. Sauber.</p>
            ) : (
              <ol className="mt-3 divide-y divide-ink-700">
                {dna.heardNotRated.map((a) => (
                  <li key={a.artist} className="flex items-center gap-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-cream-100">{a.artist}</span>
                    <span className="font-mono text-xs text-cream-500">{formatDuration(a.minutes * 60000)}</span>
                    <span className="w-20 text-right font-mono text-xs text-cream-600">{a.avgRating !== null ? `Ø ${formatRating(a.avgRating)}` : 'kein Review'}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="crate-card p-5">
            <p className="kicker rule">Hoch bewertet, kaum gehört</p>
            {dna.ratedNotHeard.length === 0 ? (
              <p className="mt-3 text-sm text-cream-500">Deine Favoriten bekommen auch ihre Spins. Stimmig.</p>
            ) : (
              <ol className="mt-3 divide-y divide-ink-700">
                {dna.ratedNotHeard.map((a) => (
                  <li key={a.artist} className="flex items-center gap-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-cream-100">{a.artist}</span>
                    <span className="w-20 text-right font-mono text-xs text-cream-500">Ø {formatRating(a.avgRating)}</span>
                    <span className="w-24 text-right font-mono text-xs text-cream-600">0 Min im Verlauf</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      )}

      {dna.monthly.length > 0 && (
        <section className="crate-card p-5">
          <p className="kicker rule">Entwicklung <span className="basis-full normal-case tracking-normal sm:basis-auto">(Hörzeit pro Monat + meistgehörter Artist)</span></p>
          <div className="mt-4 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dna.monthly} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <XAxis dataKey="month" stroke="#8B8578" fontSize={10} fontFamily="IBM Plex Mono" tickLine={false} axisLine={{ stroke: '#3A3D4C' }} minTickGap={30} />
                <YAxis stroke="#8B8578" fontSize={11} fontFamily="IBM Plex Mono" tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: 'rgba(239,233,220,0.06)' }}
                  formatter={(v) => [`${v} Min`, 'Hörzeit']}
                  labelFormatter={(m) => {
                    const p = dna.monthly.find((x) => x.month === m)
                    return `${m}${p?.topArtist ? ` · Top: ${p.topArtist}` : ''}`
                  }}
                />
                <Bar dataKey="minutes" radius={[2, 2, 0, 0]}>
                  {dna.monthly.map((d) => (
                    <Cell key={d.month} fill="#E04424" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <p className="kicker rule">Fragen an deine DNA</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {dna.jazzShare && (
            <AnswerCard
              question="Wie viel Jazz steckt in deinen Favoriten?"
              answer={`${Math.round(dna.jazzShare.inTopRated * 100)}% deiner Alben mit 8+ tragen ein Jazz-Tag — im Gesamtarchiv sind es ${Math.round(dna.jazzShare.overall * 100)}%.`}
              caveat={`n = ${dna.jazzShare.topRatedN} Favoriten. Einfluss auf den Geschmack zeigt das nicht, nur die Häufigkeit.`}
            />
          )}
          {dna.topRatedCoast && (
            <AnswerCard
              question="Sind deine Höchstbewertungen überproportional East Coast?"
              answer={Object.entries(dna.topRatedCoast.topRated)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([s, n]) => `${s}: ${n} von ${dna.topRatedCoast!.topRatedN}`)
                .join(' · ')}
              caveat="Zählung aus deinen eigenen Genre-Tags. Ob du East Coast bevorzugst, entscheidet der Vergleich mit dem Gesamtarchiv — siehe Szenen oben."
            />
          )}
          {dna.heardNotRated.length > 0 && (
            <AnswerCard
              question="Welche Artists hörst du viel, bewertest aber nicht?"
              answer={dna.heardNotRated.slice(0, 3).map((a) => `${a.artist} (${formatDuration(a.minutes * 60000)})`).join(', ')}
              caveat="Kein Urteil über Qualität — vielleicht fehlt einfach das Review."
            />
          )}
          {producerDna && producerDna.coverage.tracksWithProducer > 0 && (
            <AnswerCard
              question="Bevorzuge ich DJ-Premier-Produktionen?"
              answer={[
                `DJ Premier steht hinter ${producerDna.premier.tracks} der ${producerDna.coverage.tracksWithProducer} Tracks mit Produzenten-Credit in deinem Archiv (${Math.round(producerDna.premier.shareOfCredited * 100)}%) — u. a. auf ${producerDna.premier.albums.slice(0, 4).join(', ')}${producerDna.premier.albums.length > 4 ? ` und ${producerDna.premier.albums.length - 4} weiteren` : ''}.`,
                producerDna.premier.nWith > 0 && producerDna.premier.nWithout > 0 && producerDna.premier.avgRatingWith !== null && producerDna.premier.avgRatingWithout !== null
                  ? `Alben mit Premier-Produktion bewertest du im Schnitt ${formatRating(producerDna.premier.avgRatingWith)} (n = ${producerDna.premier.nWith}), Alben ohne ${formatRating(producerDna.premier.avgRatingWithout)} (n = ${producerDna.premier.nWithout}).`
                  : '',
                producerDna.premier.bestPickTotal > 0
                  ? `${producerDna.premier.bestPickHits} deiner ${producerDna.premier.bestPickTotal} „Am Besten“-Picks sind Premier-Beats.`
                  : '',
              ].filter(Boolean).join(' ')}
              caveat={`Credits aus MusicBrainz${credits.some((c) => c.source === 'genius') ? ' + Genius' : ''}, ${producerDna.coverage.albumsWithCredits} von ${producerDna.coverage.albumsTotal} Alben abgedeckt. Korrelation, kein Beweis — aber ein Muster.`}
            />
          )}
          {producerDna && producerDna.topFavorites.length > 0 && (
            <AnswerCard
              question="Welche Produzenten dominieren deine Favoriten?"
              answer={producerDna.topFavorites.map((p) => `${p.name} (${p.tracks} Tracks, ${Math.round(p.share * 100)}%)`).join(' · ')}
              caveat={`Gezählt über die ${producerDna.favoritesTrackN} Tracks mit Produzenten-Credit auf deinen ${producerDna.favoritesAlbumN} Alben mit 8+. Quelle: MusicBrainz${credits.some((c) => c.source === 'genius') ? ' + Genius' : ''}.`}
            />
          )}
          {dna.tasteShift && dna.tasteShift.hasEnough && (
            <AnswerCard
              question="Hat sich dein Geschmack verändert?"
              answer={`Erste Hälfte deines Verlaufs: ${dna.tasteShift.before.slice(0, 3).map((a) => a.artist).join(', ')}. Zweite Hälfte: ${dna.tasteShift.recent.slice(0, 3).map((a) => a.artist).join(', ')}.`}
              caveat="Halbiert nach Anzahl der Plays, nicht nach Kalender. Richtige Zeitreisen kommen mit mehr Daten."
            />
          )}
        </div>
        <Disclosure
          defaultOpen={desktopDefault}
          title={
            <span className="flex items-center gap-2 text-sm text-cream-500">
              <Lock className="h-3.5 w-3.5" /> {producerDna && producerDna.coverage.tracksWithProducer > 0 ? 1 : 3} gesperrte {producerDna && producerDna.coverage.tracksWithProducer > 0 ? 'Frage' : 'Fragen'} — und warum
            </span>
          }
        >
          <div className="grid grid-cols-1 gap-3 pb-1 md:grid-cols-2">
            {(!producerDna || producerDna.coverage.tracksWithProducer === 0) && (
              <>
                <LockedCard question="Bevorzuge ich DJ-Premier-Produktionen?" reason="Liegt bereit: Lade oben die Produzenten-Credits aus MusicBrainz (optional Genius-Token in den Einstellungen), dann rechnet The DNA damit." />
                <LockedCard question="Welche Produzenten dominieren meine Favoriten?" reason="Liegt bereit: Lade oben die Produzenten-Credits aus MusicBrainz (optional Genius-Token in den Einstellungen), dann rechnet The DNA damit." />
              </>
            )}
            <LockedCard question="Welche Rap-Stile und Album-Konzepte bewerte ich höher?" reason="Braucht deine eigenen Tags — pflege Stile und Konzepte als Tags in deinen Reviews, dann rechnet The DNA damit." />
          </div>
          <p className="text-xs text-cream-600">
            Gesperrt bleibt, was die Daten nicht hergeben: Stil-/Konzept-Fragen brauchen deine Tags. Geraten wird hier nicht.
          </p>
        </Disclosure>
      </section>
    </div>
  )
}

function AnswerCard({ question, answer, caveat }: { question: string; answer: string; caveat: string }) {
  return (
    <div className="crate-card p-4">
      <p className="text-sm font-medium text-cream-100">{question}</p>
      <p className="mt-1 text-sm text-cream-300">{answer}</p>
      <p className="mt-2 text-xs text-cream-600">{caveat}</p>
    </div>
  )
}

function LockedCard({ question, reason }: { question: string; reason: string }) {
  return (
    <div className="crate-card p-4 opacity-60">
      <p className="flex items-center gap-2 text-sm font-medium text-cream-300">
        <Lock className="h-3.5 w-3.5 text-cream-600" /> {question}
      </p>
      <p className="mt-1 text-xs text-cream-600">{reason}</p>
    </div>
  )
}
