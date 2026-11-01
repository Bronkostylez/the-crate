/**
 * Artist identity across data sources.
 *
 * Reviews are hand-written, plays come from Spotify exports and the live
 * API — the same artist shows up spelled differently:
 *   "N.W.A" (review)            vs "N.W.A." (export)
 *   "Wu‐Tang Clan" (U+2010)      vs "Wu-Tang Clan" (ASCII)
 *   "Snoop Doggy Dogg" (review) vs "Snoop Dogg" (export)
 *   "Puff Daddy & the Family"   vs "Puff Daddy" / "Puff Daddy & The Family"
 * Every review↔play join must go through artistKey / albumKey — never raw
 * string comparison.
 */

/** unicode dash variants → ASCII hyphen, NFKC folds ellipsis/compatibility chars */
function foldDashes(s: string): string {
  return s.normalize('NFKC').replace(/[‐‑‒–—−]/g, '-')
}

/** lowercase, dashes folded, periods removed ("N.W.A." → "nwa"), whitespace collapsed */
export function normalizeName(s: string): string {
  return foldDashes(s)
    .replace(/[.…]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** first artist of a multi-artist row: "A, B" / "A & B" → "A" */
export function primaryArtist(artistName: string): string {
  return artistName.split(/,\s*|\s+&\s+/)[0].trim()
}

/**
 * Known renames/aliases, keyed by normalized primary name.
 * Only additions that are verifiably the same person/group — never fuzzy.
 */
const ARTIST_ALIASES: Record<string, string> = {
  'snoop doggy dogg': 'snoop dogg',
}

/** stable identity key for an artist from any source */
export function artistKey(artistName: string): string {
  const key = normalizeName(primaryArtist(artistName))
  return ARTIST_ALIASES[key] ?? key
}

/** stable identity key for an album title from any source */
export function albumKey(albumTitle: string): string {
  return normalizeName(albumTitle)
}
