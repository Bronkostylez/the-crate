import { cx } from '../lib/utils'

/** Editorial rating stamp: mono "8/10", rust ink gets deeper the higher the score. */
export function RatingBadge({ rating, size = 'md' }: { rating: number | null; size?: 'sm' | 'md' | 'lg' }) {
  if (rating === null) {
    return <span className="font-mono text-xs text-cream-600">unbewertet</span>
  }
  const tone =
    rating >= 9 ? 'border-rust-400 bg-rust-500 text-ink-950'
    : rating >= 7 ? 'border-rust-600 bg-ink-900 text-rust-300'
    : rating >= 5 ? 'border-ink-600 bg-ink-900 text-cream-300'
    : 'border-ink-600 bg-ink-900 text-cream-600'
  const pad = size === 'lg' ? 'px-3 py-1.5 text-base' : size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-1 text-xs'
  return (
    <span className={cx('inline-flex items-baseline gap-0.5 rounded-sm border font-mono font-medium', tone, pad)}>
      {rating}
      <span className="opacity-60">/10</span>
    </span>
  )
}
