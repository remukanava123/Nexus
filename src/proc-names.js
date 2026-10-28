// Finds the program names inside each game's folder.
//
// The tracker normally recognises a game because a running program lives in its install folder. Windows hides the
// location of protected or elevated programs from Nexus (most anti-cheat games, for example Rocket League and F1 25),
// and for those the only thing Nexus can see is the program name. So every game is given the names of the real game
// programs found in its folder, and the tracker falls back to them.
const fs = require('fs');
const path = require('path');

const MAX_DEPTH = 4;
const MAX_ENTRIES = 4000; // per game: stop looking in a huge folder tree
const BIG = 30 * 1024 * 1024; // a program this large inside a game folder is the game itself
const MIN_SIZE = 200 * 1024; // smaller ones are only kept when their name matches the game (Unity games have a small launcher-style exe)
const TTL = 14 * 86400000;

// Programs that sit in game folders but are not the game
const NOT_THE_GAME = /crash|report|helper|handler|uninst|unins\d|setup|install|update|patch|redist|vc_?redist|dxsetup|dotnet|launcher|bootstrap|webhelper|cef|subprocess|service|anticheat|anti-cheat|easyanticheat|^eac|beclient|battleye|vanguard|javelin|activation|touchup|cleanup|benchmark|editor|^ue\d?prereq|prereq|python|node\.exe|ffmpeg|7z|redis|cmd\.exe|browser|error|backup|save|settings|busybox|config|server|clearthirdparty|useless|mdoc|ilasm|sqlmetal|mcs\.exe/i;

async function walk(dir, depth, state, out) {
  if (depth > MAX_DEPTH || state.count > MAX_ENTRIES) return;
  let entries = [];
  try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
  state.count += entries.length;
  const dirs = [];
  for (const e of entries) {
    if (e.isFile() && /\.exe$/i.test(e.name)) out.push(path.join(dir, e.name));
    else if (e.isDirectory() && !/^(_commonredist|redist|__installer|directx|vcredist|engine|content|paks|movies|localization|ue\d?prereqsetup|crashreportclient|thirdparty|\.|\$)/i.test(e.name)) dirs.push(path.join(dir, e.name));
  }
  for (const d of dirs) await walk(d, depth + 1, state, out);
}

const flat = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// gameName helps pick the game's own program out of the helpers: "F1 25" matches f1_25.exe, "Beat Saber" matches Beat Saber.exe
async function exeNamesIn(dir, gameName) {
  const found = [];
  await walk(dir, 0, { count: 0 }, found);
  const keys = [flat(gameName), flat(path.basename(dir))].filter((k) => k.length >= 3);
  const names = [];
  for (const f of found) {
    const base = path.basename(f).toLowerCase();
    if (NOT_THE_GAME.test(base)) continue;
    let size = 0;
    try { size = fs.statSync(f).size; } catch { continue; }
    const me = flat(base.replace(/\.exe$/, ''));
    const looksRight = me.length >= 4 && keys.some((k) => k.includes(me) || me.includes(k));
    if (size >= BIG || (size >= MIN_SIZE && looksRight)) names.push(base);
  }
  return [...new Set(names)];
}

// Gives every game item `procNames` (kept in store.data.procCache so the folders are not walked on every start)
async function addProcNames(items, store) {
  const cache = (store.data.procCache = store.data.procCache || {});
  const games = items.filter((i) => i.type === 'game' && i.location);
  const byName = new Map(); // program name -> how many games have it
  for (const g of games) {
    let c = cache[g.id];
    if (!c || c.loc !== g.location || Date.now() - c.at > TTL) {
      let names = [];
      try { if (fs.statSync(g.location).isDirectory()) names = await exeNamesIn(g.location, g.name); } catch {}
      c = cache[g.id] = { loc: g.location, at: Date.now(), names };
    }
    g._names = c.names;
    for (const n of c.names) byName.set(n, (byName.get(n) || 0) + 1);
  }
  for (const g of games) {
    // A name that two games share (a common engine exe, say) would make both look like they are running
    const own = (g._names || []).filter((n) => byName.get(n) === 1);
    delete g._names;
    if (own.length) g.procNames = [...new Set([...(g.procNames || []), ...own])];
  }
  store.save();
}

module.exports = { addProcNames, exeNamesIn };
