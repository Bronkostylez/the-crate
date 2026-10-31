import { cx } from '../lib/utils'

/**
 * Comic rating stamp: tilted sticker with a hard offset shadow. A perfect 10
 * earns the marker-yellow issue-star treatment, 9+ the rust stamp.
 */
export function RatingBadge({ rating, size = 'md' }: { rating: number | null; size?: 'sm' | 'md' | 'lg' }) {
  if (rating === null) {
    return <span className="font-mono text-xs text-cream-600">unbewertet</span>
  }
  const tone =
    rating === 10 ? 'border-ink-950 bg-marker-yellow text-ink-950 rotate-2'
    : rating >= 9 ? 'border-rust-400 bg-rust-500 text-cream-100 -rotate-2'
    : rating >= 7 ? 'border-rust-600 bg-ink-900 text-rust-300 -rotate-1'
    : rating >= 5 ? 'border-ink-600 bg-ink-900 text-cream-300 rotate-1'
    : 'border-ink-600 bg-ink-900 text-cream-600 rotate-1'
  const pad = size === 'lg' ? 'px-3 py-1.5 text-base' : size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-1 text-xs'
  return (
    <span
      className={cx('inline-flex items-baseline gap-0.5 rounded-md border-2 font-mono font-bold', tone, pad)}
      style={{ boxShadow: '2px 2px 0 rgba(0,0,0,0.55)' }}
    >
      {rating}
      <span className="opacity-60">/10</span>
    </span>
  )
}
