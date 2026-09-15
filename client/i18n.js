// Localization: dictionaries map the Czech source strings (the language the game was written in) to translations.
// Missing entries fall back to English, then to the Czech source. Game data (unit/building names…) is localized
// in place on the client at startup; a language switch saves the choice and reloads the page.
import { ERAS, RESEARCH, TEAM_COLORS } from '../shared/data.js';
import EN from './lang/en.js';
import DE from './lang/de.js';
import FR from './lang/fr.js';
import ES from './lang/es.js';
import PL from './lang/pl.js';
import RU from './lang/ru.js';

export const LANGS = [
  { code: 'en', name: 'English', locale: 'en-GB', flag: 'linear-gradient(180deg,#012169 0 33%,#fff 33% 66%,#c8102e 66%)' },
  { code: 'cs', name: 'Čeština', locale: 'cs-CZ', flag: 'linear-gradient(180deg,#fff 0 50%,#d7141a 50%), linear-gradient(135deg,#11457e 0 40%,transparent 40%)' },
  { code: 'de', name: 'Deutsch', locale: 'de-DE', flag: 'linear-gradient(180deg,#000 0 33%,#dd0000 33% 66%,#ffce00 66%)' },
  { code: 'fr', name: 'Français', locale: 'fr-FR', flag: 'linear-gradient(90deg,#0055a4 0 33%,#fff 33% 66%,#ef4135 66%)' },
  { code: 'es', name: 'Español', locale: 'es-ES', flag: 'linear-gradient(180deg,#aa151b 0 25%,#f1bf00 25% 75%,#aa151b 75%)' },
  { code: 'pl', name: 'Polski', locale: 'pl-PL', flag: 'linear-gradient(180deg,#fff 0 50%,#dc143c 50%)' },
  { code: 'ru', name: 'Русский', locale: 'ru-RU', flag: 'linear-gradient(180deg,#fff 0 33%,#0039a6 33% 66%,#d52b1e 66%)' },
];
const DICTS = { en: EN, de: DE, fr: FR, es: ES, pl: PL, ru: RU };

let lang = 'en';
export function currentLang() { return lang; }
export function langDef() { return LANGS.find(l => l.code === lang) || LANGS[0]; }
export function detectLang() {
  try { const saved = localStorage.getItem('aow-lang'); if (saved && LANGS.some(l => l.code === saved)) return saved; } catch {}
  return 'en'; // English by default (the flags in the menu switch the language)
}
export function setLang(code) { lang = LANGS.some(l => l.code === code) ? code : 'en'; try { localStorage.setItem('aow-lang', lang); } catch {} }

/** translate one source string (Czech) */
export function t(s) {
  if (lang === 'cs' || s === undefined || s === null) return s;
  const d = DICTS[lang]; if (d && d[s] !== undefined) return d[s];
  if (lang !== 'en' && EN[s] !== undefined) return EN[s];
  return s;
}
/** messages generated on the server / in the simulation: exact match first, then known "<name> …" patterns */
const SYS_PATTERNS = [
  [/^(.+) se znovu připojil\.$/, '%1 se znovu připojil.'], [/^(.+) opustil hru\.$/, '%1 opustil hru.'], [/^(.+) ztratil spojení\.$/, '%1 ztratil spojení.'], [/^(.+) odešel\.$/, '%1 odešel.'],
  [/^(.+) byl vytěžen\.$/, '%1 byl vytěžen.'], [/^(.+): kolem není místo pro novou jednotku\.$/, '%1: kolem není místo pro novou jednotku.'], [/^(.+) může být jen jeden\.$/, '%1 může být jen jeden.'],
  [/^Vyžaduje radnici úrovně (\d+)\.$/, 'Vyžaduje radnici úrovně %1.'], [/^(.+): ještě (\d+) s\.$/, '%1: ještě %2 s.'],
];
export function tsys(s) {
  if (lang === 'cs' || typeof s !== 'string') return s;
  const exact = t(s); if (exact !== s) return exact;
  for (const [re, key] of SYS_PATTERNS) { const m = re.exec(s); if (m) return tf(key, ...m.slice(1).map(x => t(x))); }
  return s;
}
/** translate a pattern with %1 %2 … placeholders */
export function tf(s, ...args) { let out = t(s); args.forEach((a, i) => { out = out.split('%' + (i + 1)).join(String(a)); }); return out; }

/** translate text nodes and common attributes below root (used once at startup) */
export function translateDom(root = document.body) {
  if (lang === 'cs') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    if (n.parentNode && (n.parentNode.tagName === 'SCRIPT' || n.parentNode.tagName === 'STYLE')) continue;
    const raw = n.nodeValue; const key = raw.replace(/\s+/g, ' ').trim(); if (!key) continue;
    const tr = t(key); if (tr !== key) n.nodeValue = raw.replace(key, tr);
    else if (key.includes('&middot;') === false && raw.includes('·')) { /* keep */ }
  }
  for (const el of root.querySelectorAll('[placeholder], [title]')) {
    for (const a of ['placeholder', 'title']) { const v = el.getAttribute(a); if (v) { const tr = t(v); if (tr !== v) el.setAttribute(a, tr); } }
  }
}

/** localize the shared game data in place (names, descriptions) */
export function localizeData() {
  if (lang === 'cs') return;
  const L = o => { for (const k of ['name', 'desc', 'acc', 'short', 'leader']) if (typeof o[k] === 'string') o[k] = t(o[k]); };
  for (const era of Object.values(ERAS)) {
    L(era);
    if (era.resources) for (const r of Object.values(era.resources)) L(r);
    if (era.nodes) for (const n of Object.values(era.nodes)) L(n);
    if (era.hallNames) era.hallNames = era.hallNames.map(t);
    for (const f of era.factions || []) { L(f); if (f.unitNames) for (const k of Object.keys(f.unitNames)) f.unitNames[k] = t(f.unitNames[k]); }
    for (const coll of [era.units, era.buildings]) if (coll) for (const u of Object.values(coll)) { L(u); if (u.ability) L(u.ability); for (const up of u.upgrades || []) L(up); }
  }
  for (const r of Object.values(RESEARCH)) { L(r); if (r.names) for (const k of Object.keys(r.names)) r.names[k] = t(r.names[k]); }
  for (const c of TEAM_COLORS) L(c);
}

/** build the language switch (flag chips) into a container */
export function buildLangSwitch(container) {
  container.innerHTML = '';
  for (const l of LANGS) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'lang-btn' + (l.code === lang ? ' active' : ''); b.title = l.name;
    const f = document.createElement('span'); f.className = 'flag'; f.style.background = l.flag; b.appendChild(f);
    const c = document.createElement('span'); c.textContent = l.code.toUpperCase(); b.appendChild(c);
    b.onclick = () => { if (l.code === lang) return; setLang(l.code); location.reload(); };
    container.appendChild(b);
  }
}
