import { cx } from '../lib/utils'

/**
 * Album artwork with a designed fallback: when no artwork URL exists we draw
 * a vinyl-sleeve tile (artist initials on a rust label, ring grooves) so the
 * grid never shows a broken or generic image.
 */
export function SleeveArtwork({ artist, albumTitle, artworkUrl, className }: { artist: string; albumTitle: string; artworkUrl: string | null; className?: string }) {
  if (artworkUrl) {
    return (
      <img
        src={artworkUrl}
        alt={`${albumTitle} von ${artist}`}
        loading="lazy"
        className={cx('aspect-square w-full object-cover', className)}
        onError={(e) => {
          // fall back to the sleeve if the URL 404s
          e.currentTarget.style.display = 'none'
          e.currentTarget.nextElementSibling?.removeAttribute('hidden')
        }}
      />
    )
  }
  return <SleeveFallback artist={artist} albumTitle={albumTitle} className={className} />
}

function SleeveFallback({ artist, albumTitle, className }: { artist: string; albumTitle: string; artworkUrl?: string | null; className?: string }) {
  const initials = artist
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <div className={cx('relative flex aspect-square w-full items-center justify-center overflow-hidden bg-ink-900', className)} title={`${albumTitle} von ${artist}`}>
      {/* vinyl grooves */}
      <div className="absolute inset-0 opacity-40" style={{ background: 'repeating-radial-gradient(circle at 50% 50%, transparent 0 6px, #2A2C3A 6px 7px)' }} />
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rust-500">
        <span className="font-display text-lg text-cream-100">{initials || '?'}</span>
      </div>
    </div>
  )
}
