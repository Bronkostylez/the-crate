import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { LayoutDashboard, Library, History, ListMusic, Dna, CalendarRange, Upload, Settings, Ellipsis } from 'lucide-react'
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

/** thumb reach on the phone: the four daily stops + the "Mehr" sheet */
const PRIMARY = [
  { to: '/', label: 'Überblick', icon: LayoutDashboard, end: true },
  { to: '/archive', label: 'Archiv', icon: Library },
  { to: '/history', label: 'Verlauf', icon: History },
  { to: '/dna', label: 'DNA', icon: Dna },
]
const MORE = [
  { to: '/playlist', label: 'Die Playlist', icon: ListMusic },
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

/** bottom-sheet for the secondary stops — slides up, taps big, closes softly */
function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [render, setRender] = useState(open)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      setRender(true)
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
      return () => cancelAnimationFrame(raf)
    }
    setVisible(false)
    const t = setTimeout(() => setRender(false), 200)
    return () => clearTimeout(t)
  }, [open])

  if (!render) return null
  return (
    <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Mehr">
      <button
        aria-label="Schließen"
        onClick={onClose}
        className={cx(
          'absolute inset-0 bg-ink-950/70 backdrop-blur-[2px] transition-opacity duration-200',
          visible ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div
        className={cx(
          'crate-card absolute inset-x-0 bottom-0 rounded-b-none border-x-0 border-b-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] transition-transform duration-200 ease-out',
          visible ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        <span className="tape" />
        <p className="kicker rule mb-3">mehr aus der crate</p>
        <nav className="flex flex-col gap-1">
          {MORE.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                cx(
                  'flex min-h-14 items-center gap-4 rounded-2xl px-4 text-base transition-all active:scale-[0.98]',
                  isActive ? 'marker w-fit px-4 font-semibold text-cream-100' : 'text-cream-300 active:bg-ink-800',
                )
              }
            >
              <Icon className="h-5 w-5" strokeWidth={1.75} />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}

export function Layout() {
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreActive = MORE.some((m) => location.pathname.startsWith(m.to))

  useEffect(() => setMoreOpen(false), [location.pathname])

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

      {/* phone: slim taped logo header … */}
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-dashed border-[#EFE9DC]/15 bg-ink-900/95 px-4 py-2.5 backdrop-blur md:hidden">
        <div className="tilt-l relative rounded bg-[#EFE9DC] px-2.5 py-1 shadow-[0_2px_0_rgba(0,0,0,0.45)]">
          <p className="font-block text-sm uppercase leading-none tracking-tight text-rust-500">The Crate</p>
        </div>
        <p className="kicker">privates archiv</p>
        <VinylDoodle className="ml-auto h-5 w-5 opacity-70" stroke="#E04424" />
      </header>

      <main className="relative min-w-0 flex-1 px-4 pb-28 pt-5 md:px-10 md:py-8">
        {/* scattered pencil work — decoration only */}
        <StarDoodle className="pointer-events-none absolute right-6 top-4 h-8 w-8 opacity-30 md:right-12" />
        <HeadphonesDoodle className="pointer-events-none absolute bottom-6 right-8 hidden h-14 w-14 opacity-25 md:block" />
        <div className="mx-auto max-w-6xl">
          {/* keyed on the path: every page drifts softly into place */}
          <div key={location.pathname} className="animate-page-enter">
            <Outlet />
          </div>
        </div>
      </main>

      {/* … and the real bottom navigation, thumb-first */}
      <nav
        aria-label="Hauptnavigation"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-dashed border-[#EFE9DC]/15 bg-ink-900/95 px-2 pb-[calc(0.35rem+env(safe-area-inset-bottom))] pt-1.5 backdrop-blur md:hidden"
      >
        <div className="grid grid-cols-5">
          {PRIMARY.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl transition-all duration-200 active:scale-95',
                  isActive ? 'text-cream-100' : 'text-cream-500',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cx('rounded-full px-3 py-0.5 transition-all duration-200', isActive && 'marker animate-pop')}>
                    <Icon className="h-5 w-5" strokeWidth={isActive ? 2 : 1.75} />
                  </span>
                  <span className={cx('text-[10px] leading-none', isActive && 'font-semibold')}>{label}</span>
                </>
              )}
            </NavLink>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            aria-label="Mehr öffnen"
            className={cx(
              'flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl transition-all duration-200 active:scale-95',
              moreActive ? 'text-cream-100' : 'text-cream-500',
            )}
          >
            <span className={cx('rounded-full px-3 py-0.5 transition-all duration-200', moreActive && 'marker')}>
              <Ellipsis className="h-5 w-5" strokeWidth={moreActive ? 2 : 1.75} />
            </span>
            <span className={cx('text-[10px] leading-none', moreActive && 'font-semibold')}>Mehr</span>
          </button>
        </div>
      </nav>

      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </div>
  )
}
