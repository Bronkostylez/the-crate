import type { Review } from '../types'

/**
 * Pure merge decision for review sync, pulled out so it is unit-testable
 * without a database.
 *
 * Rules:
 *  - remote row unknown locally          -> apply locally (other device /
 *                                           out-of-app change / first login)
 *  - local row dirty (changed AFTER the  -> local always wins, gets pushed
 *    last successful sync, strictly)
 *  - remote strictly newer, local clean  -> apply locally (this is how
 *                                           out-of-app corrections arrive)
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
    if (localDirty) pushIds.push(l.id) // local wins the conflict
    else if (remoteNewer) applyIds.push(row.id)
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
