import type { Review } from '../types'

/**
 * Pure merge decision for review sync, pulled out so it is unit-testable
 * without a database.
 *
 * Rules:
 *  - remote row unknown locally          -> apply locally (other device /
 *                                           out-of-app change / first login)
 *  - remote strictly newer than the      -> apply locally, even when the
 *    local row's updated_at                local row is dirty: updated_at is
 *                                           the content's own timestamp, so
 *                                           the newer content wins. This is
 *                                           what stops a stale device (old
 *                                           rows, watermark lost) from
 *                                           clobbering newer cloud data.
 *  - local row dirty (changed AFTER the  -> local content is the newer one,
 *    last successful sync) and at least     it gets pushed
 *    as new as the remote row
 *  - remote same age or older            -> keep local, push nothing
 *
 * Local rows the remote does not know are pushed only when dirty — a full
 * sync no longer mirrors every row every time.
 */

export interface RemoteReviewMeta {
  id: string
  updated_at: string
}

export interface ReconcilePlan {
  /** remote review ids to fetch in full and store locally */
  applyIds: string[]
  /** local review ids to push to the cloud */
  pushIds: string[]
}

export function planReviewReconcile(
  local: Review[],
  remote: RemoteReviewMeta[],
  watermark: number,
  toleranceMs = 2_000,
): ReconcilePlan {
  const localById = new Map(local.map((r) => [r.id, r]))
  const remoteIds = new Set(remote.map((r) => r.id))
  const applyIds: string[] = []
  const pushIds: string[] = []

  for (const row of remote) {
    const l = localById.get(row.id)
    if (!l) {
      applyIds.push(row.id)
      continue
    }
    const localTs = new Date(l.updatedAt).getTime()
    const remoteTs = new Date(row.updated_at).getTime()
    // strictly after the watermark: the watermark covers every synced row's
    // updatedAt, so a fuzzy comparison would mark freshly SYNCED rows dirty
    // and push their stale content over newer remote corrections
    const localDirty = localTs > watermark
    const remoteNewer = remoteTs - localTs > toleranceMs
    // the newer CONTENT wins: a dirty local row still loses to a newer
    // remote row — otherwise a device with a lost watermark (every old row
    // looks dirty) would push stale state over newer cloud data
    if (remoteNewer) applyIds.push(row.id)
    else if (localDirty) pushIds.push(l.id)
    // same age or remote older: nothing to do
  }

  // local-only rows: push when dirty, leave clean ones alone
  for (const l of local) {
    if (!remoteIds.has(l.id) && new Date(l.updatedAt).getTime() > watermark) {
      pushIds.push(l.id)
    }
  }

  return { applyIds, pushIds }
}

/** watermark after a successful reconcile: covers pushes AND applied remote rows */
export function nextWatermark(current: number, appliedServerTimestamps: string[]): number {
  let max = Math.max(current, Date.now())
  for (const ts of appliedServerTimestamps) {
    const t = new Date(ts).getTime()
    if (Number.isFinite(t) && t > max) max = t
  }
  return max
}
