import type { ReactNode } from 'react'
import { cx } from '../lib/utils'

/** Comic-panel stat: halftone dots in the corner, block-letter number, pasted tilt. */
export function StatCard({ label, value, sub, tilt = 0 }: { label: string; value: ReactNode; sub?: string; tilt?: number }) {
  return (
    <div
      className={cx('crate-card halftone-corner px-4 py-3', tilt !== 0 && (tilt < 0 ? 'tilt-l' : 'tilt-r'))}
    >
      <p className="kicker">{label}</p>
      <p className="mt-1 font-block text-2xl leading-tight text-cream-100 sm:text-3xl" style={{ textShadow: '2px 2px 0 rgba(201,48,24,0.55)' }}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-cream-500">{sub}</p>}
    </div>
  )
}
