// Watches a launching game: finds its window, decides when the window has "settled" (stopped resizing, title stable,
// big enough to be the real thing rather than a splash) and can bring it to the front.
const ps = require('./ps');

// Prints one line per poll for the biggest visible window belonging to the game:
//   W|hwnd|left|top|width|height|foreground(0/1)|minimised(0/1)|sound|title        or  N|sound  when there is none yet
// sound is how loud the game's own processes are right now (0..1), or 0 when not asked for (NX_AUDIO).
// Elevated games hide their path from us, so for those it falls back to matching the process name. The work is done by
// NXWatch in src/ps.js (one pass over the windows per poll).
const watchScript = () => `
$ErrorActionPreference = 'SilentlyContinue'
${ps.loader()}
$w = New-Object NXWatch -ArgumentList "$env:NX_DIRS", "$env:NX_EXES", "$env:NX_NAMES"
$audio = $env:NX_AUDIO -eq '1'
$ms = if ($env:NX_INTERVAL) { [int]$env:NX_INTERVAL } else { 600 }
$out = [Console]::Out
while ($true) {
  $out.WriteLine($w.Poll($audio)); $out.Flush()
  Start-Sleep -Milliseconds $ms
}`;

// -> { sample: the window (or null when there is none), sound: how loud the game is (0..1) }
function parseLine(line) {
  const parts = String(line || '').split('|');
  if (parts[0] === 'N') return { sample: null, sound: Number(parts[1]) || 0 };
  if (parts[0] !== 'W') return { sample: null, sound: 0 };
  const [, hwnd, left, top, w, h, fg, ic, snd, ...title] = parts;
  return {
    sample: { hwnd, left: +left, top: +top, w: +w, h: +h, fg: fg === '1', iconic: ic === '1', title: title.join('|').trim() },
    sound: Number(snd) || 0,
  };
}

// Decides from a stream of samples when the game's window is "ready": big enough, not minimised, and the same
// size, place and title for settleMs in a row. Some games swap a splash window for the real one, which resets it.
class Settler {
  constructor({ settleMs = 3500, minW = 480, minH = 270 } = {}) {
    Object.assign(this, { settleMs, minW, minH });
    this.key = null; this.stableSince = 0; this.titleChanges = 0; this.lastTitle = null; this.hwnd = null; this.seen = false;
  }

  // Returns { phase: 'starting' | 'window' | 'settling' | 'settled', hwnd }
  feed(sample, t) {
    if (!sample) { this.key = null; return { phase: this.seen ? 'window' : 'starting', hwnd: null }; }
    this.seen = true;
    if (sample.hwnd !== this.hwnd) { this.hwnd = sample.hwnd; this.titleChanges = 0; this.lastTitle = sample.title; }
    else if (sample.title !== this.lastTitle) { this.lastTitle = sample.title; this.titleChanges++; }
    // A title that keeps changing (an FPS counter, say) would never settle, so after a few changes we stop looking at it
    const title = this.titleChanges > 4 ? '' : sample.title;
    const key = `${sample.hwnd}|${sample.left}|${sample.top}|${sample.w}|${sample.h}|${sample.iconic}|${title}`;
    if (key !== this.key) { this.key = key; this.stableSince = t; }
    const big = !sample.iconic && sample.w >= this.minW && sample.h >= this.minH;
    if (!big) return { phase: 'window', hwnd: sample.hwnd };
    if (t - this.stableSince >= this.settleMs) return { phase: 'settled', hwnd: sample.hwnd };
    return { phase: 'settling', hwnd: sample.hwnd };
  }
}

// Starts the poller. onSample(sample or null, sound 0..1) every ~0.6s. With { audio: true } it also measures the
// game's sound (otherwise sound is always 0). Returns { stop() }.
function startWatch(spec, extraNames, onSample, { audio = false, interval = 600 } = {}) {
  if (process.platform === 'linux') return require('./linux').startWatch(spec, extraNames, onSample);
  const child = ps.run(watchScript(), {
    env: { NX_DIRS: spec.dirs.join('|'), NX_EXES: spec.exes.join('|'), NX_NAMES: [...spec.names, ...extraNames].join('|'), NX_AUDIO: audio ? '1' : '0', NX_INTERVAL: String(interval) },
    onLine: (line) => { const { sample, sound } = parseLine(line); onSample(sample, sound); },
  });
  return { stop() { try { child.kill(); } catch {} } };
}

// Runs a short Win32 call and resolves with what it printed ('' if it failed or took longer than ms)
function runWin32(code, ms) {
  return new Promise((resolve) => {
    let out = '';
    const child = ps.run(`${ps.loader()}
[Console]::Out.WriteLine(${code})`, {
      onLine: (l) => { out += l; },
      onExit: () => { clearTimeout(timer); resolve(out.trim()); },
    });
    const timer = setTimeout(() => { try { child.kill(); } catch {} resolve(''); }, ms);
    child.on('error', () => { clearTimeout(timer); resolve(''); });
  });
}

const isHwnd = (h) => /^\d+$/.test(String(h));

// One-off: raise a window (by handle) to the foreground. Resolves true when it ended up in front.
async function bringToFront(hwnd) {
  if (process.platform !== 'win32') return false;
  if (!isHwnd(hwnd)) return false;
  return /true/i.test(await runWin32(`[NX]::Front([IntPtr]${hwnd})`, 6000));
}

// Slip window "me" in right behind "target" (raising the target first), or with no target behind whatever opens
// next (waiting up to waitMs for it; since = when the app was launched). Resolves { front, placed }.
async function placeBehind(me, target, { raise = true, waitMs = 0, since = 0 } = {}) {
  if (process.platform !== 'win32') return { front: false, placed: false };
  if (!isHwnd(me)) return { front: false, placed: false };
  const t = isHwnd(target) ? target : 0;
  const out = await runWin32(`[NX]::Behind([IntPtr]${me}, [IntPtr]${t}, $${raise ? 'true' : 'false'}, ${Math.round(waitMs)}, ${since ? Math.round(Date.now() - since + 3000) : 0})`, waitMs + 8000);
  const [front, placed] = out.split('|');
  return { front: /true/i.test(front), placed: /true/i.test(placed) };
}

module.exports = { Settler, startWatch, bringToFront, placeBehind, parseLine };
