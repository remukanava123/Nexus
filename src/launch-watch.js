// Watches a launching game: finds its window, decides when the window has "settled" (stopped resizing, title stable,
// big enough to be the real thing rather than a splash) and can bring it to the front.
const { spawn } = require('child_process');
const path = require('path');

const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

const WIN32 = `
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class NX {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool f);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  // Windows only lets the foreground app hand over focus, so borrow its input queue for a moment
  public static bool Front(IntPtr h) {
    if (IsIconic(h)) ShowWindow(h, 9);
    uint pid; uint fgThread = GetWindowThreadProcessId(GetForegroundWindow(), out pid);
    uint me = GetCurrentThreadId();
    AttachThreadInput(me, fgThread, true);
    keybd_event(0x12, 0, 0, UIntPtr.Zero); keybd_event(0x12, 0, 2, UIntPtr.Zero);
    BringWindowToTop(h); bool ok = SetForegroundWindow(h);
    AttachThreadInput(me, fgThread, false);
    return ok && GetForegroundWindow() == h;
  }
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  // Put window "me" directly behind "target" in the stacking order, without activating anything. With no target, wait
  // up to waitMs for some other window to take the foreground (an app that is opening) and go behind that one;
  // failing that, go to the very back. Returns "front|placed": did the target come to the front, did "me" move.
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint c);
  // Visible, titled, unowned top-level windows (what shows on the taskbar), apart from our own
  static System.Collections.Generic.List<IntPtr> AppWindows(uint mine) {
    var list = new System.Collections.Generic.List<IntPtr>();
    EnumWindows((h, l) => {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid != mine && IsWindowVisible(h) && !IsIconic(h) && GetWindowTextLength(h) > 0 && GetWindow(h, 4) == IntPtr.Zero && (GetWindowLong(h, -20) & 0x80) == 0) list.Add(h);
      return true;
    }, IntPtr.Zero);
    return list;
  }
  public static string Behind(IntPtr me, IntPtr target, bool raise, int waitMs, int sinceMs) {
    bool front = false;
    if (target == IntPtr.Zero) {
      // the app either takes the foreground, or opens a new window that Windows left in the background
      uint mine; GetWindowThreadProcessId(me, out mine);
      var before = new System.Collections.Generic.HashSet<IntPtr>(AppWindows(mine));
      DateTime since = DateTime.Now.AddMilliseconds(-sinceMs); // windows of processes started since the launch count as new too
      foreach (IntPtr h in AppWindows(mine)) { uint p; GetWindowThreadProcessId(h, out p); try { if (System.Diagnostics.Process.GetProcessById((int)p).StartTime >= since) before.Remove(h); } catch {} }
      DateTime end = DateTime.Now.AddMilliseconds(waitMs);
      while (DateTime.Now < end) {
        IntPtr fg = GetForegroundWindow();
        if (fg != IntPtr.Zero && fg != me) { target = fg; break; }
        foreach (IntPtr h in AppWindows(mine)) if (!before.Contains(h)) { target = h; break; }
        if (target != IntPtr.Zero) { if (raise) front = Front(target); break; }
        System.Threading.Thread.Sleep(150);
      }
    } else if (raise) front = Front(target);
    bool placed;
    // a topmost target (the taskbar, an overlay) is above us anyway; going "after" it would make us topmost too
    if (target != IntPtr.Zero && (GetWindowLong(target, -20) & 8) != 0) placed = true;
    else placed = SetWindowPos(me, target == IntPtr.Zero ? new IntPtr(1) : target, 0, 0, 0, 0, 0x13); // NOSIZE|NOMOVE|NOACTIVATE; 1 = HWND_BOTTOM
    if (target == IntPtr.Zero && GetForegroundWindow() == me) {
      // at the back but still holding the keyboard: hand it to the window that is now on top
      uint mine; GetWindowThreadProcessId(me, out mine);
      foreach (IntPtr h in AppWindows(mine)) if ((GetWindowLong(h, -20) & 8) == 0) { Front(h); break; }
    }
    return front + "|" + placed;
  }
}
"@
`;

// Windows' audio mixer (Core Audio): the processes that are playing sound right now, on every output device,
// with how loud each one is (0..1). This is what the volume mixer's level bars show.
const AUDIO = `
Add-Type @"
using System; using System.Collections.Generic; using System.Globalization; using System.Runtime.InteropServices;
namespace NXA {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCo {}
  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator { [PreserveSig] int EnumAudioEndpoints(int flow, int mask, out IMMDeviceCollection devices); }
  [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceCollection { [PreserveSig] int GetCount(out int n); [PreserveSig] int Item(int i, out IMMDevice d); }
  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice { [PreserveSig] int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
  [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionManager2 {
    [PreserveSig] int GetAudioSessionControl(IntPtr a, int b, out IntPtr c);
    [PreserveSig] int GetSimpleAudioVolume(IntPtr a, int b, out IntPtr c);
    [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator e);
  }
  [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionEnumerator { [PreserveSig] int GetCount(out int n); [PreserveSig] int GetSession(int i, out IAudioSessionControl2 s); }
  [ComImport, Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionControl2 {
    [PreserveSig] int GetState(out int s);
    [PreserveSig] int GetDisplayName(out IntPtr s);
    [PreserveSig] int SetDisplayName(IntPtr a, IntPtr b);
    [PreserveSig] int GetIconPath(out IntPtr s);
    [PreserveSig] int SetIconPath(IntPtr a, IntPtr b);
    [PreserveSig] int GetGroupingParam(out Guid g);
    [PreserveSig] int SetGroupingParam(IntPtr a, IntPtr b);
    [PreserveSig] int RegisterAudioSessionNotification(IntPtr a);
    [PreserveSig] int UnregisterAudioSessionNotification(IntPtr a);
    [PreserveSig] int GetSessionIdentifier(out IntPtr s);
    [PreserveSig] int GetSessionInstanceIdentifier(out IntPtr s);
    [PreserveSig] int GetProcessId(out int pid);
  }
  [ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioMeterInformation { [PreserveSig] int GetPeakValue(out float peak); }
  public static class Meter {
    // "pid:level" for every audio session that is at least this loud right now
    public static string[] Loud(float min) {
      var list = new List<string>();
      var en = (IMMDeviceEnumerator)new MMDeviceEnumeratorCo();
      IMMDeviceCollection col;
      if (en.EnumAudioEndpoints(0, 1, out col) != 0 || col == null) return list.ToArray(); // output devices that are plugged in
      int n; col.GetCount(out n);
      Guid iid = typeof(IAudioSessionManager2).GUID;
      for (int d = 0; d < n; d++) {
        IMMDevice dev; object o;
        if (col.Item(d, out dev) != 0 || dev == null || dev.Activate(ref iid, 23, IntPtr.Zero, out o) != 0) continue;
        IAudioSessionEnumerator se;
        if (((IAudioSessionManager2)o).GetSessionEnumerator(out se) != 0 || se == null) continue;
        int c; se.GetCount(out c);
        for (int i = 0; i < c; i++) {
          IAudioSessionControl2 s;
          if (se.GetSession(i, out s) != 0 || s == null) continue;
          int pid; s.GetProcessId(out pid);
          var m = s as IAudioMeterInformation;
          float peak = 0;
          if (m != null) m.GetPeakValue(out peak);
          if (pid > 0 && peak >= min) list.Add(pid + ":" + peak.ToString("0.0000", CultureInfo.InvariantCulture));
        }
      }
      return list.ToArray();
    }
  }
}
"@
`;

// Prints one line per poll for the biggest visible window belonging to the game:
//   W|hwnd|left|top|width|height|foreground(0/1)|minimised(0/1)|sound|title        or  N|sound  when there is none yet
// sound is how loud the game's own processes are right now (0..1), or 0 when not asked for (NX_AUDIO).
// Elevated games hide their path from us, so for those it falls back to matching the process name.
const WATCH_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
${WIN32}
$dirs = @($env:NX_DIRS -split '\\|' | Where-Object { $_ })
$exes = @($env:NX_EXES -split '\\|' | Where-Object { $_ })
$names = @($env:NX_NAMES -split '\\|' | Where-Object { $_ })
$audio = $env:NX_AUDIO -eq '1'
if ($audio) { try { ${AUDIO} } catch { $audio = $false } }
$inv = [Globalization.CultureInfo]::InvariantCulture
function IsGame($p) {
  if ($p.ProcessName -match 'crash|uninst|installer') { return $false }
  $path = $p.Path
  if ($path) {
    $l = $path.ToLower()
    if ($exes -contains $l) { return $true }
    foreach ($d in $dirs) { if ($l.StartsWith($d)) { return $true } }
    return $false
  }
  return ($names -contains (($p.ProcessName + '.exe').ToLower()))
}
$out = [Console]::Out
while ($true) {
  $best = $null; $bestArea = -1
  foreach ($p in (Get-Process | Where-Object { $_.MainWindowHandle -ne 0 })) {
    if (-not (IsGame $p)) { continue }
    $h = $p.MainWindowHandle
    if (-not [NX]::IsWindowVisible($h)) { continue }
    $r = New-Object NX+RECT
    [void][NX]::GetWindowRect($h, [ref]$r)
    $w = $r.R - $r.L; $ht = $r.B - $r.T
    if ($w * $ht -gt $bestArea) {
      $bestArea = $w * $ht
      $fg = if ([NX]::GetForegroundWindow() -eq $h) { 1 } else { 0 }
      $ic = if ([NX]::IsIconic($h)) { 1 } else { 0 }
      $t = ($p.MainWindowTitle -replace '[|\\r\\n]', ' ')
      $best = "W|$([int64]$h)|$($r.L)|$($r.T)|$w|$ht|$fg|$ic"
      $bestTitle = $t
    }
  }
  # Is one of the game's own processes playing sound? (a launcher's music doesn't count: it isn't in the game's folder)
  $snd = 0.0
  if ($audio) {
    try {
      foreach ($e in [NXA.Meter]::Loud(0.001)) {
        $parts = $e.Split(':')
        $ap = Get-Process -Id ([int]$parts[0])
        if ($ap -and (IsGame $ap)) { $v = [double]::Parse($parts[1], $inv); if ($v -gt $snd) { $snd = $v } }
      }
    } catch {}
  }
  $s = $snd.ToString('0.0000', $inv)
  if ($best) { $out.WriteLine("$best|$s|$bestTitle") } else { $out.WriteLine("N|$s") }
  $out.Flush()
  Start-Sleep -Milliseconds 600
}`;

const enc = (script) => Buffer.from(script, 'utf16le').toString('base64');

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
function startWatch(spec, extraNames, onSample, { audio = false } = {}) {
  const child = spawn(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc(WATCH_SCRIPT)], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, NX_DIRS: spec.dirs.join('|'), NX_EXES: spec.exes.join('|'), NX_NAMES: [...spec.names, ...extraNames].join('|'), NX_AUDIO: audio ? '1' : '0' },
  });
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (line) { const { sample, sound } = parseLine(line); onSample(sample, sound); }
    }
  });
  child.on('error', () => {});
  return { stop() { try { child.kill(); } catch {} } };
}

// Runs a short Win32 script and resolves with what it printed ('' if it failed or took longer than ms)
function runWin32(code, ms) {
  return new Promise((resolve) => {
    const script = `${WIN32}\n[Console]::Out.WriteLine(${code})`;
    const child = spawn(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc(script)], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    const timer = setTimeout(() => { try { child.kill(); } catch {} resolve(''); }, ms);
    child.stdout.on('data', (d) => (out += d));
    child.on('error', () => { clearTimeout(timer); resolve(''); });
    child.on('exit', () => { clearTimeout(timer); resolve(out.trim()); });
  });
}

const isHwnd = (h) => /^\d+$/.test(String(h));

// One-off: raise a window (by handle) to the foreground. Resolves true when it ended up in front.
async function bringToFront(hwnd) {
  if (!isHwnd(hwnd)) return false;
  return /true/i.test(await runWin32(`[NX]::Front([IntPtr]${hwnd})`, 6000));
}

// Slip window "me" in right behind "target" (raising the target first), or with no target behind whatever opens
// next (waiting up to waitMs for it; since = when the app was launched). Resolves { front, placed }.
async function placeBehind(me, target, { raise = true, waitMs = 0, since = 0 } = {}) {
  if (!isHwnd(me)) return { front: false, placed: false };
  const t = isHwnd(target) ? target : 0;
  const out = await runWin32(`[NX]::Behind([IntPtr]${me}, [IntPtr]${t}, $${raise ? 'true' : 'false'}, ${Math.round(waitMs)}, ${since ? Math.round(Date.now() - since + 3000) : 0})`, waitMs + 8000);
  const [front, placed] = out.split('|');
  return { front: /true/i.test(front), placed: /true/i.test(placed) };
}

module.exports = { Settler, startWatch, bringToFront, placeBehind, parseLine, WATCH_SCRIPT };
