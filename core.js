'use strict';
/* ═══════════════════════════════════════════════════════════════
   Speedcube Timer: Rechenlogik ohne DOM

   Scrambles, Zeiten lesen und schreiben, Mittelwerte, Tagesgruppen,
   Verteilung. Kein Zugriff auf document oder localStorage, damit
   tests/core-test.js alles in Node prüfen kann.

   Ein Solve ist ein kompaktes Array (der Speicher ist mit allen Apps der
   Domain geteilt, Regel 11):  [ms, ts, puzzle, scramble, note?]
   ═══════════════════════════════════════════════════════════════ */

const Core = (() => {

const fin = (v) => typeof v === 'number' && isFinite(v);

/* Felder eines Solves benannt lesen, statt überall s[0], s[1] zu schreiben. */
const S = { ms: 0, ts: 1, puzzle: 2, scramble: 3, note: 4 };

/* ── Würfelarten und Scrambles ──────────────────────────────── */
/* Random-Move-Scrambles: zufällige Züge mit den üblichen Regeln (keine Fläche
   zweimal hintereinander, auf einer Achse höchstens zwei Züge am Stück).
   Echte Random-State-Scrambles bräuchten einen Löser; für das Training
   reicht das hier, siehe DECISIONS.md. Längen wie bei den gängigen Timern. */
const PUZZLES = {
  '222': { label: '2×2', len: 11, faces: ['R', 'U', 'F'], wide: [] },
  '333': { label: '3×3', len: 20, faces: ['U', 'D', 'L', 'R', 'F', 'B'], wide: [] },
  '444': { label: '4×4', len: 40, faces: ['U', 'D', 'L', 'R', 'F', 'B'], wide: ['Uw', 'Rw', 'Fw'] },
};
const AXIS = { U: 0, D: 0, L: 1, R: 1, F: 2, B: 2 };
const SUFFIX = ['', "'", '2'];

/** Zug-Liste für eine Würfelart. `rnd` austauschbar, damit Tests gesät laufen. */
function scrambleMoves(puzzle, rnd) {
  const p = PUZZLES[puzzle] || PUZZLES['333'];
  rnd = rnd || Math.random;
  const pool = p.faces.concat(p.wide);
  const out = [];
  let axis = -1, run = [];             // Züge der laufenden Achse
  while (out.length < p.len) {
    const m = pool[Math.floor(rnd() * pool.length)];
    const a = AXIS[m[0]];
    if (a === axis) {
      // Auf derselben Achse: kein Zug doppelt (R … R) und höchstens zwei
      // Züge am Stück, sonst hebt sich ein Teil wieder auf
      if (run.includes(m) || run.length >= 2) continue;
      run.push(m);
    } else { axis = a; run = [m]; }
    out.push(m + SUFFIX[Math.floor(rnd() * 3)]);
  }
  return out;
}

const scramble = (puzzle, rnd) => scrambleMoves(puzzle, rnd).join(' ');

/* ── Zeiten schreiben und lesen ─────────────────────────────── */
/** 12345 → "12,34", 62340 → "1:02,34". Abgeschnitten wie bei jeder
    Stoppuhr, nicht gerundet: 12,349 s wurden nie 12,35 s gelaufen. */
function fmt(ms, dec) {
  if (!fin(ms)) return '–';
  dec = dec == null ? 2 : dec;
  const neg = ms < 0; ms = Math.abs(ms);
  const unit = Math.pow(10, 3 - dec);
  const t = Math.floor(ms / unit);                 // Hundertstel bzw. Zehntel
  const frac = t % Math.pow(10, dec);
  const sec = Math.floor(t / Math.pow(10, dec));
  const m = Math.floor(sec / 60), s = sec % 60;
  const fs = dec ? ',' + String(frac).padStart(dec, '0') : '';
  return (neg ? '−' : '') + (m ? `${m}:${String(s).padStart(2, '0')}` : String(s)) + fs;
}

/** Eingetippte Zeit lesen. Erlaubt: "12,34", "12.34", "1:02,34", "62,3"
    und reine Ziffern wie am Stackmat ("1234" = 12,34, "10234" = 1:02,34).
    Liefert Millisekunden oder null. */
function parse(str) {
  let s = String(str == null ? '' : str).trim().replace(/\s+/g, '').replace(',', '.');
  if (!s) return null;
  let ms;
  if (/^\d+$/.test(s)) {
    // Reine Ziffern: die letzten zwei sind Hundertstel, davor Sekunden, davor Minuten
    const d = s.padStart(3, '0');
    const cs = +d.slice(-2), rest = d.slice(0, -2);
    const sec = +rest.slice(-2), min = +(rest.slice(0, -2) || 0);
    if (rest.length > 2 && sec >= 60) return null;
    ms = (min * 60 + sec) * 1000 + cs * 10;
  } else {
    const m = s.match(/^(?:(\d+):)?(\d+(?:\.\d*)?)$/);
    if (!m) return null;
    const min = m[1] ? +m[1] : 0, sec = +m[2];
    if (m[1] && sec >= 60) return null;
    ms = Math.round((min * 60 + sec) * 1000);
  }
  return ms > 0 && ms < 24 * 3600 * 1000 ? ms : null;
}

/* ── Mittelwerte ────────────────────────────────────────────── */
function mean(ms) {
  const v = ms.filter(fin);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** Wie viele Zeiten an jedem Ende wegfallen: wie beim Wettkampf 5 %,
    aufgerundet, mindestens eine. Ao5 und Ao12 streichen also je die
    beste und die schlechteste. */
const trimOf = (n) => Math.max(1, Math.ceil(n * 0.05));

/** Mittel der letzten n Zeiten ohne die Ausreißer. null, wenn zu wenige. */
function avgOf(ms, n) {
  if (ms.length < n) return null;
  return trimmed(ms.slice(-n), trimOf(n));
}
function trimmed(win, k) {
  const v = win.slice().sort((a, b) => a - b).slice(k, win.length - k);
  return v.reduce((a, b) => a + b, 0) / v.length;
}

/** Gleitendes Mittel: an Stelle i das avgOf der Zeiten bis einschließlich i.
    Vorne null, solange noch keine n Zeiten zusammen sind. */
function rolling(ms, n) {
  const k = trimOf(n), out = new Array(ms.length).fill(null);
  for (let i = n - 1; i < ms.length; i++) out[i] = trimmed(ms.slice(i - n + 1, i + 1), k);
  return out;
}

/** Bestes gleitendes Mittel (kleinstes) mit Position, oder null. */
function bestAvg(ms, n) {
  let best = null, at = -1;
  rolling(ms, n).forEach((v, i) => { if (v != null && (best == null || v < best)) { best = v; at = i; } });
  return best == null ? null : { v: best, at };
}

function bestOf(ms) {
  let best = null, at = -1;
  ms.forEach((v, i) => { if (fin(v) && (best == null || v < best)) { best = v; at = i; } });
  return best == null ? null : { v: best, at };
}

/* ── Tage ───────────────────────────────────────────────────── */
/** Lokaler Kalendertag "JJJJ-MM-TT". Über die Datumsfelder, nicht über
    toISOString(): das wäre UTC und schöbe späte Solves auf den Folgetag. */
function dayKey(ts) {
  const d = new Date(ts), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Mitternacht des Tages, `back` Kalendertage zurück. Über setDate statt
    Millisekunden: Tage um die Zeitumstellung haben 23 oder 25 Stunden. */
function dayStart(ts, back) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  if (back) d.setDate(d.getDate() - back);
  return d.getTime();
}

/** Liste von Kalendertagen [{key, start}] von `from` bis `to` (je inkl.). */
function dayRange(from, to) {
  const out = [], d = new Date(dayStart(from));
  const end = dayStart(to);
  while (d.getTime() <= end) {
    out.push({ key: dayKey(d.getTime()), start: d.getTime() });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Solves nach Tag: Map key → { n, mean, best }. */
function perDay(solves) {
  const m = new Map();
  for (const s of solves) {
    const k = dayKey(s[S.ts]);
    let e = m.get(k);
    if (!e) { e = { n: 0, sum: 0, best: Infinity }; m.set(k, e); }
    e.n++; e.sum += s[S.ms]; if (s[S.ms] < e.best) e.best = s[S.ms];
  }
  for (const e of m.values()) e.mean = e.sum / e.n;
  return m;
}

/** Montag der Woche als Schlüssel, für den Verlauf über lange Zeiträume. */
function weekKey(ts) {
  const d = new Date(dayStart(ts));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dayKey(d.getTime());
}

/* ── Verteilung ─────────────────────────────────────────────── */
/** Zeiten in gleich breite Klassen. Die Breite (0,5 / 1 / 2 / 5 / 10 … s)
    wird so gewählt, dass höchstens `max` Klassen entstehen. Ausreißer
    jenseits von 3 % und 95 % landen in der ersten bzw. letzten Klasse
    (open = true), sonst bestünde das Diagramm aus ein paar Balken und
    einem langen, fast leeren Schwanz aus Pops. */
function bins(ms, max) {
  max = max || 14;
  const v = ms.filter(fin).slice().sort((a, b) => a - b);
  if (v.length < 2) return null;
  const q = (p) => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
  const lo = q(0.03), hi = q(0.95);
  const steps = [100, 200, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000];
  let w = steps.find((s) => Math.floor(hi / s) - Math.floor(lo / s) + 1 <= max) || steps[steps.length - 1];
  const first = Math.floor(lo / w) * w;
  const n = Math.floor(hi / w) - Math.floor(lo / w) + 1;
  const out = [];
  for (let i = 0; i < n; i++) out.push({ from: first + i * w, to: first + (i + 1) * w, n: 0 });
  for (const t of v) {
    const i = Math.max(0, Math.min(n - 1, Math.floor((t - first) / w)));
    out[i].n++;
    if (t < first) out[0].openLo = true;
    if (t >= first + n * w) out[n - 1].openHi = true;
  }
  return { w, bins: out };
}

/* ── Einordnung ─────────────────────────────────────────────── */
/** Vergleich zweier Mittel (ms). Weniger ist besser. Unter 1 % Unterschied
    gilt als gleich, sonst wäre jeder Vergleich ein Urteil. */
function compare(cur, prev) {
  if (!fin(cur) || !fin(prev)) return null;
  const d = cur - prev;
  if (Math.abs(d) < prev * 0.01) return { dir: 0, d };
  return { dir: d < 0 ? 1 : -1, d };
}

return { S, PUZZLES, scramble, scrambleMoves, fmt, parse, mean, avgOf, rolling, bestAvg, bestOf,
  trimOf, dayKey, dayStart, dayRange, perDay, weekKey, bins, compare };
})();

if (typeof module === 'object' && module.exports) module.exports = Core;
