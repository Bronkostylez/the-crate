/**
 * Hand-drawn doodles — the zine's pencil work. Rough single-stroke paths,
 * intentionally imperfect, decorative only (aria-hidden).
 */
interface DoodleProps {
  className?: string
  stroke?: string
}

export function VinylDoodle({ className, stroke = '#E04424' }: DoodleProps) {
  return (
    <svg viewBox="0 0 100 100" fill="none" className={className} aria-hidden="true">
      <path d="M50 8c23 1 42 18 42 41s-18 42-41 43C27 93 8 74 8 51 7 28 27 7 50 8Z" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M50 22c15 0 28 12 29 27M21 50c0-15 13-27 29-28" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <path d="M50 33c9 0 17 7 17 17M33 51c0-10 8-17 17-18" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" opacity="0.45" />
      <circle cx="50" cy="50" r="7" stroke={stroke} strokeWidth="2.5" />
      <circle cx="50" cy="50" r="1.8" fill={stroke} />
    </svg>
  )
}

export function HeadphonesDoodle({ className, stroke = '#E04424' }: DoodleProps) {
  return (
    <svg viewBox="0 0 100 100" fill="none" className={className} aria-hidden="true">
      <path d="M20 62C18 38 32 16 51 16c19 1 31 22 29 46" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M18 60c-5 1-8 5-8 11 0 7 4 12 9 12 4 0 6-3 6-8v-9c0-4-3-7-7-6Z" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M82 60c5 1 8 5 8 11 0 7-4 12-9 12-4 0-6-3-6-8v-9c0-4 3-7 7-6Z" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  )
}

export function StarDoodle({ className, stroke = '#E04424' }: DoodleProps) {
  return (
    <svg viewBox="0 0 100 100" fill="none" className={className} aria-hidden="true">
      <path d="M50 12l10 25 27 3-20 18 6 27-23-14-24 13 7-26-19-19 27-2 9-25Z" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  )
}

export function ArrowDoodle({ className, stroke = '#E04424' }: DoodleProps) {
  return (
    <svg viewBox="0 0 100 60" fill="none" className={className} aria-hidden="true">
      <path d="M6 50c22 4 46-2 62-22" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M56 24l14 2-4 13" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function SquiggleDoodle({ className, stroke = '#E04424' }: DoodleProps) {
  return (
    <svg viewBox="0 0 100 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 14c8-8 12 6 20-2s12 6 20-2 12 6 20-2 12 6 20-2 8 8 12 4" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}
