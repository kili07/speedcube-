# Entscheidungen und offene Punkte

## Entscheidungen
11.11.2026, beim ersten Bau:

- **Tracker statt Wettkampf-Timer.** Auf Kilians Wunsch: keine WCA-Inspektion, kein +2/DNF, keine Exoten-Puzzles. Schwerpunkt ist der grafische Verlauf der Zeiten.
- **Würfelarten 2×2, 3×3, 4×4**, gewählt über ein Segment, das in allen drei Ansichten oben steht und für alle gilt. So mischen sich die Zeiten nicht, ohne dass es Sitzungen zu verwalten gibt.
- **Random-Move-Scrambles** (2×2: 11 Züge aus R U F, 3×3: 20, 4×4: 40 mit Rw Uw Fw). Regeln: keine Fläche doppelt auf einer Achse, höchstens zwei Züge am Stück je Achse. Random-State bräuchte einen Löser und ist für Training nicht nötig.
- **Solves als kompakte Arrays** `[ms, ts, puzzle, scramble, note?]`, Zeitstempel ist die id (normalize macht ihn eindeutig). Ein Jahr mit ~3400 Solves sind ~300 KB, der Speicher ist mit allen Apps der Domain geteilt.
- **Zeiten werden abgeschnitten, nicht gerundet** (`Core.fmt`), wie bei jeder Stoppuhr. Gemessen wird mit `performance.now()` ab dem Loslassen; die Anzeige läuft per `requestAnimationFrame`, die gespeicherte Zeit hängt nicht davon ab.
- **Haltezeit 0,3 s als Standard** (wählbar: aus, 0,3 s, 0,55 s). Verhindert Fehlstarts beim Ablegen des Würfels.
- **Jede Berührung stoppt**, auch auf der unteren Leiste (die während des Solves ausgeblendet ist). Ein Listener in der Capture-Phase stoppt vor jeder anderen Aktion. Danach sperrt `T.lock`, bis alle Finger oben sind, damit der stoppende Druck nicht gleich den nächsten Haltevorgang beginnt.
- **Zurück-Geste während des Solves verwirft den Solve** mit Hinweis „Solve verworfen“. Eine Randwischgeste beim Greifen ist fast immer ein Versehen; eine falsche Zeit zu speichern wäre schlimmer.
- **Screen Wake Lock**, solange der Timer-Tab offen ist; beim Zurückkehren in die App neu angefordert.
- **Ao5/Ao12/Ao50/Ao100** streichen wie beim Wettkampf je 5 % (aufgerundet, mindestens eine Zeit) an beiden Enden.
- **Verlauf „Jeder Solve“:** Punkte = einzelne Solves, Linie = gleitendes Mittel. Ao12, ab 300 Solves im Zeitraum Ao50 (Ao12 wäre dort reines Zittern), unter 12 Ao5. Das Mittel rechnet mit Solves vor dem Zeitraum, damit die Linie sofort beginnt. Ausreißer über 1,2 × 95-%-Quantil fallen aus der Punktwolke und werden im Satz darunter gezählt.
- **Verlauf „Je Tag“** (bei „Alles“ über 120 Tage: je Woche): Tagesmittel als Linie, Tagesbestzeit als leise gestrichelte Linie in derselben Einheit, also eine Achse.
- **Verteilung:** Klassenbreite automatisch (0,1 s bis 5 min), Ausreißer unter 3 % und über 95 % in der ersten/letzten Klasse („ab … s“ beim Ablesen).
- **Einordnung:** Mittel gegen den gleich langen Zeitraum davor; bei „Alles“ die letzten 50 gegen die ersten 50 Solves. Unter 1 % Unterschied heißt „etwa gleich schnell“.
- **Manuelle Eingabe** über den Stift oben rechts (nur im Timer). Reine Ziffern wie am Stackmat („1234“ = 12,34), weil die Zifferntastatur keinen Doppelpunkt hat.

## Abweichungen vom Skill
1. **`core.js` mit 227 Zeilen**, unter der Schwelle von 300. Eigene Datei trotzdem, weil Scrambles, Mittelwerte und Tagesgrenzen in Node getestet werden müssen (`tests/core-test.js`) und `app.js` dort nicht ladbar ist.
2. **Zahlenfeld `type="text"` mit `inputmode="decimal"`** statt `type="number"`: Android verwirft dort das Komma. Inzwischen auch im Skill so korrigiert.
3. **„Je Tag“ verbindet die Linie über Tage ohne Training** (`join`), entgegen „null unterbricht die Linie“ in `diagramme.md`. Mit vielen Pausentagen zerfiel die Linie sonst in lauter Einzelpunkte. Jeder echte Tag hat einen Punkt (`dots`), Ablesen eines Pausentags sagt „kein Training“.
4. **Zusätzliche Prüfwerkzeuge in `tools/`:** `headless.js` (aus dem Gymtracker übernommen, Layout/Kontrast/Touch-Ziele und Timer-, Lösch-, Backup-, Install- und Zurück-Abläufe in Chrome headless), `shot.html` und `shots.sh` (Screenshots aller Ansichten und Sheets in 375 px, beide Themes, frisches Chrome-Profil je Bild). Gehen nicht mit hoch.
5. **Unbenutzte Vorlage-Bausteine entfernt** (Hero, Gauge, Metrik-Karte, Sparkline, Meter, Eingabe-Karte), siehe `CLAUDE.md`.
6. **Stift-Icon für „Zeit eintragen“** statt eines Plus: es wird eine Zeit getippt, kein Eintrag angelegt.

## Offen
Nur am Handy prüfbar:
- [ ] Installieren-Knopf erscheint, Chrome schickt das echte Ereignis
- [ ] Animationen laufen flüssig; mit „Bewegung reduzieren“ bewegt sich nichts
- [ ] Weichzeichner der unteren Leiste beim Scrollen
- [ ] Touch-Latenz: Start beim Loslassen und Stopp bei Berührung ohne spürbare Verzögerung, auch mit zwei Händen gleichzeitig
- [ ] Langes Drücken auf das Timer-Feld öffnet kein Kontextmenü, markiert keinen Text, vibriert nicht
- [ ] Wake Lock: Bildschirm bleibt im Timer an, geht in den anderen Tabs normal aus
- [ ] Laufende Zeit im LCD läuft flüssig (rAF), die gespeicherte Zeit stimmt mit einer Vergleichsuhr

Sonstiges:
- [ ] Nach ein paar Wochen echter Nutzung prüfen, ob Ao50 ab 300 Solves die richtige Schwelle ist
