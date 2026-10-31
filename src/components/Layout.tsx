import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Library, Upload, Settings, Disc3 } from 'lucide-react'
import { cx } from '../lib/utils'

const NAV = [
  { to: '/', label: 'Überblick', icon: LayoutDashboard, end: true },
  { to: '/archive', label: 'Das Archiv', icon: Library },
  { to: '/import', label: 'Import', icon: Upload },
  { to: '/settings', label: 'Einstellungen', icon: Settings },
]

function navClass({ isActive }: { isActive: boolean }): string {
  return cx(
    'flex items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors',
    isActive ? 'bg-ink-800 text-cream-100' : 'text-cream-500 hover:bg-ink-850 hover:text-cream-300',
  )
}

export function Layout() {
  return (
    <div className="flex min-h-full flex-col md:flex-row">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-ink-700 bg-ink-900 p-4 md:flex">
        <div className="mb-8 flex items-center gap-3 px-2 pt-2">
          <Disc3 className="h-7 w-7 text-rust-400" strokeWidth={1.5} />
          <div>
            <p className="font-display text-base leading-none tracking-wide">THE CRATE</p>
            <p className="kicker mt-1">privates archiv</p>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={navClass}>
              <Icon className="h-4 w-4" strokeWidth={1.75} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-2">
          <p className="kicker leading-relaxed">
            am diggern seit
            <br />
            dem golden age.
          </p>
        </div>
      </aside>

      {/* mobile top bar */}
      <div className="sticky top-0 z-20 flex w-full items-center gap-2 overflow-x-auto border-b border-ink-700 bg-ink-900/95 px-3 py-2 backdrop-blur md:hidden">
        <Disc3 className="h-5 w-5 shrink-0 text-rust-400" />
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cx(
                'flex shrink-0 items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs',
                isActive ? 'bg-ink-800 text-cream-100' : 'text-cream-500',
              )
            }
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </NavLink>
        ))}
      </div>

      <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
