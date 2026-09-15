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

// flags as small inline SVGs (proper shapes: US stripes and canton, Czech blue wedge)
const svg = body => 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20">' + body + '</svg>') + '")';
const stripes = (a, b, n) => { let o = ''; for (let i = 0; i < n; i++) o += `<rect x="0" y="${(20 / n) * i}" width="30" height="${20 / n + 0.2}" fill="${i % 2 ? b : a}"/>`; return o; };
export const LANGS = [
  { code: 'en', label: 'EN', name: 'English', locale: 'en-US', flag: svg(stripes('#b22234', '#fff', 13) + '<rect x="0" y="0" width="12" height="10.8" fill="#3c3b6e"/>' + [...Array(15)].map((_, i) => `<circle cx="${1.5 + (i % 5) * 2.4}" cy="${1.6 + Math.floor(i / 5) * 3.6}" r="0.55" fill="#fff"/>`).join('')) },
  { code: 'cs', label: 'CZ', name: 'Čeština', locale: 'cs-CZ', flag: svg('<rect width="30" height="10" fill="#fff"/><rect y="10" width="30" height="10" fill="#d7141a"/><polygon points="0,0 15,10 0,20" fill="#11457e"/>') },
  { code: 'de', label: 'DE', name: 'Deutsch', locale: 'de-DE', flag: svg('<rect width="30" height="6.7" fill="#000"/><rect y="6.7" width="30" height="6.7" fill="#dd0000"/><rect y="13.3" width="30" height="6.7" fill="#ffce00"/>') },
  { code: 'fr', label: 'FR', name: 'Français', locale: 'fr-FR', flag: svg('<rect width="10" height="20" fill="#0055a4"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#ef4135"/>') },
  { code: 'es', label: 'ES', name: 'Español', locale: 'es-ES', flag: svg('<rect width="30" height="20" fill="#aa151b"/><rect y="5" width="30" height="10" fill="#f1bf00"/>') },
  { code: 'pl', label: 'PL', name: 'Polski', locale: 'pl-PL', flag: svg('<rect width="30" height="10" fill="#fff"/><rect y="10" width="30" height="10" fill="#dc143c"/>') },
  { code: 'ru', label: 'RU', name: 'Русский', locale: 'ru-RU', flag: svg('<rect width="30" height="6.7" fill="#fff"/><rect y="6.7" width="30" height="6.7" fill="#0039a6"/><rect y="13.3" width="30" height="6.7" fill="#d52b1e"/>') },
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
  const L = o => { for (const k of ['name', 'desc', 'acc', 'short', 'leader', 'year', 'tagline']) if (typeof o[k] === 'string') o[k] = t(o[k]); };
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
    const f = document.createElement('span'); f.className = 'flag'; f.style.backgroundImage = l.flag; f.style.backgroundSize = '100% 100%'; b.appendChild(f);
    const c = document.createElement('span'); c.textContent = l.label || l.code.toUpperCase(); b.appendChild(c);
    b.onclick = () => { if (l.code === lang) return; setLang(l.code); location.reload(); };
    container.appendChild(b);
  }
}
