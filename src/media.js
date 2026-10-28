// What Windows is playing right now (Spotify, YouTube in a browser, anything that shows in the volume flyout),
// read from the System Media Transport Controls. One long-lived PowerShell prints a JSON line per second.
const { spawn } = require('child_process');
const path = require('path');

const { POWERSHELL } = require('./ps');

const SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType=WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(4000) | Out-Null; $task.Result }
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$lastKey = ''; $tries = 0; $have = $false
$out = [Console]::Out
while ($true) {
  $o = @{ ok = $false }
  try {
    $s = $mgr.GetCurrentSession()
    if ($s) {
      $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $tl = $s.GetTimelineProperties()
      $pb = $s.GetPlaybackInfo()
      $key = "$($p.Title)|$($p.Artist)"
      $o = @{
        ok = $true; title = $p.Title; artist = $p.Artist; album = $p.AlbumTitle; app = $s.SourceAppUserModelId
        playing = ($pb.PlaybackStatus -eq 4); pos = [math]::Round($tl.Position.TotalSeconds, 1); dur = [math]::Round(($tl.EndTime - $tl.StartTime).TotalSeconds, 1)
        at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); key = $key
      }
      # the position only changes when the player reports it, so also say when it was reported and how fast it moves
      try { $u = $tl.LastUpdatedTime; if ($u.Year -gt 2000) { $o.upd = $u.ToUnixTimeMilliseconds() } } catch {}
      try { if ($pb.PlaybackRate) { $o.rate = [double]$pb.PlaybackRate } } catch {}
      if ($key -ne $lastKey) { $lastKey = $key; $tries = 0; $have = $false; $o.thumb = '' }
      # browsers (YouTube) often publish the picture a second or two after the title, so keep asking for a while
      if ($tries -lt 8 -and -not $have) {
        $tries++
        try {
          if ($p.Thumbnail) {
            $str = Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
            $size = [uint32]$str.Size
            if ($size -gt 0 -and $size -lt 4000000) {
              $rd = New-Object Windows.Storage.Streams.DataReader($str)
              $null = Await ($rd.LoadAsync($size)) ([uint32])
              $bytes = New-Object byte[] $size
              $rd.ReadBytes($bytes)
              $o.thumb = 'data:' + $str.ContentType + ';base64,' + [Convert]::ToBase64String($bytes)
              $have = $true
            }
          }
        } catch {}
      }
    }
  } catch {}
  $out.WriteLine(($o | ConvertTo-Json -Compress)); $out.Flush()
  Start-Sleep -Milliseconds 1000
}`;

// onUpdate(info) with info = { ok, title, artist, album, app, playing, pos, dur, at, key, thumb? }.
// thumb is only present when the track changed; keep the last one.
function start(onUpdate) {
  if (process.platform === 'linux') return require('./linux').startMedia(onUpdate);
  const enc = Buffer.from(SCRIPT, 'utf16le').toString('base64');
  const child = spawn(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  let buf = '';
  child.stdout.setEncoding('utf8'); // decoded as one stream, so a character split between two chunks isn't garbled
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      try { onUpdate(JSON.parse(line)); } catch {}
    }
  });
  child.on('error', () => {});
  return { stop() { try { child.kill(); } catch {} } };
}

module.exports = { start, SCRIPT };
