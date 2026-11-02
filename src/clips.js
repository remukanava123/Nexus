// Clips and screenshots from Medal (medal.tv). Medal keeps them as <folder>\Clips\<game>\*.mp4 and <folder>\Screenshots\<game>\*,
// with a picture of each clip in <folder>\.Thumbnails (older versions: Thumbnails). The folder is set in Medal's own settings.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');

const VIDEO = /\.(mp4|mkv|webm|mov)$/i;
const IMAGE = /\.(png|jpe?g|webp|bmp)$/i;
const CACHE_MS = 60000;
let cache = null, cacheKey = '', cacheAt = 0;

// Medal's clip folder from its settings (recorder.clipFolder), then the usual places
function medalFolders(custom) {
  const out = [];
  if (custom) out.push(custom);
  try {
    const s = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA || '', 'Medal', 'store', 'settings.json'), 'utf8'));
    if (s && s.recorder && s.recorder.clipFolder) out.push(s.recorder.clipFolder);
  } catch {}
  out.push('C:\\Medal', path.join(os.homedir(), 'Videos', 'Medal'), path.join(os.homedir(), 'Medal'));
  const seen = new Set();
  return out.filter((d) => {
    const k = path.resolve(d).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    try { return fs.statSync(path.join(d, 'Clips')).isDirectory() || fs.statSync(path.join(d, 'Screenshots')).isDirectory(); } catch { return false; }
  });
}

const dirs = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { return []; } };
const files = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name); } catch { return []; } };

function scanFolder(root, list) {
  const thumbs = new Map();
  for (const t of ['.Thumbnails', 'Thumbnails']) for (const f of files(path.join(root, t))) thumbs.set(path.parse(f).name.toLowerCase(), path.join(root, t, f));
  for (const [sub, type, re] of [['Clips', 'clip', VIDEO], ['Screenshots', 'shot', IMAGE]]) {
    const base = path.join(root, sub);
    // clips sit in one folder per game; a few versions also drop loose files straight into Clips
    for (const game of ['', ...dirs(base)]) {
      for (const f of files(path.join(base, game))) {
        if (!re.test(f)) continue;
        const p = path.join(base, game, f);
        let st;
        try { st = fs.statSync(p); } catch { continue; }
        if (!st.size) continue; // still being written
        const thumb = type === 'shot' ? p : thumbs.get(path.parse(f).name.toLowerCase());
        list.push({ path: p, url: pathToFileURL(p).href, thumb: thumb ? pathToFileURL(thumb).href : '', type, game: game || 'Other', t: st.mtimeMs, size: st.size });
      }
    }
  }
}

// -> { folders: [...], clips: [{ path, url, thumb, type: 'clip' | 'shot', game, t, size }] }, newest first
function list(custom, force) {
  const key = String(custom || '');
  if (!force && cache && key === cacheKey && Date.now() - cacheAt < CACHE_MS) return cache;
  const folders = medalFolders(custom);
  const clips = [];
  for (const f of folders) scanFolder(f, clips);
  clips.sort((a, b) => b.t - a.t);
  cache = { folders, clips }; cacheKey = key; cacheAt = Date.now();
  return cache;
}

// Only files from the last scan may be opened or shown, so the page cannot open anything else
const known = (p) => !!(cache && cache.clips.some((c) => c.path === p));

module.exports = { list, known, medalFolders };
