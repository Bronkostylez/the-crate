/**
 * Offline-proof queue + watermarks for the auto-sync.
 *
 * Small pieces of sync state live in localStorage so an offline edit
 * survives closing the tab and flushes on the next connected run:
 *  - review watermark: local updatedAt timestamp up to which reviews were
 *    pushed. Anything newer is "dirty" and goes out on the next auto-sync.
 *  - pending deletes: locally deleted review ids, replayed against the
 *    cloud when a connection exists (a delete leaves no dirty row behind).
 *  - pending full sync: set when a full mirror (imports, plays) could not
 *    run; cleared by the next successful full sync.
 */
const WATERMARK_KEY = 'crate.cloud.reviewWatermark'
const PENDING_DELETES_KEY = 'crate.cloud.pendingReviewDeletes'
const PENDING_FULL_KEY = 'crate.cloud.pendingFullSync'
const LAST_AUTO_KEY = 'crate.cloud.lastAutoSyncAt'
const PLAYS_CREATED_KEY = 'crate.cloud.playsCreatedWatermark'

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function getReviewWatermark(): number {
  return Number(store()?.getItem(WATERMARK_KEY) ?? 0) || 0
}

export function setReviewWatermark(ms: number): void {
  store()?.setItem(WATERMARK_KEY, String(ms))
}

export function readPendingDeletes(): string[] {
  try {
    const raw = store()?.getItem(PENDING_DELETES_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function writePendingDeletes(ids: string[]): void {
  store()?.setItem(PENDING_DELETES_KEY, JSON.stringify(ids))
}

export function addPendingDelete(id: string): void {
  const ids = readPendingDeletes()
  if (!ids.includes(id)) writePendingDeletes([...ids, id])
}

export function removePendingDelete(id: string): void {
  writePendingDeletes(readPendingDeletes().filter((x) => x !== id))
}

export function getPendingFullSync(): boolean {
  return store()?.getItem(PENDING_FULL_KEY) === '1'
}

export function setPendingFullSync(pending: boolean): void {
  if (pending) store()?.setItem(PENDING_FULL_KEY, '1')
  else store()?.removeItem(PENDING_FULL_KEY)
}

/** Server created_at of the newest cloud play this device has pulled. */
export function getPlaysCreatedWatermark(): string | null {
  return store()?.getItem(PLAYS_CREATED_KEY) ?? null
}

export function setPlaysCreatedWatermark(iso: string): void {
  store()?.setItem(PLAYS_CREATED_KEY, iso)
}

export function getLastAutoSyncAt(): string | null {
  return store()?.getItem(LAST_AUTO_KEY) ?? null
}

export function setLastAutoSyncAt(iso: string): void {
  store()?.setItem(LAST_AUTO_KEY, iso)
}
