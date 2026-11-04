// What is on the banners now and what comes next, for the Gacha page. No account or key is needed:
//   Honkai: Star Rail and Zenless Zone Zero: ennead.cc's game calendar (exact start and end times, with character art).
//   Genshin Impact and Wuthering Waves: the fandom wikis' banner lists (dates only, so times are an estimate), read through
//   the MediaWiki API. Each banner's page names its featured character.
// Every banner comes out in the same shape:
//   { kind: 'char' | 'weapon' | 'chronicled', title, version, start, end, image, featured: [{ name, icon, rarity }], extras: [{ name, rarity }] }
// where start/end are ms (null when the wiki says TBA).
const CALENDAR = { hsr: 'https://api.ennead.cc/mihoyo/starrail/calendar', zzz: 'https://api.ennead.cc/mihoyo/zenless/calendar' };
const WIKI = {
  // The wiki gives dates only. Genshin's dates run end-to-start on consecutive days (the end date is the last day of the banner);
  // Wuthering Waves' banners change over on the date itself. The hours are the usual switch times, so countdowns are close, not exact.
  genshin: { host: 'genshin-impact.fandom.com', page: 'Wish/List', iconSuffix: '_Icon.png', iconPrefix: '', startHour: 3, endHour: 21 },
  wuwa: { host: 'wutheringwaves.fandom.com', page: 'Convene/List', iconSuffix: '.png', iconPrefix: 'Resonator_', startHour: 3, endHour: 3 },
};
const SOON = 5 * 86400000; // banners starting within this long of each other belong to the same "next" phase

// ---------- Star Rail and Zenless: the calendar ----------
function fromCalendar(key, j, now) {
  const out = [];
  for (const b of (j && j.banners) || []) {
    const start = (b.start_time || 0) * 1000, end = (b.end_time || 0) * 1000;
    if (!start || !end || end <= now) continue;
    let kind, list;
    if (key === 'hsr') { list = (b.characters || []).length ? b.characters : b.light_cones || []; kind = (b.characters || []).length ? 'char' : 'weapon'; }
    else { list = (b.agents || []).length ? b.agents : b.w_engines || []; kind = (b.agents || []).length ? 'char' : 'weapon'; }
    const stars = (x) => (x.rarity === 'S' ? 5 : x.rarity === 'A' ? 4 : Number(x.rarity) || 0);
    // (Zenless lists a W-Engine with no name while it is unannounced)
    const featured = list.filter((x) => stars(x) === 5 && x.name).map((x) => ({ name: x.name, icon: x.icon || '', rarity: 5, sub: x.profession || x.element ? [x.element, x.profession].filter((v) => v && isNaN(v)).join(' · ') : '' }));
    if (!featured.length) continue;
    out.push({ kind, title: featured.map((f) => f.name).join(' & '), version: String(b.version || ''), start, end, image: '', featured, extras: list.filter((x) => stars(x) < 5).map((x) => ({ name: x.name, rarity: stars(x) })) });
  }
  return out;
}

// ---------- Genshin and Wuthering Waves: the wiki ----------
const decode = (s) => String(s).replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#8212;|&mdash;/g, '—').replace(/&nbsp;/g, ' ');
const text = (h) => decode(h.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

// "October 13, 2026" -> ms, at the hour the game usually switches banners (the wiki gives only the date); null for "TBA"
function wikiDate(s, hour) {
  const t = Date.parse(`${String(s).trim()} UTC`);
  return Number.isFinite(t) ? t + hour * 3600000 : null;
}

// One section of the list page ("Current" or "Upcoming") -> [{ version, start, end, rows: [{ type, banners: [{ title, name, image }] }] }]
function wikiSection(html, id, startHour, endHour) {
  const from = html.indexOf(`id="${id}"`);
  if (from < 0) return [];
  const rest = html.slice(from);
  const stop = rest.indexOf('<span class="mw-headline" id="', 10); // the section ends at the next heading, whatever it is
  const block = stop > 0 ? rest.slice(0, stop) : rest;
  const out = [];
  for (const part of block.split('<th colspan="2">').slice(1)) {
    const head = text(part.slice(0, part.indexOf('</th>')));
    const m = head.match(/^Version\s+(.+?)\s*:\s*(.+?)\s*—\s*(.+)$/);
    if (!m) continue;
    const rows = [];
    for (const row of part.split('<tr>').slice(1)) {
      const cells = row.split(/<\/td><td>/);
      if (cells.length < 2) continue;
      const banners = [];
      // Each banner is a <div> (with a picture) or an <li> (without); the link whose text is not empty carries its name
      for (const chunk of cells[1].split(/<div>|<li>/).slice(1)) {
        const a = [...chunk.matchAll(/<a href="\/wiki\/([^"]+)"[^>]*>([^<]+)<\/a>/g)][0];
        if (!a) continue;
        const img = (chunk.match(/data-src="(https:[^"]+)"/) || chunk.match(/<img[^>]+src="(https:[^"]+)"/) || [])[1] || '';
        banners.push({ title: decodeURIComponent(a[1]).replace(/_/g, ' ').split('/')[0], name: decode(a[2]), image: decode(img).replace(/scale-to-width-down\/\d+/, 'scale-to-width-down/640') });
      }
      if (banners.length) rows.push({ type: text(cells[0]), banners });
    }
    out.push({ version: m[1], start: wikiDate(m[2], startHour), end: wikiDate(m[3], endHour), rows });
  }
  return out;
}

// The featured character in a banner page's infobox: |character = Skirk (Genshin) or |resonator = Suoming (Wuthering Waves)
async function wikiFeatured(cfg, titles, fetchJson) {
  const found = {};
  if (!titles.length) return found;
  const url = `https://${cfg.host}/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&titles=${titles.map(encodeURIComponent).join('%7C')}`;
  const j = await fetchJson(url);
  for (const p of Object.values((j.query && j.query.pages) || {})) {
    const w = p.revisions && p.revisions[0] && p.revisions[0].slots && p.revisions[0].slots.main && p.revisions[0].slots.main['*'];
    const m = w && w.match(/\|\s*(?:character|resonator)\s*=\s*([^\n|}]+)/i);
    const t = w && w.match(/\|\s*type\s*=\s*([^\n|}]+)/i);
    if (w) found[p.title] = { name: m ? m[1].trim() : '', type: t ? t[1].trim() : '' };
  }
  return found;
}

// Direct picture addresses for the characters' icon files (the wiki's own Special:FilePath links refuse to load outside the wiki)
async function wikiIcons(cfg, names, fetchJson) {
  const out = {};
  if (!names.length) return out;
  const file = (n) => `File:${(cfg.iconPrefix + n + cfg.iconSuffix).replace(/ /g, '_')}`;
  const j = await fetchJson(`https://${cfg.host}/api.php?action=query&prop=imageinfo&iiprop=url&iiurlwidth=160&format=json&titles=${names.map((n) => encodeURIComponent(file(n))).join('%7C')}`);
  const byTitle = {};
  for (const p of Object.values((j.query && j.query.pages) || {})) {
    const info = p.imageinfo && p.imageinfo[0];
    if (info) byTitle[p.title.replace(/_/g, ' ')] = info.thumburl || info.url;
  }
  for (const n of names) out[n] = byTitle[file(n).replace(/_/g, ' ')] || '';
  return out;
}

async function fromWiki(key, now, fetchJson) {
  const cfg = WIKI[key];
  const j = await fetchJson(`https://${cfg.host}/api.php?action=parse&page=${encodeURIComponent(cfg.page)}&prop=text&format=json&redirects=1`);
  const html = j && j.parse && j.parse.text && j.parse.text['*'];
  if (!html) throw new Error('no page');
  const current = wikiSection(html, 'Current', cfg.startHour, cfg.endHour), upcoming = wikiSection(html, 'Upcoming', cfg.startHour, cfg.endHour);
  const titles = [...new Set([...current, ...upcoming].flatMap((v) => v.rows).flatMap((r) => r.banners.map((b) => b.title)))].slice(0, 30);
  let who = {};
  try { who = await wikiFeatured(cfg, titles, fetchJson); } catch { /* the banners still show, just without the character */ }
  let icons = {};
  try { icons = await wikiIcons(cfg, [...new Set(Object.values(who).map((w) => w.name).filter(Boolean))], fetchJson); } catch { /* a letter stands in for the picture */ }
  const icon = (name) => icons[name] || '';
  const make = (ver) => ver.rows.flatMap((r) => r.banners.map((b) => {
    // The page's own type wins: Genshin lists its weapon banner in the "Character Event" row
    const info = who[b.title] || { name: '', type: '' };
    const label = info.type || r.type;
    const kind = /weapon/i.test(label) || (!info.name && /epitome/i.test(b.title)) ? 'weapon' : /chronicled/i.test(label) ? 'chronicled' : 'char';
    const name = kind === 'char' ? info.name : '';
    return { kind, title: b.name, version: ver.version, start: ver.start, end: ver.end, approx: true, image: b.image, featured: name ? [{ name, icon: icon(name), rarity: 5, sub: '' }] : [], extras: [] };
  }));
  const cur = current.flatMap(make);
  // Upcoming versions are listed soonest first; a "TBA" one has no dates yet but is still worth a mention
  const nextVer = upcoming.find((v) => v.start && v.start > now) || upcoming.find((v) => !v.start) || null;
  return { current: cur, next: nextVer ? make(nextVer) : [] };
}

// ---------- Both ----------
// -> { [key]: { at, version, current: [banner], next: [banner] } }; a game that could not be read is left out
async function fetchAll(fetchJson, now = Date.now()) {
  const out = {};
  await Promise.all(['hsr', 'zzz'].map(async (key) => {
    try {
      const all = fromCalendar(key, await fetchJson(CALENDAR[key]), now).sort((a, b) => a.start - b.start);
      // The calendar overlaps old and new phases: of each kind, keep the phase that started last
      const started = all.filter((b) => b.start <= now);
      const latest = (kind) => Math.max(0, ...started.filter((b) => b.kind === kind).map((b) => b.start));
      const current = started.filter((b) => b.start >= latest(b.kind) - SOON);
      const future = all.filter((b) => b.start > now);
      const next = future.filter((b) => b.start - future[0].start < SOON);
      if (all.length) out[key] = { at: now, version: current.length ? current[current.length - 1].version : '', current, next };
    } catch { /* offline, or the calendar is down */ }
  }));
  await Promise.all(Object.keys(WIKI).map(async (key) => {
    try {
      const r = await fromWiki(key, now, fetchJson);
      if (r.current.length || r.next.length) out[key] = { at: now, version: r.current.length ? r.current[0].version : '', ...r };
    } catch {}
  }));
  return out;
}

module.exports = { fetchAll, fromCalendar, wikiSection };
