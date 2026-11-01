/**
 * Auto-sync — local changes fly to the cloud without the button, and
 * out-of-app cloud changes (other device, corrections) fly back: every
 * review job pulls newer remote rows before pushing dirty local ones.
 *
 * Triggers live next to the writes: saving or importing a review schedules
 * a debounced dirty push, deleting one queues the id for a cloud delete,
 * and big imports / the first cloud login schedule a full mirror. Offline
 * is not an error state: dirty reviews stay behind the watermark, deletions
 * stay in the pending queue, and everything flushes on the next connected
 * run (app start or the browser's online event).
 *
 * Failures never lose data — the watermark only advances after a
 * successful push, so a failed run simply retries on the next trigger.
 */
import { db } from '../db/local'
import { cloudSession, pullNewerReviews, syncCloud, toCloudReview } from './cloud'
import { getSupabase } from './supabase'
import {
  addPendingDelete,
  getPendingFullSync,
  getReviewWatermark,
  readPendingDeletes,
  removePendingDelete,
  setLastAutoSyncAt,
  setPendingFullSync,
  setReviewWatermark,
} from './syncQueue'

const REVIEW_DEBOUNCE_MS = 1_500
const FULL_DEBOUNCE_MS = 3_000

type Job = 'reviews' | 'full'

export interface AutoSyncEvent {
  ok: boolean
  at: string
  job: Job
  error?: string
}

let timer: ReturnType<typeof setTimeout> | null = null
let queued: Job | null = null
let running = false

/** A review was created or updated. Debounced; a burst saves once. */
export function scheduleReviewSync(): void {
  enqueue('reviews')
}

/** Plays were imported or a login just happened — mirror everything. */
export function scheduleFullSync(): void {
  enqueue('full')
}

/** A review was deleted locally; the cloud row has to go too. */
export function noteReviewDeleted(id: string): void {
  addPendingDelete(id)
  enqueue('reviews')
}

/**
 * Call once at app start: flush whatever an offline session left behind
 * (queued deletions, dirty reviews, a pending full sync) and re-flush
 * whenever the browser comes back online.
 */
export function initAutoSync(): void {
  if (typeof window === 'undefined') return
  window.addEventListener('online', () => enqueue(getPendingFullSync() ? 'full' : 'reviews'))
  enqueue(getPendingFullSync() ? 'full' : 'reviews')
}

function enqueue(job: Job): void {
  // a full sync covers everything a review sync would do
  queued = queued === 'full' || job === 'full' ? 'full' : 'reviews'
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void run(), job === 'full' ? FULL_DEBOUNCE_MS : REVIEW_DEBOUNCE_MS)
}

function online(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

async function run(): Promise<void> {
  if (running) {
    return
  }
  running = true
  try {
    while (queued) {
      const job = queued
      queued = null
      if (!online() || !(await cloudSession())) {
        // not reachable / not logged in: reviews stay dirty behind the
        // watermark and deletions stay queued; only a full sync needs a flag
        if (job === 'full') setPendingFullSync(true)
        continue
      }
      try {
        if (job === 'full') {
          await syncCloud()
          setPendingFullSync(false)
        } else {
          // pull first so out-of-app changes (other device, corrections)
          // arrive on every app start; the newer content wins every
          // conflict (see reviewReconcile). The rows just applied carry the server timestamp and
          // would look dirty to the push — exclude them, then cover their
          // timestamps in the watermark AFTER the push ran (covering them
          // before could mask a genuinely dirty row under clock drift).
          const pulled = await pullNewerReviews()
          await pushDirtyReviews(new Set(pulled.appliedIds))
          const maxApplied = pulled.appliedTs.reduce((m, ts) => Math.max(m, new Date(ts).getTime()), 0)
          if (maxApplied > 0) setReviewWatermark(Math.max(getReviewWatermark(), maxApplied))
        }
        emit({ ok: true, at: new Date().toISOString(), job })
      } catch (e) {
        if (job === 'full') setPendingFullSync(true)
        emit({ ok: false, at: new Date().toISOString(), job, error: e instanceof Error ? e.message : String(e) })
      }
    }
  } finally {
    running = false
  }
}

function emit(event: AutoSyncEvent): void {
  if (event.ok) setLastAutoSyncAt(event.at)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<AutoSyncEvent>('crate:autosync', { detail: event }))
  }
}

/**
 * Push every locally deleted review id, then every review whose local
 * updatedAt is strictly newer than the watermark (i.e. changed after the
 * last successful sync). A fuzzy "watermark minus slack" comparison would
 * mark freshly synced rows dirty and echo-push them — and their stale
 * content would clobber newer remote corrections.
 */
export async function pushDirtyReviews(excludeIds?: Set<string>): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  const user = await cloudSession()
  if (!user) return

  for (const id of readPendingDeletes()) {
    await supabase.from('review_tags').delete().eq('review_id', id)
    const { error } = await supabase.from('reviews').delete().eq('id', id)
    if (error) throw new Error(`Löschen in der Cloud fehlgeschlagen: ${error.message}`)
    removePendingDelete(id)
  }

  const watermark = getReviewWatermark()
  const dirty = (await db.reviews.toArray())
    .filter((r) => !excludeIds?.has(r.id) && new Date(r.updatedAt).getTime() > watermark)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))

  let maxPushed = watermark
  for (const r of dirty) {
    const { error } = await supabase.from('reviews').upsert(toCloudReview(user.id, r))
    if (error) throw new Error(`Review-Upload fehlgeschlagen: ${error.message}`)
    await supabase.from('review_tags').delete().eq('review_id', r.id)
    if (r.tags.length > 0) {
      await supabase.from('review_tags').insert(r.tags.map((tag) => ({ review_id: r.id, tag })))
    }
    maxPushed = Math.max(maxPushed, new Date(r.updatedAt).getTime())
  }
  setReviewWatermark(maxPushed)
}
