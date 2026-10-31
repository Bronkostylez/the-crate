import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cx } from '../lib/utils'

/**
 * Collapsible block for secondary information — mobile keeps the screen calm,
 * the content stays one tap away. Height animates via the grid-rows trick.
 */
export function Disclosure({
  title,
  children,
  defaultOpen = false,
  className,
}: {
  title: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center justify-between gap-3 text-left transition-colors"
      >
        <span className="flex-1">{title}</span>
        <ChevronDown
          className={cx('h-4 w-4 shrink-0 text-cream-500 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  )
}
