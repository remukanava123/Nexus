// Everything Nexus needs on Linux (tested target: Fedora and Bazzite, native and Flatpak launchers):
// finding games and apps, seeing what is running, launching, the now-playing song (MPRIS) and network speed.
// Nothing here is loaded on Windows.
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { pathToFileURL } = require('url');

const HOME = os.homedir();
const PROC = process.env.NEXUS_PROC_DIR || '/proc'; // (tests point this at a fake folder)
const DATA_HOME = process.env.XDG_DATA_HOME || path.join(HOME, '.local', 'share');
const CONFIG_HOME = process.env.XDG_CONFIG_HOME || path.join(HOME, '.config');

const exists = (p) => { try { return !!p && fs.existsSync(p); } catch { return false; } };
const fileUrl = (p) => pathToFileURL(p).href;
const real = (p) => { try { return fs.realpathSync(p); } catch { return p; } };
const run = (cmd, args, ms = 15000) => new Promise((resolve) => {
  execFile(cmd, args, { timeout: ms, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' }, (err, out) => resolve(err ? '' : out));
});
const readJson = async (p) => { try { return JSON.parse(await fsp.readFile(p, 'utf8')); } catch { return null; } };
const steamCdn = (appid, file) => `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/${file}`;

// ---------- Steam (native and Flatpak) ----------
const STEAM_SKIP = /Steamworks Common|Redistributable|^Proton|Steam Linux Runtime|^SteamVR$/i;

function steamRoots() {
  const list = [
    path.join(DATA_HOME, 'Steam'),
    path.join(HOME, '.steam', 'steam'),
    path.join(HOME, '.steam', 'root'),
    path.join(HOME, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
    path.join(HOME, '.var', 'app', 'com.valvesoftware.Steam', 'data', 'Steam'),
  ];
  return [...new Set(list.filter((p) => exists(path.join(p, 'steamapps'))).map(real))];
}

function steamCover(steamPath, appid) {
  const cache = path.join(steamPath, 'appcache', 'librarycache');
  for (const c of [path.join(cache, appid, 'library_600x900.jpg'), path.join(cache, `${appid}_library_600x900.jpg`)]) if (exists(c)) return fileUrl(c);
  try {
    for (const sub of fs.readdirSync(path.join(cache, appid))) {
      const p = path.join(cache, appid, sub, 'library_600x900.jpg');
      if (exists(p)) return fileUrl(p);
    }
  } catch {}
  return null;
}

async function scanSteam() {
  const games = [];
  const seen = new Set();
  for (const steamPath of steamRoots()) {
    let libs = [steamPath];
    try {
      const vdf = await fsp.readFile(path.join(steamPath, 'steamapps', 'libraryfolders.vdf'), 'utf8');
      const found = [...vdf.matchAll(/"path"\s+"(.+?)"/g)].map((m) => m[1]).filter((p) => exists(p));
      if (found.length) libs = [...new Set([steamPath, ...found.map(real)])];
    } catch {}
    for (const lib of libs) {
      const dir = path.join(lib, 'steamapps');
      let files = [];
      try { files = await fsp.readdir(dir); } catch { continue; }
      for (const f of files.filter((x) => /^appmanifest_\d+\.acf$/.test(x))) {
        const acf = await fsp.readFile(path.join(dir, f), 'utf8').catch(() => '');
        const appid = (acf.match(/"appid"\s+"(\d+)"/) || [])[1];
        const name = (acf.match(/"name"\s+"(.+?)"/) || [])[1];
        const installdir = (acf.match(/"installdir"\s+"(.+?)"/) || [])[1];
        if (!appid || !name || STEAM_SKIP.test(name) || seen.has(appid)) continue;
        seen.add(appid);
        const cover = steamCover(steamPath, appid);
        games.push({
          id: `steam:${appid}`, type: 'game', source: 'steam', name, appid,
          cover: cover || steamCdn(appid, 'library_600x900.jpg'),
          coverFallback: steamCdn(appid, 'header.jpg'),
          needsArt: !cover,
          launch: { kind: 'url', target: `steam://rungameid/${appid}` },
          location: installdir ? path.join(dir, 'common', installdir) : null,
        });
      }
    }
  }
  return games;
}

// ---------- Heroic (Epic, GOG and your own games), native and Flatpak ----------
function heroicDirs() {
  return [path.join(CONFIG_HOME, 'heroic'), path.join(HOME, '.var', 'app', 'com.heroicgameslauncher.hgl', 'config', 'heroic')].filter(exists);
}

async function scanHeroic() {
  const games = [];
  const seen = new Set();
  const add = (g) => { if (g.name && !seen.has(g.id)) { seen.add(g.id); games.push(g); } };
  for (const dir of heroicDirs()) {
    // Epic, through legendary
    const epic = await readJson(path.join(dir, 'legendaryConfig', 'legendary', 'installed.json'));
    for (const [appName, g] of Object.entries(epic || {})) {
      if (!g || g.is_dlc) continue;
      add({ id: `epic:${appName}`, type: 'game', source: 'epic', name: g.title || appName, launch: { kind: 'url', target: `heroic://launch/legendary/${appName}` }, location: g.install_path || null });
    }
    // GOG
    const gog = await readJson(path.join(dir, 'gog_store', 'installed.json'));
    const lib = await readJson(path.join(dir, 'store_cache', 'gog_library.json'));
    const titles = new Map(((lib && lib.games) || []).map((g) => [String(g.app_name), g.title]));
    for (const g of (gog && gog.installed) || []) {
      add({ id: `gog:${g.appName}`, type: 'game', source: 'gog', name: titles.get(String(g.appName)) || g.appName, launch: { kind: 'url', target: `heroic://launch/gog/${g.appName}` }, location: g.install_path || null });
    }
    // games added by hand
    const side = await readJson(path.join(dir, 'sideload_apps', 'library.json'));
    for (const g of (side && side.games) || []) {
      if (g.is_installed === false) continue;
      add({ id: `heroic:${g.app_name}`, type: 'game', source: 'heroic', name: g.title, launch: { kind: 'url', target: `heroic://launch/sideload/${g.app_name}` }, location: (g.install && g.install.executable) || g.folder_name || null });
    }
  }
  return games;
}

// ---------- Lutris ----------
async function scanLutris() {
  const out = await run('lutris', ['--list-games', '--json'], 20000);
  let list = [];
  try { list = JSON.parse(out.slice(out.indexOf('['))); } catch {}
  return list.filter((g) => g && g.id && g.name).map((g) => ({
    id: `lutris:${g.id}`, type: 'game', source: 'lutris', name: g.name,
    launch: { kind: 'url', target: `lutris:rungameid/${g.id}` },
    location: g.directory && exists(g.directory) ? g.directory : null,
  }));
}

// ---------- Desktop entries (apps and native games, including Flatpak ones) ----------
function desktopDirs() {
  const sys = (process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':').filter(Boolean);
  return [...new Set([
    path.join(DATA_HOME, 'applications'),
    ...sys.map((d) => path.join(d, 'applications')),
    '/var/lib/flatpak/exports/share/applications',
    path.join(DATA_HOME, 'flatpak', 'exports', 'share', 'applications'),
  ])].filter(exists);
}

const ICON_ROOTS = () => [
  path.join(DATA_HOME, 'icons'), '/usr/share/icons', '/usr/share/pixmaps',
  '/var/lib/flatpak/exports/share/icons', path.join(DATA_HOME, 'flatpak', 'exports', 'share', 'icons'),
];
const iconCache = new Map();
function findIcon(name) {
  if (!name) return null;
  if (path.isAbsolute(name)) return exists(name) && /\.(png|svg|jpe?g|webp)$/i.test(name) ? fileUrl(name) : null;
  if (iconCache.has(name)) return iconCache.get(name);
  let best = null, bestSize = -1;
  const consider = (p, size) => { if (size > bestSize && exists(p)) { best = p; bestSize = size; } };
  for (const root of ICON_ROOTS()) {
    consider(path.join(root, `${name}.png`), 0);
    consider(path.join(root, `${name}.svg`), 0);
    let themes = [];
    try { themes = fs.readdirSync(root); } catch { continue; }
    for (const theme of themes) {
      let sizes = [];
      try { sizes = fs.readdirSync(path.join(root, theme)); } catch { continue; }
      for (const sz of sizes) {
        const n = parseInt(sz, 10) || (sz === 'scalable' ? 512 : 0);
        for (const ext of ['png', 'svg']) consider(path.join(root, theme, sz, 'apps', `${name}.${ext}`), ext === 'svg' ? 600 : n);
      }
    }
  }
  const url = best ? fileUrl(best) : null;
  iconCache.set(name, url);
  return url;
}

function parseDesktop(text) {
  const out = {};
  let inEntry = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] === '#') continue;
    if (line[0] === '[') { inEntry = line === '[Desktop Entry]'; continue; }
    if (!inEntry) continue;
    const i = line.indexOf('=');
    if (i > 0 && !/\[.+\]$/.test(line.slice(0, i))) out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}

const APP_SKIP = /uninstall|^remove|readme|release notes|license|documentation|manual|^help$|^about /i;
// Entries that only re-launch something another launcher already lists
const LAUNCHER_SHORTCUT = /steam:\/\/|lutris[: ]+(rungameid|lutris:)|heroic:\/\/|^steam\b|run\/steam|com\.valvesoftware\.Steam|--appid|net\.lutris\.Lutris|com\.heroicgameslauncher/i;

async function scanDesktop() {
  const apps = new Map();
  for (const dir of desktopDirs()) {
    let files = [];
    try { files = (await fsp.readdir(dir)).filter((f) => f.endsWith('.desktop')); } catch { continue; }
    for (const f of files) {
      const file = path.join(dir, f);
      const d = parseDesktop(await fsp.readFile(file, 'utf8').catch(() => ''));
      if (d.Type !== 'Application' || !d.Name || /^true$/i.test(d.NoDisplay || '') || /^true$/i.test(d.Hidden || '')) continue;
      if (APP_SKIP.test(d.Name) || LAUNCHER_SHORTCUT.test(d.Exec || '')) continue;
      if (d.TryExec && d.TryExec.startsWith('/') && !exists(d.TryExec)) continue;
      const key = d.Name.toLowerCase();
      if (apps.has(key)) continue;
      // a program name to look for in the running processes (native games and Flatpak apps)
      const exec = (d.Exec || '').replace(/%[a-zA-Z]/g, '').trim().split(/\s+/);
      let proc = path.basename(exec[0] || '');
      if (/flatpak$/.test(proc)) { const cmd = exec.find((x) => x.startsWith('--command=')); proc = cmd ? cmd.slice(10) : (exec[exec.length - 1] || '').split('.').pop(); }
      // the game launchers themselves are apps, not games
      const isGame = /(^|;)Game(;|$)/.test(d.Categories || '') && !/^(steam|lutris|heroic|bottles|itch|minigalaxy|gamehub|protonup-qt|protontricks)$/i.test(proc);
      apps.set(key, {
        id: `app:${f.replace(/\.desktop$/, '')}`,
        type: isGame ? 'game' : 'app',
        source: isGame ? 'desktop' : 'app',
        name: d.Name,
        icon: findIcon(d.Icon),
        launch: { kind: 'desktop', target: file },
        procNames: proc ? [proc] : undefined,
        location: undefined,
      });
    }
  }
  return [...apps.values()];
}

async function scanAll() {
  const safe = (p) => p.catch((e) => { console.error(e); return []; });
  const [steam, heroic, lutris, desktop] = await Promise.all([scanSteam(), scanHeroic(), scanLutris(), scanDesktop()].map(safe));
  const games = [...steam, ...heroic, ...lutris];
  const norm = (s) => s.toLowerCase().replace(/[®™©:'’.\-–]/g, '').replace(/\s+/g, ' ').trim();
  const names = new Set(games.map((g) => norm(g.name)));
  return [...games, ...desktop.filter((a) => !names.has(norm(a.name)))];
}

// ---------- Running programs ----------
// Lower-cased lines like the Windows tracker produces: an executable's path, a Windows-style game path as Wine/Proton
// shows it (converted back), and "?name" for the program name alone.
async function snapshot() {
  let pids = [];
  try { pids = (await fsp.readdir(PROC)).filter((p) => /^\d+$/.test(p)); } catch { return []; }
  const out = new Set();
  const one = async (pid) => {
    const base = `${PROC}/${pid}`;
    let exe = '';
    try { exe = await fsp.readlink(`${base}/exe`); } catch {}
    exe = exe.replace(/ \(deleted\)$/, '');
    let comm = '';
    try { comm = (await fsp.readFile(`${base}/comm`, 'utf8')).trim(); } catch {}
    if (exe) { out.add(exe.toLowerCase()); out.add('?' + path.basename(exe).toLowerCase()); }
    if (comm) out.add('?' + comm.toLowerCase());
    let args = [];
    try { args = (await fsp.readFile(`${base}/cmdline`, 'utf8')).split('\0').filter(Boolean); } catch {}
    if (args[0]) out.add('?' + path.basename(args[0].replace(/\\/g, '/')).toLowerCase());
    for (const a of args.slice(1, 12)) {
      // Proton and Wine run Windows programs: the game's .exe appears here, as /home/... or as Z:\home\...
      let p = a.replace(/^[zZ]:/, '').replace(/\\/g, '/');
      if (p.startsWith('/') && /\.(exe|sh|x86_64|bin)$/i.test(p)) { out.add(p.toLowerCase()); out.add('?' + path.basename(p).toLowerCase()); }
    }
  };
  for (let i = 0; i < pids.length; i += 64) await Promise.all(pids.slice(i, i + 64).map(one));
  return [...out];
}

// Same job as the Windows window watcher: while the game's process exists it reports a (pretend) window, and a little
// while later "sound", so the cover stays until the game has had time to open its window.
function startWatch(spec, extraNames, onSample) {
  let first = 0, stopped = false;
  const names = [...(spec.names || []), ...(extraNames || [])].map((n) => n.replace(/\.exe$/i, '').toLowerCase());
  const tick = async () => {
    if (stopped) return;
    let list = [];
    try { list = await snapshot(); } catch {}
    const hit = list.some((p) => {
      if (p[0] === '?') return names.includes(p.slice(1).replace(/\.exe$/i, ''));
      return (spec.exes || []).includes(p) || (spec.dirs || []).some((d) => p.startsWith(d));
    });
    if (stopped) return;
    if (!hit) { first = 0; onSample(null, 0); return; }
    if (!first) first = Date.now();
    const age = Date.now() - first;
    onSample({ hwnd: '1', left: 0, top: 0, w: 7680, h: 4320, iconic: false, fg: true, title: 'game' }, age > 10000 ? 0.5 : 0);
  };
  const timer = setInterval(tick, 1000);
  tick();
  return { stop() { stopped = true; clearInterval(timer); } };
}

// ---------- Launching ----------
function launchDesktop(file) {
  const run1 = (cmd, args) => new Promise((resolve) => {
    const c = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    c.on('error', () => resolve(false));
    c.on('spawn', () => { c.unref(); resolve(true); });
  });
  return run1('gio', ['launch', file]).then((ok) => ok || run1('gtk-launch', [path.basename(file, '.desktop')]));
}

function launchExe(target, args) {
  const dir = path.dirname(target);
  const isScript = /\.sh$/i.test(target);
  const child = spawn(isScript ? 'sh' : target, isScript ? [target, ...(args ? String(args).split(' ') : [])] : (args ? String(args).split(' ') : []), { cwd: dir, detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
}

// ---------- Start with the desktop session ----------
function setAutostart(on, exec) {
  const file = path.join(CONFIG_HOME, 'autostart', 'nexus.desktop');
  if (!on) { try { fs.rmSync(file, { force: true }); } catch {} return; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `[Desktop Entry]\nType=Application\nName=Nexus\nComment=Game and app launcher\nExec="${exec}" --hidden\nTerminal=false\nX-GNOME-Autostart-enabled=true\n`);
}

// ---------- Now playing (MPRIS, what the Windows version reads from the media controls) ----------
const GDBUS = ['--session', '--dest'];
const unq = (s) => String(s || '').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
const str = (text, key) => { const m = text.match(new RegExp(`'${key}': <'((?:[^'\\\\]|\\\\.)*)'>`)); return m ? unq(m[1]) : ''; };

function parsePlayer(text) {
  const status = (text.match(/'PlaybackStatus': <'(\w+)'>/) || [])[1] || '';
  const title = str(text, 'xesam:title');
  const artistList = (text.match(/'xesam:artist': <\[((?:'(?:[^'\\]|\\.)*'(?:, )?)*)\]>/) || [])[1] || '';
  const artist = unq((artistList.match(/'((?:[^'\\]|\\.)*)'/) || [])[1] || '') || str(text, 'xesam:albumArtist');
  const pos = Number((text.match(/'Position': <(?:int64 )?(-?\d+)>/) || [])[1] || 0) / 1e6;
  const dur = Number((text.match(/'mpris:length': <(?:u?int64 )?(\d+)>/) || [])[1] || 0) / 1e6;
  const rate = Number((text.match(/'Rate': <([\d.]+)>/) || [])[1] || 1);
  return { status, title, artist, album: str(text, 'xesam:album'), art: str(text, 'mpris:artUrl'), pos, dur, rate };
}

function startMedia(onUpdate) {
  let stopped = false, busy = false, lastKey = '';
  const poll = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      const names = (await run('gdbus', ['call', ...GDBUS, 'org.freedesktop.DBus', '--object-path', '/org/freedesktop/DBus', '--method', 'org.freedesktop.DBus.ListNames'], 4000)).match(/org\.mpris\.MediaPlayer2\.[\w.\-]+/g) || [];
      let best = null;
      for (const n of names) {
        const text = await run('gdbus', ['call', ...GDBUS, n, '--object-path', '/org/mpris/MediaPlayer2', '--method', 'org.freedesktop.DBus.Properties.GetAll', 'org.mpris.MediaPlayer2.Player'], 4000);
        const p = parsePlayer(text);
        if (!p.title) continue;
        p.app = n.replace('org.mpris.MediaPlayer2.', '');
        if (!best || (p.status === 'Playing' && best.status !== 'Playing')) best = p;
      }
      if (stopped) return;
      if (!best) { onUpdate({ ok: false }); return; }
      const key = `${best.title}|${best.artist}`;
      const o = { ok: true, title: best.title, artist: best.artist, album: best.album, app: best.app, playing: best.status === 'Playing', pos: Math.round(best.pos * 10) / 10, dur: Math.round(best.dur * 10) / 10, at: Date.now(), upd: Date.now(), rate: best.rate, key };
      if (key !== lastKey) { lastKey = key; o.thumb = /^(https?|file):/.test(best.art) ? best.art : ''; }
      onUpdate(o);
    } catch {} finally { busy = false; }
  };
  const timer = setInterval(poll, 1500);
  poll();
  return { stop() { stopped = true; clearInterval(timer); } };
}

// ---------- Download speed (for "installing an update") ----------
function netBytes() {
  try {
    let sum = 0;
    for (const line of fs.readFileSync(path.join(PROC, 'net', 'dev'), 'utf8').split('\n').slice(2)) {
      const m = line.match(/^\s*([^:\s]+):\s*(\d+)/);
      if (m && !/^(lo|docker|veth|br-|virbr|tun|tap|podman|cni)/.test(m[1])) sum += Number(m[2]);
    }
    return sum;
  } catch { return 0; }
}

module.exports = { scanAll, snapshot, startWatch, launchDesktop, launchExe, setAutostart, startMedia, parsePlayer, netBytes, desktopDirs };
