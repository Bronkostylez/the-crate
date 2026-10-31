/**
 * Spotify Authorization Code Flow with PKCE — the only login a static
 * GitHub Pages site can safely do. No client secret anywhere: the code
 * verifier/challenge pair replaces it. Tokens live in localStorage and
 * never leave this browser except to Spotify itself.
 */

const LS = {
  verifier: 'crate.spotify.pkceVerifier',
  state: 'crate.spotify.state',
  accessToken: 'crate.spotify.accessToken',
  refreshToken: 'crate.spotify.refreshToken',
  expiresAt: 'crate.spotify.expiresAt',
  lastError: 'crate.spotify.lastError',
  displayName: 'crate.spotify.displayName',
} as const

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'
/** user-read-private lets us show "verbunden als <name>"; library data needs nothing more */
const SCOPES = 'user-read-private'

function base64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomString(byteLength: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(byteLength)))
}

async function sha256Base64url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return base64url(new Uint8Array(digest))
}

/** Exact redirect target — must be registered verbatim in the Spotify dashboard. */
export function spotifyRedirectUri(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`
}

export async function startSpotifyAuth(clientId: string): Promise<void> {
  const verifier = randomString(64)
  const challenge = await sha256Base64url(verifier)
  const state = randomString(16)
  localStorage.setItem(LS.verifier, verifier)
  localStorage.setItem(LS.state, state)
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: spotifyRedirectUri(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    scope: SCOPES,
  })
  window.location.assign(`${AUTHORIZE_URL}?${params.toString()}`)
}

interface TokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
}

function storeTokens(data: TokenResponse): void {
  localStorage.setItem(LS.accessToken, data.access_token)
  localStorage.setItem(LS.expiresAt, String(Date.now() + data.expires_in * 1000))
  // Spotify rotates refresh tokens; keep the old one when none is returned
  if (data.refresh_token) localStorage.setItem(LS.refreshToken, data.refresh_token)
  localStorage.removeItem(LS.verifier)
  localStorage.removeItem(LS.state)
}

/** Called on the OAuth redirect back to the app root. Throws on mismatch or Spotify errors. */
export async function completeSpotifyAuth(clientId: string, code: string, state: string): Promise<void> {
  if (state !== localStorage.getItem(LS.state)) throw new Error('State stimmt nicht — Login bitte erneut starten.')
  const verifier = localStorage.getItem(LS.verifier)
  if (!verifier) throw new Error('Login-Session verloren — bitte erneut verbinden.')
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: spotifyRedirectUri(),
      client_id: clientId,
      code_verifier: verifier,
    }),
  })
  if (!res.ok) throw new Error(`Spotify-Login fehlgeschlagen (HTTP ${res.status}).`)
  storeTokens((await res.json()) as TokenResponse)
  // best effort: account name for the settings page
  try {
    const me = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${localStorage.getItem(LS.accessToken)}` },
    })
    if (me.ok) {
      const data = (await me.json()) as { display_name?: string; id?: string }
      localStorage.setItem(LS.displayName, data.display_name || data.id || '')
    }
  } catch {
    /* name is cosmetic */
  }
}

export function spotifyConnected(): boolean {
  return Boolean(localStorage.getItem(LS.refreshToken))
}

export function spotifyDisplayName(): string {
  return localStorage.getItem(LS.displayName) ?? ''
}

export function disconnectSpotify(): void {
  for (const k of [LS.accessToken, LS.refreshToken, LS.expiresAt, LS.displayName]) localStorage.removeItem(k)
}

export function takeSpotifyError(): string {
  const e = localStorage.getItem(LS.lastError) ?? ''
  localStorage.removeItem(LS.lastError)
  return e
}

export function setSpotifyError(message: string): void {
  localStorage.setItem(LS.lastError, message)
}

/** Valid access token or null (refreshes silently when possible). */
export async function getAccessToken(clientId: string): Promise<string | null> {
  const token = localStorage.getItem(LS.accessToken)
  const expiresAt = Number(localStorage.getItem(LS.expiresAt) ?? 0)
  if (token && expiresAt > Date.now() + 30_000) return token
  const refresh = localStorage.getItem(LS.refreshToken)
  if (!refresh) return null
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh, client_id: clientId }),
  })
  if (!res.ok) {
    // only a definitive rejection kills the connection; a network blip must not
    if (res.status === 400 || res.status === 401) disconnectSpotify()
    return null
  }
  storeTokens((await res.json()) as TokenResponse)
  return localStorage.getItem(LS.accessToken)
}
