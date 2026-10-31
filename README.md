# THE CRATE

Tylers privates Hip-Hop-Archiv. Teil Plattensammlung, Teil Review-Archiv,
Teil Hör-Statistik — gebaut um den Geschmack einer einzigen Person, nicht um
Klickzahlen. Der Look ist eine Cutout-Collage im Mixed-Media-Stil des
De-La-Soul-Videos „RUN IT BACK!!!": fotokopierter Nacht-Grund mit Xerox-Korn,
ausgeschnittene Cover mit Tesastreifen aufgeklebt, weiße Handschrift auf
Dunklem, rote Marker-Outlines und Blockbuchstaben, handgezeichnete Doodles —
aufgeräumt trotz Bastelei, auch auf dem Handy. Und jede Zahl auf dem Bildschirm kommt aus einer echten,
importierten Datenzeile. Nichts wird erfunden, um ein Chart zu füllen.

Live: `https://bronkostylez.github.io/the-crate/` (sobald deployed)

## Was heute geht (Etappen 1–5)

- **Das Archiv** — Album-Reviews mit Artwork, Bewertung (1–10), Review-Text,
  besten/schwächsten Tracks, Genres, Tags, Notizen. Raster- und Listenansicht,
  Volltextsuche, Genre- und Bewertungsfilter, sieben Sortierungen.
  Anlegen, bearbeiten, löschen.
- **Album-Suche mit Autofill** — beim Anlegen (oder nachträglich beim
  Bearbeiten) einmal das Album suchen und antippen: Artist, Titel, Jahr und
  Cover füllen sich von selbst, beste/schwächste Tracks wählst du aus der
  echten Trackliste des Albums — auch nachträglich für importierte Reviews;
  deine bisherigen Freitext-Picks werden dabei auf die echten Tracknamen
  gemappt (nur bei eindeutigem Treffer, sonst bleiben sie erhalten).
  Deine Handarbeit bleibt: Bewertung, Review-Text, Picks, Genres.
  Quellen in Kaskade: Spotify, sobald du deinen Account verbunden hast
  (Login über PKCE, kein Client-Secret nötig), dann die
  iTunes/Apple-Music-API, dazu immer MusicBrainz (die offene,
  Community-gepflegte Musik-Enzyklopädie — keylos und stark genau da, wo
  die kommerziellen Kataloge Lücken haben: 90er-Hip-Hop, Mixtapes).
  Füllwörter wie "the" und "and" stören den Abgleich nicht ("Low End
  Theory" findet "The Low End Theory"), und kanonische Alben von
  MusicBrainz sortieren sich über gleichnamigen Tribute- und Phonk-EPs
  ein — iTunes fehlen z. B. Yeezus und The Chronic komplett, bei anderen
  Alben begräbt es das Original unter Fremdkünstlern. Ein Hinweis unter
  dem Suchfeld sagt dir immer, welche Quelle geliefert hat. Bleibt ein
  Album unauffindbar, ist die Trackliste ehrlich Freitext.
- **Import** — JSON- oder CSV-Template, Validierung pro Zeile,
  Duplikat-Erkennung, Vorschau bevor irgendwas geschrieben wird, Strategie
  Überspringen-oder-Überschreiben. Bestehende Reviews werden wortgleich
  importiert.
- **Export / Backup** — das ganze Archiv als JSON oder CSV, ein Klick.
- **Die Playlist** — Import deiner Playlist aus Spotifys Kontodaten-Export
  (Playlist-JSON) oder als CSV (z. B. Exportify). Der Name kommt aus deiner
  Datei, ein optionaler Spotify-Link verweist auf das Original. Analysiert
  werden Artist- und Album-Verteilung, Jahrzehnte (sofern der Export
  Erscheinungsjahre liefert), Kollaborationen, mehrfach enthaltene Tracks,
  älteste/neueste Releases — plus durchsuchbare Track-Tabelle. Jeder Import
  ist ein Schnappschuss: neuere Importe zeigen, was dazukam oder verschwand.
  Schnappschüsse lassen sich umbenennen, exportieren (JSON/CSV) und löschen.
  Playlist-Platzierung wird strikt vom Hörverlauf getrennt.
- **The DNA** — deine musikalische Identität, gerechnet nur aus deinen
  echten Daten: Genre-Profil (aus deinen Reviews, mit Ø-Bewertung), Hörzeit
  pro Genre, Äras-Chart, Szenen aus deinen eigenen Genre-Tags (inkl.
  East-Coast-/West-Coast-Sicht), Entwicklung pro Monat und die ehrlichen
  Widersprüche: viel gehört aber nicht bewertet, hoch bewertet aber kaum
  gehört. "Fragen an deine DNA" beantwortet, was die Daten hergeben — Fragen
  nach Produzenten oder Rap-Stilen bleiben gesperrt, bis die
  Metadaten-Etappe sie seriös beantworten kann. Korrelation, keine
  Kausalität, Stichproben immer sichtbar.
- **Recaps** — monatliche und jährliche Auswertungen aus deinem echten
  Hörverlauf: Hörzeit, Plays, aktive Tage, Top Artists/Tracks/Alben/Genres,
  Entdeckungen (Artists mit ersten Plays im Zeitraum), Rekorde, Vergleich
  zur Vorperiode — plus "Die Crate sagt": Kommentare mit Humor, aber jede
  Zeile steht auf echten Zahlen. Jeder Recap exportierbar als PNG.
- **PWA** — installierbar (Manifest + Service Worker), die App-Shell läuft
  offline; deine Daten liegen ohnehin lokal in IndexedDB.
- **Hörverlauf** — zwei Wege, klar getrennt und beide gekennzeichnet:
  Der **Live-Sync** holt auf Knopfdruck (und automatisch beim Öffnen) deine
  letzten 50 Plays direkt von der Spotify-API — sofort da, sobald dein
  Account verbunden ist. Spotify liefert zu diesen Plays keine gehörten
  Millisekunden, wohl aber die Songlänge: Die App schätzt die Hörzeit daraus
  (Songlänge × Play) und markiert jeden solchen Wert ehrlich mit „ca.".
  Der **Extended-Import** (die JSON-Dateien aus Spotifys Datenexport,
  mehrere auf einmal) bleibt der Weg für die komplette Historie mit exakten
  Hörzeiten — und ersetzt dabei die Schätzungen in seinem Zeitraum: Läuft
  derselbe Song im selben Zeitfenster schon als Live-Sync-Play, wird dessen
  Schätzung durch den exakten Wert ersetzt, nie doppelt gezählt. Daraus gerechnet: Hörzeit, Plays, Artists,
  Tracks, Minuten pro Tag im Chart, Top-Artists und Top-Tracks nach
  Hörzeit, Suchfeld und chronologische Liste. Zeitraum wählbar: 7 Tage,
  30 Tage, 12 Monate, Gesamt. Jede Zahl kommt aus einer echten Zeile —
  und du siehst, aus welcher Quelle sie stammt.

- **Überblick** — Archiv-Statistiken und Bewertungs-Verteilung, nur aus
  echten Reviews gerechnet. Ehrliche leere Zustände, wo noch keine Daten
  existieren.
- **Einstellungen** — Supabase-/Spotify-Zugangsdaten bequem in der App
  eintragen; nichts wird in den Build gebacken, kein Secret berührt das Repo.
- Läuft komplett offline — das Archiv liegt in IndexedDB, bis der
  Supabase-Sync (Cloud-Backup + 24/7-Tracking) in einer späteren Etappe kommt.

Als Nächstes: Supabase-Cloud-Sync (Backup + Sync zwischen Geräten).

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
