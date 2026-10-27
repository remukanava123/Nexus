// Reads what the Steam client already keeps on this PC: lifetime playtime (userdata/<id>/config/localconfig.vdf)
// and achievements (appcache/stats/*.bin). No account, API key or internet is needed.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };

function regSteamPath() {
  return new Promise((resolve) => {
    const reg = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe');
    execFile(reg, ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { windowsHide: true, encoding: 'utf8' }, (err, out) => {
      const m = !err && out.match(/SteamPath\s+REG_SZ\s+(.+)/);
      resolve(m ? path.normalize(m[1].trim()) : null);
    });
  });
}

let rootCache;
async function steamRoot() {
  if (rootCache !== undefined) return rootCache;
  const home = os.homedir();
  const candidates = process.platform === 'win32'
    ? [await regSteamPath(), 'C:\\Program Files (x86)\\Steam']
    : [path.join(home, '.steam', 'steam'), path.join(home, '.local', 'share', 'Steam'), path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam')];
  rootCache = candidates.find((p) => p && exists(path.join(p, 'userdata'))) || null;
  return rootCache;
}

// ---------- Valve's two file formats ----------
// Text KeyValues ("key" "value" and "key" { ... }), as in localconfig.vdf
function parseVdf(text) {
  const tok = /"((?:[^"\\]|\\.)*)"|([{}])/g;
  const root = {};
  const stack = [root];
  let key = null, m;
  while ((m = tok.exec(text))) {
    if (m[2] === '{') { const o = {}; stack[stack.length - 1][key] = o; stack.push(o); key = null; }
    else if (m[2] === '}') { stack.pop(); key = null; }
    else if (key === null) key = m[1];
    else { stack[stack.length - 1][key] = m[1].replace(/\\(.)/g, '$1'); key = null; }
  }
  return root;
}
const ci = (o, name) => { if (!o) return undefined; const k = Object.keys(o).find((x) => x.toLowerCase() === name.toLowerCase()); return k === undefined ? undefined : o[k]; };

// Binary KeyValues, as in the appcache/stats files
function parseBinaryKv(buf) {
  let p = 0;
  const cstr = () => { const s = p; while (p < buf.length && buf[p] !== 0) p++; const v = buf.toString('utf8', s, p); p++; return v; };
  function obj() {
    const o = {};
    while (p < buf.length) {
      const t = buf[p++];
      if (t === 8) break;
      const k = cstr();
      if (t === 0) o[k] = obj();
      else if (t === 1) o[k] = cstr();
      else if (t === 2 || t === 4 || t === 6) { o[k] = buf.readInt32LE(p); p += 4; }
      else if (t === 3) { o[k] = buf.readFloatLE(p); p += 4; }
      else if (t === 5) { const s = p; while (p + 1 < buf.length && !(buf[p] === 0 && buf[p + 1] === 0)) p += 2; o[k] = buf.toString('utf16le', s, p); p += 2; }
      else if (t === 7 || t === 10) { o[k] = buf.readBigUInt64LE(p).toString(); p += 8; }
      else throw new Error(`unknown KeyValues type ${t}`);
    }
    return o;
  }
  return obj();
}

// ---------- Playtime ----------
const accountFolders = async (root) => {
  try { return (await fs.promises.readdir(path.join(root, 'userdata'))).filter((n) => /^\d+$/.test(n) && n !== '0'); } catch { return []; }
};

// -> { appid: minutes }. Every Steam account that has signed in on this PC is read; the biggest number for a game wins.
async function playtimes() {
  const root = await steamRoot();
  const out = {};
  if (!root) return out;
  for (const id of await accountFolders(root)) {
    let text;
    try { text = await fs.promises.readFile(path.join(root, 'userdata', id, 'config', 'localconfig.vdf'), 'utf8'); } catch { continue; }
    const store = ci(ci(ci(ci(parseVdf(text), 'UserLocalConfigStore'), 'Software'), 'Valve'), 'Steam');
    const apps = ci(store, 'apps') || {};
    for (const [appid, v] of Object.entries(apps)) {
      const min = Number(v && ci(v, 'Playtime')) || 0;
      if (min > (out[appid] || 0)) out[appid] = min;
    }
  }
  return out;
}

// ---------- Achievements ----------
const text = (v) => (v && typeof v === 'object' ? v.english || Object.values(v).find((x) => typeof x === 'string') || '' : v || '');
const iconUrl = (appid, file) => (file ? `https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${appid}/${file}` : null);

// -> { total, unlocked, list: [{ id, name, desc, icon, hidden, done, time }] } or null when Steam has no achievement data for the game
async function achievements(appid) {
  const root = await steamRoot();
  if (!root) return null;
  const stats = path.join(root, 'appcache', 'stats');
  let schema;
  try { schema = parseBinaryKv(await fs.promises.readFile(path.join(stats, `UserGameStatsSchema_${appid}.bin`))); } catch { return null; }
  const defs = (ci(schema, String(appid)) || schema[Object.keys(schema)[0]] || {}).stats || {};

  // Per account: which bits are set. Use the account that has unlocked the most.
  let best = null;
  for (const id of await accountFolders(root)) {
    let cache;
    try { cache = parseBinaryKv(await fs.promises.readFile(path.join(stats, `UserGameStats_${id}_${appid}.bin`))).cache || {}; } catch { continue; }
    const done = new Map();
    for (const [statId, def] of Object.entries(defs)) {
      const c = cache[statId];
      if (!c || !def.bits) continue;
      for (const bit of Object.keys(def.bits)) {
        const t = c.AchievementTimes && c.AchievementTimes[bit];
        if (t || (((c.data || 0) >>> Number(bit)) & 1)) done.set(`${statId}:${bit}`, Number(t) || 0);
      }
    }
    if (!best || done.size > best.size) best = done;
  }

  const list = [];
  for (const [statId, def] of Object.entries(defs)) {
    for (const [bit, a] of Object.entries(def.bits || {})) {
      if (!a || !a.name) continue;
      const d = a.display || {};
      const key = `${statId}:${bit}`;
      const got = best && best.has(key);
      list.push({
        id: a.name, name: text(d.name) || a.name, desc: text(d.desc), hidden: String(d.hidden) === '1',
        icon: iconUrl(appid, got ? d.icon : d.icon_gray || d.icon), done: !!got, time: got ? (best.get(key) || 0) * 1000 : 0,
      });
    }
  }
  if (!list.length) return null;
  return { total: list.length, unlocked: list.filter((a) => a.done).length, list };
}

// Which of a game's achievements are rare (share of all players who have them). Public Steam data, no key needed.
async function globalPercent(appid, fetchFn) {
  const r = await fetchFn(`https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid=${appid}&format=json`, { headers: { 'User-Agent': 'Nexus-Launcher' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  const out = {};
  for (const a of (j.achievementpercentages && j.achievementpercentages.achievements) || []) out[a.name] = Math.round(Number(a.percent) * 10) / 10;
  return out;
}

module.exports = { steamRoot, playtimes, achievements, globalPercent, parseVdf, parseBinaryKv };
