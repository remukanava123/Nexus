// Playtime tracker: one long-lived hidden PowerShell lists the running programs every few seconds,
// and any game whose install folder (or exe) is among them counts as "playing".
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const ps = require('./ps');
const IS_LINUX = process.platform === 'linux';

// Listing the programs is cheap (NX.ProcPaths in src/ps.js, no WMI), so it runs often enough that Nexus notices a game
// closing within a few seconds. It also reads the path of most elevated games, which WMI couldn't.
const INTERVAL_SECONDS = 3;
const script = () => `
$ErrorActionPreference = 'SilentlyContinue'
${ps.loader()}
while ($true) {
  # one line: every program's lower-case path, or "?name.exe" when Windows hides it (protected games)
  [Console]::Out.WriteLine([NX]::ProcPaths())
  Start-Sleep -Seconds ${INTERVAL_SECONDS}
}`;

const HELPER = /crash|uninst|unins\d|redist|vc_redist|dxsetup|dotnet|installer/i;
const MAX_SESSIONS = 3000;

class Tracker extends EventEmitter {
  // getGames(): [{ id, name, dirs: [folder], exes: [file], names: [exe name] }] for everything worth tracking
  constructor(store, getGames) {
    super();
    this.store = store;
    this.getGames = getGames;
    this.child = null;
    this.active = new Map(); // id -> { start, lastTick, remindAt? }
    this.restartTimer = null;
    this.lastSave = 0;
    this.stopped = true;
  }

  start() {
    if (this.child || this.timer) return;
    this.stopped = false;
    if (IS_LINUX) {
      // No helper process on Linux: the running programs are read straight from /proc
      const linux = require('./linux');
      const tick = async () => { try { this.onSnapshot(await linux.snapshot()); } catch {} };
      tick();
      this.timer = setInterval(tick, INTERVAL_SECONDS * 1000);
      return;
    }
    const child = ps.run(script(), {
      onLine: (line) => { if (this.child === child) this.onSnapshot(line.split('|')); },
      onExit: () => {
        if (this.child !== child) return; // a helper that was stopped already; a newer one may be running
        this.child = null;
        if (!this.stopped) this.restartTimer = setTimeout(() => this.start(), 5000);
      },
    });
    this.child = child;
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.restartTimer);
    clearInterval(this.timer); this.timer = null;
    if (this.child) { try { this.child.kill(); } catch {} this.child = null; }
    this.finishAll();
  }

  onSnapshot(paths) {
    const now = Date.now();
    const running = new Set();
    for (const g of this.getGames()) {
      const hit = paths.some((p) => {
        if (p[0] === '?') return g.names.includes(p.slice(1)) && !HELPER.test(p);
        return !HELPER.test(path.basename(p)) && (g.exes.includes(p) || g.dirs.some((d) => p.startsWith(d)));
      });
      if (hit) running.add(g.id);
    }

    let changed = false;
    for (const id of running) {
      let a = this.active.get(id);
      if (!a) {
        a = { start: now, lastTick: now };
        this.active.set(id, a);
        this.store.data.recents[id] = now;
        changed = true;
        this.emit('start', id);
      }
      // Count the time since the last snapshot (capped, in case the PC slept in between)
      const pt = (this.store.data.playtime[id] = this.store.data.playtime[id] || { total: 0, count: 0, last: 0 });
      pt.total += Math.min((now - a.lastTick) / 1000, INTERVAL_SECONDS * 3);
      pt.last = now;
      a.lastTick = now;
      this.emit('tick', id, now - a.start, a);
    }
    for (const id of [...this.active.keys()]) {
      if (!running.has(id)) { this.endSession(id, now); changed = true; }
    }

    this.store.runtime.running = Object.fromEntries([...this.active].map(([id, a]) => [id, a.start]));
    if (changed) { this.store.save(); this.emit('change'); this.lastSave = now; }
    else if (this.active.size && now - this.lastSave > 60000) { this.store.save(); this.lastSave = now; }
  }

  endSession(id, now) {
    const a = this.active.get(id);
    if (!a) return;
    this.active.delete(id);
    const pt = this.store.data.playtime[id];
    if (now - a.start >= 60000) {
      if (pt) pt.count += 1;
      this.store.data.sessions.push([id, a.start, now]);
      if (this.store.data.sessions.length > MAX_SESSIONS) this.store.data.sessions.splice(0, this.store.data.sessions.length - MAX_SESSIONS);
    }
    this.emit('end', id, now - a.start);
  }

  finishAll() {
    const now = Date.now();
    for (const id of [...this.active.keys()]) this.endSession(id, now);
    this.store.runtime.running = {};
    this.store.save();
  }
}

// Folders that hold unrelated programs too: a game whose exe sits right in one of these is only matched by its exe
const SHARED_DIR = /^[a-z]:\\$|^[a-z]:\\(windows|program files|program files \(x86\)|programdata|users|games)\\$|\\(system32|syswow64|desktop|downloads|documents|appdata\\local|appdata\\roaming|windowsapps)\\$|^[a-z]:\\users\\[^\\]+\\$/i;

// The folder to watch for a game that was found as a single exe (a custom game, a Start Menu shortcut's target).
// That exe is often only a launcher that starts the real game next to it (Roblox's launcher starts RobloxPlayerBeta.exe),
// so the whole folder counts, unless it is a shared one. A "version-..." folder (Roblox) is replaced on every update,
// so its parent is watched instead.
function folderOf(exe) {
  let dir = path.dirname(exe);
  if (/^version-/i.test(path.basename(dir))) dir = path.dirname(dir);
  if (!dir.endsWith('\\')) dir += '\\';
  return SHARED_DIR.test(dir) ? null : dir;
}

// Turn the scanned game list into the folders / files to look for
function watchList(items) {
  if (IS_LINUX) return watchListLinux(items);
  return items.filter((i) => i.type === 'game' && i.location).map((i) => {
    const loc = i.location.toLowerCase();
    let isFile = /\.(exe|lnk|bat|cmd)$/i.test(loc);
    if (!isFile) { try { isFile = fs.statSync(i.location).isFile(); } catch {} }
    // Process names to fall back on when Windows won't tell us the path (only used for path-less processes)
    const names = [...(i.procNames || []), i.iconPath].filter((n) => n && /\.exe$/i.test(n)).map((n) => path.basename(n).toLowerCase()).filter((n) => !/^(launcher|setup|update)/.test(n));
    const folder = isFile && /\.exe$/.test(loc) ? folderOf(loc) : null;
    const dirs = !isFile ? [loc.endsWith('\\') ? loc : `${loc}\\`] : folder ? [folder] : [];
    return { id: i.id, name: i.name, dirs, exes: isFile ? [loc] : [], names };
  });
}

// Linux paths are case-sensitive, but the snapshot is lower-cased like on Windows, so these are too
function watchListLinux(items) {
  return items.filter((i) => i.type === 'game' && (i.location || i.procNames)).map((i) => {
    const loc = (i.location || '').toLowerCase();
    let isFile = false;
    try { isFile = !!loc && fs.statSync(i.location).isFile(); } catch {}
    const names = (i.procNames || []).map((n) => String(n).toLowerCase().replace(/\.exe$/, ''));
    return { id: i.id, name: i.name, dirs: loc && !isFile ? [loc.endsWith('/') ? loc : `${loc}/`] : [], exes: isFile ? [loc] : [], names };
  });
}

module.exports = { Tracker, watchList, folderOf };
