import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Library, History, ListMusic, Dna, CalendarRange, Upload, Settings } from 'lucide-react'
import { cx } from '../lib/utils'
import { HeadphonesDoodle, SquiggleDoodle, StarDoodle, VinylDoodle } from './Doodles'

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
    'flex items-center gap-3 rounded-full px-3 py-2 text-sm transition-all',
    isActive
      ? 'marker font-semibold text-cream-100'
      : 'text-cream-500 hover:-rotate-1 hover:bg-ink-850 hover:text-cream-300',
  )
}

export function Layout() {
  return (
    <div className="flex min-h-full flex-col md:flex-row">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-dashed border-[#EFE9DC]/15 bg-ink-900 p-4 md:flex">
        <div className="mb-8 px-2 pt-3">
          {/* logo as a taped-on paper scrap */}
          <div className="tilt-l relative w-fit rounded-md bg-[#EFE9DC] px-4 py-2 shadow-[0_3px_0_rgba(0,0,0,0.45)]">
            <span className="tape" />
            <p className="font-block text-2xl uppercase leading-none tracking-tight text-rust-500">The Crate</p>
          </div>
          <p className="kicker mt-3 whitespace-nowrap">privates archiv · vol. 1</p>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={navClass}>
              <Icon className="h-4 w-4" strokeWidth={1.75} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-3 px-2">
          <VinylDoodle className="h-16 w-16 opacity-50" />
          <SquiggleDoodle className="h-4 w-24 opacity-60" />
          <p className="font-display text-xl leading-tight text-cream-500">
            am diggern seit
            <br />
            dem golden age.
          </p>
        </div>
      </aside>

      {/* mobile top bar */}
      <div className="sticky top-0 z-20 flex w-full items-center gap-2 overflow-x-auto border-b border-dashed border-[#EFE9DC]/15 bg-ink-900/95 px-3 py-2 backdrop-blur md:hidden">
        <VinylDoodle className="h-6 w-6 shrink-0" stroke="#E04424" />
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cx(
                'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs',
                isActive ? 'marker font-semibold text-cream-100' : 'text-cream-500',
              )
            }
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </NavLink>
        ))}
      </div>

      <main className="relative min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">
        {/* scattered pencil work — decoration only */}
        <StarDoodle className="pointer-events-none absolute right-6 top-4 h-8 w-8 opacity-30 md:right-12" />
        <HeadphonesDoodle className="pointer-events-none absolute bottom-6 right-8 hidden h-14 w-14 opacity-25 md:block" />
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
