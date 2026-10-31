import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/archivo/400.css'
import '@fontsource/archivo-black'
import '@fontsource/archivo/500.css'
import '@fontsource/archivo/600.css'
import '@fontsource/caveat/500.css'
import '@fontsource/caveat/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './index.css'
import App from './App.tsx'
import { getConfigValue } from './lib/config'
import { completeSpotifyAuth, setSpotifyError } from './lib/spotify/auth'
import { pushSpotifyConnection } from './lib/cloud'

/**
 * Spotify OAuth redirect lands on the app root with ?code&state (or ?error).
 * Handle it before React mounts, then move on to the settings page — no
 * router involvement, no 404.html detour on GitHub Pages.
 */
async function handleSpotifyCallback(): Promise<boolean> {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  if (!code && !error) return false
  if (error) {
    setSpotifyError(error === 'access_denied' ? 'Du hast den Spotify-Login abgebrochen.' : `Spotify meldet: ${error}`)
  } else {
    try {
      await completeSpotifyAuth(getConfigValue('spotifyClientId'), code!, state!)
      // best effort: hand the new login to the hourly cloud tracker too
      void pushSpotifyConnection().catch(() => {})
    } catch (e) {
      setSpotifyError(e instanceof Error ? e.message : 'Spotify-Login fehlgeschlagen.')
    }
  }
  window.location.replace(`${import.meta.env.BASE_URL}settings`)
  return true
}

handleSpotifyCallback().then((handled) => {
  if (handled) return
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}
