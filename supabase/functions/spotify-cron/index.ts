// THE CRATE — hourly Spotify live tracking (Supabase Edge Function, Deno).
//
// Runs without the app being open: for every row in spotify_connection it
// refreshes the Spotify access token (PKCE public client — no secret
// anywhere), pulls /me/player/recently-played after the newest stored play,
// and upserts rows into listening_history. Plays from here carry
// duration_ms and ms_played = 0: the app shows them as an honest "ca."
// estimate, and a later Extended export replaces them with exact minutes.
//
// Auth: the cron job calls this function with the service role key, which
// also unlocks the table writes (RLS bypass is intended here — the function
// writes ON BEHALF of each connection's owner and reads only their own
// refresh token). Spotify never sees the service role key, Supabase never
// sees a Spotify client secret (there is none — PKCE).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const API = 'https://api.spotify.com/v1'

interface Connection {
  user_id: string
  refresh_token: string
  client_id: string
}

interface RecentlyPlayedItem {
  played_at?: unknown
  track?: {
    name?: unknown
    artists?: Array<{ name?: unknown }>
    album?: { name?: unknown }
    duration_ms?: unknown
  } | null
}

async function refreshAccessToken(conn: Connection): Promise<{ accessToken: string; newRefreshToken: string | null }> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: conn.refresh_token,
      client_id: conn.client_id,
    }),
  })
  if (!res.ok) throw new Error(`spotify token refresh failed: HTTP ${res.status}`)
  const data = (await res.json()) as { access_token: string; refresh_token?: string }
  return { accessToken: data.access_token, newRefreshToken: data.refresh_token ?? null }
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const { data: connections, error: connError } = await supabase
    .from('spotify_connection')
    .select('user_id, refresh_token, client_id')
  if (connError) {
    return new Response(JSON.stringify({ ok: false, error: connError.message }), { status: 500 })
  }

  const report: Array<{ user: string; fetched: number; inserted: number; error?: string }> = []

  for (const conn of (connections ?? []) as Connection[]) {
    const entry: { user: string; fetched: number; inserted: number; error?: string } = {
      user: conn.user_id,
      fetched: 0,
      inserted: 0,
    }
    report.push(entry)
    try {
      const { accessToken, newRefreshToken } = await refreshAccessToken(conn)

      // Spotify rotates refresh tokens — keep the row current
      if (newRefreshToken && newRefreshToken !== conn.refresh_token) {
        await supabase
          .from('spotify_connection')
          .update({ refresh_token: newRefreshToken })
          .eq('user_id', conn.user_id)
      }

      // incremental cursor: only plays after the newest stored one
      const { data: newest } = await supabase
        .from('listening_history')
        .select('played_at')
        .eq('user_id', conn.user_id)
        .eq('source', 'spotify_api')
        .order('played_at', { ascending: false })
        .limit(1)
      const params = new URLSearchParams({ limit: '50' })
      if (newest && newest.length > 0) {
        params.set('after', String(new Date(newest[0].played_at as string).getTime()))
      }

      const res = await fetch(`${API}/me/player/recently-played?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) throw new Error(`recently-played failed: HTTP ${res.status}`)
      const data = (await res.json()) as { items?: RecentlyPlayedItem[] }

      const rows = []
      for (const item of data.items ?? []) {
        const track = item.track && typeof item.track.name === 'string' ? item.track.name.trim() : ''
        const artists = (item.track?.artists ?? [])
          .map((a) => (typeof a.name === 'string' ? a.name.trim() : ''))
          .filter(Boolean)
        if (!track || artists.length === 0 || typeof item.played_at !== 'string') continue
        const playedAt = new Date(item.played_at)
        if (Number.isNaN(playedAt.getTime())) continue
        // second precision, matching the app + Extended export, so the same
        // play dedupes on the unique constraint wherever it lands first
        playedAt.setMilliseconds(0)
        rows.push({
          user_id: conn.user_id,
          track_name: track,
          artist_name: artists.join(', '),
          album_name:
            typeof item.track?.album?.name === 'string' && item.track.album.name.trim()
              ? item.track.album.name.trim()
              : null,
          played_at: playedAt.toISOString(),
          ms_played: 0,
          duration_ms:
            typeof item.track?.duration_ms === 'number' && item.track.duration_ms > 0
              ? Math.round(item.track.duration_ms)
              : null,
          source: 'spotify_api',
        })
      }
      entry.fetched = rows.length

      if (rows.length > 0) {
        const { error: insertError, count } = await supabase
          .from('listening_history')
          .upsert(rows, { onConflict: 'user_id,played_at,track_name,artist_name', ignoreDuplicates: true, count: 'exact' })
          .select('id')
        if (insertError) throw new Error(`insert failed: ${insertError.message}`)
        entry.inserted = count ?? rows.length
      }
    } catch (e) {
      entry.error = e instanceof Error ? e.message : String(e)
    }
  }

  return new Response(JSON.stringify({ ok: true, connections: report.length, report }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
