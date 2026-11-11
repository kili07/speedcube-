# Speedcube Timer

Stack, harte Regeln, Bau-Reihenfolge und Upload stehen im Skill `web-app` und gelten vorrangig. Entscheidungen und offene Punkte stehen in `DECISIONS.md`. Diese Datei hält nur fest, was an **dieser** App anders oder eigen ist.

Kurzname und Präfix: `cube` (`cube.v1`, `cube.theme`, `cube.view`, `cube.reload`, Cache `cube-v<n>`).

## Richtung
Schlichter Tracker für Speedcube-Zeiten, kein Wettkampf-Werkzeug (keine Inspektion, kein +2/DNF). Moment: Das Handy liegt flach auf dem Tisch, beide Hände am Würfel, Daumen oder Handballen starten und stoppen; zwischen den Solves ein kurzer Blick. Welt: Stackmat-Timer mit LCD, Timer-Matte, Wettkampf-Scorecard.

- **Farbe:** Standard dunkel. Grund Schiefer-Blaugrau wie eine Timer-Matte (`#151A1F`, Fläche `#1D242B`), kein Schwarz. Akzent Würfel-Gelb (`#F2C230` dunkel, Ocker `#7D6000` hell), nur für Aktionen, aktive Tabs und die Hauptlinie der Diagramme. Hell ist Scorecard-Papier (`#F3F1EA`). Halten/Bereit in Rot/Grün wie die Lämpchen am Stackmat, immer mit Wort („Halten …“, „Los“).
- **Schrift:** Archivo für Text (sachlich wie ein Formular), Chivo Mono für jede Zeit und Kennzahl (feste Ziffernbreite wie eine Stoppuhr, `--font-num`).
- **Form:** überall 4 px Radius (Geräteoptik), auch Knöpfe und Segmente (`--r-pill` ist 4 px). 1-px-Linien statt Schatten.
- **Dichte:** Timer luftig mit einer Riesenzahl; Zeitenliste dicht als Tabelle (Nr., Zeit, Ao5, Ao12, Uhr) wie eine Scorecard.
- **Merkmal:** Die Zeit sitzt in einem eingelassenen LCD-Feld, hinter ihr blasse 8er-Geistersegmente (`.lcd`, `ghostOf()`). Alles andere bleibt ruhig.

## Abweichungen von der Vorlage in tokens.css
- Schriften Archivo und Chivo Mono statt Inter und Space Grotesk; `--w-num` 500; neu `--fs-time` (Zeit im LCD).
- Radien alle 4 px, Sheet 8 px. `--tabs` 3.
- Alle Farben neu (siehe Richtung). Neu: `--lcd`, `--lcd-line`, `--lcd-ink`, `--lcd-ghost` (LCD-Feld), `--ln-2` (zweite, leise Diagrammlinie: Tagesbestzeit).
- `--st-low` / `--st-high` dienen beim Timer als Halten / Bereit.
- `--bar` neutral grau (Verteilung ist keine Hauptlinie).

## Eigene Bausteine
| Baustein | Wo |
|---|---|
| LCD-Feld mit Geisterschicht | `renderTimer()`, `paintTimer()`, `lcdHTML()` in app.js; `.lcd` in style.css |
| Timer-Zustandsautomat (idle → hold → ready → run) | `press()`, `release()`, `startRun()`, `stopRun()`, `abortRun()`, `wireTimer()` |
| Zeitentabelle nach Tagen | `renderZeiten()`; `.thead`, `.trow`, `.day-h`, `.pb-tag` |
| Kennwertreihe unter dem Timer | `.tstats` |
| Bestwerte-Liste | `bestCard()`; `.brows` |
| Punktwolke, zweite Linie, Tagespunkte, Lücken überbrücken | `Charts.line({ pts, alt, dots, join, sparse })`; `.pts`, `.ln-alt`, `.dot` |
| Legende über Diagrammen | `.legend` mit `i.lg-pt`, `i.lg-ln`, `i.lg-alt` |
| Rechenlogik ohne DOM | `core.js`: Scrambles, `fmt`/`parse`, `avgOf`, `rolling`, `bestAvg`, Tage, `bins`, `compare` |

Entfernt aus der Vorlage: Hero/Gauge, Metrik-Karte, Sparkline, `.meter`, Eingabe-Karte.

## Prüfen
- `node tests/core-test.js` (mit `CUBE_SEED=<n>` andere Testdaten)
- `python3 -m http.server 8123`, dann `node tools/headless.js` und `node tools/headless.js --dialoge`
- Screenshots aller Ansichten: `tools/shots.sh <ordner> [muster]`
