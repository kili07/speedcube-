'use strict';
/* ═══════════════════════════════════════════════════════════════
   Speedcube Timer: Logik

   Aufbau:
   1. Konstanten, Helfer, Icons
   2. Daten: Grundstruktur, Laden, Speichern, Theme
   3. Navigation und Rendern
   4. Bewegung
   5. Ansichten: Timer, Zeiten, Verlauf
   6. Sheet und Dialoge
   7. Einstellungen, Backup
   8. Zurück-Taste
   9. Updates, Installieren
   10. Diagramme ablesen, Bausteine
   11. Verdrahten, Start

   Rechnen (Scrambles, Mittelwerte, Tage, Verteilung) steht in core.js.
   ═══════════════════════════════════════════════════════════════ */

/* ── 1. Konstanten, Helfer, Icons ───────────────────────────── */
const KEY = 'cube.v1';
/* Bei jeder Änderung hochzählen: wird in den Einstellungen angezeigt, damit
   sich auf dem Handy prüfen lässt, welche Fassung wirklich läuft. */
const APP_VERSION = '1.0.0';

const THEME_KEY = 'cube.theme';
/* `bar` ist die Hintergrundfarbe des Themes und landet im
   <meta name="theme-color">, damit die Systemleiste des Handys mitzieht.
   Muss mit --bg in tokens.css übereinstimmen (einzige erlaubte feste Farbe). */
const THEMES = {
  dark:  { label: 'Dunkel', bar: '#151A1F' },
  light: { label: 'Hell',   bar: '#F3F1EA' },
};

const HOLDS = [[0, 'Aus'], [300, '0,3 s'], [550, '0,55 s']];
const { S, PUZZLES, fmt } = Core;

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fin = (v) => typeof v === 'number' && isFinite(v);

/* Formatierung immer über Intl, nie von Hand mit toFixed und Komma-Ersatz.
   Ausnahme: Solve-Zeiten (Core.fmt), die sind ein Uhrformat, keine Zahl. */
const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nfa = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const dfLong = new Intl.DateTimeFormat('de-DE',
  { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
const dfDay = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'long' });
const dfShort = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'numeric' });
const dfShortY = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'numeric', year: '2-digit' });
const dfTime = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });

/** Zeitspanne in Sekunden für Sätze („1,8 s“), ohne Minutenform. */
const secs = (ms) => nfa.format(Math.round(Math.abs(ms) / 10) / 100) + ' s';

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

/* Icons: Lucide (ISC-Lizenz, licenses/lucide-ISC.txt), Pfade unverändert
   aus dem Paket lucide-static. Neue Symbole von dort holen, nie aus dem
   Gedächtnis schreiben. */
const lucide = (paths, cls) => `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICON = {
  chev:    lucide('<path d="m9 18 6-6-6-6"/>', 'chev'),
  info:    lucide('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
  refresh: lucide('<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>'),
  trash:   lucide('<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
  pencil:  lucide('<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>'),
};

/* ── 2. Daten ───────────────────────────────────────────────── */
/** Frische Grundstruktur. Basis beim Laden und beim Backup-Import, damit
    später ergänzte Felder in alten Daten nicht fehlen. */
const blank = () => ({
  v: 1,
  puzzle: '333',      // gewählte Würfelart, gilt für Timer, Zeiten und Verlauf
  solves: [],         // [ms, ts, puzzle, scramble, note?], zeitlich aufsteigend (Core.S)
  settings: {
    hold: 300,        // so lange halten (ms), bis der Timer „Los“ zeigt; 0 = sofort
  },
  theme: 'dark',
  lastBackup: null,   // ISO-Zeit des letzten Backup-Exports
});

let db = blank();

/** Fremden Datensatz (aus localStorage oder Backup) auf die aktuelle Struktur
    bringen. Object.assign allein reicht nicht: es ersetzt verschachtelte
    Objekte im Ganzen, ein älteres Unterobjekt ohne ein neues Feld würde die
    Vorgabe also löschen statt ergänzen. Daten haben Vorrang vor Vorgabe. */
function normalize(src) {
  const base = blank();
  const d = Object.assign(blank(), src || {});
  delete d.meta;                                   // Kopfdaten des Backups gehören nicht in die Daten

  // In ein frisches Objekt mischen: base.settings bleibt als Vorgabe unverändert
  d.settings = Object.assign({}, base.settings, d.settings && typeof d.settings === 'object' ? d.settings : {});
  if (!HOLDS.some(([v]) => v === d.settings.hold)) d.settings.hold = base.settings.hold;
  if (!PUZZLES[d.puzzle]) d.puzzle = base.puzzle;
  if (!THEMES[d.theme]) d.theme = base.theme;

  // Kaputte Einträge fallen weg statt die Statistik zu vergiften
  d.solves = (Array.isArray(d.solves) ? d.solves : [])
    .filter((s) => Array.isArray(s) && fin(s[S.ms]) && s[S.ms] > 0 && fin(s[S.ts]))
    .map((s) => {
      const o = [Math.round(s[S.ms]), Math.round(s[S.ts]), PUZZLES[s[S.puzzle]] ? s[S.puzzle] : '333',
        typeof s[S.scramble] === 'string' ? s[S.scramble] : ''];
      if (typeof s[S.note] === 'string' && s[S.note]) o.push(s[S.note]);
      return o;
    })
    .sort((a, b) => a[S.ts] - b[S.ts]);
  // Zeitstempel dienen als id der Zeile: doppelte um 1 ms verschieben
  for (let i = 1; i < d.solves.length; i++) {
    if (d.solves[i][S.ts] <= d.solves[i - 1][S.ts]) d.solves[i][S.ts] = d.solves[i - 1][S.ts] + 1;
  }
  return d;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    db = normalize(JSON.parse(raw));
  } catch (e) { console.warn('Laden fehlgeschlagen', e); }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { toast('Speichern fehlgeschlagen!'); console.error(e); }
}

/** Theme aufs Dokument legen. Der Spiegel in THEME_KEY ist das, was das
    Startskript in index.html liest; ohne ihn flackert der Start. */
function applyTheme(t) {
  if (!THEMES[t]) t = 'dark';
  db.theme = t;
  document.documentElement.dataset.theme = t;
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.content = THEMES[t].bar;
  try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* nicht schlimm */ }
}

/** Solves der gewählten Würfelart, zeitlich aufsteigend. */
const list = () => db.solves.filter((s) => s[S.puzzle] === db.puzzle);
const findSolve = (ts) => db.solves.find((s) => s[S.ts] === ts);

/** Neuen Solve anhängen. Zeitstempel eindeutig halten, er ist die id. */
function addSolve(ms, scr) {
  let ts = Date.now();
  const last = db.solves[db.solves.length - 1];
  if (last && ts <= last[S.ts]) ts = last[S.ts] + 1;
  const s = [ms, ts, db.puzzle, scr || ''];
  db.solves.push(s);
  save();
  return s;
}

/* ── 3. Navigation und Rendern ──────────────────────────────── */
const TITLES = { timer: 'Timer', zeiten: 'Zeiten', stats: 'Verlauf' };
let view = 'timer';

/* Zustand der Ansichten liegt nicht im Datensatz, sondern in sessionStorage:
   Lädt die App wegen eines Updates neu, landet man wieder dort, wo man war.
   Ein frischer Start beginnt beim Timer. */
const VIEW_KEY = 'cube.view';
let range = 30;                       // Zeitraum im Verlauf in Tagen, 0 = alles
let shown = 100;                      // so viele Zeilen zeigt die Zeitenliste

function saveViewState() {
  try { sessionStorage.setItem(VIEW_KEY, JSON.stringify({ view, range })); }
  catch (e) { /* privater Modus o.ä.: dann eben wieder der Timer */ }
}
function restoreViewState() {
  let s;
  try { s = JSON.parse(sessionStorage.getItem(VIEW_KEY) || 'null'); } catch (e) { s = null; }
  if (!s || !TITLES[s.view]) return 'timer';
  if ([7, 30, 90, 0].includes(s.range)) range = s.range;
  return s.view;
}

function nav(v) {
  view = v;
  $$('.view').forEach((s) => s.classList.toggle('hidden', s.id !== 'view-' + v));
  $$('.tabbar button[data-nav]').forEach((b) => b.classList.toggle('on', b.dataset.nav === v));
  $('#viewTitle').textContent = TITLES[v] || '';
  $('#btnNew').classList.toggle('hidden', v !== 'timer');
  window.scrollTo(0, 0);
  shown = 100;
  armBack();                    // Zurück soll zum Timer führen, nicht aus der App
  animNext = true;              // ein Wechsel durch den Benutzer darf animieren
  render();
  syncWakeLock();
}

/* Ablesefunktionen der Diagramme: Schlüssel mit 'v' gehören zur Ansicht
   (render() räumt sie ab), mit 's' zum Sheet. */
const readers = new Map();
let rid = 0;

/** Alles neu zeichnen. Bei den Datenmengen einer Handy-App ist gezieltes
    Aktualisieren unnötige Komplexität. Einzige Ausnahme ist die laufende
    Zeit im LCD-Feld (paintTimer), die 60-mal pro Sekunde wechselt. */
function render() {
  for (const k of readers.keys()) if (k[0] === 'v') readers.delete(k);
  const n = list().length;
  $('#topSub').textContent = `${PUZZLES[db.puzzle].label}, ${nf0.format(n)} ${n === 1 ? 'Solve' : 'Solves'}`;
  if (view === 'timer') renderTimer();
  else if (view === 'zeiten') renderZeiten();
  else if (view === 'stats') renderStats();
  if (animNext) { animNext = false; runAnims($('#view-' + view)); }
  saveViewState();
}

/* ── 4. Bewegung ────────────────────────────────────────────────
   Zahlen zählen hoch, Diagrammlinien blenden ein, in 600 ms mit ease-out
   (dieselbe Kurve wie --ease-out in tokens.css). Nur nach einem Wechsel
   durch den Benutzer. Im HTML steht immer der Endwert. Solve-Zeiten zählen
   nie hoch: zwei Nachkommastellen lassen sich nicht genau so wieder
   schreiben, und eine hochlaufende Zeit sähe aus wie ein laufender Timer. */
let animNext = true;
const ANIM_MS = 600;
const reduceMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/** Zahl, die beim ersten Zeichnen hochzählt. Im HTML steht der fertige Text.
    Nur für ganze Zahlen oder eine Nachkommastelle (dec), nie für Uhrzeiten. */
function countNum(v, dec) {
  const to = dec ? Math.round(v * 10) / 10 : Math.round(v);
  return `<span data-count="${to}"${dec ? ' data-dec="1"' : ''}>${esc((dec ? nf1 : nf0).format(to))}</span>`;
}

function runAnims(root) {
  if (!root || reduceMotion() || document.hidden) return;
  root.classList.add('anim');
  // Wieder abnehmen: Neuzeichnen durch die App soll die Linien nicht erneut einblenden
  setTimeout(() => root.classList.remove('anim'), ANIM_MS + 100);
  const items = $$('[data-count]', root).map((e) => ({ e, end: e.textContent, to: +e.dataset.count, dec: !!e.dataset.dec }));
  if (!items.length) return;
  const show = (it, v) => { it.e.textContent = (it.dec ? nf1 : nf0).format(v); };
  let done = false;
  const finish = () => { if (!done) { done = true; items.forEach((it) => { it.e.textContent = it.end; }); } };
  const t0 = performance.now();
  const step = (now) => {
    if (done) return;
    const p = Math.min(1, (now - t0) / ANIM_MS);
    if (p >= 1) { finish(); return; }
    const k = 1 - Math.pow(1 - p, 3);            // ease-out, wie --ease-out
    items.forEach((it) => show(it, it.to * k));
    requestAnimationFrame(step);
  };
  items.forEach((it) => show(it, 0));
  requestAnimationFrame(step);
  // Falls requestAnimationFrame nicht kommt (Tab im Hintergrund): Endwerte trotzdem setzen
  setTimeout(finish, ANIM_MS + 250);
}

/* ── 5. Ansichten ───────────────────────────────────────────── */
const puzzleSeg = () => seg('puzzle', Object.keys(PUZZLES).map((k) => [k, PUZZLES[k].label]), db.puzzle);

/* ── 5a. Timer ──────────────────────────────────────────────────
   Ablauf wie am Stackmat: Fläche halten → nach der Haltezeit „Los“ →
   loslassen startet → jede Berührung stoppt. Zustände:
   idle → hold → ready → run → idle. Nach dem Stoppen sperrt `lock`, bis
   alle Finger wieder oben sind, sonst begänne der stoppende Druck gleich
   den nächsten Haltevorgang. */
const T = { st: 'idle', t0: 0, holdTimer: 0, raf: 0, lock: false, scr: '', scrFor: '', fresh: null };
const pointers = new Set();

function curScramble() {
  if (T.scrFor !== db.puzzle) { T.scr = Core.scramble(db.puzzle); T.scrFor = db.puzzle; }
  return T.scr;
}
function newScramble() { T.scrFor = ''; curScramble(); }

/** Hinweis unter der Zeit, je Zustand. Farbe nie allein: immer ein Wort. */
function hintFor(st) {
  if (st === 'hold') return 'Halten …';
  if (st === 'ready') return 'Los';
  if (st === 'run') return '';
  if (T.fresh) return T.fresh;
  return db.settings.hold ? 'Halten, loslassen startet' : 'Antippen startet';
}

/** Ziffern im LCD als 8 setzen: das ist die blasse Geisterschicht dahinter.
    Chivo Mono hat feste Breite, beide Schichten decken sich also genau. */
const ghostOf = (t) => t.replace(/\d/g, '8');
/** Zeit fürs LCD als HTML: das Komma in eigenem Element, damit es schmaler
    gesetzt werden kann als eine Ziffer. */
const lcdHTML = (t) => esc(t).replace(',', '<i>,</i>');

function renderTimer() {
  const ls = list(), ms = ls.map((s) => s[S.ms]);
  const last = ls[ls.length - 1];
  const shownT = last ? fmt(last[S.ms]) : '0,00';
  const best = Core.bestOf(ms);
  const ao5 = Core.avgOf(ms, 5), ao12 = Core.avgOf(ms, 12);
  const today = Core.dayKey(Date.now());
  const nToday = ls.filter((s) => Core.dayKey(s[S.ts]) === today).length;
  const scr = curScramble();
  $('#view-timer').innerHTML = `
    <div class="hide-run">${puzzleSeg()}</div>
    <div class="scr hide-run">
      <p class="scr-t p${esc(db.puzzle)}">${esc(scr)}</p>
      <button class="icon-btn" data-action="newScr" aria-label="Neuer Scramble">${ICON.refresh}</button>
    </div>
    <div class="pad" id="pad">
      <div class="lcd st-${T.st}" id="lcd">
        <span class="lcd-ghost" id="lcdG" aria-hidden="true">${lcdHTML(ghostOf(shownT))}</span>
        <span class="lcd-t num" id="lcdT">${lcdHTML(shownT)}</span>
      </div>
      <div class="pad-hint${T.fresh ? ' pb' : ''}" id="padHint" aria-live="polite">${esc(hintFor(T.st))}</div>
      <div class="tstats hide-run">
        <div><span class="lbl">Ao5</span><span class="num">${esc(fmt(ao5))}</span></div>
        <div><span class="lbl">Ao12</span><span class="num">${esc(fmt(ao12))}</span></div>
        <div><span class="lbl">Bestzeit</span><span class="num">${esc(best ? fmt(best.v) : '–')}</span></div>
        <div><span class="lbl">Heute</span><span class="num">${nf0.format(nToday)}</span></div>
      </div>
      ${last ? `<div class="last-act hide-run">
        <button class="btn btn-sm" data-action="noteLast">${ICON.pencil}${last[S.note] ? 'Notiz ändern' : 'Notiz'}</button>
        <button class="btn btn-sm" data-action="delLast">${ICON.trash}Letzte löschen</button>
      </div>` : ''}
    </div>`;
}

/** Nur LCD und Hinweis auffrischen: während des Haltens und Laufens wäre
    ein komplettes render() zu teuer und würde den Druck auf #pad zerreißen. */
function paintTimer(text) {
  const lcd = $('#lcd'); if (!lcd) return;
  lcd.className = 'lcd st-' + T.st;
  if (text != null) { $('#lcdT').innerHTML = lcdHTML(text); $('#lcdG').innerHTML = lcdHTML(ghostOf(text)); }
  const h = $('#padHint'); h.textContent = hintFor(T.st); h.classList.toggle('pb', !!T.fresh && T.st === 'idle');
}

function press() {
  if (T.lock || T.st !== 'idle' || !$('#sheet').classList.contains('hidden')) return;
  T.fresh = null;
  T.st = 'hold';
  if (!db.settings.hold) T.st = 'ready';
  else T.holdTimer = setTimeout(() => { if (T.st === 'hold') { T.st = 'ready'; paintTimer(); } }, db.settings.hold);
  paintTimer(db.settings.hold ? null : '0,00');
  if (T.st === 'ready') paintTimer('0,00');
}

function release() {
  if (T.st === 'ready') startRun();
  else if (T.st === 'hold') { clearTimeout(T.holdTimer); T.st = 'idle'; paintTimer(); }
}

function startRun() {
  T.st = 'run';
  T.t0 = performance.now();
  document.body.classList.add('running');
  paintTimer('0,00');
  const tick = () => {
    if (T.st !== 'run') return;
    paintTimer(fmt(performance.now() - T.t0));
    T.raf = requestAnimationFrame(tick);
  };
  T.raf = requestAnimationFrame(tick);
}

function stopRun() {
  const ms = Math.round(performance.now() - T.t0);
  cancelAnimationFrame(T.raf);
  T.st = 'idle';
  T.lock = true;
  document.body.classList.remove('running');
  const before = Core.bestOf(list().map((s) => s[S.ms]));
  addSolve(ms, curScramble());
  T.fresh = before && ms < before.v ? `Neue Bestzeit, ${secs(before.v - ms)} schneller` : null;
  newScramble();
  render();
}

/** Laufenden Solve verwerfen (Zurück-Geste, App wandert weg). */
function abortRun(msg) {
  clearTimeout(T.holdTimer);
  cancelAnimationFrame(T.raf);
  const was = T.st;
  T.st = 'idle';
  document.body.classList.remove('running');
  if (view === 'timer') render();
  if (was === 'run' && msg) toast(msg);
  return was !== 'idle';
}

function wireTimer() {
  // Halten und Loslassen auf der Fläche; Knöpfe darin bleiben Knöpfe
  document.addEventListener('pointerdown', (e) => {
    if (T.st === 'run') {           // jede Berührung irgendwo stoppt
      e.preventDefault(); e.stopPropagation();
      pointers.add(e.pointerId);
      stopRun();
      return;
    }
    if (view !== 'timer' || !e.target.closest('#pad') || e.target.closest('button')) return;
    e.preventDefault();
    pointers.add(e.pointerId);
    if (pointers.size === 1) press();
  }, true);
  const up = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size) return;      // erst wenn alle Finger oben sind
    if (T.lock) { T.lock = false; return; }
    if (e.type === 'pointercancel') { if (T.st !== 'run') abortRun(); return; }
    release();
  };
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', up, true);
  // Langes Drücken soll kein Kontextmenü und keine Textauswahl öffnen
  document.addEventListener('contextmenu', (e) => { if (e.target.closest('#pad')) e.preventDefault(); });

  // Tastatur: Leertaste wie die Fläche, beim Laufen stoppt jede Taste
  const typing = () => document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  document.addEventListener('keydown', (e) => {
    // Gehaltene Leertaste nach dem Stoppen kommt als e.repeat und startet nichts
    if (T.st === 'run') { e.preventDefault(); stopRun(); T.lock = false; return; }
    if (e.code !== 'Space' || e.repeat || typing() || view !== 'timer') return;
    e.preventDefault();
    press();
  });
  document.addEventListener('keyup', (e) => {
    if (e.code !== 'Space' || typing()) return;
    if (view === 'timer') { e.preventDefault(); release(); }
  });
  document.addEventListener('visibilitychange', syncWakeLock);
}

/* Bildschirm anlassen, solange der Timer offen ist: das Handy liegt beim
   Lösen unberührt auf dem Tisch. Der Browser gibt die Sperre beim Wechsel
   in den Hintergrund selbst frei, deshalb bei Rückkehr neu anfordern. */
let wakeLock = null;
async function syncWakeLock() {
  const want = view === 'timer' && !document.hidden;
  try {
    if (want && !wakeLock && navigator.wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!want && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { wakeLock = null; /* nicht erlaubt oder nicht da: dann eben ohne */ }
}

function enterTime() {
  askText('Zeit eintragen', 'Zeit, z. B. 12,34 oder 1:02,34 (Ziffern reichen: 1234 = 12,34)',
    { numeric: true, placeholder: '12,34', okLabel: 'Eintragen' }, (v) => {
      const ms = Core.parse(v);
      if (!ms) { toast('Die Zeit lässt sich nicht lesen'); return; }
      addSolve(ms, curScramble());
      newScramble();
      T.fresh = null;
      closeSheet(); render(); toast(`${fmt(ms)} eingetragen`);
    });
}

function deleteLast() {
  const ls = list(), last = ls[ls.length - 1];
  if (!last) return;
  askSheet('Letzte Zeit löschen?', `${fmt(last[S.ms])} von ${dfTime.format(new Date(last[S.ts]))} Uhr. Das lässt sich nicht rückgängig machen.`,
    'Löschen', () => {
      db.solves = db.solves.filter((s) => s !== last);
      T.fresh = null;
      save(); closeSheet(); render(); toast('Gelöscht');
    }, null, true);
}

function noteFor(s, back) {
  askText('Notiz', `Notiz zu ${fmt(s[S.ms])}`, { value: s[S.note] || '', placeholder: 'z. B. Pop, neuer Würfel', okLabel: 'Sichern' }, (v) => {
    v = String(v).trim().slice(0, 200);
    if (v) s[S.note] = v; else s.length = 4;
    save(); closeSheet(); render(); toast(v ? 'Notiz gesichert' : 'Notiz entfernt');
  }, back);
}

/* ── 5b. Zeiten ─────────────────────────────────────────────── */
function emptyState() {
  return `<div class="empty"><h2>Noch keine Zeiten für ${esc(PUZZLES[db.puzzle].label)}</h2>
    <p>Stoppe den ersten Solve im Timer oder trage eine Zeit von Hand ein.</p>
    <button class="btn btn-primary" data-nav="timer">Zum Timer</button></div>`;
}

function renderZeiten() {
  const ls = list(), ms = ls.map((s) => s[S.ms]);
  if (!ls.length) { $('#view-zeiten').innerHTML = puzzleSeg() + emptyState(); return; }
  const ao5 = Core.rolling(ms, 5), ao12 = Core.rolling(ms, 12);
  const best = Core.bestOf(ms);
  const days = Core.perDay(ls);
  let html = '', day = '';
  const from = Math.max(0, ls.length - shown);
  for (let i = ls.length - 1; i >= from; i--) {
    const s = ls[i], k = Core.dayKey(s[S.ts]);
    if (k !== day) {
      if (day) html += '</div>';
      day = k;
      const e = days.get(k);
      html += `<div class="day-h"><span class="grow">${esc(dfDay.format(new Date(s[S.ts])))}</span>`
        + `<span class="muted">${nf0.format(e.n)}× Mittel <span class="num">${esc(fmt(e.mean))}</span></span></div><div class="trows">`;
    }
    html += `<button class="trow" data-ts="${s[S.ts]}">
      <span class="c-n">${nf0.format(i + 1)}</span>
      <span class="c-t num">${esc(fmt(s[S.ms]))}${best && best.at === i ? '<em class="pb-tag">PB</em>' : ''}</span>
      <span class="c-a num">${esc(fmt(ao5[i]))}</span>
      <span class="c-a num">${esc(fmt(ao12[i]))}</span>
      <span class="c-h">${esc(dfTime.format(new Date(s[S.ts])))}</span>
      ${s[S.note] ? `<span class="c-note">${esc(s[S.note])}</span>` : ''}
    </button>`;
  }
  html += '</div>';
  $('#view-zeiten').innerHTML = puzzleSeg()
    + `<div class="thead" aria-hidden="true"><span class="c-n">Nr.</span><span class="c-t">Zeit</span><span class="c-a">Ao5</span><span class="c-a">Ao12</span><span class="c-h">Uhr</span></div>`
    + html
    + (from > 0 ? `<button class="btn btn-block more" data-action="more">Ältere Zeiten zeigen (${nf0.format(from)} weitere)</button>` : '');
}

function openSolve(ts) {
  const s = findSolve(ts);
  if (!s) return;
  const ls = db.solves.filter((x) => x[S.puzzle] === s[S.puzzle]);
  const i = ls.indexOf(s), ms = ls.slice(0, i + 1).map((x) => x[S.ms]);
  openSheet(`Solve ${nf0.format(i + 1)}`, `
    <div class="solve-big num">${lcdHTML(fmt(s[S.ms]))}</div>
    <p class="note solve-when">${esc(dfLong.format(new Date(s[S.ts])))}, ${esc(dfTime.format(new Date(s[S.ts])))} Uhr, ${esc(PUZZLES[s[S.puzzle]].label)}</p>
    <div class="tstats in-sheet">
      <div><span class="lbl">Ao5 bis hier</span><span class="num">${esc(fmt(Core.avgOf(ms, 5)))}</span></div>
      <div><span class="lbl">Ao12 bis hier</span><span class="num">${esc(fmt(Core.avgOf(ms, 12)))}</span></div>
    </div>
    <div class="lbl">Scramble</div>
    <p class="scr-t p${esc(s[S.puzzle])} in-sheet">${esc(s[S.scramble] || 'nicht bekannt (von Hand eingetragen)')}</p>
    <label>Notiz<input id="f_note" autocomplete="off" maxlength="200" placeholder="z. B. Pop, neuer Würfel" value="${esc(s[S.note] || '')}"></label>
    <button class="btn btn-danger btn-block" id="f_del">${ICON.trash}Solve löschen</button>
  `, () => {
    const v = $('#f_note').value.trim();
    if (v) s[S.note] = v; else s.length = 4;
    save(); closeSheet(); render(); toast('Gesichert');
  });
  $('#f_del').onclick = () => askSheet('Solve löschen?', `${fmt(s[S.ms])} vom ${dfLong.format(new Date(s[S.ts]))}. Das lässt sich nicht rückgängig machen.`, 'Löschen', () => {
    db.solves = db.solves.filter((x) => x !== s);
    save(); closeSheet(); render(); toast('Gelöscht');
  }, () => openSolve(ts), true);
}

/* ── 5c. Verlauf ────────────────────────────────────────────── */
const RANGES = [[7, '7 Tage'], [30, '30 Tage'], [90, '90 Tage'], [0, 'Alles']];

/** Satz zur Einordnung zweier Mittel; weniger ist besser. */
function compareText(cur, prev, what) {
  const c = Core.compare(cur, prev);
  if (!c) return null;
  if (c.dir === 0) return `Im Mittel etwa gleich schnell wie ${what}.`;
  return `Im Mittel <b>${esc(secs(c.d))} ${c.dir > 0 ? 'schneller' : 'langsamer'}</b> als ${what}.`;
}

/** Fünf Datumsmarken über die x-Achse, statt jede Zeile zu beschriften. */
function sparseLabels(tsList) {
  const n = tsList.length, out = new Array(n).fill('');
  if (!n) return out;
  const span = tsList[n - 1] - tsList[0];
  // Alles an einem Tag: Uhrzeit; über fast ein Jahr: mit Jahr, sonst stünde
  // links und rechts dasselbe Datum
  const f = Core.dayKey(tsList[0]) === Core.dayKey(tsList[n - 1]) ? dfTime
    : span > 300 * 86400000 ? dfShortY : dfShort;
  const picks = n < 5 ? [...Array(n).keys()] : [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1];
  let prev = '';
  picks.forEach((i) => { const l = f.format(new Date(tsList[i])); if (l !== prev) out[i] = l; prev = l; });
  return out;
}

const fmtSec = (v) => nf0.format(v);
const q = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];

function renderStats() {
  const all = list();
  const el = $('#view-stats');
  if (!all.length) { el.innerHTML = puzzleSeg() + emptyState(); return; }
  const now = Date.now();
  const from = range ? Core.dayStart(now, range - 1) : all[0][S.ts];
  const i0 = all.findIndex((s) => s[S.ts] >= from);
  const inR = i0 < 0 ? [] : all.slice(i0);
  const msAll = all.map((s) => s[S.ms]);
  const ms = inR.map((s) => s[S.ms]);
  const bestR = Core.bestOf(ms), meanR = Core.mean(ms);

  let html = puzzleSeg() + seg('range', RANGES, range);
  html += `<div class="card"><div class="stats">
      <div><span class="lbl">Bestzeit</span><span class="num">${esc(bestR ? fmt(bestR.v) : '–')}</span></div>
      <div><span class="lbl">Mittel</span><span class="num">${esc(fmt(meanR))}</span></div>
      <div><span class="lbl">Solves</span><span class="num">${countNum(ms.length)}</span></div>
    </div></div>`;

  if (ms.length < 2) {
    html += `<div class="empty"><p>${ms.length ? 'Ein Solve' : 'Keine Solves'} in diesem Zeitraum. Wähle einen längeren Zeitraum oder stoppe ein paar Zeiten.</p></div>`;
    el.innerHTML = html + bestCard(all);
    return;
  }

  /* Jeder Solve als Punkt, das gleitende Mittel als Linie. Das Mittel rechnet
     mit den Solves vor dem Zeitraum, damit die Linie nicht erst nach zwölf
     Solves beginnt. Bei sehr vielen Punkten glättet Ao50, Ao12 wäre dort
     reines Zittern. */
  const win = inR.length >= 300 ? 50 : inR.length >= 12 ? 12 : 5;
  const roll = Core.rolling(msAll, win).slice(i0);
  const sorted = ms.slice().sort((a, b) => a - b);
  // Ausreißer (Pop, vergessenes Stoppen) würden die Achse sprengen: über der
  // Kappe fallen sie aus der Punktwolke, gezählt werden sie im Satz darunter
  const cap = q(sorted, 0.95) * 1.2;
  const pts = ms.map((v) => (v <= cap ? v / 1000 : null));
  const over = ms.filter((v) => v > cap).length;
  const rollS = roll.map((v) => (v == null ? null : v / 1000));
  const svg1 = Charts.line({ vals: rollS, pts, labels: sparseLabels(inR.map((s) => s[S.ts])), sparse: true, fmtY: fmtSec, h: 200 });
  const read1 = (i) => `<b>${esc(fmt(ms[i]))}</b> Ao${win} ${esc(fmt(roll[i]))}<span class="grow"></span>${esc(dfShort.format(new Date(inR[i][S.ts])))} ${esc(dfTime.format(new Date(inR[i][S.ts])))}`;

  let t1;
  if (range) {
    const prev = all.filter((s) => s[S.ts] >= Core.dayStart(from, range) && s[S.ts] < from).map((s) => s[S.ms]);
    t1 = prev.length >= 3 ? compareText(meanR, Core.mean(prev), `in den ${range} Tagen davor`)
      : `Für die ${range} Tage davor gibt es zu wenige Zeiten zum Vergleich.`;
  } else {
    const k = Math.min(50, Math.floor(ms.length / 2));
    t1 = k >= 5 ? compareText(Core.mean(ms.slice(-k)), Core.mean(ms.slice(0, k)), `deine ersten ${k} Solves`).replace('Im Mittel', `Die letzten ${k} Solves sind im Mittel`) : null;
  }
  if (over) t1 = (t1 ? t1 + ' ' : '') + `${nf0.format(over)} Ausreißer über ${esc(secs(cap))} nicht im Bild.`;

  html += `<div class="sec-h">Jeder Solve <span class="legend"><i class="lg-pt"></i>Zeit <i class="lg-ln"></i>Ao${win}</span></div>
    <div class="card">${chartBox(svg1, (i) => (fin(ms[i]) ? read1(i) : null), '<span>Antippen zum Ablesen</span>')}
    ${t1 ? `<p class="tr-text">${t1}</p>` : ''}</div>`;

  /* Je Tag (bei „Alles“ über vier Monate je Woche): Mittel als Linie,
     Bestzeit als leise zweite Linie. Tage ohne Training bleiben Lücken. */
  const days = Core.dayRange(from, now);
  const weekly = days.length > 120;
  const groups = new Map();
  for (const s of inR) {
    const k = weekly ? Core.weekKey(s[S.ts]) : Core.dayKey(s[S.ts]);
    let g = groups.get(k);
    if (!g) { g = { n: 0, sum: 0, best: Infinity }; groups.set(k, g); }
    g.n++; g.sum += s[S.ms]; g.best = Math.min(g.best, s[S.ms]);
  }
  const slots = weekly ? days.filter((d, i) => i === 0 || new Date(d.start).getDay() === 1).map((d) => ({ key: Core.weekKey(d.start), start: d.start }))
    : days;
  const gv = slots.map((d) => groups.get(d.key) || null);
  const meanS = gv.map((g) => (g ? g.sum / g.n / 1000 : null));
  const bestS = gv.map((g) => (g ? g.best / 1000 : null));
  const active = gv.filter(Boolean).length;
  const svg2 = active < 2
    ? `<div class="chart-empty">Der ${weekly ? 'Wochen' : 'Tages'}verlauf erscheint ab dem zweiten Trainings${weekly ? 'woche' : 'tag'}.</div>`
    : Charts.line({ vals: meanS, alt: bestS, dots: true, join: true, labels: sparseLabels(slots.map((d) => d.start)), sparse: true, fmtY: fmtSec, h: 170 });
  const read2 = (i) => {
    const g = gv[i], when = (weekly ? 'Woche ab ' : '') + dfShort.format(new Date(slots[i].start));
    return g ? `<b>${esc(fmt(g.sum / g.n))}</b> Mittel, Bestzeit ${esc(fmt(g.best))}, ${nf0.format(g.n)}×<span class="grow"></span>${esc(when)}`
      : `<span>${esc(when)}: ${weekly ? 'kein Training in der Woche' : 'kein Training'}</span>`;
  };
  const t2 = weekly
    ? `In ${nf0.format(active)} von ${nf0.format(slots.length)} Wochen geübt.`
    : `An ${nf0.format(active)} von ${nf0.format(slots.length)} Tagen geübt, im Schnitt ${nf0.format(Math.round(ms.length / Math.max(1, active)))} Solves pro Trainingstag.`;
  html += `<div class="sec-h">${weekly ? 'Je Woche' : 'Je Tag'} <span class="legend"><i class="lg-ln"></i>Mittel <i class="lg-alt"></i>Bestzeit</span></div>
    <div class="card">${chartBox(svg2, read2, '<span>Antippen zum Ablesen</span>')}<p class="tr-text">${t2}</p></div>`;

  /* Verteilung: wie oft welche Zeit. Zeigt, ob man konstant ist. */
  const b = Core.bins(ms, 14);
  if (b) {
    const lab = (v) => (b.w < 1000 ? nf1.format(v / 1000) : nf0.format(v / 1000));
    const svg3 = Charts.bars(b.bins.map((x) => ({ label: lab(x.from), v: x.n })), { fmtY: (v) => nf0.format(v), h: 150 });
    const read3 = (i) => {
      const x = b.bins[i];
      const span = x.openHi ? `ab ${lab(x.from)} s` : x.openLo ? `unter ${lab(x.to)} s` : `${lab(x.from)} bis ${lab(x.to)} s`;
      return `<b>${nf0.format(x.n)}×</b> ${esc(span)}`;
    };
    const t3 = `Die Hälfte deiner Solves liegt zwischen <b>${esc(fmt(q(sorted, 0.25)))}</b> und <b>${esc(fmt(q(sorted, 0.75)))}</b>.`;
    html += `<div class="sec-h">Verteilung</div>
      <div class="card">${chartBox(svg3, read3, '<span>Antippen zum Ablesen</span>')}<p class="tr-text">${t3}</p></div>`;
  }
  el.innerHTML = html + bestCard(all);
}

/** Bestwerte über alle Zeiten der Würfelart. */
function bestCard(all) {
  const ms = all.map((s) => s[S.ms]);
  const rows = [['Single', Core.bestOf(ms), 1], ['Ao5', Core.bestAvg(ms, 5), 5], ['Ao12', Core.bestAvg(ms, 12), 12],
    ['Ao50', Core.bestAvg(ms, 50), 50], ['Ao100', Core.bestAvg(ms, 100), 100]]
    .filter(([, b]) => b)
    .map(([name, b]) => `<div class="brow"><span class="grow">${name}</span><span class="num">${esc(fmt(b.v))}</span>`
      + `<span class="muted b-when">${esc(dfShort.format(new Date(all[b.at][S.ts])))}</span></div>`).join('');
  return rows ? `<div class="sec-h">Bestwerte, alle Zeiten</div><div class="rows brows">${rows}</div>` : '';
}

/* ── 6. Sheet und Dialoge ───────────────────────────────────── */
let sheetSaveFn = null;

function openSheet(title, html, saveFn, saveLabel) {
  armBack();                              // Zurück soll das Sheet schließen, nicht die App
  $('#sheetTitle').textContent = title;
  $('#sheetBody').innerHTML = html;
  $('#sheetBody').onclick = null;         // Handler des vorherigen Sheets verwerfen
  $('#sheetCancel').onclick = closeSheet; // ggf. überschriebenes Abbrechen zurücksetzen
  sheetSaveFn = saveFn || null;
  const btn = $('#sheetSave');
  btn.classList.toggle('hidden', !saveFn);
  btn.textContent = saveLabel || 'Sichern';
  $('#sheet').classList.remove('hidden');
  $('#scrim').classList.remove('hidden');
  $('#sheetBody').scrollTop = 0;
}

function closeSheet() {
  $('#sheet').classList.add('hidden');
  $('#scrim').classList.add('hidden');
  sheetSaveFn = null;
  for (const k of readers.keys()) if (k[0] === 's') readers.delete(k);
}

/* Ersatz für confirm() / prompt() / alert(): installierte Web-Apps
   unterdrücken die nativen Dialoge je nach Gerät kommentarlos (Regel 1).
   `back` führt zurück zum vorherigen Sheet statt alles zuzuklappen. */
function askSheet(title, text, okLabel, onOk, back, danger) {
  openSheet(title, `
    <p class="dlg-t">${esc(text)}</p>
    <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-block" id="dlgOk">${esc(okLabel)}</button>
    <button class="btn btn-block" id="dlgNo">Abbrechen</button>
  `, null);
  const zurueck = () => (back ? back() : closeSheet());
  $('#dlgOk').onclick = onOk;
  $('#dlgNo').onclick = zurueck;
  $('#sheetCancel').onclick = zurueck;
}

function infoSheet(title, text, back) {
  openSheet(title, `
    <p class="dlg-t">${esc(text)}</p>
    <button class="btn btn-primary btn-block" id="dlgOk">Verstanden</button>
  `, null);
  const zurueck = () => (back ? back() : closeSheet());
  $('#dlgOk').onclick = zurueck;
  $('#sheetCancel').onclick = zurueck;
}

/** Einzeiliger Texteingabe-Dialog. `opts`: {value, placeholder, numeric, okLabel}
    numeric: type="text" mit Zifferntastatur statt type="number", weil Android
    dort das deutsche Komma verwirft (DECISIONS.md). */
function askText(title, label, opts, onOk, back) {
  opts = opts || {};
  openSheet(title, `
    <label>${esc(label)}<input id="dlg_in"
      ${opts.numeric ? 'type="text" inputmode="decimal" autocomplete="off"' : 'autocomplete="off"'}
      placeholder="${esc(opts.placeholder || '')}"
      value="${esc(opts.value == null ? '' : opts.value)}"></label>
  `, () => onOk($('#dlg_in').value), opts.okLabel || 'Übernehmen');
  if (back) $('#sheetCancel').onclick = back;
  const inp = $('#dlg_in');
  inp.focus(); inp.select && inp.select();
  inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); sheetSaveFn && sheetSaveFn(); } };
}

/* ── 7. Einstellungen, Backup ───────────────────────────────── */
function openSettings() {
  const last = db.lastBackup ? dfLong.format(new Date(db.lastBackup)) : 'noch nie';
  const n = list().length;
  openSheet('Einstellungen', `
    <div class="lbl">Darstellung</div>
    ${seg('theme', Object.keys(THEMES).map((k) => [k, THEMES[k].label]), db.theme)}
    <div class="lbl">Haltezeit vor dem Start</div>
    ${seg('hold', HOLDS, db.settings.hold)}
    <p class="note set-note">Mit Haltezeit startet der Timer erst, wenn das Feld „Los“ zeigt. Das verhindert Fehlstarts beim Ablegen des Würfels.</p>
    <div class="lbl">Backup</div>
    <p class="dlg-t">Deine Zeiten liegen nur auf diesem Gerät. „Browserdaten löschen“ entfernt sie ohne Vorwarnung, deshalb regelmäßig ein Backup sichern. Letztes Backup: ${esc(last)}.</p>
    <button class="btn btn-block" id="btnExport">Backup speichern</button>
    <button class="btn btn-block" id="btnImport">Backup laden</button>
    <input type="file" id="fileImport" accept="application/json,.json" class="hidden">
    <div class="lbl set-gap">Zeiten</div>
    <button class="btn btn-block btn-danger-line" id="btnClear"${n ? '' : ' disabled'}>Alle ${esc(PUZZLES[db.puzzle].label)}-Zeiten löschen</button>
    <div class="lbl set-gap">App</div>
    <button class="btn btn-block hidden" id="btnInstall">App installieren</button>
    <button class="btn btn-block" id="btnUpdate">Nach Update suchen</button>
    <p class="note">Version ${esc(APP_VERSION)}</p>
  `, null);
  $('#sheetBody').onclick = (e) => {
    const s = e.target.closest('[data-seg]');
    if (!s) return;
    if (s.dataset.seg === 'theme') applyTheme(s.dataset.v);
    if (s.dataset.seg === 'hold') db.settings.hold = +s.dataset.v;
    save(); openSettings(); render();
  };
  $('#btnExport').onclick = exportBackup;
  $('#btnImport').onclick = () => $('#fileImport').click();
  $('#fileImport').onchange = (e) => importBackup(e.target.files[0]);
  $('#btnClear').onclick = clearPuzzle;
  $('#btnInstall').onclick = installApp;
  $('#btnUpdate').onclick = checkUpdate;
  syncInstall();
}

function clearPuzzle() {
  const n = list().length, lab = PUZZLES[db.puzzle].label;
  askSheet(`Alle ${lab}-Zeiten löschen?`, `${nf0.format(n)} Solves werden gelöscht. Die anderen Würfelarten bleiben. Vorher am besten ein Backup speichern, löschen lässt sich nicht rückgängig machen.`,
    `${nf0.format(n)} Solves löschen`, () => {
      db.solves = db.solves.filter((s) => s[S.puzzle] !== db.puzzle);
      T.fresh = null;
      save(); closeSheet(); render(); toast('Gelöscht');
    }, openSettings, true);
}

function exportBackup() {
  db.lastBackup = new Date().toISOString();
  save();
  /* Der gesamte Datensatz wandert unverändert in die Datei. `meta` steht nur
     als Kopfzeile davor und wird beim Import wieder entfernt (normalize).
     Geheimnisse gibt es in dieser App keine. */
  const payload = Object.assign({
    meta: { app: 'Speedcube Timer', appVersion: APP_VERSION, format: db.v, exported: db.lastBackup },
  }, db);
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cube-timer-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Backup gespeichert');
  openSettings();
}

function importBackup(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!d || !Array.isArray(d.solves)) throw new Error('Die Datei ist kein Backup dieser App.');
      const stand = d.meta && d.meta.exported ? ` vom ${dfLong.format(new Date(d.meta.exported))}` : '';
      askSheet('Backup laden',
        `Das Backup${stand} enthält ${nf0.format(d.solves.length)} Solves. `
        + 'Deine jetzigen Zeiten werden dabei ersetzt.',
        'Laden', () => {
          db = normalize(d);              // ergänzt Fehlendes, wirft `meta` und Kaputtes weg
          applyTheme(db.theme);
          T.fresh = null; T.scrFor = '';
          save(); closeSheet(); render(); toast('Backup geladen');
        }, openSettings);
    } catch (e) { infoSheet('Import fehlgeschlagen', e.message, openSettings); }
  };
  r.readAsText(file);
}

/* ── 8. Zurück-Taste ────────────────────────────────────────────
   Ohne Zutun beendet ein einziger Druck auf Zurück die installierte App.
   Deshalb liegt ein zusätzlicher Verlaufseintrag („Wächter“) über der App:
   Zurück landet bei uns statt beim System. Der Druck schließt der Reihe
   nach, was offen ist (laufender Solve, Sheet, anderer Tab), und baut den
   Wächter wieder auf. Auf dem Timer kommt ein Hinweis (leaveHint).
   Zusammenspiel ist fummelig und erprobt: nur mit Bedacht ändern. */
let guardUp = false;

function pushGuard() {
  if (guardUp) return;
  guardUp = true;
  try { history.pushState({ g: 1 }, ''); } catch (e) { guardUp = false; }
}

/** Vor allem, was die Zurück-Taste abfangen soll: Sheet öffnen, Seite wechseln. */
function armBack() { pushGuard(); }

/** Zurück auf dem Timer: Hinweis statt Dialog. Ein „Verlassen“-Knopf
    kann die installierte App nicht schließen; nur die System-Zurückgeste
    selbst beendet sie. Deshalb bleibt der Wächter hier unten, und der nächste
    Zurück-Druck schließt die App. Tippt man stattdessen in die App, steht der
    Wächter wieder (Antippen zählt als Nutzeraktion; ohne sie überspringt
    Chrome den Eintrag beim Zurückgehen). In der Dashboard-Vorschau nichts tun. */
function leaveHint(msg) {
  if (window.__dashboard) return;
  toast(msg || 'Zum Verlassen nochmal zurück wischen');
  document.addEventListener('pointerdown', pushGuard, { once: true });
}

function wireBack() {
  pushGuard();
  window.addEventListener('popstate', () => {
    guardUp = false;

    // Eine Wischgeste am Rand während des Solves ist fast immer ein Versehen
    // beim Greifen: Solve verwerfen statt eine falsche Zeit zu speichern
    if (T.st !== 'idle') { abortRun('Solve verworfen'); pushGuard(); return; }
    // Über den Abbrechen-Knopf, nicht closeSheet: verschachtelte Sheets haben
    // dort ihren Rückweg zum vorherigen Sheet hinterlegt.
    if (!$('#sheet').classList.contains('hidden')) { $('#sheetCancel').click(); pushGuard(); return; }
    if (view !== 'timer') { nav('timer'); pushGuard(); return; }

    leaveHint();
  });
}

/* ── 9. Updates, Installieren ───────────────────────────────── */
/** Welche APP_VERSION liegt im Offline-Cache? Das ist die Fassung, die beim
    nächsten Laden ausgeliefert wird, nicht zwingend die laufende. */
async function cachedVersion() {
  if (!('caches' in window)) return null;
  for (const k of await caches.keys()) {
    if (!k.startsWith('cube-')) continue;     // Caches der anderen Apps auf der Domain
    const c = await caches.open(k);
    const res = (await c.match('./app.js')) || (await c.match('app.js'));
    if (!res) continue;
    const m = (await res.text()).match(/APP_VERSION\s*=\s*'([^']+)'/);
    if (m) return m[1];
  }
  return null;
}

/** Lädt neu, wenn im Cache eine andere Fassung liegt als die laufende. Die
    Sperre in sessionStorage verhindert eine Endlosschleife, falls das
    Neuladen die Version wider Erwarten nicht ändert. */
let reloading = false;
async function applyIfNewer(announce) {
  if (reloading) return false;
  const cv = await cachedVersion();
  if (!cv || cv === APP_VERSION) return false;
  if (sessionStorage.getItem('cube.reload') === cv) return false;   // schon versucht
  if (!$('#sheet').classList.contains('hidden')) {                      // Formular offen
    toast(`Version ${cv} bereit: App neu starten`);
    return true;
  }
  reloading = true;
  sessionStorage.setItem('cube.reload', cv);
  if (announce) toast(`Version ${cv} wird geladen …`);
  setTimeout(() => location.reload(), announce ? 700 : 0);
  return true;
}

function wireUpdates() {
  if (!('serviceWorker' in navigator)) return;

  /* Auf 'controllerchange' ist kein Verlass: aktualisiert sich dieselbe
     Registrierung, bleibt das Ereignis aus. Verlässlich ist der
     Zustandswechsel des neuen Workers auf 'activated'. */
  const watch = (w) => {
    if (!w) return;
    if (w.state === 'activated') { applyIfNewer(false); return; }
    w.addEventListener('statechange', () => {
      if (w.state === 'activated') applyIfNewer(false);
    });
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => applyIfNewer(false));

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      watch(reg.installing); watch(reg.waiting);
      reg.addEventListener('updatefound', () => watch(reg.installing));
      navigator.serviceWorker.ready.then(() => applyIfNewer(false));
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    }).catch(() => {});
  });
}

/** Knopf „Nach Update suchen". Findet reg.update() eine neue Fassung,
    übernimmt der Wächter aus wireUpdates() das Neuladen. */
async function checkUpdate() {
  if (!('serviceWorker' in navigator)) { toast('Updates werden hier nicht unterstützt'); return; }
  closeSheet();
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      await reg.update();
      if (reg.installing || reg.waiting) { toast('Update wird geladen …'); return; }
    }
  } catch (e) { /* offline: dann gilt der vorhandene Cache */ }
  if (!(await applyIfNewer(true))) toast(`Version ${APP_VERSION} ist aktuell`);
}

/* Eigener Installieren-Knopf statt Chrome-Menü: Chrome 154 bis 157 meldet dort
   „bereits installiert", sobald irgendeine andere App auf derselben Domain
   installiert ist (crbug.com/568841400). beforeinstallprompt prüft pro App.
   Chrome schickt das Ereignis nur, solange die App installierbar ist; der
   Knopf verschwindet also von selbst. */
let installEvt = null;

/** Knopf ein- oder ausblenden. Das Ereignis kommt oft erst ein paar Sekunden
    nach dem Laden, unter Umständen bei schon offenen Einstellungen. */
function syncInstall() {
  const b = $('#btnInstall');
  if (b) b.classList.toggle('hidden', !installEvt);
}

function wireInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();             // keine eigene Leiste von Chrome, der Knopf reicht
    installEvt = e;
    syncInstall();
  });
  window.addEventListener('appinstalled', () => {
    installEvt = null;
    syncInstall();
    toast('Speedcube Timer ist installiert');
  });
}

async function installApp() {
  const e = installEvt;
  if (!e) return;
  installEvt = null;                // prompt() geht nur einmal pro Ereignis
  syncInstall();
  e.prompt();
  await e.userChoice.catch(() => {});
}

/* ── 10. Diagramme ablesen, Bausteine ───────────────────────── */
/** Diagramm in einen Kasten mit Ablesezeile setzen. reader(i) liefert HTML
    für Punkt i oder null. scope 's' für Diagramme im Sheet. */
function chartBox(svg, reader, initial, scope) {
  const id = (scope || 'v') + (++rid);
  if (reader) readers.set(id, reader);
  return `<div class="chart" data-cid="${id}"><div class="readout">${initial || ''}</div>${svg}</div>`;
}

function onChartPointer(e) {
  const svg = e.target.closest && e.target.closest('.chart svg[data-n]');
  if (!svg) return;
  const box = svg.closest('.chart');
  const fn = readers.get(box.dataset.cid);
  if (!fn) return;
  const r = svg.getBoundingClientRect();
  const vbw = svg.viewBox.baseVal.width || 340;
  const x = ((e.clientX - r.left) / r.width) * vbw;
  const n = +svg.dataset.n, x0 = +svg.dataset.x0, x1 = +svg.dataset.x1;
  const i = Math.max(0, Math.min(n - 1, Math.floor(((x - x0) / (x1 - x0)) * n)));
  const html = fn(i);
  if (html == null) return;
  box.querySelector('.readout').innerHTML = html;
  const c = svg.querySelector('.cursor');
  if (c) {
    const cx = x0 + ((x1 - x0) * (i + 0.5)) / n;
    c.setAttribute('x1', cx); c.setAttribute('x2', cx);
    c.classList.remove('hidden');
  }
}

/** Segmented Control für 2 bis 5 feste Optionen. */
const seg = (name, opts, cur) => `<div class="seg">${opts.map(([v, l]) =>
  `<button data-seg="${esc(name)}" data-v="${esc(v)}" class="${String(v) === String(cur) ? 'on' : ''}" aria-pressed="${String(v) === String(cur)}">${esc(l)}</button>`).join('')}</div>`;

/* ── 11. Verdrahten, Start ──────────────────────────────────── */
/** Klicks per Delegation am body, nicht einzeln pro gerenderter Zeile.
    Klicks im Sheet behandelt das Sheet selbst (#sheetBody.onclick). */
function wire() {
  document.body.addEventListener('click', (e) => {
    if (e.target.closest('#sheet')) return;
    const n = e.target.closest('[data-nav]'); if (n) { nav(n.dataset.nav); return; }
    const s = e.target.closest('[data-seg]');
    if (s) {
      if (s.dataset.seg === 'range') range = +s.dataset.v;
      if (s.dataset.seg === 'puzzle') { db.puzzle = s.dataset.v; T.fresh = null; shown = 100; save(); }
      animNext = true; render(); return;
    }
    const a = e.target.closest('[data-action]');
    if (a) {
      const act = a.dataset.action;
      if (act === 'newScr') { newScramble(); render(); }
      else if (act === 'delLast') deleteLast();
      else if (act === 'noteLast') { const ls = list(); if (ls.length) noteFor(ls[ls.length - 1]); }
      else if (act === 'more') { shown += 200; render(); }
      return;
    }
    const r = e.target.closest('[data-ts]'); if (r) { openSolve(+r.dataset.ts); return; }
  });
  // Diagramme ablesen: Antippen und Ziehen mit dem Finger, mit der Maus schon beim Drüberfahren
  document.addEventListener('pointerdown', onChartPointer);
  document.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'mouse') onChartPointer(e); });
  $('#btnNew').onclick = enterTime;
  $('#btnSettings').onclick = openSettings;
  $('#sheetCancel').onclick = closeSheet;
  $('#scrim').onclick = () => $('#sheetCancel').click();   // wie Abbrechen, mit Rückweg verschachtelter Sheets
  $('#sheetSave').onclick = () => sheetSaveFn && sheetSaveFn();
}

load();
applyTheme(db.theme);
wire();
wireTimer();
wireBack();
nav(restoreViewState());

/* Bittet den Browser, den Speicher nicht bei Platzmangel wegzuräumen. */
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

wireUpdates();
wireInstall();
