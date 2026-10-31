import { useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Trophy } from 'lucide-react'
import { db } from '../db/local'
import { computeMilestones, splitMilestones, type Milestone } from '../lib/milestones'
import { EmptyState } from '../components/EmptyState'
import { formatDate } from '../lib/utils'

const LAST_SEEN_KEY = 'the-crate:milestones-last-seen'

function ReachedCard({ m, isNew, tilt }: { m: Milestone; isNew: boolean; tilt: number }) {
  return (
    <div
      className="crate-card relative p-4"
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      {isNew && (
        <span className="absolute -top-2 right-3 -rotate-3 rounded-sm bg-marker-yellow px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-ink-950 shadow-md">
          Neu
        </span>
      )}
      <p className="kicker">{m.subject}</p>
      <p className="mt-1 font-display text-4xl text-rust-400">
        {m.target.toLocaleString('de-DE')}
        <span className="ml-1 text-xl text-cream-300">{m.verb}</span>
      </p>
      <p className="mt-1 text-xs text-cream-500">
        geknackt am {formatDate(m.reachedAt!)}
        {m.estimated && ' · inkl. ca.-Schätzung'}
      </p>
    </div>
  )
}

export function MilestonesPage() {
  const reviews = useLiveQuery(() => db.reviews.toArray(), [])
  const plays = useLiveQuery(() => db.plays.toArray(), [])

  const lastSeen = useRef<string>(localStorage.getItem(LAST_SEEN_KEY) ?? '')
  // everything shown this visit counts as seen once the user leaves the page
  useEffect(() => {
    return () => {
      localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString())
    }
  }, [])

  const { reached, upcoming } = useMemo(() => {
    if (!reviews || !plays) return { reached: [], upcoming: [] }
    return splitMilestones(computeMilestones(reviews, plays))
  }, [reviews, plays])

  if (!reviews || !plays) return null

  const newCount = reached.filter((m) => (m.reachedAt ?? '') > lastSeen.current).length

  if (reviews.length === 0 && plays.length === 0) {
    return (
      <div className="space-y-8">
        <header>
          <p className="kicker">Meilensteine</p>
          <h1 className="mt-1 font-display text-3xl">Deine Trophäen-Vitrine.</h1>
        </header>
        <EmptyState
          icon={Trophy}
          title="Noch keine Daten, noch keine Meilensteine"
          body="Sobald Reviews im Archiv und Plays im Verlauf sind, entstehen hier deine Meilensteine — der 100. Play von Illmatic inklusive."
          action={<Link to="/import" className="crate-btn-primary">Zum Import</Link>}
        />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="kicker">Meilensteine</p>
        <h1 className="mt-1 font-display text-3xl">Deine Trophäen-Vitrine.</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-cream-500">
          Gerechnet nur aus deinen echten Plays und Reviews. Jeder geknackte Meilenstein zeigt die Zahl und den Tag,
          an dem er gefallen ist — der 100. Play von Illmatic landet auch hier.
        </p>
      </header>

      <section className="space-y-3">
        <p className="kicker rule">
          Vitrine
          {newCount > 0 && <span className="text-marker-yellow">· {newCount} neu seit deinem letzten Besuch</span>}
        </p>
        {reached.length === 0 ? (
          <p className="text-sm text-cream-500">
            Noch nichts geknackt — die nächsten Ziele unten sind schon im Visier.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2 lg:grid-cols-3">
            {reached.map((m, i) => (
              <ReachedCard key={m.id} m={m} isNew={(m.reachedAt ?? '') > lastSeen.current} tilt={i % 2 === 0 ? -0.6 : 0.7} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <p className="kicker rule">Als Nächstes im Visier</p>
        <div className="crate-card divide-y divide-[#EFE9DC]/8 px-4">
          {upcoming.slice(0, 8).map((m) => (
            <div key={m.id} className="py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-sm text-cream-100">
                  {m.subject} <span className="text-cream-500">· {m.verb}</span>
                </p>
                <p className="shrink-0 font-mono text-xs text-cream-500">
                  {m.verb === 'Stunden'
                    ? `${m.current.toFixed(1)} / ${m.target}`
                    : `${m.current.toLocaleString('de-DE')} / ${m.target.toLocaleString('de-DE')}`}
                  {m.estimated && ' ca.'}
                </p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-800">
                <div
                  className="h-full rounded-full bg-rust-500 transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.round((m.current / m.target) * 100))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
