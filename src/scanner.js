// Finds installed games and apps on this PC.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { execFile } = require('child_process');
const { pathToFileURL } = require('url');
const { expandEnv, isExtractable } = require('./icons');

const exists = (p) => { try { return !!p && fs.existsSync(p); } catch { return false; } };
const fileUrl = (p) => pathToFileURL(p).href;
const steamCdn = (appid, file) => `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/${file}`;

const SYS32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
const REG = path.join(SYS32, 'reg.exe');
const POWERSHELL = path.join(SYS32, 'WindowsPowerShell', 'v1.0', 'powershell.exe');

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' }, (err, stdout) => resolve(err ? '' : stdout));
  });
}

// Parses `reg query` output into { 'HKEY_...\\Key': { ValueName: 'data' } }
async function regQuery(key, recursive = false) {
  const out = await run(REG, ['query', key, ...(recursive ? ['/s'] : [])]);
  const result = {};
  let current = null;
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith('HKEY_')) { current = result[line.trim()] = {}; continue; }
    const m = current && line.match(/^\s{4}(.+?)\s{4}(REG_\w+)\s*(.*)$/);
    if (m) current[m[1]] = m[3];
  }
  return result;
}

let uninstallCache = null;
async function uninstallEntries() {
  if (uninstallCache) return uninstallCache;
  const roots = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ];
  const all = await Promise.all(roots.map((r) => regQuery(r, true)));
  uninstallCache = all.flatMap((o) => Object.values(o)).filter((v) => v.DisplayName);
  return uninstallCache;
}
const cleanIconPath = (p) => (p || '').replace(/"/g, '').replace(/,\s*-?\d+$/, '').trim();

// ---------- Steam ----------
const STEAM_SKIP = /Steamworks Common|Redistributable|^Proton|Steam Linux Runtime|^SteamVR$/i;

async function scanSteam() {
  const reg = await regQuery('HKCU\\Software\\Valve\\Steam');
  const vals = Object.values(reg)[0] || {};
  const steamPath = path.normalize(vals.SteamPath || 'C:/Program Files (x86)/Steam');
  let libs = [steamPath];
  try {
    const vdf = await fsp.readFile(path.join(steamPath, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    const found = [...vdf.matchAll(/"path"\s+"(.+?)"/g)].map((m) => path.normalize(m[1].replace(/\\\\/g, '\\')));
    if (found.length) libs = found;
  } catch {}

  const games = [];
  const seen = new Set();
  for (const lib of libs) {
    const dir = path.join(lib, 'steamapps');
    let files = [];
    try { files = await fsp.readdir(dir); } catch { continue; }
    for (const f of files.filter((f) => /^appmanifest_\d+\.acf$/.test(f))) {
      const acf = await fsp.readFile(path.join(dir, f), 'utf8').catch(() => '');
      const appid = (acf.match(/"appid"\s+"(\d+)"/) || [])[1];
      const name = (acf.match(/"name"\s+"(.+?)"/) || [])[1];
      const installdir = (acf.match(/"installdir"\s+"(.+?)"/) || [])[1];
      if (!appid || !name || STEAM_SKIP.test(name) || seen.has(appid)) continue;
      seen.add(appid);
      const cover = steamCover(steamPath, appid);
      games.push({
        id: `steam:${appid}`,
        type: 'game',
        source: 'steam',
        name,
        appid,
        cover: cover || steamCdn(appid, 'library_600x900.jpg'),
        coverFallback: steamCdn(appid, 'header.jpg'),
        needsArt: !cover, // the plain CDN path misses newer games, so look up the real one

        launch: { kind: 'url', target: `steam://rungameid/${appid}` },
        location: installdir ? path.join(dir, 'common', installdir) : null,
      });
    }
  }
  return games;
}

function steamCover(steamPath, appid) {
  const cache = path.join(steamPath, 'appcache', 'librarycache');
  const candidates = [path.join(cache, appid, 'library_600x900.jpg'), path.join(cache, `${appid}_library_600x900.jpg`)];
  for (const c of candidates) if (exists(c)) return fileUrl(c);
  // Newer Steam clients put art in hashed sub-folders
  try {
    for (const sub of fs.readdirSync(path.join(cache, appid))) {
      const p = path.join(cache, appid, sub, 'library_600x900.jpg');
      if (exists(p)) return fileUrl(p);
    }
  } catch {}
  return null;
}

// ---------- Epic ----------
async function scanEpic() {
  const dir = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests';
  let files = [];
  try { files = (await fsp.readdir(dir)).filter((f) => f.endsWith('.item')); } catch { return []; }
  const games = [];
  for (const f of files) {
    let m;
    try { m = JSON.parse(await fsp.readFile(path.join(dir, f), 'utf8')); } catch { continue; }
    if (m.bIsIncompleteInstall || (m.MainGameAppName && m.MainGameAppName !== m.AppName)) continue;
    const exe = m.LaunchExecutable ? path.join(m.InstallLocation, m.LaunchExecutable) : null;
    const key = encodeURIComponent(`${m.CatalogNamespace}:${m.CatalogItemId}:${m.AppName}`);
    games.push({
      id: `epic:${m.AppName}`,
      type: 'game',
      source: 'epic',
      name: m.DisplayName,
      iconPath: exists(exe) ? exe : null,
      launch: { kind: 'url', target: `com.epicgames.launcher://apps/${key}?action=launch&silent=true` },
      location: m.InstallLocation,
    });
  }
  return games;
}

// ---------- Battle.net ----------
// Product codes understood by `Battle.net.exe --exec="launch <code>"`
const BNET_CODES = {
  'overwatch': 'Pro', 'overwatch 2': 'Pro', 'world of warcraft': 'WoW', 'diablo iv': 'Fen', 'diablo iii': 'D3',
  'diablo ii resurrected': 'OSI', 'diablo immortal': 'ANBS', 'hearthstone': 'WTCG', 'heroes of the storm': 'Hero',
  'starcraft ii': 'S2', 'starcraft': 'S1', 'starcraft remastered': 'S1', 'warcraft iii reforged': 'W3', 'call of duty': 'AUKS',
};

async function scanBattleNet() {
  const entries = await uninstallEntries();
  const bnet = entries.find((e) => e.DisplayName === 'Battle.net');
  const bnetExe = bnet && [cleanIconPath(bnet.DisplayIcon), path.join(bnet.InstallLocation || '', 'Battle.net.exe')].find(exists);
  const games = [];
  for (const e of entries) {
    if (!/Blizzard/i.test(e.Publisher || '') || /^Battle\.net/i.test(e.DisplayName)) continue;
    const exe = cleanIconPath(e.DisplayIcon);
    const code = BNET_CODES[e.DisplayName.toLowerCase().replace(/[®™:]/g, '').trim()];
    let launch;
    // 'bnet': Nexus makes sure Battle.net is open and logged in first, because the command is ignored on a cold start
    if (code && bnetExe) launch = { kind: 'bnet', target: bnetExe, code };
    else if (exists(exe)) launch = { kind: 'exe', target: exe };
    else if (bnetExe) launch = { kind: 'exe', target: bnetExe };
    else continue;
    games.push({
      id: `bnet:${e.DisplayName}`,
      type: 'game',
      source: 'battlenet',
      name: e.DisplayName,
      iconPath: exists(exe) ? exe : null,
      launch,
      alt: bnetExe ? { label: 'Open Battle.net', launch: { kind: 'exe', target: bnetExe } } : null,
      location: e.InstallLocation || (exists(exe) ? path.dirname(exe) : null),
    });
  }
  return games;
}

// ---------- HoYoPlay ----------
const HOYO = {
  hk4e: { name: 'Genshin Impact', exe: ['GenshinImpact.exe', 'YuanShen.exe'] },
  hkrpg: { name: 'Honkai: Star Rail', exe: ['StarRail.exe'] },
  nap: { name: 'Zenless Zone Zero', exe: ['ZenlessZoneZero.exe'] },
  bh3: { name: 'Honkai Impact 3rd', exe: ['BH3.exe'] },
};

async function scanHoYo() {
  const reg = await regQuery('HKCU\\Software\\Cognosphere\\HYP\\1_0', true);
  const hyp = (await uninstallEntries()).find((e) => e.DisplayName === 'HoYoPlay');
  const hypExe = hyp && [cleanIconPath(hyp.DisplayIcon), path.join(hyp.InstallLocation || '', 'launcher.exe')].find(exists);
  const games = [];
  for (const v of Object.values(reg)) {
    if (!v.GameBiz || !v.GameInstallPath) continue;
    const info = HOYO[v.GameBiz.split('_')[0]];
    if (!info) continue;
    const exe = info.exe.map((e) => path.join(v.GameInstallPath, e)).find(exists);
    if (!exe) continue;
    games.push({
      id: `hoyo:${v.GameBiz}`,
      type: 'game',
      source: 'hoyoplay',
      name: info.name,
      icon: exists(v.GameIconPath) ? fileUrl(v.GameIconPath) : null,
      iconPath: exe,
      launch: { kind: 'exe', target: exe },
      alt: hypExe ? { label: 'Open HoYoPlay', launch: { kind: 'exe', target: hypExe } } : null,
      location: v.GameInstallPath,
    });
  }
  return games;
}

// ---------- Wuthering Waves (Kuro Games launcher) ----------
async function scanWuWa() {
  const roots = new Set();
  for (const e of await uninstallEntries()) {
    if (/Wuthering/i.test(e.DisplayName) && e.InstallLocation) roots.add(path.normalize(e.InstallLocation));
  }
  for (const d of 'CDEFGH') {
    for (const sub of ['Wuthering Waves', 'Games\\Wuthering Waves', 'Program Files\\Wuthering Waves']) roots.add(`${d}:\\${sub}`);
  }
  for (const root of roots) {
    const launcher = path.join(root, 'launcher.exe');
    const gameExe = [
      path.join(root, 'Wuthering Waves Game', 'Wuthering Waves.exe'),
      path.join(path.dirname(root), 'Wuthering Waves Game', 'Wuthering Waves.exe'),
      path.join(root, 'Wuthering Waves.exe'),
    ].find(exists);
    if (!gameExe && !exists(launcher)) continue;
    const hasLauncher = exists(launcher);
    // The game exes refuse to run without the launcher, so open the launcher and press its Start button for the user
    // (through UI Automation: the launcher is a WebView2 page whose button is named "Start"). Anything else it shows,
    // such as Update, is left alone and Nexus steps aside so the user can deal with it.
    return [{
      id: 'kuro:wuwa',
      type: 'game',
      source: 'kuro',
      name: 'Wuthering Waves',
      procNames: ['Client-Win64-Shipping.exe'], // the real game process; the launcher and the stub exe don't stay open
      autoPress: hasLauncher ? { proc: 'launcher_main', cls: 'main-action-button' } : null, // the label defaults to any launch word (Start, Play, Launch, translations)
      iconPath: gameExe || launcher,
      launch: { kind: 'exe', target: hasLauncher ? launcher : gameExe },
      alt: null,
      location: path.dirname(gameExe || launcher),
    }];
  }
  return [];
}

// ---------- Start Menu apps ----------
const DOC_TARGET = /\.(url|html?|txt|pdf|chm|ini|log|md|json|xml|rtf|cfg|docx?|xlsx?)$/i;
const APP_SKIP = /^Administrative Tools$|(Native|Cross) Tools Command Prompt|uninstall|uninst|readme|read me|help|documentation|manual|website|web site|release notes|license|support|changelog|^remove|^repair|setup$/i;
const FOLDER_SKIP = /Administrative Tools|Accessibility|System Tools|Startup/i;

async function walk(dir, out = []) {
  let entries = [];
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!FOLDER_SKIP.test(e.name)) await walk(p, out); }
    else if (e.name.toLowerCase().endsWith('.lnk')) out.push(p);
  }
  return out;
}

async function scanApps(shell) {
  const dirs = [
    path.join(process.env.APPDATA || '', 'Microsoft\\Windows\\Start Menu\\Programs'),
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft\\Windows\\Start Menu\\Programs'),
  ];
  const links = (await Promise.all(dirs.map((d) => walk(d)))).flat();
  const apps = new Map();
  for (const lnk of links) {
    const name = path.basename(lnk, '.lnk');
    if (APP_SKIP.test(name) || apps.has(name.toLowerCase())) continue;
    let link = {};
    try { link = shell.readShortcutLink(lnk); } catch {}
    const target = link.target || null;
    if (target && DOC_TARGET.test(target)) continue;
    if (target && /^[a-z]:\\/i.test(target)) {
      if (!exists(target)) continue; // leftover shortcut from an uninstalled app
      try { if (fs.statSync(target).isDirectory()) continue; } catch {} // "Open screenshots folder" style links
    }
    // Where the shortcut's icon really lives: its own icon location (any index, may use %windir%), else the program itself
    const linkIcon = expandEnv(link.icon);
    const iconSrc = isExtractable(linkIcon) && exists(linkIcon) ? { path: linkIcon, index: link.iconIndex || 0 }
      : exists(target) && isExtractable(target) ? { path: target, index: 0 } : null;
    apps.set(name.toLowerCase(), {
      id: `app:${name.toLowerCase()}`,
      type: 'app',
      source: 'app',
      name,
      iconSrc,
      iconPath: iconSrc ? iconSrc.path : lnk,
      launch: { kind: 'open', target: lnk },
      location: exists(target) ? target : lnk,
    });
  }

  // Microsoft Store / packaged apps (not in the Start Menu folders)
  const script = path.join(__dirname, 'store-apps.ps1').replace('app.asar', 'app.asar.unpacked');
  const ps = await run(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script]);
  let pkgs = [];
  try { pkgs = JSON.parse(ps.trim() || '[]'); } catch {}
  for (const p of [].concat(pkgs)) {
    if (!p || !p.Name || apps.has(p.Name.toLowerCase()) || APP_SKIP.test(p.Name)) continue;
    apps.set(p.Name.toLowerCase(), {
      id: `uwp:${p.AppID}`,
      type: 'app',
      source: 'app',
      name: p.Name,
      icon: exists(p.Logo) ? fileUrl(p.Logo) : null,
      launch: { kind: 'uwp', target: p.AppID },
    });
  }
  return [...apps.values()];
}

// Game names already detected by a launcher scan shouldn't also appear as plain apps
async function scanAll(shell) {
  if (process.platform === 'linux') return require('./linux').scanAll();
  uninstallCache = null;
  const safe = (p) => p.catch((e) => { console.error(e); return []; });
  const [steam, epic, bnet, hoyo, wuwa, apps] = await Promise.all(
    [scanSteam(), scanEpic(), scanBattleNet(), scanHoYo(), scanWuWa(), scanApps(shell)].map(safe));
  const games = [...steam, ...epic, ...bnet, ...hoyo, ...wuwa];
  const gameNames = new Set(games.map((g) => norm(g.name)));
  const gameDirs = games.map((g) => g.location && g.location.toLowerCase()).filter(Boolean);
  const isGame = (a) => gameNames.has(norm(a.name)) ||
    (a.location && gameDirs.some((d) => a.location.toLowerCase().startsWith(d + path.sep)));
  return [...games, ...apps.filter((a) => !isGame(a))];
}

function norm(s) { return s.toLowerCase().replace(/[®™©:'’.\-–]/g, '').replace(/\s+/g, ' ').trim(); }

module.exports = { scanAll };
