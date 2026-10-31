import type { ReactNode } from 'react'

export function StatCard({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="crate-card px-4 py-3">
      <p className="kicker">{label}</p>
      <p className="mt-1 font-display text-2xl text-cream-100">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-cream-500">{sub}</p>}
    </div>
  )
}
