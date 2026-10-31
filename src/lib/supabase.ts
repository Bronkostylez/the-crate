import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getConfigValue } from './config'

/**
 * Lazy Supabase client factory.
 *
 * Returns null while no credentials are configured — the app is fully
 * functional offline (IndexedDB) in that state. Once the user pastes their
 * project URL + anon key into Settings, the client is created on demand.
 * No service role key ever touches this app.
 */
let cached: SupabaseClient | null | undefined

export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached
  const url = getConfigValue('supabaseUrl')
  const anonKey = getConfigValue('supabaseAnonKey')
  cached = url && anonKey ? createClient(url, anonKey) : null
  return cached
}

/** Call after settings change so the next getSupabase() re-reads config. */
export function resetSupabaseClient(): void {
  cached = undefined
}
