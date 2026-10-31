# THE CRATE — Einrichtung

**Stand 31.10.2026: Das Supabase-Backend ist komplett eingerichtet.** Datenbank,
Login, 24/7-Tracking und Zeitplan laufen bereits. Diese Datei dokumentiert den
Ist-Zustand, deine restlichen Schritte in der App und — ganz unten — die
Rebuild-Anleitung, falls das Backend je neu aufgesetzt werden muss.

## Was bereits läuft

| Baustein | Status |
|---|---|
| Supabase-Projekt „the-crate", Region Frankfurt (eu-central-1), Free-Plan | aktiv |
| Datenbankschema (Migrationen 0001 + 0002, 13 Tabellen, Row Level Security) | eingespielt |
| Dein Login (E-Mail bestätigt), öffentliche Registrierung gesperrt | aktiv |
| Edge Function `spotify-cron` | deployed |
| Stündlicher Cron-Job `crate-spotify-sync` (jede Stunde zu Minute 23) | aktiv |
| Live-Seite über GitHub Actions | deployed bei jedem Push auf `main` |

Dein Datenbank-Passwort und dein Cloud-Login-Passwort liegen sicher im
Passwort-Manager (Vault-Einträge „Supabase the-crate database" und
„THE CRATE Cloud login").

## Was du noch tust — nur in der App

1. **Einstellungen** öffnen und unter **Cloud** eintragen:
   - **Project URL** und den **anon public**-Key (beide hast du privat
     bekommen; sie stehen auch im Supabase-Dashboard unter Project
     Settings → API).
2. Bei **Cloud-Sync** mit deiner E-Mail und dem Cloud-Login-Passwort
   anmelden.
3. Deine **Spotify Client ID** eintragen (siehe Abschnitt „Spotify") und
   einmal mit Spotify verbinden.
4. Einmal **Jetzt synchronisieren**. Ab dann läuft alles von allein: Die
   App übergibt dein Spotify-Login an deine eigene `spotify_connection`-
   Tabelle (nur du kannst sie lesen), und der Stunden-Job holt deine Plays
   ab — auch bei geschlossener App.

> Project URL und anon-Key sind *bewusst veröffentlichbar*. Deine Daten
> schützen dein Login und die Row Level Security, nicht das Verstecken
> dieser Werte. Der **service_role**-Key ist der gefährliche — der gehört
> nirgendwo hin außer in den Cron-Job in deiner eigenen Datenbank
> (schon erledigt).

## Spotify (dein Part)

1. developer.spotify.com → mit deinem Spotify-Konto einloggen → **Create
   app**. Name und Beschreibung egal („THE CRATE").
2. **Redirect URI:** `https://bronkostylez.github.io/the-crate/`
   (exakt so, inklusive Slash am Ende).
3. Die **Client ID** in THE CRATE → **Einstellungen** eintragen.
4. Das **Client Secret** bleibt unangetastet — der Login läuft über PKCE,
   Spotifys offizielle Methode für Browser-Apps ohne Secret.

### Deine komplette Hörhistorie

Die Live-Spotify-API liefert nur die letzten ~50 gespielten Tracks. Deine
echte Historie kommt aus Spotifys Datenexport — **jetzt schon anfordern**,
das dauert Tage:

1. spotify.com → Konto → **Datenschutz-Einstellungen** → **Daten
   herunterladen**.
2. **„Erweiterte Streaming-Historie"** (Extended streaming history) anhaken
   und anfordern.
3. Spotify schickt dir einen Download-Link per Mail (meist innerhalb einer
   Woche, kann bis zu 30 Tage dauern).
4. Etappe 2 bringt den Importer für genau diese JSON-Dateien mit.

## Prüfen, ob das Tracking läuft

Nach einer Stunde im Supabase-Dashboard unter **Edge Functions →
spotify-cron → Logs**, oder im **SQL Editor** mit
`select * from cron.job_run_details order by start_time desc limit 5;`.
Neu getrackte Plays siehst du in der App nach dem nächsten **Jetzt
synchronisieren** — mit ehrlichem „ca." bei der Hörzeit, bis ein Extended
Export die exakten Minuten liefert.

## Deine 30 Album-Reviews

1. In THE CRATE: **Import → JSON-Template** (oder CSV für Excel/Sheets).
2. Eine Zeile pro Album ausfüllen: Artist, Titel, Jahr, Genres, Bewertung,
   dein Review-Text, beste/schwächste Tracks. Pflicht sind nur Artist +
   Titel.
3. Import-Seite → Datei wählen → Vorschau prüfen → bestätigen.
   Dein Wortlaut wird wortgleich übernommen.

## Der laufende Betrieb

- Nichts zu warten. GitHub Actions deployed bei jedem Push neu.
- **Import → Export JSON** erstellt jederzeit ein komplettes Backup des
  Archivs.
- Browserdaten löschen löscht das *lokale* Archiv — mit angebundener Cloud
  holt „Jetzt synchronisieren" alles wieder zurück.

---

## Rebuild-Anleitung (nur falls das Backend neu aufgesetzt werden muss)

Alles Copy-Paste, kein eigener Code nötig. Ungefähr 20 Minuten.

1. **Projekt anlegen:** supabase.com → **New project**, Region **Frankfurt
   (eu-central-1)**, Datenbank-Passwort vergeben und im Passwort-Manager
   sichern.
2. **Schema einspielen:** **SQL Editor → New query** → kompletter Inhalt
   von `supabase/migrations/0001_init.sql` → **Run**. Gleich danach
   dasselbe mit `supabase/migrations/0002_live_tracking.sql`.
3. **Login anlegen:** **Authentication → Users → Add user → Create new
   user**, deine E-Mail + ein Passwort.
4. **Tür abschließen:** In den Authentication-Einstellungen **„Allow new
   users to sign up" deaktivieren**. Damit kann sich niemand außer dem
   eben angelegten Konto je einloggen.
5. **Edge Function:** **Edge Functions → Create function** → Name exakt
   `spotify-cron` → kompletter Inhalt von
   `supabase/functions/spotify-cron/index.ts` in den Editor kopieren →
   **Deploy**.
6. **Stündlichen Zeitplan anlegen:** **SQL Editor → New query** → diesen
   Block einfügen, die zwei Grossschreib-Platzhalter ersetzen, **Run**:

   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;

   select cron.schedule(
     'crate-spotify-sync',
     '23 * * * *',   -- stündlich, Minute 23
     $$
     select net.http_post(
       url := 'https://DEIN-PROJEKT.supabase.co/functions/v1/spotify-cron',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer DEIN-SERVICE-ROLE-KEY'
       )
     );
     $$
   );
   ```

   `DEIN-PROJEKT` ist derselbe Projekt-Teil wie in deiner Project URL, den
   **service_role**-Key findest du unter **Project Settings → API**. Das
   ist der einzige Ort, an dem dieser Schlüssel etwas verloren hat: ein
   Job in deiner eigenen Datenbank. Nicht ins Repo, nicht in die App.
7. **App verdrahten** wie oben unter „Was du noch tust — nur in der App"
   beschrieben.
