// Character builds and tier ratings for the Gacha page's popup, read from Prydwen.gg, plus hover trailers from each game's wiki.
// Prydwen has no API, so this reads the React Server Components payload inside its HTML page
// (self.__next_f.push chunks). If they change the markup the parser returns null and the popup
// says "not found": nothing else depends on it.
//
// Polite by design (robots.txt asks for Crawl-delay: 10): nothing is fetched until the user opens a
// popup, requests to prydwen.gg are at least 10 s apart, and every answer is cached on disk for 3 days.
//
// getBuild(key, name, fetchText, enabled) resolves to, and never throws, the same shape for every game:
//   { ok: true, source: 'Prydwen.gg', url, slug, updated /* ms or 0 */,
//     tiers:    [{ role, ratings: [[label, 'T0'], ...] }],
//     sections: [{ title, rows: [{ parts: [{ name, icon, fx: [[label, text], ...] }], pct, sub }] }],
//     stats:    [[label, value], ...] }
//   | { ok: false, reason: 'unsupported' | 'off' | 'notfound' | 'offline' }
// A row with several parts is a 2+2 mix of sets. fx is what the tooltip shows (2-piece / 4-piece text, a weapon's effect).

const fs = require('fs');
const path = require('path');

const PRY = 'https://www.prydwen.gg';
const BASE = `${PRY}/star-rail`;
const GAMES = {
  hsr: { base: BASE },
  zzz: { base: `${PRY}/zenless` },
  wuwa: { base: `${PRY}/wuthering-waves` },
  genshin: { base: `${PRY}/genshin-impact` },
};
const DAY = 24 * 3600 * 1000;
const TTL = 3 * DAY;
const MISS_TTL = 1 * DAY;
const INDEX_TTL = 7 * DAY;
const SETS_TTL = 7 * DAY;
const SPACING = 10000; // robots.txt Crawl-delay

// Prydwen's rating number -> tier label (the same scale in all four games)
const TIER = { 11: 'T0', 10: 'T0.5', 9: 'T1', 8: 'T1.5', 7: 'T2', 6: 'T3', 5: 'T4', 4: 'T5' };
// Names whose Prydwen slug is not just the lower-cased name (keys are lower-case)
const ALIASES = { 'aeon ★ aha': 'aha', 'dan heng • imbibitor lunae': 'imbibitor-lunae' };

let file = '';
let cache = null; // { builds, misses, index (HSR names), idx (other games' names), sets (HSR icons), gi (Genshin icons), trailers }
const inflight = new Map();
let lastHit = 0;
let queue = Promise.resolve();

function init(userDataDir) { file = path.join(userDataDir, 'gacha-builds.json'); cache = null; }

function load() {
  if (cache) return cache;
  cache = { builds: {}, misses: {}, index: null, idx: {}, sets: null, gi: null, trailers: {} };
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (j && typeof j === 'object') cache = { builds: j.builds || {}, misses: j.misses || {}, index: j.index || null, idx: j.idx || {}, sets: j.sets || null, gi: j.gi || null, trailers: j.trailers || {} };
  } catch { /* no cache yet, or damaged: start empty */ }
  return cache;
}
function persist() {
  if (!file) return;
  fs.promises.writeFile(file, JSON.stringify(cache)).catch(() => {});
}

// All the page's RSC chunks joined back into one string
function rscText(html) {
  let out = '';
  for (const m of String(html).matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)) {
    try { out += JSON.parse(`"${m[1]}"`); } catch { /* a chunk we can't read */ }
  }
  return out;
}

// The JSON array/object that starts right after `"key":`, found by bracket matching (strings skipped)
function valueAfter(text, key, from = 0) {
  const i = text.indexOf(`"${key}":`, from);
  if (i < 0) return null;
  const j = i + key.length + 3;
  const open = text[j];
  if (open !== '[' && open !== '{') return null;
  let depth = 0, inStr = false;
  for (let k = j; k < text.length; k++) {
    const c = text[k];
    if (inStr) { if (c === '\\') k++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') {
      depth--;
      if (depth === 0) { try { return JSON.parse(text.slice(j, k + 1)); } catch { return null; } }
    }
  }
  return null;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const pctOf = (p) => (typeof p === 'string' && p.includes('%') ? p : '');
const str = (v) => (typeof v === 'string' ? v : '');
const arr = (v) => (Array.isArray(v) ? v : []);
const tierOf = (n) => TIER[Number(n)] || '';
// Prydwen writes effect texts as small bits of HTML; the tooltip wants plain text
function plain(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, ' ').replace(/<\/p>\s*<p>/gi, ' ').replace(/<[^>]+>/g, '')
    .replace(/&apos;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
const pctNum = (n) => (Number.isFinite(Number(n)) ? `${Number(n).toFixed(1)}%` : '');
// "Updated" stamps come as ISO dates, "12/November/2026" or "2026-09-25"
const stamp = (s) => { const v = Date.parse(String(s || '').replace(/\//g, ' ')); return Number.isFinite(v) ? v : 0; };

function guessSlug(name) {
  const low = String(name || '').toLowerCase().trim();
  if (ALIASES[low]) return ALIASES[low];
  return low.replace(/[★•]/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ---------- Honkai: Star Rail ----------
function tiersFor(text, slug) {
  const re = new RegExp(`"slug":"${slug.replace(/[^a-z0-9-]/g, '')}","category":"([^"]+)","moc_rating":(\\d+),"moc_special_rating":\\d+,"pure_rating":(\\d+),"pure_special_rating":\\d+,"apo_rating":(\\d+)`, 'g');
  const seen = new Set(), out = [];
  for (const m of text.matchAll(re)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({ role: m[1], moc: tierOf(m[2]), pf: tierOf(m[3]), as: tierOf(m[4]) });
  }
  return out;
}

// The summary for one character page, or null when it has neither relic nor cone builds
function parseCharacter(html, slug) {
  const t = rscText(html);
  const relicB = valueAfter(t, 'relicBuilds'), coneB = valueAfter(t, 'coneBuilds'), statB = valueAfter(t, 'statBuilds');
  const hasRelic = Array.isArray(relicB) && relicB.length, hasCone = Array.isArray(coneB) && coneB.length;
  if (!hasRelic && !hasCone) return null;
  const planars = [], seen = new Set();
  for (const r of hasRelic ? relicB : []) {
    for (const o of (r && r.ornament_options) || []) {
      const n = str(o && o.name);
      if (n && !seen.has(n)) { seen.add(n); planars.push({ name: n, pct: pctOf(o.percentage) }); }
    }
  }
  const s = Array.isArray(statB) && statB[0] ? statB[0] : null;
  const upd = t.match(/"updatedAt":"([^"]+)"/);
  return {
    ok: true, source: 'Prydwen.gg', url: `${BASE}/characters/${slug}`, slug,
    updated: upd ? Date.parse(upd[1]) || 0 : 0,
    tiers: tiersFor(t, slug),
    relics: (hasRelic ? relicB : []).slice(0, 3).map((r) => ({ set: str(r.relic_set_1), set2: str(r.relic_set_2), pct: pctOf(r.percentage) })).filter((r) => r.set),
    planars: planars.slice(0, 3),
    cones: (hasCone ? coneB : []).slice(0, 4).map((c) => ({ name: str(c.cone_name), dupes: Number(c.dupes) || 0, pct: pctOf(c.percentage) })).filter((c) => c.name),
    stats: s ? { body: str(s.body), feet: str(s.feet), sphere: str(s.sphere), rope: str(s.rope), substats: str(s.substats) } : null,
  };
}

// name -> slug map from the tier-list page's character list
function parseIndex(html) {
  const list = valueAfter(rscText(html), 'characters');
  const map = {};
  if (Array.isArray(list)) for (const c of list) if (c && c.slug && c.name) map[norm(c.name)] = c.slug;
  return map;
}

// Icons and set effects. Prydwen only names the Star Rail sets; StarRailRes (a public data repo) has every set's icon
// and its 2-piece / 4-piece text. One small file, cached for a week; any failure just leaves the plain names.
const SRR = 'https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/';

async function hsrSets(fetchText) {
  const c = load();
  if (c.sets && Date.now() - c.sets.at < SETS_TTL) return c.sets;
  try {
    const sets = JSON.parse(await fetchText(SRR + 'index_new/en/relic_sets.json'));
    const cones = JSON.parse(await fetchText(SRR + 'index_new/en/light_cones.json'));
    const relics = {}, lc = {};
    for (const s of Object.values(sets)) if (s && s.name) relics[norm(s.name)] = { name: s.name, icon: SRR + s.icon, fx: s.desc || [] };
    for (const l of Object.values(cones)) if (l && l.name) lc[norm(l.name)] = { icon: SRR + l.icon, path: l.path || '' };
    c.sets = { at: Date.now(), relics, cones: lc };
    persist();
  } catch { /* keep the stale copy, or nothing */ }
  return c.sets;
}

// The Star Rail build in the shared shape, with icons and effects added (the cached copy stays as Prydwen gave it).
// A 4-piece set shows its 2 and 4 piece text, a planar ornament or a 2+2 mix only the 2-piece.
async function hsrFinish(d, fetchText) {
  const s = await hsrSets(fetchText).catch(() => null);
  const part = (name, pieces) => {
    const r = s && s.relics[norm(name)];
    if (!r) return { name, icon: '', fx: [] };
    const fx = [];
    if (pieces.includes(2) && r.fx[0]) fx.push(['2-piece', r.fx[0]]);
    if (pieces.includes(4) && r.fx[1]) fx.push(['4-piece', r.fx[1]]);
    return { name: r.name, icon: r.icon, fx };
  };
  const sections = [];
  if (d.relics && d.relics.length) sections.push({ title: 'Relic sets', rows: d.relics.map((x) => ({ parts: x.set2 ? [part(x.set, [2]), part(x.set2, [2])] : [part(x.set, [2, 4])], pct: x.pct, sub: '' })) });
  if (d.planars && d.planars.length) sections.push({ title: 'Planar ornaments', rows: d.planars.map((x) => ({ parts: [part(x.name, [2])], pct: x.pct, sub: '' })) });
  if (d.cones && d.cones.length) sections.push({ title: 'Light cones', rows: d.cones.map((x) => {
    const l = s && s.cones[norm(x.name)];
    return { parts: [{ name: x.name, icon: l ? l.icon : '', fx: [] }], pct: x.pct, sub: x.dupes ? `S${x.dupes}` : '' };
  }) });
  const st = d.stats;
  return {
    ok: true, source: d.source, url: d.url, slug: d.slug, updated: d.updated,
    tiers: (d.tiers || []).map((t) => ({ role: t.role, ratings: [['Memory of Chaos', t.moc], ['Pure Fiction', t.pf], ['Apocalyptic Shadow', t.as]].filter((x) => x[1]) })).filter((t) => t.ratings.length),
    sections,
    stats: st ? [['Body', st.body], ['Feet', st.feet], ['Sphere', st.sphere], ['Rope', st.rope], ['Substats', st.substats]].filter((x) => x[1]) : [],
  };
}

// ---------- Zenless Zone Zero ----------
// The page carries the drive disc sets and W-Engines with their icons and effect text, so nothing else is needed.
function parseZzz(html, slug) {
  const t = rscText(html);
  const mine = (list) => arr(list).filter((b) => b && b.Character === slug);
  const disks = mine(valueAfter(t, 'diskBuilds')), engB = mine(valueAfter(t, 'engineBuilds'));
  if (!disks.length && !engB.length) return null;
  const sets = {}, engines = {};
  for (const s of arr(valueAfter(t, 'driveSets'))) if (s && s.name) sets[norm(s.name)] = s;
  for (const e of arr(valueAfter(t, 'engines'))) if (e && e.name) engines[norm(e.name)] = e;
  const setPart = (name, pieces) => {
    const s = sets[norm(name)];
    const fx = [];
    if (s && pieces.includes(2) && s.piece_2) fx.push(['2-piece', plain(s.piece_2)]);
    if (s && pieces.includes(4) && s.piece_4) fx.push(['4-piece', plain(s.piece_4)]);
    return { name, icon: s ? str(s.image) : '', fx };
  };
  const sections = [];
  const discRows = disks.slice(0, 3).map((b) => {
    const names = str(b.Set).split(/\s*\+\s*/).filter(Boolean);
    return { parts: names.map((n) => setPart(n, names.length > 1 ? [2] : [2, 4])), pct: pctOf(b.Percentage), sub: '' };
  }).filter((r) => r.parts.length);
  if (discRows.length) sections.push({ title: 'Drive discs', rows: discRows });
  const engRows = engB.slice(0, 4).map((b) => {
    const e = engines[norm(b.Engine)];
    return { parts: [{ name: str(b.Engine), icon: e ? str(e.image) : '', fx: e && e.description ? [['Effect', plain(e.description)]] : [] }], pct: pctOf(b.Percentage_top), sub: Number(b.Dupes) ? `P${Number(b.Dupes)}` : '' };
  }).filter((r) => r.parts[0].name);
  if (engRows.length) sections.push({ title: 'W-Engines', rows: engRows });
  const sb = mine(valueAfter(t, 'statBuilds'))[0];
  const tiers = [], seen = new Set();
  for (const m of t.matchAll(new RegExp(`"slug":"${slug.replace(/[^a-z0-9-]/g, '')}","category":"([^"]+)","rating":(\\d+)`, 'g'))) {
    if (seen.has(m[1]) || !tierOf(m[2])) continue;
    seen.add(m[1]);
    tiers.push({ role: m[1], ratings: [['Rating', tierOf(m[2])]] });
  }
  const upd = t.match(/"updatedAt":"([^"]+)"/);
  return {
    ok: true, source: 'Prydwen.gg', url: `${GAMES.zzz.base}/characters/${slug}`, slug, updated: upd ? stamp(upd[1]) : 0,
    tiers, sections,
    stats: sb ? [['Disc 4', sb.Disk_4], ['Disc 5', sb.Disk_5], ['Disc 6', sb.Disk_6], ['Substats', sb.Substats]].filter((x) => str(x[1])) : [],
  };
}

// ---------- Wuthering Waves ----------
function parseWuwa(html, slug) {
  const t = rscText(html);
  const mine = (list) => arr(list).filter((b) => b && b.Character === slug);
  const echoB = mine(valueAfter(t, 'echoBuilds')), wepB = mine(valueAfter(t, 'weaponBuilds'));
  if (!echoB.length && !wepB.length) return null;
  const echoSets = {}, weapons = {};
  for (const s of arr(valueAfter(t, 'echoSets'))) if (s && s.name) echoSets[norm(s.name)] = s;
  for (const w of arr(valueAfter(t, 'weapons'))) if (w && w.Name) weapons[norm(w.Name)] = w;
  const sections = [];
  const echoRows = echoB.slice(0, 3).map((b) => {
    const s = echoSets[norm(b.Set)];
    const fx = s ? [['2-piece', s.bonus_2], ['3-piece', s.bonus_3], ['5-piece', s.bonus_5]].filter((x) => str(x[1])).map(([l, v]) => [l, plain(v)]) : [];
    return { parts: [{ name: str(b.Set), icon: s ? str(s.imageUrl) : '', fx }], pct: pctOf(b.Percentage), sub: '' };
  }).filter((r) => r.parts[0].name);
  if (echoRows.length) sections.push({ title: 'Echo sets', rows: echoRows });
  // A weapon's effect has {0} {1} slots filled from its refinement rows: show the first and last value
  const effect = (w) => str(w.Effect).replace(/\{(\d)\}/g, (_, i) => {
    const a = w[`Array_${i}`];
    return Array.isArray(a) && a.length ? (a.length > 1 && a[0] !== a[a.length - 1] ? `${a[0]}–${a[a.length - 1]}` : String(a[0])) : '?';
  });
  const wepRows = wepB.slice(0, 4).map((b) => {
    const w = weapons[norm(b.Weapon)];
    return { parts: [{ name: str(b.Weapon), icon: w && w.ID ? `https://cdn.prydwen.gg/images/wuthering-waves/weapons/${w.ID}.webp` : '', fx: w && w.Effect ? [['Effect', plain(effect(w))]] : [] }], pct: pctOf(b.Percentage), sub: Number(b.Dupes) ? `R${Number(b.Dupes)}` : '' };
  }).filter((r) => r.parts[0].name);
  if (wepRows.length) sections.push({ title: 'Weapons', rows: wepRows });
  const rate = arr(valueAfter(t, 'ratings')).find((r) => r && r.slug === slug);
  const tiers = [];
  if (rate) {
    const ratings = [['Whimpering Wastes', tierOf(rate.ww_rating)], ['Tower of Adversity', tierOf(rate.toa_rating)], ['Overall', tierOf(rate.overall_rating)]].filter((x) => x[1]);
    if (ratings.length) tiers.push({ role: str(rate.ww_cat || rate.toa_cat).replace(/^./, (c) => c.toUpperCase()), ratings });
  }
  const sb = mine(valueAfter(t, 'echoStatBuilds'))[0];
  const costs = sb ? String(sb.Format || '').split('') : [];
  const stats = sb ? [1, 2, 3, 4, 5].map((i) => [`Echo ${i}${costs[i - 1] ? ` (${costs[i - 1]}-cost)` : ''}`, str(sb[`Echo_${i}`])]).concat([['Substats', str(sb.Substats)]]).filter((x) => x[1]) : [];
  const upd = t.match(/"updatedAt":"([^"]+)"/);
  return { ok: true, source: 'Prydwen.gg', url: `${GAMES.wuwa.base}/characters/${slug}`, slug, updated: upd ? stamp(upd[1]) : 0, tiers, sections, stats };
}

// ---------- Genshin Impact ----------
// Prydwen's Genshin page names the artifact sets and weapons and gives usage rates but no icons or effect text; those
// come from Yatta (gi.yatta.moe), a public Genshin data site.
const YATTA = 'https://gi.yatta.moe';

async function giSets(fetchText) {
  const c = load();
  if (c.gi && Date.now() - c.gi.at < SETS_TTL) return c.gi;
  try {
    const rel = JSON.parse(await fetchText(`${YATTA}/api/v2/en/reliquary`)).data.items;
    const wep = JSON.parse(await fetchText(`${YATTA}/api/v2/en/weapon`)).data.items;
    const relics = {}, weapons = {};
    for (const s of Object.values(rel)) if (s && s.name) relics[norm(s.name)] = { icon: `${YATTA}/assets/UI/reliquary/${s.icon}.png`, fx: Object.values(s.affixList || {}) };
    for (const w of Object.values(wep)) if (w && w.name) weapons[norm(w.name)] = { icon: `${YATTA}/assets/UI/${w.icon}.png` };
    c.gi = { at: Date.now(), relics, weapons };
    persist();
  } catch { /* keep the stale copy, or nothing */ }
  return c.gi;
}

function parseGenshin(html, slug) {
  const t = rscText(html);
  const artD = arr(valueAfter(t, 'artifactsData')), wepD = arr(valueAfter(t, 'weaponsData'));
  if (!artD.length && !wepD.length) return null;
  const note = (x) => str(x && x.cells && x.cells[0] && x.cells[0].notes).trim();
  // Usage rates: 4-piece sets have the same name twice, a 2+2 mix two names; weapons are listed by name
  const setUse = {};
  for (const s of arr(valueAfter(t, 'artifactSets'))) if (s && s.nameB) setUse[`${norm(s.nameA)}|${norm(s.nameB)}`] = Number(s.percentage);
  const wepUse = {};
  for (const m of t.matchAll(/"weaponId":"\d+","name":"([^"]+)","percentage":([\d.]+)/g)) wepUse[norm(m[1])] = Number(m[2]);
  const sections = [];
  const artRows = artD.map((x) => {
    const names = str(x.ref).split(/\s*\+\s*/).filter(Boolean);
    const use = names.length > 1 ? setUse[`${norm(names[0])}|${norm(names[1])}`] : setUse[`${norm(names[0])}|${norm(names[0])}`];
    return { names, use, note: note(x) };
  }).filter((r) => r.names.length).sort((a, b) => (b.use || -1) - (a.use || -1)).slice(0, 4);
  if (artRows.length) sections.push({ title: 'Artifact sets', rows: artRows.map((r) => ({ parts: r.names.map((n) => ({ name: n, icon: '', fx: [], pieces: r.names.length > 1 ? [2] : [2, 4], note: r.note })), pct: r.use ? pctNum(r.use) : '', sub: '' })) });
  const wepRows = wepD.map((x) => ({ name: str(x.ref), dupes: str(x.dupes), use: wepUse[norm(x.ref)], note: note(x) })).filter((r) => r.name).sort((a, b) => (b.use || -1) - (a.use || -1)).slice(0, 5);
  if (wepRows.length) sections.push({ title: 'Weapons', rows: wepRows.map((r) => ({ parts: [{ name: r.name, icon: '', fx: [], note: r.note, weapon: true }], pct: r.use ? pctNum(r.use) : '', sub: r.dupes })) });
  const rate = arr(valueAfter(t, 'ratings')).find((r) => r && r.slug === slug);
  const tiers = rate && /^T\d/.test(str(rate.ratingOverall)) ? [{ role: str(rate.category), ratings: [['Overall', rate.ratingOverall]] }] : [];
  const stats = arr(valueAfter(t, 'artifactStats')).map((s) => [str(s.slot), str(s.stat)]).filter((x) => x[0] && x[1]);
  const upd = t.match(/"last_updated":"([^"]+)"/);
  return { ok: true, source: 'Prydwen.gg', url: `${GAMES.genshin.base}/characters/${slug}`, slug, updated: upd ? stamp(upd[1]) : 0, tiers, sections, stats };
}

// Adds Yatta's icons and set effects to a parsed Genshin build (done once, before it is cached)
async function giFinish(d, fetchText) {
  const g = await giSets(fetchText).catch(() => null);
  if (!g) return d;
  for (const sec of d.sections) for (const row of sec.rows) for (const p of row.parts) {
    const fx = [];
    if (p.weapon) { const w = g.weapons[norm(p.name)]; if (w) p.icon = w.icon; }
    else {
      const r = g.relics[norm(p.name)];
      if (r) {
        p.icon = r.icon;
        if ((p.pieces || []).includes(2) && r.fx[0]) fx.push(['2-piece', r.fx[0]]);
        if ((p.pieces || []).includes(4) && r.fx[1]) fx.push(['4-piece', r.fx[1]]);
      }
    }
    if (p.note) fx.push(['Note', p.note]);
    p.fx = fx;
    delete p.note; delete p.pieces; delete p.weapon;
  }
  return d;
}

const PARSERS = { hsr: parseCharacter, zzz: parseZzz, wuwa: parseWuwa, genshin: parseGenshin };

// ---------- Fetching ----------
// Every prydwen.gg request goes through here: at least SPACING ms after the previous one
function polite(fn) {
  const run = queue.then(async () => {
    const wait = lastHit + SPACING - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastHit = Date.now();
    return fn();
  });
  queue = run.catch(() => {});
  return run;
}

// Resolves to html, or null when the page is missing/blocked (any HTTP status); throws on network errors
async function page(fetchText, url) {
  return polite(async () => {
    try { return await fetchText(url); }
    catch (e) { if (e && e.status) return null; throw e; }
  });
}

// name -> slug for one game, read from its tier-list page. Star Rail lists characters; ZZZ and Wuthering Waves put
// name and slug side by side; Genshin's ratings only carry slugs, so its map is slug -> slug and names are matched by substring.
function indexFor(key, html) {
  if (key === 'hsr') return parseIndex(html);
  const t = rscText(html), map = {};
  for (const m of t.matchAll(/"name":"([^"]+)"[^{}]{0,160}?"slug":"([a-z0-9-]+)"/g)) map[norm(m[1])] = m[2];
  if (key === 'genshin') for (const m of t.matchAll(/"slug":"([a-z0-9-]+)","category":"/g)) map[norm(m[1])] = m[1];
  return map;
}

function bestSlug(map, name, key) {
  const n = norm(name);
  if (map[n]) return map[n];
  let best = '';
  for (const k of Object.keys(map)) {
    if (k.length < 3 || k.length <= best.length) continue;
    if (n.startsWith(k) || n.endsWith(k) || (key === 'genshin' && n.includes(k)) || (key !== 'genshin' && n.length >= 4 && k.startsWith(n))) best = k;
  }
  return best ? map[best] : '';
}

async function slugFromIndex(key, name, fetchText) {
  const c = load();
  let ix = key === 'hsr' ? c.index : c.idx[key] || null;
  if (!ix || Date.now() - ix.at > INDEX_TTL || !ix.map) {
    const html = await page(fetchText, `${GAMES[key].base}/tier-list`);
    const map = html ? indexFor(key, html) : {};
    if (Object.keys(map).length) {
      ix = { at: Date.now(), map };
      if (key === 'hsr') c.index = ix; else c.idx[key] = ix;
      persist();
    } else if (!ix) return '';
  }
  return bestSlug(ix.map, name, key);
}

async function lookup(key, name, fetchText) {
  const c = load();
  const ck = (slug) => (key === 'hsr' ? slug : `${key}:${slug}`); // (Star Rail entries predate the other games and stay keyed by slug)
  const tryOne = async (slug) => {
    const hit = c.builds[ck(slug)];
    if (hit && Date.now() - hit.at < TTL) return hit.data;
    const miss = c.misses[ck(slug)];
    if (miss && Date.now() - miss < MISS_TTL) return null;
    let html;
    try { html = await page(fetchText, `${GAMES[key].base}/characters/${slug}`); }
    catch (e) { if (hit) return hit.data; throw e; } // stale copy beats an error
    let data = html ? PARSERS[key](html, slug) : null;
    if (data && key === 'genshin') data = await giFinish(data, fetchText).catch(() => data);
    if (data) { c.builds[ck(slug)] = { at: Date.now(), data }; delete c.misses[ck(slug)]; persist(); return data; }
    if (hit) return hit.data;
    c.misses[ck(slug)] = Date.now(); persist();
    return null;
  };
  const guess = guessSlug(name);
  if (guess) { const d = await tryOne(guess); if (d) return d; }
  const slug = await slugFromIndex(key, name, fetchText);
  if (slug && slug !== guess) return tryOne(slug);
  return null;
}

async function getBuild(key, name, fetchText, enabled) {
  try {
    if (!enabled) return { ok: false, reason: 'off' };
    if (!GAMES[key]) return { ok: false, reason: 'unsupported' };
    name = String(name || '').trim();
    if (!name) return { ok: false, reason: 'notfound' };
    const k = `${key}|${norm(name)}`;
    let p = inflight.get(k);
    if (!p) {
      p = lookup(key, name, fetchText).finally(() => inflight.delete(k));
      inflight.set(k, p);
    }
    const data = await p;
    if (!data) return { ok: false, reason: 'notfound' };
    if (key === 'hsr') return await hsrFinish(data, fetchText).catch(() => ({ ...data, tiers: [], sections: [], stats: [] }));
    return data;
  } catch {
    return { ok: false, reason: 'offline' };
  }
}

// ---------- Character trailers ----------
// Every game's fan wiki files the official trailers as video files whose metadata holds the YouTube id, so no
// YouTube search is needed. -> { ok: true, id, title } | { ok: false }
const WIKIS = {
  hsr: { api: 'https://honkai-star-rail.fandom.com/api.php', terms: (n) => [`${n} Character Trailer`], who: (t) => (/^File:(.+?) Character Trailer/.exec(t) || [])[1] },
  zzz: { api: 'https://zenless-zone-zero.fandom.com/api.php', terms: (n) => [`${n} Character Demo`, `${n} Character Teaser`], who: (t) => (/^File:(.+?) Character (?:Demo|Teaser)\b/.exec(t) || [])[1] },
  genshin: { api: 'https://genshin-impact.fandom.com/api.php', terms: (n) => [`Character Demo ${n}`], who: (t) => (/^File:Character (?:Demo|Trailer) - "([^"]+?)[-:]/.exec(t) || [])[1] },
  wuwa: { api: 'https://wutheringwaves.fandom.com/api.php', terms: (n) => [`Resonator Showcase ${n}`], who: (t) => (/^File:Wuthering Waves - Resonator Showcase - (.+?) [—–-]/.exec(t) || [])[1] },
};
const TRAILER_TTL = 14 * DAY;
// "Ellen" on the wiki, "Ellen Joe" in the banner data: the shorter name may be the start of the longer
const sameName = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || (Math.min(x.length, y.length) >= 3 && (x.startsWith(y) || y.startsWith(x)))); };

async function getTrailer(key, name, fetchText) {
  try {
    const W = WIKIS[key];
    name = String(name || '').trim();
    if (!W || !name) return { ok: false };
    const c = load();
    const k = `${key}|${norm(name)}`;
    const hit = c.trailers[k];
    if (hit && Date.now() - hit.at < (hit.id ? TRAILER_TTL : MISS_TTL)) return hit.id ? { ok: true, id: hit.id, title: hit.title } : { ok: false };
    const q = (o) => `${W.api}?${new URLSearchParams({ format: 'json', action: 'query', ...o })}`;
    const titles = [];
    for (const term of W.terms(name)) {
      const found = JSON.parse(await fetchText(q({ list: 'search', srnamespace: '6', srlimit: '12', srsearch: term })));
      for (const x of (found.query || {}).search || []) {
        const who = W.who(x.title);
        if (who && sameName(who, name) && !titles.includes(x.title)) titles.push(x.title);
      }
    }
    let best = null;
    if (titles.length) {
      const j = JSON.parse(await fetchText(q({ titles: titles.slice(0, 5).join('|'), prop: 'imageinfo', iiprop: 'metadata|mime|extmetadata' })));
      for (const p of Object.values((j.query || {}).pages || {})) {
        const ii = (p.imageinfo || [])[0];
        if (!ii || ii.mime !== 'video/youtube') continue;
        const id = String((arr(ii.metadata).find((m) => m.name === 'videoId') || {}).value || '');
        const date = String((((ii.extmetadata || {}).DateTime) || {}).value || '');
        if (/^[\w-]{11}$/.test(id) && (!best || date > best.date)) best = { id, date, title: String(p.title || '').replace(/^File:/, '') };
      }
    }
    c.trailers[k] = { at: Date.now(), id: best ? best.id : '', title: best ? best.title : '' };
    persist();
    return best ? { ok: true, id: best.id, title: best.title } : { ok: false };
  } catch {
    return { ok: false };
  }
}

module.exports = { init, getBuild, getTrailer, parseCharacter, parseIndex, parseZzz, parseWuwa, parseGenshin, rscText, valueAfter, guessSlug, bestSlug, indexFor };
