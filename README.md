# THE CRATE

Tylers privates Hip-Hop-Archiv. Teil Plattensammlung, Teil Review-Archiv,
Teil Hör-Statistik — gebaut um den Geschmack einer einzigen Person, nicht um
Klickzahlen. Dunkler, editorialer Vinyl-Look, und jede Zahl auf dem
Bildschirm kommt aus einer echten, importierten Datenzeile. Nichts wird
erfunden, um ein Chart zu füllen.

Live: `https://bronkostylez.github.io/the-crate/` (sobald deployed)

## Was heute geht (Etappe 1)

- **Das Archiv** — Album-Reviews mit Artwork, Bewertung (1–10), Review-Text,
  besten/schwächsten Tracks, Genres, Tags, Notizen. Raster- und Listenansicht,
  Volltextsuche, Genre- und Bewertungsfilter, sieben Sortierungen.
  Anlegen, bearbeiten, löschen.
- **Album-Suche mit Autofill** — beim Anlegen einmal das Album suchen und
  antippen: Artist, Titel, Jahr, Genre und Cover füllen sich von selbst,
  beste/schwächste Tracks wählst du aus der echten Trackliste des Albums.
  Deine Handarbeit bleibt: Bewertung, Review-Text, Picks. Quelle ist die
  iTunes/Apple-Music-API (ohne Zugangsdaten, grober Genre-Feed); ein
  Spotify-Provider kann später übernehmen, ohne die UI anzufassen.
- **Import** — JSON- oder CSV-Template, Validierung pro Zeile,
  Duplikat-Erkennung, Vorschau bevor irgendwas geschrieben wird, Strategie
  Überspringen-oder-Überschreiben. Bestehende Reviews werden wortgleich
  importiert.
- **Export / Backup** — das ganze Archiv als JSON oder CSV, ein Klick.
- **Überblick** — Archiv-Statistiken und Bewertungs-Verteilung, nur aus
  echten Reviews gerechnet. Ehrliche leere Zustände, wo noch keine Daten
  existieren.
- **Einstellungen** — Supabase-/Spotify-Zugangsdaten bequem in der App
  eintragen; nichts wird in den Build gebacken, kein Secret berührt das Repo.
- Läuft komplett offline — das Archiv liegt in IndexedDB, bis der
  Supabase-Sync in einer späteren Etappe kommt.

Als Nächstes: Hörverlauf-Import (Spotify Extended Streaming History),
Playlist-Analyse, die musikalische Identität („The DNA"), monatliche und
jährliche Recaps, PWA + Cloud-Sync.

## Lokal laufen lassen

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # Produktions-Build nach dist/ (schreibt auch 404.html)
npm run preview    # den Produktions-Build lokal ausliefern
```

Node 22 empfohlen. Keine `.env` nötig — die App läuft ohne jede
Zugangsdaten. Wer sie trotzdem in den Build geben will, kopiert
`.env.example` nach `.env`; dieselben drei Werte lassen sich nach dem Deploy
genauso gut in den App-Einstellungen eintragen.

## Deployment

Auf `main` pushen, dann im Repo: **Settings → Pages → Source: GitHub
Actions**. Der Workflow in `.github/workflows/deploy.yml` baut mit dem
Repo-Namen als Basispfad und veröffentlicht `dist`. Die komplette Anleitung
inklusive Supabase- und Spotify-Einrichtung: [docs/SETUP.md](docs/SETUP.md).

## Unter der Haube

React 19, TypeScript, Vite, Tailwind, Dexie/IndexedDB, Recharts, Lucide.
Supabase (Postgres + Auth + Row Level Security) bildet die Cloud-Seite; das
Schema mit allen Tabellen, Dedupe-Indexes und RLS-Policies liegt in
`supabase/migrations/0001_init.sql`. Architektur und Sicherheitsmodell:
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Das lokale Review-Schema spiegelt das SQL-Schema Feld für Feld — der spätere
Cloud-Sync ist damit eine Kopie, keine Migration.

## Grundregeln, die im Code stecken

- Keine erfundenen Statistiken, keine Platzhalter, die sich als echte Daten
  ausgeben.
- Der Original-Wortlaut von Reviews wird beim Import nie umgeschrieben.
- Kein Supabase-Service-Role-Key, kein Spotify-Client-Secret — stattdessen
  PKCE + RLS.
- Kein öffentliches Signup; ein privater Account, alles hinter RLS.
