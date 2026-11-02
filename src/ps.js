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
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int size);
  // Hidden by Windows itself (suspended Store apps, windows on another virtual desktop) although "visible"
  public static bool Cloaked(IntPtr h) { int v; return DwmGetWindowAttribute(h, 14, out v, 4) == 0 && v != 0; }
  public static string ClassOf(IntPtr h) { var sb = new StringBuilder(128); GetClassName(h, sb, sb.Capacity); return sb.ToString(); }
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
  string[] dirs, exes, names, hosts;
  Dictionary<int, bool> known = new Dictionary<int, bool>();
  Dictionary<int, int> kinds = new Dictionary<int, int>();
  HashSet<IntPtr> before; // windows already open when the watch started
  DateTime since = DateTime.Now.AddSeconds(-3);
  int me, polls = 0;
  static string[] Split(string s) { return (s ?? "").ToLowerInvariant().Split(new char[] { '|' }, StringSplitOptions.RemoveEmptyEntries); }
  public NXWatch(string d, string e, string n) : this(d, e, n, "", 0) {}
  // hosts: program names of the game's launcher or store (steam.exe...); me: Nexus's own process, whose windows never count
  public NXWatch(string d, string e, string n, string h, int m) { dirs = Split(d); exes = Split(e); names = Split(n); hosts = Split(h); me = m; }

  // 1 the game, 2 its launcher or store, 3 a program started since the launch (an anti-cheat setup, a launcher the game opened), 0 anything else
  int Kind(int pid) {
    int k;
    if (kinds.TryGetValue(pid, out k)) return k;
    k = 0;
    if (IsGame(pid)) k = 1;
    else {
      try {
        using (var p = Process.GetProcessById(pid)) {
          string n = p.ProcessName.ToLowerInvariant() + ".exe";
          if (Array.IndexOf(hosts, n) >= 0) k = 2;
          else if (p.StartTime >= since && n != "conhost.exe" && n != "powershell.exe" && n != "werfault.exe") k = 3;
        }
      } catch {}
    }
    kinds[pid] = k;
    return k;
  }
  // Started since the launch? The watcher itself takes a second to start, so a quick popup can already be open at its first look.
  Dictionary<int, bool> fresh = new Dictionary<int, bool>();
  bool Fresh(int pid) {
    bool f;
    if (fresh.TryGetValue(pid, out f)) return f;
    f = false;
    try { using (var p = Process.GetProcessById(pid)) f = p.StartTime >= since; } catch {}
    fresh[pid] = f;
    return f;
  }

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
    if (++polls % 50 == 0) { known.Clear(); kinds.Clear(); fresh.Clear(); } // process ids get reused eventually
    IntPtr best = IntPtr.Zero; long bestArea = -1; NX.RECT br = new NX.RECT();
    var shown = new List<IntPtr>();
    NX.EnumWindows((h, l) => {
      if (!NX.IsWindowVisible(h)) return true;
      shown.Add(h);
      if (NX.GetWindow(h, 4) != IntPtr.Zero) return true;
      uint pid; NX.GetWindowThreadProcessId(h, out pid);
      if (!IsGame((int)pid) || NX.ClassOf(h) == "#32770") return true; // a dialog box is never the game itself, it is a popup (below)
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
    string pop = Popup(shown, best);
    if (best == IntPtr.Zero) return "N|" + s + "|" + pop;
    var sb = new StringBuilder(256);
    NX.GetWindowText(best, sb, sb.Capacity);
    string title = sb.ToString().Replace('|', ' ').Replace('\r', ' ').Replace('\n', ' ');
    int fg = NX.GetForegroundWindow() == best ? 1 : 0, ic = NX.IsIconic(best) ? 1 : 0;
    return "W|" + best.ToInt64() + "|" + br.L + "|" + br.T + "|" + (br.R - br.L) + "|" + (br.B - br.T) + "|" + fg + "|" + ic + "|" + s + "|" + pop + "|" + title;
  }

  // A window that opened since the watch started and probably wants the user: a dialog box from any program (an error,
  // "install this service?"), or a window from the game, its launcher or a program started since the launch.
  // -> "hwnd;width;height;dialog(0/1);kind;exe;title" for the likeliest one, or "" for none
  string Popup(List<IntPtr> shown, IntPtr best) {
    if (before == null) { before = new HashSet<IntPtr>(shown); return ""; }
    IntPtr pick = IntPtr.Zero; int pickScore = 0; long pickArea = 0; int pw = 0, ph = 0, pkind = 0; bool pdlg = false; uint ppid = 0;
    foreach (IntPtr h in shown) {
      if (h == best || NX.IsIconic(h) || NX.Cloaked(h)) continue;
      uint pid; NX.GetWindowThreadProcessId(h, out pid);
      if ((int)pid == me || (before.Contains(h) && !Fresh((int)pid))) continue;
      NX.RECT r; NX.GetWindowRect(h, out r);
      int w = r.R - r.L, hh = r.B - r.T;
      if (w < 160 || hh < 90) continue; // tooltips, notification dots
      bool dlg = NX.ClassOf(h) == "#32770";
      int kind = Kind((int)pid);
      if (!dlg && kind == 0) continue;
      if (!dlg && ((NX.GetWindowLong(h, -20) & 0x80) != 0 || NX.GetWindowTextLength(h) == 0)) continue; // tool windows, untitled overlays
      int score = dlg ? 3 : kind == 1 ? 1 : 2;
      long area = (long)w * hh;
      if (score > pickScore || (score == pickScore && area > pickArea)) { pick = h; pickScore = score; pickArea = area; pw = w; ph = hh; pkind = kind; pdlg = dlg; ppid = pid; }
    }
    if (pick == IntPtr.Zero) return "";
    string exe = "";
    try { using (var p = Process.GetProcessById((int)ppid)) exe = p.ProcessName.ToLowerInvariant() + ".exe"; } catch {}
    var sb = new StringBuilder(256); NX.GetWindowText(pick, sb, sb.Capacity);
    return pick.ToInt64() + ";" + pw + ";" + ph + ";" + (pdlg ? 1 : 0) + ";" + pkind + ";" + exe + ";" + sb.ToString().Replace('|', ' ').Replace(';', ',').Replace('\r', ' ').Replace('\n', ' ');
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

  // ----- One program's sound only (Windows 10 2004 and later: process loopback) -----
  // The overlay's sound bars listen to the music app alone (Spotify, the browser playing YouTube), not the whole PC,
  // so a loud game doesn't move them. Cap.Run prints "B|v1,...,v16" (16 bands, low to high, 0..1) about 30 times a second.
  [StructLayout(LayoutKind.Sequential)] struct LoopbackParams { public uint Pid; public int Mode; }
  [StructLayout(LayoutKind.Sequential)] struct ActivationParams { public int Type; public LoopbackParams P; }
  [StructLayout(LayoutKind.Explicit)] struct PropBlob { [FieldOffset(0)] public short vt; [FieldOffset(8)] public int size; [FieldOffset(16)] public IntPtr data; }
  [ComImport, Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IActivateAudioInterfaceAsyncOperation { [PreserveSig] int GetActivateResult(out int hr, [MarshalAs(UnmanagedType.IUnknown)] out object iface); }
  [ComImport, Guid("41D949AB-9862-444A-80F6-C261334DA5EB"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IActivateAudioInterfaceCompletionHandler { void ActivateCompleted(IActivateAudioInterfaceAsyncOperation op); }
  [ComImport, Guid("94ea2b94-e9cc-49e0-c0ff-ee64ca8f5b90"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IAgileObject {}
  [ComImport, Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioClient {
    [PreserveSig] int Initialize(int shareMode, uint flags, long dur, long period, IntPtr fmt, IntPtr session);
    [PreserveSig] int GetBufferSize(out uint n);
    [PreserveSig] int GetStreamLatency(out long l);
    [PreserveSig] int GetCurrentPadding(out uint p);
    [PreserveSig] int IsFormatSupported(int m, IntPtr f, out IntPtr c);
    [PreserveSig] int GetMixFormat(out IntPtr f);
    [PreserveSig] int GetDevicePeriod(out long a, out long b);
    [PreserveSig] int Start();
    [PreserveSig] int Stop();
    [PreserveSig] int Reset();
    [PreserveSig] int SetEventHandle(IntPtr h);
    [PreserveSig] int GetService(ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object o);
  }
  [ComImport, Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioCaptureClient {
    [PreserveSig] int GetBuffer(out IntPtr data, out uint frames, out uint flags, out ulong pos, out ulong qpc);
    [PreserveSig] int ReleaseBuffer(uint frames);
    [PreserveSig] int GetNextPacketSize(out uint n);
  }
  [ComVisible(true)]
  public class CapDone : IActivateAudioInterfaceCompletionHandler, IAgileObject {
    public System.Threading.ManualResetEvent Ev = new System.Threading.ManualResetEvent(false);
    public void ActivateCompleted(IActivateAudioInterfaceAsyncOperation op) { Ev.Set(); }
  }
  public static class Cap {
    [DllImport("Mmdevapi.dll", ExactSpelling = true)]
    static extern int ActivateAudioInterfaceAsync([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid riid, IntPtr prm, IActivateAudioInterfaceCompletionHandler h, out IActivateAudioInterfaceAsyncOperation op);

    // The process behind a media session. Its app id is the exe name for desktop apps ("Spotify.exe", "chrome.exe"),
    // a package name for Store apps, and a hash for Firefox. Several processes share a name (browsers): the oldest is the
    // parent of the rest, and capturing it includes its children.
    static readonly string[][] Aliases = { new[] { "308046b0af4a39cb", "firefox" }, new[] { "spotify", "spotify" }, new[] { "microsoftedge", "msedge" }, new[] { "msedge", "msedge" }, new[] { "chrome", "chrome" }, new[] { "brave", "brave" }, new[] { "opera", "opera" }, new[] { "vivaldi", "vivaldi" }, new[] { "applemusic", "applemusic" }, new[] { "tidal", "tidal" }, new[] { "deezer", "deezer" }, new[] { "zunemusic", "microsoft.media.player" }, new[] { "vlc", "vlc" }, new[] { "foobar", "foobar2000" } };
    public static int FindPid(string app) {
      string a = (app ?? "").ToLowerInvariant(), name = null;
      if (a.EndsWith(".exe")) name = System.IO.Path.GetFileNameWithoutExtension(a);
      if (name == null) foreach (var al in Aliases) if (a.Contains(al[0])) { name = al[1]; break; }
      if (name == null) {
        // any program playing sound whose name is in the app id
        foreach (string e in Meter.Loud(0f)) {
          try { using (var p = Process.GetProcessById(int.Parse(e.Split(':')[0]))) if (a.Contains(p.ProcessName.ToLowerInvariant())) { name = p.ProcessName.ToLowerInvariant(); break; } } catch {}
        }
      }
      if (name == null) return 0;
      int best = 0; DateTime first = DateTime.MaxValue;
      foreach (var p in Process.GetProcessesByName(name)) {
        try { if (p.StartTime < first) { first = p.StartTime; best = p.Id; } } catch {} finally { p.Dispose(); }
      }
      return best;
    }

    // Windows PowerShell runs scripts on a single-threaded apartment; the audio activation calls back on another thread, so work on a free-threaded one
    public static void Run(int pid) {
      var t = new System.Threading.Thread(() => RunMta(pid));
      t.SetApartmentState(System.Threading.ApartmentState.MTA);
      t.IsBackground = true;
      t.Start(); t.Join();
    }
    static void RunMta(int pid) {
      var w = Console.Out;
      var prm = new ActivationParams { Type = 1, P = new LoopbackParams { Pid = (uint)pid, Mode = 0 } }; // 1 = process loopback, 0 = with its child processes
      IntPtr pPrm = Marshal.AllocHGlobal(Marshal.SizeOf(prm)); Marshal.StructureToPtr(prm, pPrm, false);
      var pv = new PropBlob { vt = 65, size = Marshal.SizeOf(prm), data = pPrm }; // VT_BLOB
      IntPtr pPv = Marshal.AllocHGlobal(Marshal.SizeOf(pv)); Marshal.StructureToPtr(pv, pPv, false);
      Guid iid = typeof(IAudioClient).GUID;
      var done = new CapDone();
      IActivateAudioInterfaceAsyncOperation op;
      if (ActivateAudioInterfaceAsync("VAD\\Process_Loopback", ref iid, pPv, done, out op) != 0 || !done.Ev.WaitOne(5000)) { w.WriteLine("X|activate"); return; }
      int hr; object o;
      op.GetActivateResult(out hr, out o);
      if (hr != 0 || o == null) { w.WriteLine("X|result " + hr); return; }
      var client = (IAudioClient)o;
      // 16-bit stereo at 44.1 kHz; Windows converts whatever the app plays to this
      byte[] fmt = new byte[18];
      BitConverter.GetBytes((short)1).CopyTo(fmt, 0); BitConverter.GetBytes((short)2).CopyTo(fmt, 2);
      BitConverter.GetBytes(44100).CopyTo(fmt, 4); BitConverter.GetBytes(44100 * 4).CopyTo(fmt, 8);
      BitConverter.GetBytes((short)4).CopyTo(fmt, 12); BitConverter.GetBytes((short)16).CopyTo(fmt, 14);
      IntPtr pFmt = Marshal.AllocHGlobal(18); Marshal.Copy(fmt, 0, pFmt, 18);
      hr = client.Initialize(0, 0x00020000 | 0x00040000 | 0x80000000, 200000, 0, pFmt, IntPtr.Zero); // shared; LOOPBACK | EVENTCALLBACK | AUTOCONVERTPCM
      if (hr != 0) { w.WriteLine("X|init " + hr); return; }
      var ev = new System.Threading.AutoResetEvent(false);
      client.SetEventHandle(ev.SafeWaitHandle.DangerousGetHandle());
      Guid ciid = typeof(IAudioCaptureClient).GUID; object co;
      if (client.GetService(ref ciid, out co) != 0) { w.WriteLine("X|service"); return; }
      var cap = (IAudioCaptureClient)co;
      client.Start();
      w.WriteLine("OK"); w.Flush();

      const int N = 1024, HOP = 1470; // 1024-sample windows, a new set of bands every 1/30 s
      float[] ring = new float[N]; int at = 0, since = 0;
      double[] freq = new double[16];
      for (int b = 0; b < 16; b++) freq[b] = 60 * Math.Pow(12000.0 / 60, b / 15.0);
      double[] hann = new double[N];
      for (int i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.Cos(2 * Math.PI * i / (N - 1));
      DateTime lastData = DateTime.Now, lastCheck = DateTime.Now;
      Process target = null; try { target = Process.GetProcessById(pid); } catch {}
      short[] tmp = new short[8192];
      while (true) {
        ev.WaitOne(100);
        uint packet;
        while (cap.GetNextPacketSize(out packet) == 0 && packet > 0) {
          IntPtr data; uint frames, flags; ulong p1, p2;
          if (cap.GetBuffer(out data, out frames, out flags, out p1, out p2) != 0) break;
          int count = (int)frames * 2;
          if (count > tmp.Length) tmp = new short[count];
          if ((flags & 2) != 0) Array.Clear(tmp, 0, count); else Marshal.Copy(data, tmp, 0, count);
          cap.ReleaseBuffer(frames);
          for (int i = 0; i < (int)frames; i++) {
            ring[at] = (tmp[2 * i] + tmp[2 * i + 1]) / 65536f; at = (at + 1) % N;
            if (++since >= HOP) { since = 0; Bands(ring, at, hann, freq, w); }
          }
          lastData = DateTime.Now;
        }
        // no packets while the app is silent: say so, so the bars fall
        if ((DateTime.Now - lastData).TotalMilliseconds > 120) { w.WriteLine("B|0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0"); w.Flush(); lastData = DateTime.Now; }
        if ((DateTime.Now - lastCheck).TotalSeconds > 2) { lastCheck = DateTime.Now; if (target != null) { target.Refresh(); if (target.HasExited) { w.WriteLine("X|gone"); return; } } }
      }
    }

    // Goertzel at 16 log-spaced frequencies over the last N samples; each band as 0..1 on a 60 dB scale
    static void Bands(float[] ring, int at, double[] hann, double[] freq, System.IO.TextWriter w) {
      int N = ring.Length;
      var sb = new StringBuilder("B|");
      for (int b = 0; b < freq.Length; b++) {
        double k = 2 * Math.Cos(2 * Math.PI * freq[b] / 44100), s1 = 0, s2 = 0;
        for (int i = 0; i < N; i++) { double s0 = ring[(at + i) % N] * hann[i] + k * s1 - s2; s2 = s1; s1 = s0; }
        double mag = Math.Sqrt(Math.Max(0, s1 * s1 + s2 * s2 - k * s1 * s2)) / (N / 4.0);
        double v = (20 * Math.Log10(mag + 1e-9) + 60) / 60;
        if (b > 0) sb.Append(',');
        sb.Append(Math.Max(0, Math.Min(1, v)).ToString("0.00", CultureInfo.InvariantCulture));
      }
      w.WriteLine(sb.ToString()); w.Flush();
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
