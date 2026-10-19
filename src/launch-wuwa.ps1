# Opens the Kuro launcher and presses its Start button (the game refuses to run without the launcher).
# The launcher is a WebView2 page, so there is no button to find by name; we click a spot relative to its window
# and only click once that spot looks like the bright, enabled Start button.
param([Parameter(Mandatory)][string]$Launcher)

Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class Win {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int dx, int dy, uint d, UIntPtr e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte sc, uint f, UIntPtr e);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
}
'@
[Win]::SetProcessDPIAware() | Out-Null

$BtnX = 0.860; $BtnY = 0.872   # Start button centre, as a fraction of the launcher window
$LogFile = Join-Path $env:TEMP 'nexus-wuwa-launch.log'
'' | Set-Content $LogFile
function Log($m) { "$(Get-Date -Format HH:mm:ss) $m" | Add-Content $LogFile }
function GameRunning { [bool](Get-Process 'Client-Win64-Shipping' -ErrorAction SilentlyContinue) }
function LauncherHandle {
  $p = Get-Process launcher_main -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if ($p) { $p.MainWindowHandle } else { [IntPtr]::Zero }
}

if (GameRunning) { exit 0 }

if ((LauncherHandle) -eq [IntPtr]::Zero) {
  Start-Process -FilePath $Launcher -WorkingDirectory (Split-Path $Launcher)
  for ($i = 0; $i -lt 60 -and (LauncherHandle) -eq [IntPtr]::Zero; $i++) { Start-Sleep -Milliseconds 500 }
}
$h = LauncherHandle
if ($h -eq [IntPtr]::Zero) { exit 2 }

$deadline = (Get-Date).AddSeconds(90)
$clicks = 0
while ((Get-Date) -lt $deadline -and -not (GameRunning)) {
  [Win]::ShowWindow($h, 9) | Out-Null
  [Win]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero); [Win]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)  # Alt tap lets us take the foreground
  [Win]::SetForegroundWindow($h) | Out-Null
  Start-Sleep -Milliseconds 400
  $r = New-Object Win+RECT
  [Win]::GetWindowRect($h, [ref]$r) | Out-Null
  $x = [int]($r.L + ($r.R - $r.L) * $BtnX); $y = [int]($r.T + ($r.B - $r.T) * $BtnY)

  # Sample the button: the enabled Start button is a light grey/white pill
  $bmp = New-Object System.Drawing.Bitmap 24, 12
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($x - 12, $y - 6, 0, 0, $bmp.Size)
  $sum = 0; for ($px = 0; $px -lt 24; $px++) { for ($py = 0; $py -lt 12; $py++) { $c = $bmp.GetPixel($px, $py); $sum += ($c.R + $c.G + $c.B) / 3 } }
  $g.Dispose(); $bmp.Dispose()
  $bright = $sum / (24 * 12)

  Log "window $($r.L),$($r.T),$($r.R),$($r.B) target $x,$y brightness $([int]$bright) clicks $clicks"
  if ($bright -gt 110 -and $clicks -lt 3) {
    $old = New-Object Win+POINT; [Win]::GetCursorPos([ref]$old) | Out-Null
    $moved = [Win]::SetCursorPos($x, $y); Log "SetCursorPos ok=$moved"; Start-Sleep -Milliseconds 150
    [Win]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 60; [Win]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
    [Win]::SetCursorPos($old.X, $old.Y) | Out-Null
    $clicks++
    # give the game time to appear (UAC prompt, update check) before deciding to click again
    for ($i = 0; $i -lt 24 -and -not (GameRunning); $i++) { Start-Sleep -Milliseconds 500 }
  } else {
    Start-Sleep -Milliseconds 700
  }
}
if (GameRunning) { exit 0 } else { exit 3 }
