// What is a launching game doing while there is no window yet? Often it is installing an update. Two sources:
//  - Steam: the game's appmanifest_<id>.acf says exactly how many bytes are to be downloaded and how many are done.
//  - Anything else (Battle.net, HoYoPlay, Epic...): their progress isn't readable, so we watch how fast the PC is
//    downloading and how much has come in since the launch. That is the whole machine's traffic, so it is shown as
//    "downloaded so far" and only counts as an update when it is fast and steady while no game window exists.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

// ---------- Steam ----------
function acfValue(text, key) {
  const m = text.match(new RegExp(`"${key}"\\s+"(.*?)"`));
  return m ? m[1] : undefined;
}

// Reads a Steam game's manifest. item.location is <library>\steamapps\common\<installdir>.
function readSteamState(item) {
  if (!item || item.source !== 'steam' || !item.appid || !item.location) return null;
  const steamapps = path.dirname(path.dirname(item.location));
  let text;
  try { text = fs.readFileSync(path.join(steamapps, `appmanifest_${item.appid}.acf`), 'utf8'); } catch { return null; }
  const num = (k) => Number(acfValue(text, k)) || 0;
  const flags = num('StateFlags');
  const toDownload = num('BytesToDownload'), downloaded = num('BytesDownloaded');
  const toStage = num('BytesToStage'), staged = num('BytesStaged');
  const pending = !!(flags & 2) || (acfValue(text, 'TargetBuildID') && acfValue(text, 'TargetBuildID') !== '0' && acfValue(text, 'TargetBuildID') !== acfValue(text, 'buildid'));
  const total = toDownload + toStage;
  const done = downloaded + staged;
  // BytesToDownload keeps the size of the *last* update after it has finished, so only count it while an update is pending
  return { flags, pending, running: !!(flags & 1024), total: pending ? total : 0, done: pending ? Math.min(done, total) : 0 };
}

// ---------- Network ----------
// A persistent hidden PowerShell that prints the total bytes received on all active, non-loopback adapters once a second
const NET_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
while ($true) {
  $sum = [int64]0
  foreach ($n in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
    if ($n.OperationalStatus -eq 'Up' -and $n.NetworkInterfaceType -ne 'Loopback' -and $n.NetworkInterfaceType -ne 'Tunnel') { $sum += $n.GetIPv4Statistics().BytesReceived }
  }
  [Console]::Out.WriteLine($sum); [Console]::Out.Flush()
  Start-Sleep -Milliseconds 1000
}`;

class NetMonitor {
  constructor() {
    this.samples = []; // { t, bytes }
    this.base = null;
    this.child = null;
  }

  start() {
    this.child = spawn(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(NET_SCRIPT, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    let buf = '';
    this.child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const bytes = Number(buf.slice(0, i).trim()); buf = buf.slice(i + 1);
        if (!Number.isFinite(bytes) || bytes <= 0) continue;
        const t = Date.now();
        if (this.base === null) this.base = bytes;
        this.samples.push({ t, bytes });
        while (this.samples.length > 60) this.samples.shift();
      }
    });
    this.child.on('error', () => {});
    return this;
  }

  stop() { try { if (this.child) this.child.kill(); } catch {} this.child = null; }

  // Bytes per second over the last `windowMs`, and bytes received since start()
  speed(windowMs = 4000) {
    const s = this.samples;
    if (s.length < 2) return 0;
    const last = s[s.length - 1];
    let first = s[0];
    for (const x of s) if (last.t - x.t <= windowMs) { first = x; break; }
    const dt = (last.t - first.t) / 1000;
    return dt > 0 ? Math.max(0, (last.bytes - first.bytes) / dt) : 0;
  }
  received() { const s = this.samples; return s.length && this.base !== null ? Math.max(0, s[s.length - 1].bytes - this.base) : 0; }
}

// ---------- Steam speed ----------
// Steam only rewrites the manifest every few seconds, so keep a short history and average over it
class RateTracker {
  constructor() { this.points = []; }
  add(value, t = Date.now()) { this.points.push({ t, v: value }); while (this.points.length > 12) this.points.shift(); }
  rate(windowMs = 12000) {
    const p = this.points;
    if (p.length < 2) return 0;
    const last = p[p.length - 1];
    let first = p[0];
    for (const x of p) if (last.t - x.t <= windowMs) { first = x; break; }
    const dt = (last.t - first.t) / 1000;
    return dt > 0 ? Math.max(0, (last.v - first.v) / dt) : 0;
  }
}

const fmtBytes = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.round(b / 1e3)} KB`);
const fmtSpeed = (bps) => `${bps >= 1e9 ? (bps / 1e9).toFixed(1) + ' GB' : bps >= 1e6 ? (bps / 1e6).toFixed(1) + ' MB' : Math.round(bps / 1e3) + ' KB'}/s`;
function fmtEta(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return '';
  if (sec < 90) return 'less than a minute left';
  if (sec < 5400) return `about ${Math.round(sec / 60)} min left`;
  return `about ${(sec / 3600).toFixed(1)} h left`;
}

module.exports = { readSteamState, NetMonitor, RateTracker, fmtBytes, fmtSpeed, fmtEta };
