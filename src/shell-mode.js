// "Nexus is my desktop": makes Nexus the Windows shell for this user, so after sign-in there is no wallpaper,
// taskbar or Explorer, only Nexus. It is a per-user setting (HKCU) and is always reversible:
//   - Settings → "Restore the Windows desktop", or running the exe with --restore-shell
//   - the launcher script falls back to Explorer when Nexus can't be found, and starts Explorer again when Nexus exits
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SYS = process.env.SystemRoot || 'C:\\Windows';
const REG = path.join(SYS, 'System32', 'reg.exe');
const WSCRIPT = path.join(SYS, 'System32', 'wscript.exe');
const POWERSHELL = path.join(SYS, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const SHELL_KEY = 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon';

const vbs = (s) => String(s).replace(/"/g, '""');

function readShellValue(key = SHELL_KEY) {
  const r = spawnSync(REG, ['query', key, '/v', 'Shell'], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) return null;
  const m = /^\s*Shell\s+REG_(?:EXPAND_)?SZ\s+(.*?)\s*$/im.exec(r.stdout || '');
  return m ? m[1] : null;
}

function writeShellValue(value, key = SHELL_KEY) {
  const r = spawnSync(REG, ['add', key, '/v', 'Shell', '/t', 'REG_SZ', '/d', value, '/f'], { encoding: 'utf8', windowsHide: true });
  return r.status === 0;
}

function deleteShellValue(key = SHELL_KEY) {
  const r = spawnSync(REG, ['delete', key, '/v', 'Shell', '/f'], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 || readShellValue(key) === null;
}

// The Windows-side launcher. No console window, waits for Nexus, then makes sure a desktop exists
function buildLauncherScript({ exe, procNames, selfPath, regKey = SHELL_KEY, shellValue }) {
  const names = procNames.map((n) => `Name='${vbs(n)}'`).join(' or ');
  return `' Nexus desktop launcher. Written by Nexus; Settings → "Restore the Windows desktop" removes it.
Option Explicit
Dim sh, fso, svc, started, seen, running
' A hiccup must never leave the screen blank: on any error, carry on, and the worst case is the normal desktop
On Error Resume Next
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
Set svc = GetObject("winmgmts:\\\\.\\root\\cimv2")

' (.Count isn't supported by this WMI provider, so count by looping)
Function ProcCount(filter)
  Dim n, p
  n = 0
  For Each p In svc.ExecQuery("select ProcessId from Win32_Process where " & filter)
    n = n + 1
  Next
  ProcCount = n
End Function

' Explorer only takes over as the desktop when it is not already running. Clearing the per-user Shell value for a
' few seconds makes sure it starts as the real desktop, then the value goes back so Nexus is the shell next time.
Sub StartDesktop()
  If ProcCount("Name='explorer.exe'") > 0 Then Exit Sub
  On Error Resume Next
  sh.RegDelete "${vbs(regKey)}\\Shell"
  sh.Run "explorer.exe", 1, False
  WScript.Sleep 15000
  If fso.FileExists("${vbs(selfPath)}") Then sh.RegWrite "${vbs(regKey)}\\Shell", "${vbs(shellValue)}", "REG_SZ"
End Sub

If Not fso.FileExists("${vbs(exe)}") Then
  StartDesktop
  WScript.Quit
End If

sh.Run """${vbs(exe)}"" --shell", 1, False
started = Now
seen = False
Do
  WScript.Sleep 3000
  running = (ProcCount("${vbs(names)}") > 0)
  If running Then seen = True
  If seen And Not running Then Exit Do
  If Not seen And DateDiff("s", started, Now) > 90 Then Exit Do
Loop
StartDesktop
`;
}

function enable({ userData, exe, procNames, key = SHELL_KEY }) {
  const current = readShellValue(key);
  const script = path.join(userData, 'shell.vbs');
  const ours = current && current.toLowerCase().includes('shell.vbs');
  if (current && !ours) throw new Error(`Windows is already set up with a custom desktop (${current}). Nexus won't overwrite it.`);
  const shellValue = `"${WSCRIPT}" //B //Nologo "${script}"`;
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(script, buildLauncherScript({ exe, procNames, selfPath: script, regKey: key, shellValue }), 'utf8');
  if (!writeShellValue(shellValue, key)) { try { fs.unlinkSync(script); } catch {} throw new Error('Windows would not let Nexus change the setting.'); }
  return shellValue;
}

function disable({ userData, key = SHELL_KEY }) {
  const current = readShellValue(key);
  if (current && !current.toLowerCase().includes('shell.vbs')) throw new Error("The desktop setting isn't one Nexus made, so it was left alone.");
  const ok = deleteShellValue(key);
  try { fs.unlinkSync(path.join(userData, 'shell.vbs')); } catch {}
  if (!ok) throw new Error('Could not remove the setting.');
}

function status(key = SHELL_KEY) {
  const v = readShellValue(key);
  return { enabled: !!(v && v.toLowerCase().includes('shell.vbs')), other: !!(v && !v.toLowerCase().includes('shell.vbs')) };
}

// What Explorer normally does at sign-in: run the apps in the Run keys and Startup folders (skipping ones turned off in Task Manager)
const STARTUP_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$skip = @($env:NX_SKIP -split '\\|' | Where-Object { $_ } | ForEach-Object { $_.ToLower() })
$dry = $env:NX_DRY -eq '1'
$AP = 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved'
function Off($hives, $sub, $name) {
  foreach ($h in $hives) {
    $p = $h + ':\\' + $AP + '\\' + $sub
    $v = (Get-ItemProperty -Path $p -Name $name).$name
    if ($v -is [byte[]] -and $v.Length -gt 0 -and ($v[0] -band 1)) { return $true }
  }
  return $false
}
$jobs = @()
foreach ($r in @(
  @{ k = 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'; s = 'Run' },
  @{ k = 'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run'; s = 'Run32' },
  @{ k = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'; s = 'Run' })) {
  $item = Get-Item -Path $r.k
  if (-not $item) { continue }
  foreach ($n in $item.GetValueNames()) {
    if (-not $n) { continue }
    $cmd = [string](Get-ItemProperty -Path $r.k -Name $n).$n
    if (-not $cmd) { continue }
    if (Off @('HKCU', 'HKLM') $r.s $n) { continue }
    $jobs += [pscustomobject]@{ Name = $n; Cmd = $cmd }
  }
}
foreach ($dir in @([Environment]::GetFolderPath('Startup'), [Environment]::GetFolderPath('CommonStartup'))) {
  foreach ($f in (Get-ChildItem -Path $dir -File)) {
    if ($f.Name -ieq 'desktop.ini') { continue }
    if (Off @('HKCU', 'HKLM') 'StartupFolder' $f.Name) { continue }
    $jobs += [pscustomobject]@{ Name = $f.Name; Cmd = '"' + $f.FullName + '"' }
  }
}
$seen = @{}
foreach ($j in $jobs) {
  $low = $j.Cmd.ToLower()
  if ($seen[$low]) { continue }
  $seen[$low] = $true
  $self = $false
  foreach ($s in $skip) { if ($low.Contains($s)) { $self = $true } }
  if ($self) { continue }
  if ($dry) { [Console]::Out.WriteLine('would start: ' + $j.Name + ' => ' + $j.Cmd); continue }
  Start-Process -FilePath $env:ComSpec -ArgumentList ('/d /s /c "start "" ' + $j.Cmd + '"') -WindowStyle Hidden
  Start-Sleep -Milliseconds 400
}`;

function runStartupApps(skip = ['nexus'], dry = false) {
  const child = spawn(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(STARTUP_SCRIPT, 'utf16le').toString('base64')], {
    windowsHide: true, stdio: ['ignore', dry ? 'pipe' : 'ignore', 'ignore'],
    env: { ...process.env, NX_SKIP: skip.join('|'), NX_DRY: dry ? '1' : '0' },
  });
  if (!dry) { child.unref(); return null; }
  return new Promise((resolve) => { let out = ''; child.stdout.on('data', (d) => (out += d)); child.on('exit', () => resolve(out)); });
}

// Start Explorer as the desktop from inside Nexus (the "Windows desktop" button)
function startDesktop({ userData, key = SHELL_KEY }) {
  const current = readShellValue(key);
  const script = path.join(userData, 'shell.vbs');
  const ours = current && current.toLowerCase().includes('shell.vbs');
  if (ours) deleteShellValue(key); // so Explorer starts as the real desktop; put back below, unless it was turned off meanwhile
  spawn('explorer.exe', [], { detached: true, stdio: 'ignore' }).unref();
  if (ours) setTimeout(() => { if (fs.existsSync(script) && readShellValue(key) === null) writeShellValue(current, key); }, 15000);
}

module.exports = { SHELL_KEY, readShellValue, writeShellValue, deleteShellValue, buildLauncherScript, enable, disable, status, runStartupApps, startDesktop };
