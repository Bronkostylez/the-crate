import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Library, History, ListMusic, Dna, CalendarRange, Upload, Settings, Disc3 } from 'lucide-react'
import { cx } from '../lib/utils'

const NAV = [
  { to: '/', label: 'Überblick', icon: LayoutDashboard, end: true },
  { to: '/archive', label: 'Das Archiv', icon: Library },
  { to: '/history', label: 'Hörverlauf', icon: History },
  { to: '/playlist', label: 'Die Playlist', icon: ListMusic },
  { to: '/dna', label: 'The DNA', icon: Dna },
  { to: '/recaps', label: 'Recaps', icon: CalendarRange },
  { to: '/import', label: 'Import', icon: Upload },
  { to: '/settings', label: 'Einstellungen', icon: Settings },
]

function navClass({ isActive }: { isActive: boolean }): string {
  return cx(
    'flex items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors',
    isActive
      ? 'border-2 border-[#241C0E] bg-[#241C0E] text-[#F7F0DE] shadow-[2px_2px_0_0_#9C4420]'
      : 'border-2 border-transparent text-cream-500 hover:bg-ink-800 hover:text-cream-300',
  )
}

export function Layout() {
  return (
    <div className="flex min-h-full flex-col md:flex-row">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r-2 border-[#241C0E] bg-ink-900 p-4 md:flex">
        <div className="mb-8 px-2 pt-2">
          <div className="w-fit -rotate-1 border-2 border-[#241C0E] bg-[#241C0E] px-3 py-2 shadow-[3px_3px_0_0_#9C4420]">
            <p className="font-display text-lg leading-none tracking-wide text-[#F7F0DE]">THE CRATE</p>
          </div>
          <p className="kicker mt-2.5 whitespace-nowrap">privates archiv · vol. 1</p>
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
      <div className="sticky top-0 z-20 flex w-full items-center gap-2 overflow-x-auto border-b-2 border-[#241C0E] bg-ink-900/95 px-3 py-2 backdrop-blur md:hidden">
        <Disc3 className="h-5 w-5 shrink-0 text-rust-500" />
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cx(
                'flex shrink-0 items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs',
                isActive ? 'bg-[#241C0E] text-[#F7F0DE]' : 'text-cream-500',
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
