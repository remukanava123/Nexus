// PowerShell helpers shared by the tracker, the launch watcher and the window tricks.
//
// The Win32 and Core Audio code is C#. PowerShell's Add-Type compiles C# with csc every time a script starts, which
// costs one to three seconds of CPU per run, so Nexus compiles it once into a DLL in its data folder (named after a
// hash of the source, so a new version recompiles) and every later script just loads that DLL. Until the DLL exists
// a script falls back to compiling in memory, exactly as before.
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

// C# 5 (what Windows PowerShell's compiler understands): no string interpolation, no ?. and no out var.
const NATIVE = String.raw`
using System; using System.Collections.Generic; using System.Diagnostics; using System.Globalization;
using System.Runtime.InteropServices; using System.Text;

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
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint c);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr h, int flags, StringBuilder buf, ref int size);

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

  // Visible, titled, unowned top-level windows (what shows on the taskbar), apart from our own
  static List<IntPtr> AppWindows(uint mine) {
    var list = new List<IntPtr>();
    EnumWindows((h, l) => {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid != mine && IsWindowVisible(h) && !IsIconic(h) && GetWindowTextLength(h) > 0 && GetWindow(h, 4) == IntPtr.Zero && (GetWindowLong(h, -20) & 0x80) == 0) list.Add(h);
      return true;
    }, IntPtr.Zero);
    return list;
  }

  // Put window "me" directly behind "target" in the stacking order, without activating anything. With no target, wait
  // up to waitMs for some other window to take the foreground (an app that is opening) and go behind that one;
  // failing that, go to the very back. Returns "front|placed": did the target come to the front, did "me" move.
  public static string Behind(IntPtr me, IntPtr target, bool raise, int waitMs, int sinceMs) {
    bool front = false;
    if (target == IntPtr.Zero) {
      // the app either takes the foreground, or opens a new window that Windows left in the background
      uint mine; GetWindowThreadProcessId(me, out mine);
      var before = new HashSet<IntPtr>(AppWindows(mine));
      DateTime since = DateTime.Now.AddMilliseconds(-sinceMs); // windows of processes started since the launch count as new too
      foreach (IntPtr h in AppWindows(mine)) { uint p; GetWindowThreadProcessId(h, out p); try { if (Process.GetProcessById((int)p).StartTime >= since) before.Remove(h); } catch {} }
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

  // Full path of a process's exe, or null when Windows won't say. PROCESS_QUERY_LIMITED_INFORMATION is enough, and
  // Windows grants it for most elevated games too (WMI and Get-Process ask for more and get nothing for those).
  public static string ImagePath(int pid) {
    IntPtr h = OpenProcess(0x1000, false, pid);
    if (h == IntPtr.Zero) return null;
    try {
      var sb = new StringBuilder(1024); int n = sb.Capacity;
      return QueryFullProcessImageName(h, 0, sb, ref n) ? sb.ToString(0, n) : null;
    } finally { CloseHandle(h); }
  }

  // Every running program: its lower-case path, or "?name.exe" when even the limited query is refused (protected games)
  public static string ProcPaths() {
    var seen = new HashSet<string>();
    foreach (Process p in Process.GetProcesses()) {
      try {
        string path = ImagePath(p.Id);
        seen.Add(path != null ? path.ToLowerInvariant() : "?" + p.ProcessName.ToLowerInvariant() + ".exe");
      } catch {} finally { p.Dispose(); }
    }
    return string.Join("|", seen);
  }
}

// Watches one game while it starts: its biggest window and whether its own processes play sound. One EnumWindows pass
// per poll (Get-Process's MainWindowHandle walks every window once per process, which is what made the old poller heavy).
public class NXWatch {
  string[] dirs, exes, names;
  Dictionary<int, bool> known = new Dictionary<int, bool>();
  int polls = 0;
  static string[] Split(string s) { return (s ?? "").ToLowerInvariant().Split(new char[] { '|' }, StringSplitOptions.RemoveEmptyEntries); }
  public NXWatch(string d, string e, string n) { dirs = Split(d); exes = Split(e); names = Split(n); }

  // Same rules as the playtime tracker: the exe is in the game's folder or is the game's file; when Windows hides the
  // path, the program name has to be one of the game's.
  public bool IsGame(int pid) {
    bool r;
    if (known.TryGetValue(pid, out r)) return r;
    r = Check(pid);
    known[pid] = r;
    return r;
  }
  bool Check(int pid) {
    if (pid <= 4) return false;
    string path = NX.ImagePath(pid), name;
    if (path != null) name = System.IO.Path.GetFileName(path).ToLowerInvariant();
    else { try { using (var p = Process.GetProcessById(pid)) name = p.ProcessName.ToLowerInvariant() + ".exe"; } catch { return false; } }
    if (name.Contains("crash") || name.Contains("uninst") || name.Contains("installer")) return false;
    if (path == null) return Array.IndexOf(names, name) >= 0;
    string l = path.ToLowerInvariant();
    if (Array.IndexOf(exes, l) >= 0) return true;
    foreach (string d in dirs) if (l.StartsWith(d)) return true;
    return false;
  }

  //   W|hwnd|left|top|width|height|foreground(0/1)|minimised(0/1)|sound|title   or   N|sound   when there is no window yet
  public string Poll(bool audio) {
    if (++polls % 50 == 0) known.Clear(); // process ids get reused eventually
    IntPtr best = IntPtr.Zero; long bestArea = -1; NX.RECT br = new NX.RECT();
    NX.EnumWindows((h, l) => {
      if (!NX.IsWindowVisible(h) || NX.GetWindow(h, 4) != IntPtr.Zero) return true;
      uint pid; NX.GetWindowThreadProcessId(h, out pid);
      if (!IsGame((int)pid)) return true;
      NX.RECT r; NX.GetWindowRect(h, out r);
      long area = (long)(r.R - r.L) * (r.B - r.T);
      if (area > bestArea) { bestArea = area; best = h; br = r; }
      return true;
    }, IntPtr.Zero);
    double snd = 0;
    if (audio) {
      try {
        foreach (string e in NXA.Meter.Loud(0.001f)) {
          string[] parts = e.Split(':');
          if (IsGame(int.Parse(parts[0]))) { double v = double.Parse(parts[1], CultureInfo.InvariantCulture); if (v > snd) snd = v; }
        }
      } catch {}
    }
    string s = snd.ToString("0.0000", CultureInfo.InvariantCulture);
    if (best == IntPtr.Zero) return "N|" + s;
    var sb = new StringBuilder(256);
    NX.GetWindowText(best, sb, sb.Capacity);
    string title = sb.ToString().Replace('|', ' ').Replace('\r', ' ').Replace('\n', ' ');
    int fg = NX.GetForegroundWindow() == best ? 1 : 0, ic = NX.IsIconic(best) ? 1 : 0;
    return "W|" + best.ToInt64() + "|" + br.L + "|" + br.T + "|" + (br.R - br.L) + "|" + (br.B - br.T) + "|" + fg + "|" + ic + "|" + s + "|" + title;
  }
}

// Windows' audio mixer (Core Audio): the processes that are playing sound right now, on every output device,
// with how loud each one is (0..1). This is what the volume mixer's level bars show.
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
`;

const HASH = crypto.createHash('sha1').update(NATIVE).digest('hex').slice(0, 10);
let dllPath = null; // <userData>/helpers/nexus-native-<hash>.dll, once it has been built
let srcPath = null; // the C# source next to it (the source is too long to pass on a command line)
const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;

// PowerShell lines that make [NX], [NXWatch] and [NXA.Meter] available: the compiled DLL when it exists, else compile now
function loader() {
  if (dllPath) return `Add-Type -LiteralPath ${psQuote(dllPath)}`;
  if (srcPath) return `Add-Type -LiteralPath ${psQuote(srcPath)}`;
  return `Add-Type -TypeDefinition @'\n${NATIVE}\n'@`; // only before init() (tests): long, but fits for a short script
}

const enc = (script) => Buffer.from(script, 'utf16le').toString('base64');

// Starts a hidden PowerShell running `script` and calls onLine for every line it prints (decoded as UTF-8 as a whole,
// so a character split across two chunks isn't garbled). Never throws: a failed start just ends quietly.
function run(script, { env, onLine, onExit } = {}) {
  const child = spawn(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc(`[Console]::OutputEncoding = [Text.Encoding]::UTF8\n${script}`)], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], env: env ? { ...process.env, ...env } : process.env,
  });
  let buf = '';
  if (!child.stdout) return child; // couldn't start (spawn reports it through 'error')
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (line && onLine) onLine(line);
    }
  });
  child.on('error', () => {});
  if (onExit) child.on('exit', onExit);
  return child;
}

// Compiles the C# into <dir>/helpers once (in the background). Scripts started before it finishes compile in memory.
function init(dir) {
  if (process.platform !== 'win32') return Promise.resolve(false);
  const helpers = path.join(dir, 'helpers');
  const target = path.join(helpers, `nexus-native-${HASH}.dll`);
  if (fs.existsSync(target)) { dllPath = target; return Promise.resolve(true); }
  const work = path.join(helpers, `build-${process.pid}`);
  try {
    fs.mkdirSync(work, { recursive: true });
    fs.writeFileSync(path.join(work, 'native.cs'), NATIVE);
    const src = path.join(helpers, `nexus-native-${HASH}.cs`);
    fs.writeFileSync(src, NATIVE);
    srcPath = src;
  } catch { return Promise.resolve(false); }
  const out = path.join(work, path.basename(target));
  const script = `Add-Type -LiteralPath ${psQuote(path.join(work, 'native.cs'))} -OutputAssembly ${psQuote(out)} -OutputType Library; if (Test-Path -LiteralPath ${psQuote(out)}) { 'ok' }`;
  return new Promise((resolve) => {
    let ok = false;
    run(script, {
      onLine: (l) => { if (l === 'ok') ok = true; },
      onExit: () => {
        try {
          if (ok) {
            fs.renameSync(out, target);
            dllPath = target;
            // an older Nexus's DLL is no longer needed (it may still be loaded by a running script; then it goes next time)
            for (const f of fs.readdirSync(helpers)) if (/^nexus-native-.*\.(dll|cs)$/.test(f) && !f.startsWith(`nexus-native-${HASH}.`)) { try { fs.unlinkSync(path.join(helpers, f)); } catch {} }
          }
        } catch {}
        try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
        resolve(!!dllPath);
      },
    });
  });
}

module.exports = { POWERSHELL, NATIVE, init, loader, run, enc, psQuote };
