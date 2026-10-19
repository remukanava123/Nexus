// Playtime tracker: one long-lived hidden PowerShell lists the running programs every few seconds,
// and any game whose install folder (or exe) is among them counts as "playing".
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const INTERVAL_SECONDS = 8;
const SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
while ($true) {
  # Elevated / protected games (HSR, WuWa) hide their path from us, so fall back to "?name.exe"
  $paths = Get-CimInstance Win32_Process -Property ExecutablePath,Name | ForEach-Object { if ($_.ExecutablePath) { $_.ExecutablePath.ToLower() } elseif ($_.Name) { '?' + $_.Name.ToLower() } } | Sort-Object -Unique
  [Console]::Out.WriteLine((ConvertTo-Json -Compress -InputObject @($paths)))
  Start-Sleep -Seconds ${INTERVAL_SECONDS}
}`;

const HELPER = /crash|uninst|unins\d|redist|vc_redist|dxsetup|dotnet|installer/i;
const MAX_SESSIONS = 3000;

class Tracker extends EventEmitter {
  // getGames(): [{ id, name, dirs: [folder], exes: [file] }] for everything worth tracking
  constructor(store, getGames) {
    super();
    this.store = store;
    this.getGames = getGames;
    this.child = null;
    this.buffer = '';
    this.active = new Map(); // id -> { start, lastTick, reminded }
    this.restartTimer = null;
    this.lastSave = 0;
    this.stopped = true;
  }

  start() {
    if (this.child) return;
    this.stopped = false;
    this.child = spawn(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => {
      this.buffer += chunk;
      let i;
      while ((i = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, i).trim();
        this.buffer = this.buffer.slice(i + 1);
        if (!line) continue;
        try { this.onSnapshot([].concat(JSON.parse(line))); } catch {}
      }
    });
    this.child.on('exit', () => {
      this.child = null;
      if (!this.stopped) this.restartTimer = setTimeout(() => this.start(), 5000);
    });
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.restartTimer);
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
        a = { start: now, lastTick: now, reminded: false };
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

// Turn the scanned game list into the folders / files to look for
function watchList(items) {
  return items.filter((i) => i.type === 'game' && i.location).map((i) => {
    const loc = i.location.toLowerCase();
    let isFile = /\.(exe|lnk|bat|cmd)$/i.test(loc);
    if (!isFile) { try { isFile = fs.statSync(i.location).isFile(); } catch {} }
    // Process names to fall back on when Windows won't tell us the path (only used for path-less processes)
    const names = (i.procNames || [i.iconPath]).filter((n) => n && /\.exe$/i.test(n)).map((n) => path.basename(n).toLowerCase()).filter((n) => !/^(launcher|setup|update)/.test(n));
    return { id: i.id, name: i.name, dirs: isFile ? [] : [loc.endsWith('\\') ? loc : `${loc}\\`], exes: isFile ? [loc] : [], names };
  });
}

module.exports = { Tracker, watchList };
