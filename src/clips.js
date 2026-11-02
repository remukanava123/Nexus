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

// Clips the player can't show as they are get a copy it can. Medal's own ffmpeg does the work.
//   H.264 with one audio track: played as it is.
//   H.264 with several audio tracks (everything, the game, your microphone): Chromium often freezes the picture while
//   the sound goes on, so the copy keeps only the first track (the full mix). Streams are copied, a fraction of a second.
//   HEVC (H.265, which Medal records with a GPU encoder) or anything else: Chromium plays the sound but shows no picture
//   on many PCs, so the copy is converted to H.264, on the graphics card when it can (NVIDIA, AMD or Intel; a 2-minute
//   clip takes a few seconds), otherwise on the processor (closer to half a minute).
function findFfmpeg() {
  const base = path.join(process.env.LOCALAPPDATA || '', 'Medal');
  try {
    const dirs = fs.readdirSync(base).filter((d) => /^recorder-/i.test(d)).sort().reverse();
    for (const d of dirs) for (const f of ['ffmpeg7.exe', 'ffmpeg.exe']) if (fs.existsSync(path.join(base, d, f))) return path.join(base, d, f);
  } catch {}
  return null;
}

const CACHE_MAX = 2 * 1024 ** 3; // keep at most 2 GB of copies; the oldest go first
const CACHE_TAG = 'v2-'; // copies made before HEVC was converted (some only had their audio fixed) are thrown away
function trimCache(dir) {
  try {
    const list = fs.readdirSync(dir).map((f) => { const p = path.join(dir, f); const st = fs.statSync(p); return { f, p, size: st.size, t: st.mtimeMs }; }).sort((a, b) => b.t - a.t);
    let total = 0;
    for (const x of list) {
      if (!x.f.startsWith(CACHE_TAG)) { fs.rmSync(x.p, { force: true }); continue; }
      total += x.size;
      if (total > CACHE_MAX) fs.rmSync(x.p, { force: true });
    }
  } catch {}
}

const runFfmpeg = (ffmpeg, args, { onStderr, onStdout, ms = 600000 } = {}) => new Promise((resolve) => {
  const { spawn } = require('child_process');
  const child = spawn(ffmpeg, args, { windowsHide: true });
  let err = '';
  const timer = setTimeout(() => { try { child.kill(); } catch {} }, ms);
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (d) => { err += d; if (onStderr) onStderr(d); });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => { if (onStdout) onStdout(d); });
  child.on('error', () => { clearTimeout(timer); resolve({ code: -1, err }); });
  child.on('exit', (code) => { clearTimeout(timer); resolve({ code, err }); });
});

// -> { video: 'h264' | 'hevc' | ..., audio: number of audio tracks, dur: seconds }, from what ffmpeg prints about the file
const probes = new Map();
async function probe(ffmpeg, p) {
  if (probes.has(p)) return probes.get(p);
  const { err } = await runFfmpeg(ffmpeg, ['-hide_banner', '-i', p], { ms: 15000 });
  const video = ((err.match(/Stream #\d+:\d+[^:]*: Video: (\w+)/) || [])[1] || '').toLowerCase();
  const audio = (err.match(/Stream #\d+:\d+[^:]*: Audio:/g) || []).length;
  const d = err.match(/Duration: (\d+):(\d+):([\d.]+)/);
  const info = { video, audio, dur: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : 0 };
  if (video) probes.set(p, info);
  return info;
}

// The first H.264 encoder that works on this PC, found once: the graphics card's, then the processor's
let encoder = null;
const ENCODERS = [['h264_nvenc', '-preset', 'p1'], ['h264_amf', '-quality', 'speed'], ['h264_qsv', '-preset', 'veryfast'], ['libx264', '-preset', 'veryfast']];
async function pickEncoder(ffmpeg) {
  if (encoder) return encoder;
  for (const e of ENCODERS.slice(0, -1)) {
    const { code } = await runFfmpeg(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=256x144:d=0.2', '-c:v', ...e, '-f', 'null', '-'], { ms: 15000 });
    if (code === 0) return (encoder = e);
  }
  return (encoder = ENCODERS[ENCODERS.length - 1]);
}

const jobs = new Map(); // one copy per clip at a time, however often it is asked for
// -> { url, converted } to play (the original when it plays fine), or { url: null } when Nexus can't make a copy.
// quick: only say what is ready now, never start a copy (hover previews). onProgress(0..1) while converting.
async function playable(p, cacheDir, { quick = false, onProgress } = {}) {
  if (!known(p)) return { url: null };
  const original = { url: pathToFileURL(p).href, converted: false };
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) return original;
  let st;
  try { st = fs.statSync(p); } catch { return { url: null }; }
  const key = require('crypto').createHash('sha1').update(`${p}|${st.size}|${st.mtimeMs}`).digest('hex').slice(0, 16);
  const out = path.join(cacheDir, `${CACHE_TAG}${key}.mp4`);
  if (fs.existsSync(out)) { try { fs.utimesSync(out, new Date(), new Date()); } catch {} return { url: pathToFileURL(out).href, converted: true }; }
  const info = await probe(ffmpeg, p);
  const convert = info.video && info.video !== 'h264';
  if (!convert && info.audio <= 1) return original;
  if (quick) return convert ? { url: null } : original;
  if (jobs.has(out)) return jobs.get(out);
  const job = (async () => {
    fs.mkdirSync(cacheDir, { recursive: true });
    trimCache(cacheDir);
    const tmp = `${out}.part.mp4`;
    const video = convert ? ['-c:v', ...(await pickEncoder(ffmpeg)), '-b:v', '10M', '-maxrate', '14M', '-bufsize', '20M', '-pix_fmt', 'yuv420p'] : ['-c:v', 'copy'];
    const args = ['-hide_banner', '-loglevel', 'error', '-y', ...(convert ? ['-hwaccel', 'auto'] : []), '-i', p, '-map', '0:v:0', '-map', '0:a:0?', ...video, '-c:a', 'copy', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', tmp];
    const { code } = await runFfmpeg(ffmpeg, args, {
      onStdout: (d) => { const m = d.match(/out_time_us=(\d+)/g); if (m && info.dur && onProgress) onProgress(Math.min(1, Number(m[m.length - 1].split('=')[1]) / 1e6 / info.dur)); },
    });
    try {
      if (code === 0) { fs.renameSync(tmp, out); return { url: pathToFileURL(out).href, converted: true }; }
      fs.rmSync(tmp, { force: true });
    } catch {}
    return convert ? { url: null } : original;
  })();
  jobs.set(out, job);
  try { return await job; } finally { jobs.delete(out); }
}

// Opens the Medal app (its own library). Medal's installer stub starts the current version, or the version folder directly.
function openMedal() {
  const { spawn } = require('child_process');
  const base = path.join(process.env.LOCALAPPDATA || '', 'Medal');
  for (const exe of [path.join(base, 'Medal.exe'), path.join(base, 'current', 'Medal.exe')]) {
    if (!fs.existsSync(exe)) continue;
    try { spawn(exe, [], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref(); return true; } catch {}
  }
  return false;
}

module.exports = { list, known, medalFolders, openMedal, playable };
