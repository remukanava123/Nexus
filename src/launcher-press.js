// For games that sit behind their own launcher (Wuthering Waves, ...): finds the launcher's window, waits until its
// main button says "Start" / "Play" / "Launch" (or a translation), and presses it through Windows UI Automation (no
// mouse movement, works while another window is on top). It never presses anything else, so an "Update", "Install" or
// "Continue" button is left for the user.
const { spawn } = require('child_process');
const path = require('path');

const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

// Words a launcher's main "go" button can say (any case). Deliberately no Continue / Accept / Install / Update / Download:
// those can mean agreeing to something or changing the install, so they are always left to the user.
const LAUNCH_WORDS = [
  'play', 'play now', 'play game', 'play the game', 'start', 'start now', 'start game', 'start the game', 'start playing',
  'launch', 'launch now', 'launch game', 'launch the game', 'run game', 'enter game', 'enter world',
  'jouer', 'jouer maintenant', 'lancer', 'lancer le jeu', 'démarrer', 'demarrer', 'démarrer le jeu',
  'jugar', 'jugar ahora', 'iniciar', 'iniciar juego', 'iniciar el juego', 'comenzar a jugar',
  'spielen', 'jetzt spielen', 'starten', 'spiel starten', 'spielen starten',
  'jogar', 'jogar agora', 'iniciar jogo', 'giocare', 'gioca', 'gioca ora', 'avvia', 'avvia gioco',
  'spelen', 'nu spelen', 'starta', 'spela', 'grać', 'uruchom', 'uruchom grę', 'oyna', 'başlat', 'oyunu başlat',
  'играть', 'запустить', 'запустить игру', 'начать игру',
  '开始游戏', '开始', '启动', '启动游戏', '進入遊戲', '開始遊戲', '開始', '啟動', '啟動遊戲',
  'スタート', 'ゲームスタート', 'ゲームを開始', 'プレイ', '起動', '시작', '게임 시작', '플레이', '실행',
];
// Update buttons: only pressed when "install game updates automatically" is on. Never Install / Download (those can be a first install).
const UPDATE_WORDS = [
  'update', 'update now', 'update game', 'update the game', 'install update', 'download update', 'apply update', 'patch', 'patch game',
  'mise à jour', 'mettre à jour', 'actualizar', 'actualizar juego', 'aktualisieren', 'jetzt aktualisieren', 'atualizar', 'aggiorna',
  'bijwerken', 'обновить', '更新', '立即更新', '更新游戏', '更新遊戲', '업데이트', 'アップデート',
];
const DEFAULT_UPDATE = '^\\s*(' + UPDATE_WORDS.join('|') + ')\\s*[.!]?\\s*$';
const DEFAULT_START = '^\\s*(' + LAUNCH_WORDS.join('|') + ')\\s*[.!]?\\s*$';

// Output lines:  none | window | button|<name>|<enabled 0/1>|<hwnd> | clicked|<hwnd>
const PRESS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$proc = $env:NX_PROC
$cls = $env:NX_CLASS
$startRe = $env:NX_START
$dry = $env:NX_DRY -eq '1'
$byName = [string]::IsNullOrEmpty($cls)
$updRe = $env:NX_UPDATE
$goRe = if ($updRe) { '(' + $startRe + ')|(' + $updRe + ')' } else { $startRe }
$updClicks = 0
$lastInfo = ''
$out = [Console]::Out
$AE = [System.Windows.Automation.AutomationElement]
$anyCond = [System.Windows.Automation.Condition]::TrueCondition
$Inv = [System.Windows.Automation.InvokePattern]::Pattern
$sure = 0
while ($true) {
  $p = Get-Process -Name $proc | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if (-not $p) { $out.WriteLine('none'); $out.Flush(); $sure = 0; Start-Sleep -Milliseconds 1000; continue }
  $h = [int64]$p.MainWindowHandle
  $root = $AE::FromHandle([IntPtr]$h)
  $b = $null
  if ($root) {
    # A Chromium page only builds its accessibility tree after the first query, so the button shows up a moment later
    $all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $anyCond)
    $texts = @()
    foreach ($e in $all) {
      $cur = $e.Current
      # progress text the launcher shows itself ("Downloading 2.3 GB / 10 GB", "45%", "25 MB/s")
      if ($texts.Count -lt 3 -and $cur.ControlType -eq [System.Windows.Automation.ControlType]::Text -and $cur.Name -match '\\d\\s?(GB|MB|KB|%)' -and $cur.Name.Length -lt 90) { $texts += $cur.Name }
      if ($b) { continue }
      if ($byName) {
        # no button class known for this launcher: take a real, big button whose label is a launch word
        if ($cur.ControlType -ne [System.Windows.Automation.ControlType]::Button) { continue }
        if ($cur.Name -notmatch $goRe) { continue }
        $r = $cur.BoundingRectangle
        if ($r.Width -lt 80 -or $r.Height -lt 28) { continue }
        if ($e.GetSupportedPatterns() -contains $Inv) { $b = $e }
      } elseif ($cur.ClassName -match $cls -and $e.GetSupportedPatterns() -contains $Inv) { $b = $e }
    }
    $info = ($texts -join ' | ')
    if ($info -ne $lastInfo) { $lastInfo = $info; if ($info) { $out.WriteLine('info|' + $info); $out.Flush() } }
  }
  if (-not $b) { $out.WriteLine('window'); $out.Flush(); $sure = 0; Start-Sleep -Milliseconds 1000; continue }
  $name = $b.Current.Name
  $en = if ($b.Current.IsEnabled) { 1 } else { 0 }
  $out.WriteLine("button|$name|$en|$h"); $out.Flush()
  if ($en -eq 1 -and $updRe -and $name -match $updRe -and $updClicks -lt 3) {
    # an Update button: press it, then keep watching so the Start button that follows gets pressed too
    $sure++
    if ($sure -ge 2) {
      if (-not $dry) { try { $b.GetCurrentPattern($Inv).Invoke() } catch { } }
      $updClicks++
      $out.WriteLine("updated|$h"); $out.Flush()
      $sure = 0
      Start-Sleep -Milliseconds 4000
      continue
    }
  } elseif ($en -eq 1 -and $name -match $startRe) {
    $sure++
    # the button must say it on two polls in a row, so a launcher that is still checking for updates isn't pressed too early
    if ($sure -ge 2) {
      if (-not $dry) { try { $b.GetCurrentPattern($Inv).Invoke() } catch { $out.WriteLine('error|' + $_.Exception.Message); $out.Flush(); Start-Sleep -Milliseconds 1500; continue } }
      $out.WriteLine("clicked|$h"); $out.Flush()
      exit
    }
  } else { $sure = 0 }
  Start-Sleep -Milliseconds 1000
}`;

// cfg: { proc: 'launcher_main', cls?: 'main-action-button', start?: regex }. Leave cls out to match any big button by its
// label; start defaults to DEFAULT_START. onEvent gets { type, name?, enabled?, hwnd? }
function startAutoPress(cfg, onEvent, { dry = false, update = false } = {}) {
  const child = spawn(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(PRESS_SCRIPT, 'utf16le').toString('base64')], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, NX_PROC: cfg.proc, NX_CLASS: cfg.cls || '', NX_START: cfg.start || DEFAULT_START, NX_DRY: dry ? '1' : '0', NX_UPDATE: update ? DEFAULT_UPDATE : '' },
  });
  let buf = '';
  let lastKey = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      const [type, a, b, c] = line.split('|');
      const ev = type === 'button' ? { type, name: a, enabled: b === '1', hwnd: c } : type === 'clicked' || type === 'updated' ? { type, hwnd: a } : type === 'info' ? { type, text: a } : type === 'error' ? { type, message: a } : { type };
      const key = JSON.stringify(ev);
      if (type !== 'clicked' && type !== 'updated' && key === lastKey) { onEvent({ ...ev, repeat: true }); continue; } // still the same state
      lastKey = key;
      onEvent(ev);
    }
  });
  child.on('error', () => {});
  return { stop() { try { child.kill(); } catch {} } };
}

module.exports = { startAutoPress, PRESS_SCRIPT, DEFAULT_START, DEFAULT_UPDATE, LAUNCH_WORDS, UPDATE_WORDS };
