import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="crate-card flex flex-col items-center gap-3 px-6 py-14 text-center">
      <Icon className="h-8 w-8 text-cream-600" strokeWidth={1.25} />
      <p className="font-display text-lg text-cream-300">{title}</p>
      <p className="max-w-md text-sm leading-relaxed text-cream-500">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
