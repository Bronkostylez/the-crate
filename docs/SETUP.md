# THE CRATE — Einrichtung

Du musst an keiner Stelle selbst Code oder SQL schreiben. Jeder Schritt hier
ist „Konto anlegen, Wert kopieren, irgendwo einfügen". Insgesamt ungefähr
20 Minuten.

## Was du an Konten brauchst

| Konto | Wo | Wofür | Kosten |
|---|---|---|---|
| GitHub | github.com | beherbergt Code + die Live-Seite | 0 € |
| Supabase | supabase.com | Datenbank + Login | Free-Plan |
| Spotify for Developers | developer.spotify.com | Hördaten (ab Etappe 2) | 0 € |

Die App läuft **sofort, komplett offline und ohne ein einziges Konto**: Das
Review-Archiv und die Importe liegen in der IndexedDB deines Browsers. Die
Konten bringen Cloud-Backup, Sync und Spotify-Daten dazu.

## 1 · Die Seite online stellen (GitHub Pages)

1. Das öffentliche Repo `the-crate` existiert bereits; der Code liegt auf
   `main`.
2. Im Repo: **Settings → Pages → Build and deployment → Source: „GitHub
   Actions"** wählen.
3. Ab jetzt baut und veröffentlicht jeder Push auf `main` die Seite neu unter
   `https://bronkostylez.github.io/the-crate/`. Der Workflow liegt in
   `.github/workflows/deploy.yml` — nichts zu konfigurieren, keine Secrets
   nötig.

## 2 · Supabase (Datenbank + Login)

1. supabase.com → **New project**. Region **Frankfurt (eu-central-1)**
   wählen. Ein Datenbank-Passwort vergeben und im Passwort-Manager sichern.
2. Wenn das Projekt fertig ist: **SQL Editor → New query** → die Datei
   `supabase/migrations/0001_init.sql` aus dem Repo öffnen, komplett
   kopieren, einfügen, **Run**. Das legt alle Tabellen, Indexes und
   Sicherheitsregeln an.
3. Gleich danach dasselbe mit `supabase/migrations/0002_live_tracking.sql`
   — das rüstet den Live-Tracker und den Cloud-Sync nach.
4. Dein Login anlegen: **Authentication → Users → Add user → Create new
   user**, deine E-Mail + ein Passwort.
5. **Die Tür abschließen:** In den Authentication-Einstellungen (Sign In /
   Providers bzw. Sign-Up-Einstellungen, je nach Dashboard-Version) **„Allow
   new users to sign up" deaktivieren**. Damit kann sich niemand außer dem
   eben angelegten Konto je einloggen.
6. Zwei Werte kopieren aus **Project Settings → API**:
   - **Project URL** (sieht aus wie `https://abcdefgh.supabase.co`)
   - **anon public**-Key (langes Token, beginnt mit `eyJ…`)
7. THE CRATE öffnen → **Einstellungen**, beide Werte einfügen, Speichern,
   dann unten bei **Cloud-Sync** mit deinem neuen Konto anmelden.

> Beide Werte sind *bewusst veröffentlichbar*. Deine Daten schützen dein
> Login und die Row Level Security, nicht das Verstecken dieser Schlüssel.
> Der **service_role**-Key auf derselben Seite ist der gefährliche — den
> nirgendwo einfügen.

## 3 · Spotify (ab Etappe 2 gebraucht)

1. developer.spotify.com → mit deinem Spotify-Konto einloggen → **Create
   app**.
2. Name egal („THE CRATE"), Beschreibung egal.
3. **Redirect URI:** `https://bronkostylez.github.io/the-crate/`
   (exakt so, inklusive Slash am Ende).
4. Die **Client ID** in THE CRATE → **Einstellungen** eintragen.
5. Das **Client Secret** bleibt unangetastet — der Login läuft über PKCE,
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


## 4 · 24/7-Tracking einschalten (Edge Function + Cron)

Damit kein Play verloren geht, holt eine kleine Server-Funktion stündlich
deine neuesten Spotify-Plays ab — auch wenn die App geschlossen ist. Drei
Schritte, alles Copy-Paste:

1. **Funktion anlegen:** Supabase-Dashboard → **Edge Functions** → **Create
   function** → Name exakt `spotify-cron` → den kompletten Inhalt von
   `supabase/functions/spotify-cron/index.ts` aus dem Repo in den Editor
   kopieren → **Deploy**.
2. **Stündlichen Zeitplan anlegen:** **SQL Editor → New query** → diesen
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
   **service_role**-Key findest du unter **Project Settings → API**. Das ist
   der einzige Ort, an dem dieser Schlüssel etwas verloren hat: ein Job in
   deiner eigenen Datenbank. Nicht ins Repo, nicht in die App.
3. **Einschalten:** In THE CRATE → **Einstellungen** einmal mit Spotify
   verbinden UND bei Cloud-Sync anmelden. Die App übergibt dein Spotify-
   Login dann an deine eigene `spotify_connection`-Tabelle (nur du kannst
   sie lesen) — ab dem nächsten Stundentakt läuft die Erfassung von allein.

**Prüfen, ob es läuft:** Nach einer Stunde im Dashboard unter **Edge
Functions → spotify-cron → Logs**, oder im **SQL Editor** mit
`select * from cron.job_run_details order by start_time desc limit 5;`.
Neu getrackte Plays siehst du in der App nach dem nächsten **Jetzt
synchronisieren** — mit ehrlichem „ca." bei der Hörzeit, bis ein Extended
Export die exakten Minuten liefert.

## 5 · Deine 30 Album-Reviews

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
