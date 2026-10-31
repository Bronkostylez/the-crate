/**
 * The default reference to the user's live Spotify playlist.
 * The app links out to the original playlist instead of copying it;
 * the link below was provided by the owner for exactly that purpose.
 * An override (e.g. a different playlist later) is kept in localStorage,
 * and a snapshot-level URL always wins for its own snapshot.
 */
export const DEFAULT_PLAYLIST_URL = 'https://open.spotify.com/playlist/0e4Tg1jfYSi4zhTqrw1qqm'

const KEY = 'the-crate:playlist-link'

/** Strip tracking parameters (?si=…&utm_…) — the base URL is all a reference needs. */
export function sanitizeSpotifyUrl(url: string): string | null {
  try {
    const u = new URL(url.trim())
    if (!u.hostname.endsWith('spotify.com')) return null
    return `${u.origin}${u.pathname}`
  } catch {
    return null
  }
}

export function getPlaylistLink(): string {
  return localStorage.getItem(KEY) ?? DEFAULT_PLAYLIST_URL
}

export function setPlaylistLink(url: string): void {
  const clean = sanitizeSpotifyUrl(url)
  if (clean) localStorage.setItem(KEY, clean)
}
