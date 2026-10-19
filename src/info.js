// Looks up cover art, descriptions and in-game screenshots for games from public web sources:
//   Steam store API  ->  Wikipedia  ->  Bing Images (searched in a hidden browser window)
// Google Images isn't used: it blocks automated visitors and shows consent walls in Europe.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout: ${what}`)), ms))]);
const norm = (s) => s.toLowerCase().replace(/[®™©:'’.\-–!]/g, '').replace(/\s+/g, ' ').trim();
// Names like "Honkai: Star Rail" or "Rocket League®" search better without punctuation
const searchName = (name) => name.replace(/[®™©:]/g, ' ').replace(/\s+/g, ' ').trim();
const decode = (s) => String(s || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// True if the URL really serves an image (covers saved from a bad URL would otherwise stay blank forever)
async function verifyImage(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
    return res.ok && /^image\//i.test(res.headers.get('content-type') || '');
  } catch { return false; }
}

// ---------- Steam ----------
// Same matcher as the scanner: exact name, or the same name plus up to 3 extra characters
async function findSteamId(name) {
  try {
    const data = await getJson(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(name)}&cc=US&l=english`);
    const n = norm(name);
    const hit = (data.items || []).find((i) => {
      const r = norm(i.name);
      return r === n || (r.startsWith(n + ' ') && r.length - n.length <= 3);
    });
    return hit ? hit.id : null;
  } catch { return null; }
}

// Real image paths for many games at once. (Building the URL by hand 404s for newer games: each has a hashed folder.)
async function steamStoreArt(appids) {
  const out = {};
  const ids = [...new Set(appids)];
  for (let i = 0; i < ids.length; i += 25) {
    const chunk = ids.slice(i, i + 25);
    const input = { ids: chunk.map((appid) => ({ appid })), context: { language: 'english', country_code: 'US' }, data_request: { include_assets: true } };
    try {
      const j = await getJson(`https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=${encodeURIComponent(JSON.stringify(input))}`);
      for (const it of (j.response && j.response.store_items) || []) {
        const a = it.assets;
        if (!a || !a.asset_url_format) continue;
        const url = (file) => file && `https://shared.akamai.steamstatic.com/store_item_assets/${a.asset_url_format.replace('${FILENAME}', file)}`;
        out[it.appid] = { cover: url(a.library_capsule), header: url(a.header), hero: url(a.library_hero) };
      }
    } catch {}
  }
  return out;
}

async function steamDetails(appid) {
  try {
    const data = await getJson(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=english`);
    const d = data[appid] && data[appid].success && data[appid].data;
    if (!d) return null;
    return {
      source: 'Steam',
      description: decode(d.short_description),
      genres: (d.genres || []).map((g) => g.description),
      developers: d.developers || [],
      publishers: d.publishers || [],
      release: d.release_date && !d.release_date.coming_soon ? d.release_date.date : null,
      website: d.website || null,
      header: d.header_image || null,
      screenshots: (d.screenshots || []).slice(0, 12).map((s) => ({ thumb: s.path_thumbnail, full: s.path_full })),
      storeUrl: `https://store.steampowered.com/app/${appid}`,
    };
  } catch { return null; }
}

// ---------- Wikipedia ----------
const wikiUrl = (u) => (u.startsWith('//') ? `https:${u}` : u);

// Pictures from the article: cover art plus gameplay shots (logos, people and hardware photos are skipped)
function wikiImages(items) {
  const imgs = (items || []).filter((i) => i.type === 'image' && i.srcset && i.srcset.length && !/\.svg$/i.test(i.title || ''))
    .map((i) => ({
      title: i.title || '',
      caption: (i.caption && i.caption.text) || '',
      thumb: wikiUrl(i.srcset[0].src),
      full: wikiUrl(i.srcset[i.srcset.length - 1].src),
    }));
  const isCover = (i) => /cover|box.?art|poster/i.test(i.title);
  const isJunk = (i) => /gdc|award|e3|controller|crowd|convention|interview|staff|logo|icon|portrait/i.test(i.title + ' ' + i.caption);
  // Infobox cover art has a file name like "…cover…", or at least no caption (gameplay screenshots have captions)
  const cover = imgs.find(isCover) || imgs.find((i) => !i.caption && !isJunk(i));
  return {
    cover: cover ? cover.full : null,
    shots: imgs.filter((i) => i !== cover && !isJunk(i)).map(({ thumb, full }) => ({ thumb, full })),
  };
}

async function wikiInfo(name) {
  try {
    const search = await getJson(`https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(name + ' video game')}&limit=3`);
    const n = norm(name);
    const page = (search.pages || []).find((p) => /game/i.test(p.description || '') && (norm(p.title).includes(n) || n.includes(norm(p.title))));
    if (!page) return null;
    const key = encodeURIComponent(page.key);
    const [s, media] = await Promise.all([
      getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${key}`),
      getJson(`https://en.wikipedia.org/api/rest_v1/page/media-list/${key}`).catch(() => ({})),
    ]);
    if (!s.extract) return null;
    const { cover, shots } = wikiImages(media.items);
    return {
      source: 'Wikipedia',
      description: s.extract,
      storeUrl: s.content_urls && s.content_urls.desktop && s.content_urls.desktop.page,
      cover, // only a real cover/box-art file; the page's lead image is often a logo or a screenshot
      screenshots: shots.slice(0, 10),
    };
  } catch { return null; }
}

// ---------- Bing Images, through a hidden browser window ----------
// Plain HTTP requests get throttled or served junk; a real browser window is treated like a normal visitor.
let searchWin = null;
let idleTimer = null;
let queue = Promise.resolve();

function getSearchWindow() {
  if (searchWin && !searchWin.isDestroyed()) return searchWin;
  const { BrowserWindow } = require('electron');
  searchWin = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { partition: 'persist:imgsearch', sandbox: true, backgroundThrottling: false } });
  searchWin.webContents.setUserAgent(UA);
  searchWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // Bing tries to start a Microsoft sign-in in the background; we never want that
  searchWin.webContents.session.webRequest.onBeforeRequest({ urls: ['*://login.live.com/*', '*://login.microsoftonline.com/*'] }, (_d, cb) => cb({ cancel: true }));
  return searchWin;
}
function dropSearchWindow() {
  clearTimeout(idleTimer);
  if (searchWin && !searchWin.isDestroyed()) searchWin.destroy();
  searchWin = null;
}
const closeWhenIdle = () => { clearTimeout(idleTimer); idleTimer = setTimeout(dropSearchWindow, 30000); };

const EXTRACT = `[...document.querySelectorAll('a.iusc')].map(a => { try { return JSON.parse(a.getAttribute('m')); } catch { return null; } })
  .filter(Boolean).map(r => ({ t: r.t || '', desc: r.desc || '', purl: r.purl || '', murl: r.murl || '', turl: r.turl || '' }))`;

// One search at a time, with a short pause between them so Bing doesn't throttle us
function runSearch(url) {
  const job = queue.then(async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const win = getSearchWindow();
        await withTimeout(win.loadURL(url), 20000, 'load');
        for (let i = 0; i < 12; i++) { // wait for the result grid to render
          if (await win.webContents.executeJavaScript(`document.querySelectorAll('a.iusc').length`)) break;
          await sleep(400);
        }
        const rows = await withTimeout(win.webContents.executeJavaScript(EXTRACT), 8000, 'read');
        closeWhenIdle();
        await sleep(900);
        if (rows.length) return rows;
      } catch { dropSearchWindow(); await sleep(1500); }
    }
    return [];
  });
  queue = job.catch(() => {});
  return job;
}

const SHAPE = { wide: '+filterui:aspect-wide', tall: '+filterui:aspect-tall', square: '+filterui:aspect-square' };
const NOT_GAMEPLAY = /wallpaper|logo|icon|cosplay|fan ?art|skin|merch|figure|plush|lego|clipart|transparent|template|poster|cover|box ?art|tier list|tutorial|guide|download|apk|mod menu|hack|cheat|reaction|meme/i;
const NOT_COVER = /wallpaper|cosplay|fan ?art|merch|figure|plush|lego|clipart|transparent|template|gameplay|screenshot|youtube|tier list|meme|ps4|ps5|xbox|switch|nintendo|steam deck|android|ios/i;

// `gameName` throws away results that aren't about the game: its words must appear in the result's title/page address
async function bingImages(query, { count = 10, gameName = '', shape = null, junk = null } = {}) {
  const words = norm(gameName).split(' ').filter((w) => w.length > 2 && !['the', 'of', 'and', 'for', 'pre', 'game', 'editor', 'edition', 'demo'].includes(w));
  const relevant = (r) => {
    const hay = norm(`${r.t} ${r.purl}`).replace(/[/_\-]/g, ' ');
    return (!words.length || words.every((w) => hay.includes(w))) && !(junk && junk.test(r.t));
  };
  const qft = `+filterui:imagesize-large${shape ? SHAPE[shape] : ''}`;
  const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&qft=${encodeURIComponent(qft)}&form=IRFLTR&first=1&setlang=en-US&mkt=en-US`;
  const rows = await runSearch(url);
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (!/^https:\/\//.test(r.murl) || !r.turl || seen.has(r.murl) || !/\.(jpe?g|png|webp)(\?|$)/i.test(r.murl) || !relevant(r)) continue;
    seen.add(r.murl);
    out.push({ full: r.murl, thumb: r.turl, title: r.t });
    if (out.length >= count) break;
  }
  return out;
}

// ---------- Public API ----------
// Cover art for a game that has none: Steam -> Wikipedia cover -> image search for the poster -> a gameplay shot
async function findCover(name, appid) {
  const id = appid || (await findSteamId(name));
  if (id) {
    const art = (await steamStoreArt([id]))[id];
    if (art && art.cover && (await verifyImage(art.cover))) return art.cover;
  }
  const wiki = await wikiInfo(name);
  if (wiki && wiki.cover && (await verifyImage(wiki.cover))) return wiki.cover;

  const posters = await bingImages(`${searchName(name)} video game cover art`, { count: 6, gameName: name, shape: 'tall', junk: NOT_COVER });
  for (const p of posters) {
    if (await verifyImage(p.full)) return p.full;
    if (await verifyImage(p.thumb)) return p.thumb;
  }
  return wiki && wiki.screenshots.length ? wiki.screenshots[0].full : null;
}

async function getGameInfo(item) {
  const steamId = item.appid || (await findSteamId(item.name));
  let info = steamId ? await steamDetails(steamId) : null;
  let shots = info ? info.screenshots.slice() : [];
  let fromWeb = false;

  // Not on Steam (or only a few official shots): Wikipedia has real gameplay captures
  if (!info || shots.length < 6) {
    const wiki = await wikiInfo(item.name);
    if (!info) info = wiki;
    if (wiki) shots = [...shots, ...wiki.screenshots];
  }
  // Then image search for actual gameplay, like searching "<game> gameplay screenshot"
  if (shots.length < 8) {
    const found = await bingImages(`${searchName(item.name)} gameplay screenshot`, { count: 12 - shots.length, gameName: item.name, shape: 'wide', junk: NOT_GAMEPLAY });
    if (found.length) { shots = [...shots, ...found]; fromWeb = true; }
  }
  info = info || { source: null, description: '' };
  return { ...info, screenshots: shots.slice(0, 12), screenshotsFromWeb: fromWeb };
}

// Logo for an app that has no usable icon of its own
async function findAppIcon(name) {
  const rows = await bingImages(`${searchName(name)} app logo icon`, { count: 4, gameName: name, shape: 'square', junk: /wallpaper|screenshot|banner|cosplay|meme/i });
  for (const r of rows) {
    if (await verifyImage(r.full)) return r.full;
    if (await verifyImage(r.thumb)) return r.thumb;
  }
  return null;
}

module.exports = { getGameInfo, findCover, findAppIcon, steamStoreArt, verifyImage, dropSearchWindow };
