// Which installed games have an update waiting, so the Games page can say so before you press Play.
//   Steam: the game's appmanifest says an update is queued (Steam itself checks; it shows here once Steam has noticed).
//   HoYoPlay (Star Rail, Genshin, ZZZ): the version in the game folder's config.ini against HoYoverse's current one.
//   Wuthering Waves: the version in launcherDownloadConfig.json against Kuro's launcher index.
//   Battle.net: the game folder's .build.info against Blizzard's public version list for that product.
// Epic and EA keep their versions behind a login, so they are not checked.
const fs = require('fs');
const path = require('path');
const updates = require('./updates');

const HOYO_BRANCHES = 'https://sg-hyp-api.hoyoverse.com/hyp/hyp-connect/api/getGameBranches?launcher_id=VYTpXlbWo8';
const KURO_INDEX = 'https://prod-alicdn-gamestarter.kurogame.com/launcher/game/G153/50004_obOHXFrFanqsaIEOmuKroCcbZkQRBC7c/index.json';

// "4.6.0" vs "4.10.1": -1, 0 or 1
function cmpVersion(a, b) {
  const x = String(a).split('.').map((n) => parseInt(n, 10) || 0), y = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d < 0 ? -1 : 1; }
  return 0;
}

const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };

function hoyoLocal(it) {
  const ini = readText(path.join(it.location || '', 'config.ini'));
  return ini ? ((ini.match(/^\s*game_version\s*=\s*([\d.]+)/m) || [])[1] || null) : null;
}

// The newest version among the base game and its resource bundles ("HD" and the like are patched separately)
function kuroLocal(it) {
  for (const dir of [it.location, path.join(it.location || '', 'Wuthering Waves Game'), path.join(path.dirname(it.location || ''), 'Wuthering Waves Game')]) {
    const text = readText(path.join(dir || '', 'launcherDownloadConfig.json'));
    if (!text) continue;
    try {
      const j = JSON.parse(text);
      const all = [j.version, ...Object.values(j.bundles || {}).map((b) => b && b.version)].filter(Boolean);
      if (all.length) return all.sort(cmpVersion).pop();
    } catch {}
  }
  return null;
}

// Blizzard's pipe-separated tables: a "Name!TYPE:n|..." header row, then one row per line ("## seqn" lines are comments)
function parseBpsv(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
  if (!lines.length) return [];
  const cols = lines[0].split('|').map((c) => c.split('!')[0]);
  return lines.slice(1).map((l) => { const v = l.split('|'); return Object.fromEntries(cols.map((c, i) => [c, v[i]])); });
}

// What the game folder says is installed: one row per product in .build.info (WoW keeps retail and Classic in one folder)
function bnetLocal(it) {
  const text = readText(path.join(it.location || '', '.build.info'));
  return text ? parseBpsv(text).filter((r) => r.Active === '1' && r.Product && r['Build Key']) : [];
}

// -> { [id]: { needs: true, local, remote, source } } for games with an update; games that are up to date are left out
async function check(items, fetchJson, fetchText) {
  const out = {};
  const games = items.filter((i) => i.type === 'game');
  for (const it of games.filter((g) => g.source === 'steam')) {
    const st = updates.readSteamState(it);
    if (st && st.pending) out[it.id] = { needs: true, source: 'steam', downloading: st.running };
  }
  const hoyo = games.filter((g) => g.source === 'hoyoplay');
  if (hoyo.length) {
    try {
      const j = await fetchJson(HOYO_BRANCHES);
      const remote = {};
      for (const b of (j && j.data && j.data.game_branches) || []) if (b.game && b.main && b.main.tag) remote[b.game.biz] = b.main.tag;
      for (const it of hoyo) {
        const biz = it.id.replace(/^hoyo:/, ''), local = hoyoLocal(it);
        if (local && remote[biz] && cmpVersion(local, remote[biz]) < 0) out[it.id] = { needs: true, source: 'hoyoplay', local, remote: remote[biz] };
      }
    } catch { /* offline */ }
  }
  if (fetchText) {
    const versions = {}; // product -> its rows, fetched once however many games share it
    for (const it of games.filter((g) => g.source === 'battlenet')) {
      for (const row of bnetLocal(it)) {
        try {
          const code = row.Product.toLowerCase();
          if (!versions[code]) versions[code] = parseBpsv(await fetchText(`https://us.version.battle.net/v2/products/${code}/versions`));
          // The row for the branch the game is on (eu, us...); another region's row is not what the launcher would install
          const remote = versions[code].find((r) => r.Region === row.Branch) || versions[code].find((r) => r.Region === 'us');
          if (remote && remote.BuildConfig && remote.BuildConfig !== row['Build Key']) {
            out[it.id] = { needs: true, source: 'battlenet', local: row.Version, remote: remote.VersionsName };
            break;
          }
        } catch { /* offline, or a product Blizzard doesn't list */ }
      }
    }
  }
  const kuro = games.find((g) => g.source === 'kuro');
  if (kuro) {
    try {
      const j = await fetchJson(KURO_INDEX);
      const remote = j && j.default && (j.default.version || (j.default.config && j.default.config.version));
      const local = kuroLocal(kuro);
      if (local && remote && cmpVersion(local, remote) < 0) out[kuro.id] = { needs: true, source: 'kuro', local, remote };
    } catch {}
  }
  return out;
}

module.exports = { check, cmpVersion };
