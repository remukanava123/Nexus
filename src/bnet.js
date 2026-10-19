// Starting a Blizzard game through Battle.net. `Battle.net.exe --exec="launch <code>"` only works when Battle.net is
// already running and logged in: sent while it is still starting, the command is dropped and you just get the launcher.
// So: make sure Battle.net is up, wait until its window title is "Battle.net" (it says "Battle.net Login" until the
// automatic sign-in finishes), give it a moment, then send the command to the running copy.
const { spawn, execFile } = require('child_process');
const path = require('path');

const SYS32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
const TASKLIST = path.join(SYS32, 'tasklist.exe');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Window titles of the running Battle.net client ([] when it isn't running, 'N/A'-titled helper processes dropped)
function battleNetTitles() {
  return new Promise((resolve) => {
    execFile(TASKLIST, ['/v', '/fi', 'IMAGENAME eq Battle.net.exe', '/fo', 'csv', '/nh'], { windowsHide: true, timeout: 15000 }, (err, out) => {
      if (err) return resolve(null); // couldn't ask: treat as unknown
      const rows = String(out).split(/\r?\n/).filter((l) => /^"Battle\.net\.exe"/i.test(l));
      const titles = rows.map((l) => { const m = l.match(/"([^"]*)"\s*$/); return m ? m[1] : ''; });
      resolve({ running: rows.length > 0, titles: titles.filter((t) => t && t !== 'N/A') });
    });
  });
}

const isLoggedIn = (titles) => titles.some((t) => /^Battle\.net$/i.test(t.trim()));
const isLoginScreen = (titles) => titles.some((t) => /login|log in|sign in/i.test(t));

// opts: { exe, code, onPhase(name), onNeedsLogin(), timeoutMs, dry }  ->  resolves 'sent' | 'dry' | 'timeout'
async function launchViaBattleNet({ exe, code, onPhase, onNeedsLogin, timeoutMs = 180000, dry = false }) {
  const t0 = Date.now();
  const start = () => spawn(exe, [], { cwd: path.dirname(exe), detached: true, stdio: 'ignore', windowsHide: false }).unref();
  // Judge by whether a Battle.net *window* exists: a leftover background process alone doesn't count. Starting it again
  // while it is running just brings the existing one forward.
  const first = await battleNetTitles();
  if (!first || !first.titles.length) start();
  let steady = 0;
  let warned = false;
  let lastStart = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    await sleep(1500);
    const s = await battleNetTitles();
    if (!s) continue;
    if (s.titles.length && onPhase) onPhase('launcher');
    if (!s.titles.length && Date.now() - lastStart > 25000) { start(); lastStart = Date.now(); } // still no window: try again
    if (isLoggedIn(s.titles)) {
      if (++steady >= 2) break; // logged in on two checks in a row (about 3 s)
    } else {
      steady = 0;
      if (isLoginScreen(s.titles) && !warned && Date.now() - t0 > 40000) { warned = true; if (onNeedsLogin) onNeedsLogin(); }
    }
  }
  if (steady < 2) return 'timeout';
  if (dry) return 'dry';
  spawn(exe, [`--exec="launch ${code}"`], { cwd: path.dirname(exe), detached: true, stdio: 'ignore', windowsVerbatimArguments: true, windowsHide: true }).unref();
  if (onPhase) onPhase('pressed');
  return 'sent';
}

module.exports = { launchViaBattleNet, battleNetTitles, isLoggedIn, isLoginScreen };
