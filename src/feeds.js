// Online data for the Barça tab and the per-game news. Everything here is a free, key-less source:
// ESPN's public site API (fixtures, results, table, squad), a few RSS feeds (news), HoYoverse's launcher feed
// (HSR / Genshin / ZZZ announcements and banners) and Steam's public news API.
// Responses are cached on disk so pages open instantly and still work offline.
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Nexus/1.0';
const BARCA_ID = '83';
const ESPN = 'https://site.api.espn.com/apis';
const COMPETITIONS = [
  { slug: 'esp.1', label: 'La Liga', short: 'LL', color: '#ee3f58' },
  { slug: 'uefa.champions', label: 'Champions League', short: 'UCL', color: '#4d7cff' },
  { slug: 'esp.copa_del_rey', label: 'Copa del Rey', short: 'CDR', color: '#e0b84a' },
  { slug: 'esp.super_cup', label: 'Supercopa', short: 'SC', color: '#34c38f' },
];
const NEWS_FEEDS = [
  { source: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/football/teams/barcelona/rss.xml' },
  { source: 'BarcaBlog', url: 'https://barcablog.com/feed' },
  { source: 'Google News', url: 'https://news.google.com/rss/search?q=%22FC+Barcelona%22&hl=en&gl=US&ceid=US:en', splitSource: true },
  { source: 'Google News', url: 'https://news.google.com/rss/search?q=Bar%C3%A7a+Lamine+Yamal+OR+Flick&hl=en&gl=US&ceid=US:en', splitSource: true },
];

// HoYoPlay launcher feed ids (global launcher)
const HOYO = { 'hoyo:hkrpg_global': '4ziysqXOQ8', 'hoyo:hk4e_global': 'gopR6Cufr3', 'hoyo:nap_global': 'U5hbdsT9W7' };
const HOYO_LAUNCHER = 'VYTpXlbWo8';
const STEAM_APP_FOR = { 'kuro:wuwa': '3513350' }; // Wuthering Waves has a Steam news feed even when played through Kuro's launcher

let cacheFile = null;
let cache = {};
let saveTimer = null;

function init(dir) {
  cacheFile = path.join(dir, 'feed-cache.json');
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { cache = {}; }
}

function saveSoon() {
  if (!cacheFile) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { fs.writeFileSync(cacheFile, JSON.stringify(cache)); } catch {} }, 1500);
}

async function getText(url, ms = 12000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': UA, Accept: '*/*' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(timer); }
}
const getJson = async (url, ms) => JSON.parse(await getText(url, ms));

// ---------- small helpers ----------
const decode = (s) => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');
const stripHtml = (s) => decode(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (block, name) => { const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i')); return m ? m[1] : ''; };
const attr = (block, name, a) => { const m = block.match(new RegExp(`<${name}[^>]*\\s${a}="([^"]+)"`, 'i')); return m ? decode(m[1]) : ''; };
const normTitle = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function parseRss(xml, feed) {
  const out = [];
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const b = m[0];
    let title = stripHtml(tag(b, 'title'));
    let source = feed.source;
    if (feed.splitSource) { // Google News titles end with " - Publisher"
      const i = title.lastIndexOf(' - ');
      if (i > 0) { source = title.slice(i + 3); title = title.slice(0, i); }
    }
    const link = stripHtml(tag(b, 'link')) || attr(b, 'link', 'href');
    const date = Date.parse(stripHtml(tag(b, 'pubDate')) || stripHtml(tag(b, 'dc:date')) || '');
    const body = tag(b, 'content:encoded') || tag(b, 'description');
    const imgMatch = decode(body).match(/<img[^>]+src=["']([^"']+)["']/i);
    const image = attr(b, 'media:thumbnail', 'url') || attr(b, 'media:content', 'url') || attr(b, 'enclosure', 'url') || (imgMatch ? imgMatch[1] : '');
    if (!title || !link) continue;
    out.push({
      title, url: link, date: Number.isFinite(date) ? date : 0, source, googleFeed: !!feed.splitSource,
      summary: feed.splitSource ? '' : stripHtml(tag(b, 'description')).slice(0, 220),
      image: /^https:\/\//.test(image) ? image : '',
    });
  }
  return out;
}

// ---------- Barça ----------
const scoreOf = (c) => (c.score && typeof c.score === 'object' ? c.score.displayValue : c.score) ?? '';

function normEvent(e, comp) {
  const c = e.competitions && e.competitions[0];
  if (!c) return null;
  const side = (ha) => {
    const x = c.competitors.find((k) => k.homeAway === ha);
    if (!x) return null;
    const t = x.team || {};
    return {
      id: String(t.id || ''), name: t.displayName || t.name || '?', short: t.abbreviation || (t.displayName || '?').slice(0, 3).toUpperCase(),
      logo: (t.logos && t.logos[0] && t.logos[0].href) || t.logo || '', score: scoreOf(x), winner: !!x.winner,
    };
  };
  const st = (c.status && c.status.type) || {};
  const tv = [...new Set((c.broadcasts || []).map((b) => b.media && b.media.shortName).filter(Boolean))];
  return {
    id: String(e.id), date: Date.parse(e.date), comp: comp.label, compShort: comp.short, compColor: comp.color,
    round: (e.seasonType && e.seasonType.name) || '', state: st.state || 'pre', status: st.shortDetail || st.description || '',
    clock: (c.status && c.status.displayClock) || '', home: side('home'), away: side('away'),
    venue: (c.venue && c.venue.fullName) || '', tv,
  };
}

async function fetchCompetition(comp) {
  const base = `${ESPN}/site/v2/sports/soccer/${comp.slug}/teams/${BARCA_ID}/schedule`;
  const [past, next] = await Promise.allSettled([getJson(base), getJson(`${base}?fixture=true`)]);
  const events = [];
  for (const r of [past, next]) if (r.status === 'fulfilled') for (const e of r.value.events || []) { const n = normEvent(e, comp); if (n && n.home && n.away) events.push(n); }
  return events;
}

function statMap(entry) {
  const m = {};
  for (const s of entry.stats || []) m[s.name] = s.value;
  return {
    rank: m.rank, played: m.gamesPlayed, won: m.wins, drawn: m.ties, lost: m.losses,
    gf: m.pointsFor, ga: m.pointsAgainst, gd: m.pointDifferential, points: m.points,
  };
}

async function fetchStandings(slug) {
  const j = await getJson(`${ESPN}/v2/sports/soccer/${slug}/standings`);
  const group = (j.children && j.children[0] && j.children[0].standings) || j.standings;
  const rows = ((group && group.entries) || []).map((en) => ({
    id: String(en.team.id), name: en.team.displayName, logo: (en.team.logos && en.team.logos[0] && en.team.logos[0].href) || '', ...statMap(en),
  })).filter((r) => r.rank !== undefined).sort((a, b) => a.rank - b.rank);
  return rows;
}

async function fetchRoster() {
  const j = await getJson(`${ESPN}/site/v2/sports/soccer/esp.1/teams/${BARCA_ID}/roster`);
  let list = j.athletes || [];
  if (list.length && list[0].items) list = list.flatMap((g) => g.items); // grouped by position in some responses
  return list.map((a) => ({
    name: a.displayName || a.fullName, jersey: a.jersey || '', pos: (a.position && (a.position.abbreviation || a.position.name)) || '',
    posName: (a.position && a.position.displayName) || '', age: a.age || null, country: a.citizenship || (a.flag && a.flag.alt) || '',
    photo: (a.headshot && a.headshot.href) || '', url: ((a.links || []).find((l) => (l.rel || []).includes('playercard')) || {}).href || '',
  })).filter((p) => p.name);
}

async function fetchBarcaNews() {
  const results = await Promise.allSettled(NEWS_FEEDS.map(async (f) => parseRss(await getText(f.url), f)));
  const all = [];
  for (const r of results) if (r.status === 'fulfilled') all.push(...r.value);
  try { // ESPN's league news, filtered down to Barcelona stories
    const j = await getJson(`${ESPN}/site/v2/sports/soccer/esp.1/news`);
    for (const a of j.articles || []) {
      if (!/barcelona|bar[cç]a|lamine|yamal|flick|raphinha|pedri/i.test(`${a.headline} ${a.description}`)) continue;
      const img = (a.images || []).find((i) => i.url);
      all.push({ title: a.headline, url: (a.links && a.links.web && a.links.web.href) || '', date: Date.parse(a.published), source: 'ESPN', summary: a.description || '', image: img ? img.url : '' });
    }
  } catch { /* ESPN news is a bonus */ }
  const seen = new Set();
  const onTopic = (n) => !n.googleFeed || /barcelona|bar[cç]a|blaugrana|flick|yamal|lewandowski|pedri|raphinha|gavi|camp nou|de jong|koundé|kounde|araujo|ter stegen|szczesny|fermín|fermin|olmo/i.test(n.title);
  return all.filter((n) => n.url && n.title && onTopic(n) && !seen.has(normTitle(n.title)) && seen.add(normTitle(n.title)))
    .sort((a, b) => (b.date || 0) - (a.date || 0)).slice(0, 40);
}

const BARCA_TTL = 10 * 60000;
const BARCA_LIVE_TTL = 45000;
let barcaInflight = null;

function cachedBarca() { return cache.barca ? cache.barca.data : null; }

async function getBarca(force) {
  const c = cache.barca;
  const live = c && c.data.matches.some((m) => m.state === 'in');
  const ttl = live ? BARCA_LIVE_TTL : BARCA_TTL;
  if (c && !force && Date.now() - c.t < ttl) return c.data;
  if (barcaInflight) return barcaInflight;
  barcaInflight = (async () => {
    try {
      const [comps, liga, ucl, roster, news] = await Promise.allSettled([
        Promise.all(COMPETITIONS.map((k) => fetchCompetition(k).catch(() => []))),
        fetchStandings('esp.1'), fetchStandings('uefa.champions'), fetchRoster(), fetchBarcaNews(),
      ]);
      const prev = (c && c.data) || {};
      const matches = comps.status === 'fulfilled' ? comps.value.flat() : (prev.matches || []);
      const byId = new Map();
      for (const m of matches) byId.set(m.id, m); // a match can show up in both the past and fixture lists
      const data = {
        updated: Date.now(),
        matches: [...byId.values()].sort((a, b) => a.date - b.date),
        standings: { liga: liga.status === 'fulfilled' ? liga.value : prev.standings && prev.standings.liga || [], ucl: ucl.status === 'fulfilled' ? ucl.value : prev.standings && prev.standings.ucl || [] },
        roster: roster.status === 'fulfilled' && roster.value.length ? roster.value : prev.roster || [],
        news: news.status === 'fulfilled' && news.value.length ? news.value : prev.news || [],
        competitions: COMPETITIONS.map(({ label, short, color }) => ({ label, short, color })),
      };
      if (!data.matches.length && !data.news.length && !data.roster.length) throw new Error('offline');
      cache.barca = { t: Date.now(), data };
      saveSoon();
      return data;
    } finally { barcaInflight = null; }
  })();
  return barcaInflight;
}

// ---------- Game news ----------
const UPDATE_RE = /\b(update|patch|hotfix|hot fix|version|changelog|release notes|maintenance|v?\d+\.\d+(\.\d+)?)\b/i;

async function steamNews(appid) {
  const j = await getJson(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${appid}&count=8&maxlength=420`);
  return ((j.appnews && j.appnews.newsitems) || []).map((n) => ({
    id: `s${n.gid}`, title: stripHtml(n.title), url: n.url, date: (n.date || 0) * 1000, label: n.feedlabel || 'Steam',
    text: stripHtml(String(n.contents || '').replace(/\{STEAM_CLAN_IMAGE\}\S*/g, '').replace(/\[[^\]]*\]/g, ' ')).slice(0, 260),
    isUpdate: UPDATE_RE.test(n.title),
  }));
}

async function hoyoNews(gameId) {
  const j = await getJson(`https://sg-hyp-api.hoyoverse.com/hyp/hyp-connect/api/getGameContent?launcher_id=${HOYO_LAUNCHER}&game_id=${gameId}&language=en-us`);
  const content = (j.data && j.data.content) || {};
  const typeLabel = { POST_TYPE_ANNOUNCE: 'Announcement', POST_TYPE_ACTIVITY: 'Event', POST_TYPE_INFO: 'News' };
  const items = (content.posts || []).map((p, i) => ({
    id: `h${normTitle(p.title).slice(0, 60)}`, title: stripHtml(p.title), url: p.link, date: 0, order: i, label: typeLabel[p.type] || 'News', text: '',
    isUpdate: /update|version|maintenance/i.test(p.title) && !/preview|trailer/i.test(p.title),
  }));
  const versions = items.map((p) => (p.title.match(/Version\s+(\d+\.\d+)/i) || [])[1]).filter(Boolean);
  const banners = (content.banners || []).map((b) => ({ image: b.image && b.image.url, url: b.image && b.image.link })).filter((b) => b.image);
  return { items, banners, version: versions[0] || '' };
}

const NEWS_TTL = 30 * 60000;

// `games`: [{ id, name }]. Returns { updated, byGame: { id: { items, banners, version } } }
async function getGameNews(games, force) {
  cache.news = cache.news || { t: 0, byGame: {} };
  const out = cache.news.byGame;
  const jobs = [];
  for (const g of games) {
    const hoyo = HOYO[g.id];
    const appid = STEAM_APP_FOR[g.id] || (g.id.startsWith('steam:') ? g.id.slice(6) : null);
    if (!hoyo && !appid) continue;
    const fresh = out[g.id] && Date.now() - out[g.id].t < NEWS_TTL;
    if (fresh && !force) continue;
    jobs.push((async () => {
      try {
        const data = hoyo ? await hoyoNews(hoyo) : { items: await steamNews(appid), banners: [], version: '' };
        out[g.id] = { t: Date.now(), ...data };
      } catch { /* keep whatever we had */ }
    })());
  }
  // a few at a time, so a big Steam library does not fire dozens of requests at once
  for (let i = 0; i < jobs.length; i += 6) await Promise.all(jobs.slice(i, i + 6));
  cache.news.t = Date.now();
  saveSoon();
  const byGame = {};
  for (const g of games) if (out[g.id]) byGame[g.id] = out[g.id];
  return { updated: cache.news.t, byGame };
}

const cachedNews = () => (cache.news ? cache.news.byGame : {});

module.exports = { init, getBarca, cachedBarca, getGameNews, cachedNews, COMPETITIONS };
