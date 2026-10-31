/**
 * Runtime configuration.
 *
 * Resolution order: value entered in the app's Settings page (localStorage)
 * wins over the build-time environment variable. That keeps the deployed
 * GitHub Pages build free of any baked-in values while still letting a
 * local developer use .env.
 *
 * Everything here is frontend-safe by design. Secrets (Supabase service
 * role key, Spotify client secret) are never part of this app.
 */

const LS_KEYS = {
  supabaseUrl: 'crate.config.supabaseUrl',
  supabaseAnonKey: 'crate.config.supabaseAnonKey',
  spotifyClientId: 'crate.config.spotifyClientId',
} as const

export interface ConfigField {
  key: keyof typeof LS_KEYS
  label: string
  envName: string
  value: string
  source: 'settings' | 'env' | 'missing'
  hint: string
}

function read(key: keyof typeof LS_KEYS, envName: string): { value: string; source: ConfigField['source'] } {
  const fromSettings = (localStorage.getItem(LS_KEYS[key]) ?? '').trim()
  if (fromSettings) return { value: fromSettings, source: 'settings' }
  const fromEnv = ((import.meta.env[envName] as string | undefined) ?? '').trim()
  if (fromEnv) return { value: fromEnv, source: 'env' }
  return { value: '', source: 'missing' }
}

export function getConfig(): ConfigField[] {
  const fields: Array<Omit<ConfigField, 'value' | 'source'>> = [
    {
      key: 'supabaseUrl',
      label: 'Supabase Project URL',
      envName: 'VITE_SUPABASE_URL',
      hint: 'Supabase-Dashboard → Project Settings → API → Project URL. Darf im Frontend sichtbar sein.',
    },
    {
      key: 'supabaseAnonKey',
      label: 'Supabase anon (publishable) key',
      envName: 'VITE_SUPABASE_ANON_KEY',
      hint: 'Gleiche Seite, der „anon public“-Key. Ist bewusst veröffentlichbar — geschützt wird über dein Login + Row Level Security.',
    },
    {
      key: 'spotifyClientId',
      label: 'Spotify Client ID',
      envName: 'VITE_SPOTIFY_CLIENT_ID',
      hint: 'developer.spotify.com → deine App → Client ID. Der Login läuft über PKCE, ein Client-Secret wird nie gebraucht.',
    },
  ]
  return fields.map((f) => ({ ...f, ...read(f.key, f.envName) }))
}

export function getConfigValue(key: keyof typeof LS_KEYS): string {
  const envName = getConfig().find((f) => f.key === key)?.envName ?? ''
  return read(key, envName).value
}

export function setConfigValue(key: keyof typeof LS_KEYS, value: string): void {
  const trimmed = value.trim()
  if (trimmed) localStorage.setItem(LS_KEYS[key], trimmed)
  else localStorage.removeItem(LS_KEYS[key])
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}
