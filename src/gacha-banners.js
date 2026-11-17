// What is on the banners now and what comes next, for the Gacha page. No account or key is needed:
//   Honkai: Star Rail and Zenless Zone Zero: ennead.cc's game calendar (exact start and end times, with character art).
//   Genshin Impact and Wuthering Waves: the fandom wikis' banner lists (dates only, so times are an estimate), read through
//   the MediaWiki API. Each banner's page names its featured character.
// Every banner comes out in the same shape:
//   { kind: 'char' | 'weapon' | 'chronicled', title, version, start, end, image, featured: [{ name, icon, rarity, sub, id, element, splash, splashFit }], extras: [{ name, rarity }] }
// where start/end are ms (null when the wiki says TBA). splash is a big picture ('' when there is none) and splashFit says how to
// draw it: 'cutout' (transparent full-body art) or 'cover' (a wide painted picture). Each game's entry also has art: the current
// version's key visual (the launcher's background), '' when it could not be read.
const CALENDAR = { hsr: 'https://api.ennead.cc/mihoyo/starrail/calendar', zzz: 'https://api.ennead.cc/mihoyo/zenless/calendar' };
const WIKI = {
  // The wiki gives dates only. Genshin's dates run end-to-start on consecutive days (the end date is the last day of the banner);
  // Wuthering Waves' banners change over on the date itself. The hours are the usual switch times, so countdowns are close, not exact.
  // splashSuffix is the wiki's file name for the big picture: Genshin has a wide wish splash (not a cut-out), Wuthering Waves a full sprite.
  genshin: { host: 'genshin-impact.fandom.com', page: 'Wish/List', iconSuffix: '_Icon.png', iconPrefix: '', splashSuffix: ' Wish.png', splashFit: 'cover', startHour: 3, endHour: 21 },
  // Wuthering Waves: the Convene Still is the full painted scene (2560x1440); the Full Sprite cut-out stands in when a character has none yet.
  wuwa: { host: 'wutheringwaves.fandom.com', page: 'Convene/List', iconSuffix: '.png', iconPrefix: 'Resonator_', splashSuffix: ' Convene Still.png', splashFit: 'cover', splashPos: '50% 30%', altSuffix: ' Full Sprite.png', width: 800, startHour: 3, endHour: 3 },
};
// Star Rail's calendar only has cut-outs; the wiki has each character's 1920x1080 Introduction key art (painted background, name badge
// on the left, the character on the right), looked up by name.
const HSR_WIKI = { host: 'honkai-star-rail.fandom.com', file: (n) => `File:Character_${n.replace(/ /g, '_')}_Introduction.png`, width: 800, pos: '78% 50%' };
const SOON = 5 * 86400000; // banners starting within this long of each other belong to the same "next" phase

// The calendar's element and path codes are the game's own numbers (it only gives codes for Star Rail)
const HSR_ELEMENT = { 1: 'Physical', 2: 'Fire', 4: 'Ice', 8: 'Lightning', 16: 'Wind', 32: 'Quantum', 64: 'Imaginary' };
const HSR_PATH = { 1: 'Destruction', 2: 'Hunt', 3: 'Erudition', 4: 'Harmony', 5: 'Nihility', 6: 'Preservation', 7: 'Abundance', 8: 'Remembrance', 9: 'Elation' };
// The game's ids key the public asset repos, so the big pictures can be built from the id alone
const SPLASH = {
  hsrChar: (id) => `https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/image/character_preview/${id}.png`,
  hsrCone: (id) => `https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/image/light_cone_preview/${id}.png`,
  zzzAgent: (id) => `https://act-webstatic.hoyoverse.com/game_record/zzzv2/role_vertical_painting/role_vertical_painting_${id}.png`,
};

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
    const featured = list.filter((x) => stars(x) === 5 && x.name).map((x) => {
      const id = String(x.id || '');
      // Star Rail sends numeric codes, Zenless sends the words; either way end up with plain words
      const element = key === 'hsr' ? HSR_ELEMENT[x.element] || '' : isNaN(x.element) ? x.element || '' : '';
      const role = key === 'hsr' ? HSR_PATH[x.path] || '' : isNaN(x.profession) ? x.profession || '' : '';
      // (a Zenless W-Engine has no big picture, so it keeps just its icon)
      const splash = !id ? '' : key === 'hsr' ? (kind === 'char' ? SPLASH.hsrChar(id) : SPLASH.hsrCone(id)) : kind === 'char' ? SPLASH.zzzAgent(id) : '';
      return { name: x.name, icon: x.icon || '', rarity: 5, sub: [element, role].filter(Boolean).join(' · '), id, element, splash, splashFit: splash ? 'cutout' : '' };
    });
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
  // (Genshin's version heading carries an id attribute, Wuthering Waves' does not)
  for (const part of block.split(/<th colspan="2"[^>]*>/).slice(1)) {
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
        banners.push({ title: decodeURIComponent(a[1]).replace(/_/g, ' ').split('/')[0], name: decode(a[2]), image: decode(img).replace(/scale-to-width-down\/\d+/, 'scale-to-width-down/1280') });
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

// Direct picture addresses for each character's icon file and big splash file (the wiki's own Special:FilePath links refuse to
// load outside the wiki). One call asks for both files of every name, at 1280 wide; the wiki hands back the original when it is smaller.
// -> { [name]: { icon, splash } }, '' for a file the wiki does not have
async function wikiImages(cfg, names, fetchJson) {
  const out = {};
  if (!names.length) return out;
  const iconFile = (n) => `File:${(cfg.iconPrefix + n + cfg.iconSuffix).replace(/ /g, '_')}`;
  const splashFile = (n) => `File:${(n + cfg.splashSuffix).replace(/ /g, '_')}`;
  const altFile = (n) => (cfg.altSuffix ? `File:${(n + cfg.altSuffix).replace(/ /g, '_')}` : '');
  // The API takes at most 50 titles a call, so cap the names rather than lose the whole answer
  const list = names.slice(0, cfg.altSuffix ? 16 : 25);
  const titles = list.flatMap((n) => [iconFile(n), splashFile(n), altFile(n)].filter(Boolean));
  const j = await fetchJson(`https://${cfg.host}/api.php?action=query&prop=imageinfo&iiprop=url&iiurlwidth=${cfg.width || 1280}&format=json&titles=${titles.map(encodeURIComponent).join('%7C')}`);
  const byTitle = {};
  for (const p of Object.values((j.query && j.query.pages) || {})) {
    const info = p.imageinfo && p.imageinfo[0];
    if (info) byTitle[p.title.replace(/_/g, ' ')] = info.thumburl || info.url;
  }
  const got = (f) => (f ? byTitle[f.replace(/_/g, ' ')] || '' : '');
  for (const n of list) {
    const main = got(splashFile(n)), alt = got(altFile(n));
    // No still yet: the cut-out takes its place (and is drawn as a cut-out)
    out[n] = main ? { icon: got(iconFile(n)), splash: main, splashFit: cfg.splashFit, splashPos: cfg.splashPos || '', splashAlt: alt }
      : { icon: got(iconFile(n)), splash: alt, splashFit: alt ? 'cutout' : '', splashPos: '', splashAlt: '' };
  }
  return out;
}

// Star Rail's Introduction art for each character name -> { [name]: url }, only for the files the wiki has. Any failure is {} and the
// calendar's cut-outs are shown as they were.
async function hsrIntros(names, fetchJson) {
  const out = {};
  const list = [...new Set(names)].slice(0, 40);
  if (!list.length) return out;
  const j = await fetchJson(`https://${HSR_WIKI.host}/api.php?action=query&prop=imageinfo&iiprop=url&iiurlwidth=${HSR_WIKI.width}&format=json&titles=${list.map((n) => encodeURIComponent(HSR_WIKI.file(n))).join('%7C')}`);
  const byTitle = {};
  for (const p of Object.values((j.query && j.query.pages) || {})) {
    const info = p.imageinfo && p.imageinfo[0];
    if (info) byTitle[p.title.replace(/_/g, ' ')] = info.thumburl || info.url;
  }
  for (const n of list) { const u = byTitle[HSR_WIKI.file(n).replace(/_/g, ' ')]; if (u) out[n] = u; }
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
  let images = {};
  try { images = await wikiImages(cfg, [...new Set(Object.values(who).map((w) => w.name).filter(Boolean))], fetchJson); } catch { /* a letter stands in for the picture */ }
  const pics = (name) => images[name] || { icon: '', splash: '', splashFit: '', splashPos: '', splashAlt: '' };
  const make = (ver) => ver.rows.flatMap((r) => r.banners.map((b) => {
    // The page's own type wins: Genshin lists its weapon banner in the "Character Event" row
    const info = who[b.title] || { name: '', type: '' };
    const label = info.type || r.type;
    const kind = /weapon/i.test(label) || (!info.name && /epitome|reverbs/i.test(b.title)) ? 'weapon' : /chronicled/i.test(label) ? 'chronicled' : 'char';
    const name = kind === 'char' ? info.name : '';
    return { kind, title: b.name, version: ver.version, start: ver.start, end: ver.end, approx: true, image: b.image, featured: name ? [{ name, icon: pics(name).icon, rarity: 5, sub: '', id: '', element: '', splash: pics(name).splash, splashFit: pics(name).splashFit, splashPos: pics(name).splashPos, splashAlt: pics(name).splashAlt }] : [], extras: [] };
  }));
  const cur = current.flatMap(make);
  // Upcoming versions are listed soonest first; a "TBA" one has no dates yet but is still worth a mention
  const nextVer = upcoming.find((v) => v.start && v.start > now) || upcoming.find((v) => !v.start) || null;
  return { current: cur, next: nextVer ? make(nextVer) : [] };
}

// ---------- Key art ----------
// The launchers' current background picture for each game, used as the page backdrop. Pure decoration, so every failure is ''.
// -> { hsr, genshin, zzz, wuwa }
async function keyArt(fetchJson) {
  const art = { hsr: '', genshin: '', zzz: '', wuwa: '' };
  await Promise.all([
    (async () => {
      // One HoYoPlay call covers all three HoYoverse games (same launcher id as game-updates.js)
      try {
        const biz = { hkrpg_global: 'hsr', hk4e_global: 'genshin', nap_global: 'zzz' };
        const j = await fetchJson('https://sg-hyp-api.hoyoverse.com/hyp/hyp-connect/api/getAllGameBasicInfo?launcher_id=VYTpXlbWo8&language=en-us');
        for (const g of (j && j.data && j.data.game_info_list) || []) {
          const k = biz[g && g.game && g.game.biz];
          const bg = g && g.backgrounds && g.backgrounds[0] && g.backgrounds[0].background;
          if (k && bg && bg.url) art[k] = String(bg.url);
        }
      } catch { /* no backdrop picture for the HoYoverse games */ }
    })(),
    (async () => {
      // Kuro's launcher names the background in one file and keeps its picture list in another
      try {
        const base = 'https://prod-alicdn-gamestarter.kurogame.com/launcher';
        const idx = await fetchJson(`${base}/launcher/50004_obOHXFrFanqsaIEOmuKroCcbZkQRBC7c/G153/index.json`);
        const code = idx && idx.functionCode && idx.functionCode.background;
        if (code) {
          const bg = await fetchJson(`${base}/50004_obOHXFrFanqsaIEOmuKroCcbZkQRBC7c/G153/background/${code}/en.json`);
          if (bg && bg.firstFrameImage) art.wuwa = String(bg.firstFrameImage);
        }
      } catch { /* no backdrop picture for Wuthering Waves */ }
    })(),
  ]);
  return art;
}

// ---------- Both ----------
// -> { [key]: { at, version, art, current: [banner], next: [banner] } }; a game that could not be read is left out
async function fetchAll(fetchJson, now = Date.now()) {
  const out = {};
  const artP = keyArt(fetchJson).catch(() => ({}));
  await Promise.all(['hsr', 'zzz'].map(async (key) => {
    try {
      const all = fromCalendar(key, await fetchJson(CALENDAR[key]), now).sort((a, b) => a.start - b.start);
      // The calendar overlaps old and new phases: of each kind, keep the phase that started last
      const started = all.filter((b) => b.start <= now);
      const latest = (kind) => Math.max(0, ...started.filter((b) => b.kind === kind).map((b) => b.start));
      const current = started.filter((b) => b.start >= latest(b.kind) - SOON);
      const future = all.filter((b) => b.start > now);
      const next = future.filter((b) => b.start - future[0].start < SOON);
      if (key === 'hsr') {
        // Swap each character's cut-out for the wiki's full key art where there is one; the cut-out stays as splashAlt
        const chars = all.filter((b) => b.kind === 'char').flatMap((b) => b.featured);
        let intros = {};
        try { intros = await hsrIntros(chars.map((f) => f.name), fetchJson); } catch { /* the cut-outs stay */ }
        for (const f of chars) if (intros[f.name]) { f.splashAlt = f.splash; f.splash = intros[f.name]; f.splashFit = 'cover'; f.splashPos = HSR_WIKI.pos; }
      }
      if (all.length) out[key] = { at: now, version: current.length ? current[current.length - 1].version : '', current, next };
    } catch { /* offline, or the calendar is down */ }
  }));
  await Promise.all(Object.keys(WIKI).map(async (key) => {
    try {
      const r = await fromWiki(key, now, fetchJson);
      if (r.current.length || r.next.length) out[key] = { at: now, version: r.current.length ? r.current[0].version : '', ...r };
    } catch {}
  }));
  const art = await artP;
  for (const key of Object.keys(out)) { out[key].art = art[key] || ''; out[key].sv = SHAPE; }
  return out;
}

// Bump when the banner data gains fields the page needs: saved data with an older stamp is fetched again at once,
// instead of showing the old cut-out art for up to two hours.
const SHAPE = 4;

module.exports = { fetchAll, fromCalendar, wikiSection, keyArt, SHAPE };
