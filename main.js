const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, globalShortcut, nativeImage, Notification, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const scanner = require('./src/scanner');
const gameInfo = require('./src/info');
const icons = require('./src/icons');
const Store = require('./src/store');
const { Tracker, watchList } = require('./src/tracker');
const Gacha = require('./shared/gacha-data');
const feeds = require('./src/feeds');
const { starterTagsFor } = require('./src/starter-tags');
const launchWatch = require('./src/launch-watch');
const shellMode = require('./src/shell-mode');
const launcherPress = require('./src/launcher-press');
const bnet = require('./src/bnet');
const updates = require('./src/updates');
const releaseCheck = require('./src/release-check');
const lifetime = require('./src/lifetime');
const { addProcNames } = require('./src/proc-names');
const RELEASE_NOTES = require('./shared/release-notes');
const { createOverlay } = require('./src/overlay');
const overwatchApi = require('./src/overwatch');
const ps = require('./src/ps');

const IS_LINUX = process.platform === 'linux';
const linux = IS_LINUX ? require('./src/linux') : null;
if (IS_LINUX) {
  // Wayland (Fedora, Bazzite): use the native Wayland backend when there is one, and let global shortcuts go through the desktop portal
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
  app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal,WaylandWindowDecorations');
}

const ICON = path.join(__dirname, 'assets', 'icon.png');
const TRAY_ICON = path.join(__dirname, 'assets', 'tray.png'); // a simpler version of the logo that stays readable at 16 px
const SETTING_DEFAULTS = Store.DEFAULT_SETTINGS;

// "Low resource mode" (Settings → Data & maintenance): no GPU acceleration, which frees the GPU process's memory.
// It has to be decided before Electron starts, so the saved setting is read straight from the file here.
try {
  const saved = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'library.json'), 'utf8').replace(/^﻿/, ''));
  if (saved && saved.settings && saved.settings.lowResource) app.disableHardwareAcceleration();
} catch {}

let win, tray, store, tracker, overlay;
let items = [];
let watched = [];
let scanning = null;
let currentHotkey = null;
const iconCache = new Map();

// Started by the desktop launcher script (Settings → "Use Nexus as my desktop"): Nexus is the Windows shell this session
const shellActive = process.argv.includes('--shell');

if (process.argv.includes('--restore-shell')) {
  // Emergency exit hatch, e.g. from Task Manager → Run new task:  "Nexus 1.0.0.exe" --restore-shell
  app.whenReady().then(() => {
    let msg = 'The Windows desktop will be back the next time you sign in.';
    try { shellMode.disable({ userData: app.getPath('userData') }); } catch (e) { msg = String(e.message || e); }
    dialog.showMessageBoxSync({ type: 'info', title: 'Nexus', message: msg, buttons: ['OK'] });
    app.exit(0);
  });
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.whenReady().then(init);
}

function init() {
  if (!IS_LINUX) app.setAppUserModelId('local.nexus.launcher'); // needed for Windows notifications
  ps.init(app.getPath('userData')).catch(() => {}); // builds the Win32 helper DLL once, so later PowerShell runs start fast
  store = new Store(app.getPath('userData'));
  if (shellActive) store.runtime.shellMode = 'shell';
  const s = store.data.settings;
  createWindow(process.argv.includes('--hidden'));
  createTray();
  if (!registerHotkey(s.hotkey)) registerHotkey(SETTING_DEFAULTS.hotkey);
  registerIpc();
  if (s.startWithWindows) setLoginItem(true); // keeps the startup entry pointing at wherever the .exe lives now

  tracker = new Tracker(store, () => watched);
  overlay = createOverlay({ electron: require('electron'), store, onMatches: () => { if (win && !win.isDestroyed()) win.webContents.send('matches:updated'); }, runningNames: () => (tracker ? [...tracker.active.keys()] : []).map((id) => (items.find((i) => i.id === id) || {}).name || '') });
  overlay.registerKeys();
  tracker.on('change', () => { overlay.gamesChanged(); });
  tracker.on('change', () => { createTray(); sendState(); }); // rebuild the tray menu so its "Playing: ..." line is current
  tracker.on('end', (id, ms) => {
    if (ms >= 60000) { sendState(); setTimeout(() => refreshLifetime().catch(() => {}), 20000); } // Steam writes the new total a moment after the game closes
    const nothingRunning = tracker.active.size === 0; // (store.runtime.running is only refreshed after this event)
    // The game Nexus launched (and is waiting behind, or ghosting over) has closed: come back now
    if (backdrop && backdrop.id === id && nothingRunning) { stopBackdrop(); returnToNexus(); return; }
    // After a game: come straight back, fullscreen, so the desktop never shows. (When Nexus is the desktop, always: a blank screen is the alternative.)
    if (nothingRunning && (store.runtime.shellMode === 'shell' || (store.data.settings.returnAfterGame && ms >= 45000))) setTimeout(returnToNexus, 1500);
  });
  tracker.on('tick', onPlayTick);
  if (s.trackPlaytime) tracker.start();
  getLibrary(false).catch(console.error); // start scanning before the page even asks
  feeds.init(app.getPath('userData'));
  setTimeout(refreshNews, 20000);
  setInterval(refreshNews, 30 * 60000);
  setInterval(checkAlerts, 30000);
  setTimeout(checkAlerts, 5000);
  setTimeout(() => checkRelease(false), 45000);
  setInterval(() => checkRelease(false), 12 * 3600000);
  setInterval(() => refreshLifetime().catch(() => {}), 30 * 60000);
  // Explorer normally starts the Run-key and Startup-folder apps at sign-in; with Nexus as the desktop, nobody else will
  if (shellActive && s.shellRunStartup) setTimeout(() => shellMode.runStartupApps(['nexus']), 6000);
}

// A game was closed: show Nexus again (fullscreen if wanted), unless it is already in front
function returnToNexus() {
  stopBackdrop();
  exitGhost();
  if (!win || win.isDestroyed() || (win.isVisible() && win.isFocused())) return;
  if (store.data.settings.returnFullscreen || shellActive) win.setFullScreen(true);
  showWindow();
  win.setAlwaysOnTop(true, 'screen-saver'); // windows opened a moment ago (the launcher closing, a crash report) must not sit on top of us
  win.moveTop();
  // Windows won't always hand focus to a window that hasn't been clicked: borrow the foreground thread's input for a moment
  try { launchWatch.bringToFront(win.getNativeWindowHandle().readBigUInt64LE(0).toString()); } catch {}
  setTimeout(() => { if (win && !win.isDestroyed()) win.setAlwaysOnTop(!!store.data.settings.alwaysOnTop, 'screen-saver'); }, 2500);
}

// Starts the Windows desktop (taskbar, Start menu) from inside Nexus when it is the shell
function openWindowsDesktop() {
  shellMode.startDesktop({ userData: app.getPath('userData') });
  store.runtime.shellMode = 'desktop';
  sendState();
  createTray();
}

// At logon Windows won't hand the foreground to a freshly started background app, and the desktop is
// still loading, so the window can end up behind things. Pin it on top for a few seconds, twice.
function bringToFront() {
  const pin = () => {
    if (!win || win.isDestroyed()) return;
    win.setAlwaysOnTop(true, 'screen-saver');
    win.show(); win.moveTop(); win.focus();
    setTimeout(() => { if (win && !win.isDestroyed()) win.setAlwaysOnTop(!!store.data.settings.alwaysOnTop, 'screen-saver'); }, 2000);
  };
  pin();
  setTimeout(pin, 6000);
}

function createWindow(startHidden) {
  const s = store.data.settings;
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 920, minHeight: 600,
    show: false,
    backgroundColor: '#0b0d12',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0b0d12', symbolColor: '#9aa0ae', height: 40 },
    icon: ICON,
    alwaysOnTop: !!s.alwaysOnTop,
    webPreferences: { preload: path.join(__dirname, 'src', 'preload.js'), contextIsolation: true, sandbox: true, autoplayPolicy: 'no-user-gesture-required' }, // lets the boot chime play
  });
  win.setMenu(null);
  if (s.alwaysOnTop) win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.on('did-finish-load', () => win.webContents.setZoomFactor(zoomFor(store.data.settings.uiScale)));
  // Big-screen-on-startup means the user wants to see it, so the --hidden autostart flag doesn't apply
  win.once('ready-to-show', () => {
    const wantsVisible = shellActive || !startHidden || s.startBigScreen || s.startFullscreen;
    if (!wantsVisible) return;
    if (s.startFullscreen || shellActive) win.setFullScreen(true);
    win.show();
    if (startHidden || shellActive) bringToFront();
  });
  win.on('close', (e) => {
    if (app.isQuitting) return;
    if (store.runtime.shellMode === 'shell') {
      // Hiding to the tray would leave a blank screen, so offer the Windows desktop instead
      e.preventDefault();
      dialog.showMessageBox(win, { type: 'question', title: 'Nexus', message: 'Nexus is your desktop right now.', detail: 'Switch to the Windows desktop (taskbar and Start menu)? Nexus keeps running in the tray.', buttons: ['Windows desktop', 'Stay in Nexus'], defaultId: 0, cancelId: 1 })
        .then((r) => { if (r.response === 0) { openWindowsDesktop(); win.hide(); } });
      return;
    }
    if (store.data.settings.closeToTray) { e.preventDefault(); win.hide(); } else { app.isQuitting = true; app.quit(); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

function nowPlayingLabel() {
  const running = (store && store.runtime && store.runtime.running) || {};
  const names = items.filter((i) => i.id in running).map((i) => i.name);
  return names.length ? `Playing: ${names.join(', ')}` : 'Not playing anything';
}

function createTray() {
  if (!tray) {
    tray = new Tray(nativeImage.createFromPath(TRAY_ICON).resize({ width: 16, height: 16 }));
    tray.on('click', showWindow);
  }
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: nowPlayingLabel(), enabled: false },
    { type: 'separator' },
    { label: 'Open Nexus', click: showWindow },
    ...(store && store.runtime.shellMode === 'shell' ? [{ label: 'Windows desktop', click: openWindowsDesktop }] : []),
    { label: 'Pick a game for me', click: () => { showWindow(); win.webContents.send('navigate', 'pick'); } },
    { label: 'Rescan library', click: () => getLibrary(true).then(() => win.webContents.send('library:updated')) },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
  updateTrayTip();
}

function updateTrayTip() {
  if (tray) tray.setToolTip(`Nexus (${(currentHotkey || '').replace('Control', 'Ctrl')}) - ${nowPlayingLabel()}`);
}

// Smoothly animate the whole window's opacity (Windows supports this natively)
let fadeTimer = null;
function fadeWindow(from, to, ms, done) {
  clearInterval(fadeTimer);
  const start = Date.now();
  win.setOpacity(from);
  fadeTimer = setInterval(() => {
    const t = Math.min(1, (Date.now() - start) / ms);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease in-out
    try { win.setOpacity(from + (to - from) * e); } catch {}
    if (t >= 1) { clearInterval(fadeTimer); fadeTimer = null; if (done) done(); }
  }, 16);
}
function fadeHide(ms = 250, done) {
  if (!win.isVisible()) { if (done) done(); return; }
  if (!store.data.settings.animations || ms <= 0) { win.hide(); if (done) done(); return; }
  fadeWindow(win.getOpacity(), 0, ms, () => { win.hide(); win.setOpacity(1); if (done) done(); });
}

function showWindow() {
  if (!win) return;
  exitGhost();
  cancelStepBehind();
  cancelLaunchWait(); // the user brought Nexus back, so don't fade it away again when the game shows up
  if (win.isMinimized()) win.restore();
  const wasVisible = win.isVisible();
  const from = wasVisible ? win.getOpacity() : 0;
  if (!wasVisible) win.setOpacity(0);
  win.show();
  win.focus();
  if (store.data.settings.animations && from < 0.99) fadeWindow(from, 1, 260);
  else { clearInterval(fadeTimer); win.setOpacity(1); }
  win.webContents.send('focus-search');
}
const toggleWindow = () => (win.isVisible() && win.isFocused() ? (cancelLaunchWait(), fadeHide(220)) : showWindow());

// ---------- Waiting for a launched game ----------
// While a game starts, Nexus keeps a full-screen cover up (game art, tips, progress) above everything, the taskbar and
// any pop-ups or newly opened windows included. It only fades once the game's window has "settled" (stopped resizing,
// big enough, steady title) AND the game itself is playing sound (a loaded game has music or effects; a splash or loading
// screen often doesn't), and has been brought to the front. Games behind their own launcher get the launcher's Start
// button pressed for them.
const GAME_WAIT_MS = 150000; // give up waiting for the game window after this long
const SILENT_GAME_MS = 60000; // a settled game window that never makes a sound (muted, sound off) counts after this long
let launchWait = null; // the wait in progress, if any: { finish(why) }
let coverForced = false; // true while Nexus went fullscreen just for the cover
let coverTimer = null;
let pressJob = null; // the launcher "press Start" helper, if one is running

const TOP = 'screen-saver'; // the highest always-on-top level

function cancelLaunchWait() {
  if (launchWait) launchWait.finish('cancel');
}

function sendPhase(phase, extra) {
  if (win && !win.isDestroyed()) win.webContents.send('launch:phase', { phase, ...extra });
}

// Fullscreen and above everything for the cover. Other windows can still be pushed above us (the taskbar when it is
// clicked, an always-on-top app), so we put ourselves back on top a couple of times a second. Never takes focus away.
let ghostOn = false; // Nexus is on top of the game at 1% opacity, click-through

function keepOnTop(ms = 400) {
  clearInterval(coverTimer);
  coverTimer = setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    win.setAlwaysOnTop(true, TOP);
    win.moveTop();
  }, ms);
}

// Back from the 1% state: clicks land on Nexus again and "on top" goes back to what the setting says
function exitGhost() {
  if (!ghostOn) return;
  ghostOn = false;
  clearInterval(coverTimer); coverTimer = null;
  if (win && !win.isDestroyed()) { win.setIgnoreMouseEvents(false); win.setAlwaysOnTop(!!store.data.settings.alwaysOnTop, TOP); }
}

function startCover() {
  if (!store.data.settings.launchCover || !win || win.isDestroyed()) return;
  if (!win.isFullScreen()) { coverForced = true; win.setFullScreen(true); }
  win.setAlwaysOnTop(true, TOP);
  win.moveTop();
  win.focus();
  keepOnTop();
}
function endCover() {
  clearInterval(coverTimer);
  coverTimer = null;
  if (!win || win.isDestroyed()) { coverForced = false; return; }
  win.setAlwaysOnTop(!!store.data.settings.alwaysOnTop, TOP);
  if (coverForced) { coverForced = false; win.setFullScreen(false); }
}

// ---------- Stepping behind what was launched ----------
// Nexus never closes or hides itself after a launch. It fades to invisible (and lets clicks through), the game or app
// comes to the front, Nexus slips in right behind it in the window order, and a few seconds later it is solid again
// back there, out of sight.
const BEHIND_SHOW_MS = 5000;
let behindGen = 0; // bumped whenever the user brings Nexus back, so a step-behind in progress stops
let behindTimer = null;

const myHwnd = () => (IS_LINUX ? '1' : win.getNativeWindowHandle().readBigUInt64LE(0).toString());

function cancelStepBehind() {
  behindGen++;
  clearTimeout(behindTimer); behindTimer = null;
  if (beforeShow) { const f = beforeShow; beforeShow = null; f(); } // the cover was never tidied away: do it now
  if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(false);
}

// target: the window to go behind (raised first), or null for "whatever opens next" (waitMs) / the very back.
// game: true when target is a game, so Nexus also goes to the very back. tidy runs just before Nexus is shown again
// back there (leaving fullscreen then, not while invisible: that would make the window solid and catch clicks again).
let beforeShow = null;
async function stepBehind(target, { game = false, waitMs = 0, since = 0, tidy = null } = {}) {
  if (!win || win.isDestroyed()) return;
  const s = store.data.settings;
  if (IS_LINUX) {
    // Linux has no way to slot a window in behind another one, so Nexus just tucks itself away (minimised) and comes back when the game closes
    cancelStepBehind();
    clearInterval(coverTimer); coverTimer = null;
    if (tidy) tidy();
    win.setOpacity(1); win.setIgnoreMouseEvents(false);
    win.minimize();
    return;
  }
  cancelStepBehind();
  const gen = behindGen;
  beforeShow = tidy;
  if (win.isVisible()) {
    win.setIgnoreMouseEvents(true); // invisible windows must not catch clicks
    if (s.launchFade && s.animations) await new Promise((res) => fadeWindow(win.getOpacity(), 0, 900, res));
    else { clearInterval(fadeTimer); win.setOpacity(0); }
  }
  if (gen !== behindGen || win.isDestroyed()) return;
  clearInterval(coverTimer); coverTimer = null;
  win.setAlwaysOnTop(false);
  await launchWatch.placeBehind(myHwnd(), target, { raise: true, waitMs, since });
  // behind a game: right at the very back, under the game and every other window (an elevated game can refuse to be raised or to have us slotted under it)
  if (game) await launchWatch.placeBehind(myHwnd(), null, { raise: false });
  if (gen !== behindGen || win.isDestroyed()) return;
  behindTimer = setTimeout(() => {
    if (gen !== behindGen || !win || win.isDestroyed()) return;
    if (beforeShow) { const f = beforeShow; beforeShow = null; f(); }
    if (game) launchWatch.placeBehind(myHwnd(), null, { raise: false }); // tidy() may have left fullscreen: stay at the back
    win.setIgnoreMouseEvents(false);
    if (s.launchFade && s.animations) fadeWindow(0, 1, 400); else win.setOpacity(1);
  }, BEHIND_SHOW_MS);
}

// A window smaller than this is taken for a launcher, splash or anti-cheat window, not the game (default 1600x900).
// Never more than 90% of the smallest screen, or a game on a small or scaled display could never count.
function minGameWindow() {
  const want = Math.max(0, Number(store.data.settings.launchMinWidth) || 0);
  if (!want) return { minW: 480, minH: 270 }; // setting turned off: only tiny windows are ignored
  const sizes = screen.getAllDisplays().map((d) => d.size);
  const capW = Math.min(...sizes.map((z) => z.width)) * 0.9;
  const capH = Math.min(...sizes.map((z) => z.height)) * 0.9;
  return { minW: Math.round(Math.min(want, capW)), minH: Math.round(Math.min(want * 9 / 16, capH)) };
}

// While a game Nexus launched runs with Nexus behind it (or ghosting over it): bring Nexus forward as soon as the game
// closes. The playtime tracker already checks every few seconds, so normally its 'end' event does this (see init) and
// nothing extra runs while you play. Only when the tracker is off, or never recognises the game, does a slow window
// watcher stand in, and a game window that is briefly recreated (a resolution change) doesn't count as closing.
let backdrop = null;
function stopBackdrop() {
  if (backdrop) { clearTimeout(backdrop.timer); clearTimeout(backdrop.check); if (backdrop.watcher) backdrop.watcher.stop(); backdrop = null; }
}
function startBackdropWatch(it, spec) {
  stopBackdrop();
  const job = { id: it.id, watcher: null, timer: null, check: null };
  backdrop = job;
  const watchWindow = () => {
    let seen = false, gone = 0;
    job.watcher = launchWatch.startWatch(spec, (it.readyNames || []).map((n) => n.toLowerCase()), (sample) => {
      if (backdrop !== job) return;
      if (sample) { seen = true; gone = 0; return; }
      if (seen && ++gone >= 3) { stopBackdrop(); returnToNexus(); } // about 6 s without any game window
    }, { interval: 2000 });
  };
  const tracked = () => store.data.settings.trackPlaytime && tracker && tracker.active.has(it.id);
  if (tracked()) { /* the tracker's 'end' event brings Nexus back */ }
  else job.check = setTimeout(() => { if (backdrop === job && !tracked()) watchWindow(); }, 20000); // give the tracker a few polls first
  job.timer = setTimeout(() => { if (backdrop === job) stopBackdrop(); }, 12 * 3600 * 1000);
}

function stopPress() {
  if (pressJob) { pressJob.stop(); pressJob = null; }
}

const UPDATE_WAIT_MS = 3 * 3600 * 1000; // while an update is downloading there is no point giving up

// Starts pressing the launcher's Start button (and, if allowed, Update) for a game that has a launcher (it.autoPress).
// onEvent sees what the launcher shows.
function startPress(it, onEvent) {
  stopPress();
  if (!it || !it.autoPress) return null;
  const job = launcherPress.startAutoPress(it.autoPress, (ev) => { if (onEvent) onEvent(ev); if (ev.type === 'clicked') setTimeout(() => { if (pressJob === job) stopPress(); }, 500); }, { update: !!store.data.settings.autoUpdate });
  pressJob = job;
  setTimeout(() => { if (pressJob === job) stopPress(); }, UPDATE_WAIT_MS); // never leave the helper running
  return job;
}

function sendUpdate(info) {
  if (win && !win.isDestroyed()) win.webContents.send('launch:update', info);
}

// After launching something: for games, keep the cover up until the game is really on screen, then fade away.
// Anything else: Nexus steps behind it after a beat.
function hideAfterLaunch(it) {
  const s = store.data.settings;
  stopBackdrop();
  exitGhost();
  const spec = it && it.type === 'game' ? watchList([it])[0] : null; // games always get the cover; the hide setting is for apps and sites
  if (!spec && !s.hideOnLaunch) { startPress(it); return; }
  cancelLaunchWait();
  const beat = s.launchConfetti ? 1100 : 450;
  if (!spec) {
    // an app or site: step behind whatever window it opens
    if (win && !win.isDestroyed()) win.webContents.send('launch:done');
    const since = Date.now();
    setTimeout(() => stepBehind(null, { waitMs: 8000, since, tidy: endCover }), beat);
    return;
  }

  const t0 = Date.now();
  const settler = new launchWatch.Settler({ settleMs: 3500 + Math.max(0, Number(s.launchExtraWait) || 0) * 1000, ...minGameWindow() });
  const wait = { state: 'waiting', item: it, watcher: null, timer: null, upd: null, net: null, handedOff: false };
  const cleanup = () => {
    clearTimeout(wait.timer); clearInterval(wait.upd);
    if (wait.watcher) wait.watcher.stop();
    if (wait.net) wait.net.stop();
    stopPress();
  };
  let phase = '';
  const setPhase = (p) => { if (p !== phase) { phase = p; sendPhase(p); } };
  let pressed = false;
  let pressedAt = 0;
  let launcherHwnd = null;
  let stuckSince = 0; // since when the launcher has shown something other than a launch word (an update, a login...)
  let launcherSince = 0; // since when the launcher window has been open without a button we can use
  let longWait = false; // the launcher showed a greyed-out Start: allow it longer
  // ----- updates: is this launch really "installing an update"? -----
  let updating = false; // an update is downloading right now
  let updateClicked = false; // we pressed the launcher's Update button
  let launcherText = ''; // progress text the launcher shows itself
  let lastUpdateAt = 0;
  let fastTicks = 0; // how long the PC has been downloading fast
  const rate = new updates.RateTracker();
  wait.net = new updates.NetMonitor().start();

  wait.finish = (why, hwnd) => {
    if (why === 'cancel') { wait.state = 'cancelled'; cleanup(); if (launchWait === wait) launchWait = null; endCover(); return; }
    if (wait.state !== 'waiting') return;
    wait.state = 'finishing';
    cleanup();
    (async () => {
      sendUpdate(null);
      if (launchWait === wait) launchWait = null;
      const game = why === 'ready' && hwnd; // the game's window is up and playing
      if (why === 'ready') sendPhase('ready');
      if (game && !IS_LINUX && (s.gameMode === 'ghost' || s.alwaysOnTop)) {
        // "On top, nearly invisible" ("always on top" can't be behind anything): fade to 1%, click-through, the game keeps the keyboard
        if (s.launchFade && s.animations) await new Promise((res) => fadeWindow(win.getOpacity(), 0.01, 900, res)); else win.setOpacity(0.01);
        if (wait.state === 'cancelled') { win.setOpacity(1); return; }
        win.setAlwaysOnTop(true, TOP); win.moveTop();
        win.setIgnoreMouseEvents(true);
        ghostOn = true;
        keepOnTop();
        await launchWatch.bringToFront(hwnd);
        coverForced = false;
        win.webContents.send('launch:done', { behind: true });
        startBackdropWatch(it, spec);
        return;
      }
      win.webContents.send('launch:done', { behind: true });
      if (game) {
        // Stay fullscreen right behind the game until it closes
        coverForced = false;
        startBackdropWatch(it, spec);
        await stepBehind(hwnd, { game: true });
      } else if (!wait.handedOff) {
        // Gave up waiting, or "Hide Nexus now": go to the back
        await stepBehind(null, { tidy: endCover });
      }
    })();
  };
  // The launcher needs a person (a login, a prompt, a button Nexus won't press): step aside so they can use it, but keep
  // waiting. The launcher's Start button is still pressed the moment it shows up, and when the game appears Nexus
  // goes behind it as usual. hwnd is the launcher's window, or null for "whatever comes to the front".
  wait.handoff = (hwnd) => {
    if (wait.state !== 'waiting' || wait.handedOff) return;
    wait.handedOff = true;
    armTimeout(15 * 60000); // plenty of time to log in or click through the launcher
    sendPhase('handoff');
    try { new Notification({ title: it.name, body: 'The launcher needs you. Nexus has stepped aside and will start the game when the launcher is ready.' }).show(); } catch {}
    if (win && !win.isDestroyed()) win.webContents.send('launch:done', { behind: true });
    stepBehind(hwnd || null, { tidy: endCover });
  };
  launchWait = wait;
  startCover();
  setPhase('starting');
  // Giving up on a game behind a launcher whose Start button was never pressed would leave the launcher open and the
  // game never started, so step aside instead and keep pressing in the background.
  const armTimeout = (ms) => {
    clearTimeout(wait.timer);
    wait.timer = setTimeout(() => (it.autoPress && !pressed && !wait.handedOff ? wait.handoff(launcherHwnd) : wait.finish('timeout')), ms);
  };
  armTimeout(GAME_WAIT_MS);

  // Every 1.5 s: is something being downloaded? Steam says exactly; for the rest we watch how fast the PC is downloading.
  wait.upd = setInterval(() => {
    if (wait.state !== 'waiting') return;
    const speed = wait.net.speed(4000);
    fastTicks = speed >= 1.5e6 ? Math.min(fastTicks + 1, 12) : Math.max(0, fastTicks - 1);
    let info = null;
    const st = it.source === 'steam' ? updates.readSteamState(it) : null;
    if (st && st.pending && st.total > 0 && (st.running || st.done > 0 || fastTicks >= 2)) {
      rate.add(st.done);
      const sp = rate.rate() || speed;
      const eta = sp > 50000 ? updates.fmtEta((st.total - st.done) / sp) : '';
      info = { title: 'Installing an update', pct: Math.min(1, st.done / st.total), line: `${updates.fmtBytes(st.done)} of ${updates.fmtBytes(st.total)} · ${updates.fmtSpeed(sp)}${eta ? ' · ' + eta : ''}` };
    } else if ((!settler.seen || (updateClicked && !pressed)) && (launcherText || fastTicks >= 4) && (updateClicked || fastTicks >= 4)) {
      if (launcherText) {
        const m = launcherText.match(/(\d{1,3}(?:[.,]\d+)?)\s?%/);
        const hasRate = /\/\s?s/i.test(launcherText);
        info = { title: 'Installing an update', pct: m ? Math.min(1, parseFloat(m[1].replace(',', '.')) / 100) : null, line: launcherText + (!hasRate && speed >= 3e5 ? ` · ${updates.fmtSpeed(speed)}` : '') };
      } else {
        info = { title: 'Downloading an update', pct: null, line: `${updates.fmtBytes(wait.net.received())} downloaded since launch · ${updates.fmtSpeed(speed)}` };
      }
    }
    if (info) {
      lastUpdateAt = Date.now();
      if (!updating) { updating = true; armTimeout(UPDATE_WAIT_MS); setPhase('updating'); }
      sendUpdate(info);
    } else if (updating && Date.now() - lastUpdateAt > 20000) {
      updating = false; sendUpdate(null); armTimeout(GAME_WAIT_MS); // the download stopped: back to the normal limit
    }
  }, 1500);

  if (it.autoPress) {
    startPress(it, (ev) => {
      if (wait.state !== 'waiting' || ev.repeat && ev.type !== 'button' && ev.type !== 'window' && ev.type !== 'info') return;
      if (ev.hwnd) launcherHwnd = ev.hwnd;
      if (ev.type === 'info') { launcherText = ev.text.replace(/\s*\|\s*/g, ' · ').trim(); return; }
      if (ev.type === 'window' || ev.type === 'button') { if (!pressed && !settler.seen && !updating) setPhase('launcher'); }
      if (ev.type === 'window') { launcherSince = launcherSince || Date.now(); stuckSince = 0; }
      if (ev.type === 'button') {
        launcherSince = 0;
        const label = ev.name || '';
        // A Start (or allowed Update) button that is greyed out is the launcher still checking files or starting up:
        // that is waiting, not stuck. Anything else (Install, Log in...) needs the user.
        const ours = new RegExp(it.autoPress.start || launcherPress.DEFAULT_START, 'i').test(label) || (s.autoUpdate && new RegExp(launcherPress.DEFAULT_UPDATE, 'i').test(label));
        if (ours) stuckSince = 0; else stuckSince = stuckSince || Date.now();
        if (ours && !ev.enabled && !longWait) { longWait = true; armTimeout(10 * 60000); } // checking files can take minutes
      }
      if (ev.type === 'updated') { updateClicked = true; stuckSince = 0; }
      if (ev.type === 'clicked') { pressed = true; pressedAt = Date.now(); stuckSince = 0; setPhase('pressed'); }
      if (ev.type === 'none') { launcherSince = 0; stuckSince = 0; }
    });
  }

  // Sound from the game's own processes while its big window is up. Both have to be true before the cover goes:
  // the window has settled, and the game has played sound for a moment (two polls, about a second).
  let heard = 0;
  let settledAt = 0; // when the window last started counting as settled (0 = not settled right now)
  wait.watcher = launchWatch.startWatch(spec, (it.readyNames || []).map((n) => n.toLowerCase()), (sample, sound) => {
    if (wait.state !== 'waiting') return;
    const now = Date.now();
    const elapsed = now - t0;
    const r = settler.feed(sample, elapsed);
    const big = r.phase === 'settling' || r.phase === 'settled';
    if (!big) heard = 0; else if (sound > 0) heard++;
    if (it.autoPress && !updating && !wait.handedOff) {
      // The launcher needs a person: it shows something we won't press (a login...) for a while, or never shows a button at all.
      // After we pressed Update the button says "Updating 45%" and the like, which is not stuck, so allow 15 minutes then.
      const stuckLimit = updateClicked ? 15 * 60000 : 15000;
      if (!settler.seen && ((stuckSince && now - stuckSince > stuckLimit) || (launcherSince && now - launcherSince > 60000))) wait.handoff(launcherHwnd);
      // Start was pressed but no game window ever came (a prompt inside the launcher, say)
      else if (pressed && !settler.seen && now - pressedAt > 75000) wait.handoff(launcherHwnd);
    }
    if (updating) { settledAt = 0; return; } // the cover shows the update; the window can't be the finished game yet
    if (r.phase !== 'settled') settledAt = 0;
    else if (!settledAt) {
      settledAt = now;
      armTimeout(Math.max(GAME_WAIT_MS - elapsed, SILENT_GAME_MS + 15000)); // leave time to listen for the game
    }
    if (settledAt && (heard >= 2 || now - settledAt >= SILENT_GAME_MS)) return wait.finish('ready', r.hwnd);
    // "settled" without sound yet: the window is ready, the game may still be loading
    if (!wait.handedOff && !(it.autoPress && !pressed && !settler.seen)) setPhase(r.phase === 'settled' ? 'listening' : r.phase === 'starting' && pressed ? 'pressed' : r.phase);
  }, { audio: true });
}

// Registers the global shortcut; keeps the old one if the new combination is taken or invalid
function registerHotkey(accel) {
  const prev = currentHotkey;
  if (prev) globalShortcut.unregister(prev);
  let ok = false;
  try { ok = globalShortcut.register(accel, toggleWindow); } catch {}
  if (ok) {
    currentHotkey = accel;
    updateTrayTip();
    return true;
  }
  if (prev) { try { globalShortcut.register(prev, toggleWindow); } catch {} }
  return false;
}

app.on('before-quit', () => { app.isQuitting = true; if (overlay) overlay.stop(); if (tracker) tracker.stop(); if (store) store.saveNow(); });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', (e) => e.preventDefault());

const sendState = () => { if (win && !win.isDestroyed()) win.webContents.send('state:update', store.public()); };

// ---------- Notifications ----------
function notifyUser(title, body, view) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: ICON });
  n.on('click', () => { showWindow(); if (view) win.webContents.send('navigate', view); });
  n.show();
}

// A newer GitHub release only produces a notification (once per version); the user opens the page and installs it themselves
// Installing from inside Nexus only works for the installed copy (the installer puts Nexus in %LOCALAPPDATA%\Programs). Other copies get the download page.
const installedCopy = () => process.platform === 'win32' && app.isPackaged && path.resolve(app.getPath('exe')).toLowerCase().startsWith(path.join(process.env.LOCALAPPDATA || '', 'Programs').toLowerCase());
const updateInfo = () => (latestRelease ? { version: latestRelease.latest, url: latestRelease.url, canInstall: !!(latestRelease.installer && installedCopy()) } : null);
let latestRelease = null; // result of the last GitHub check that found a newer version
async function checkRelease(manual) {
  if (!manual && !store.data.settings.checkUpdates) return null;
  const res = await releaseCheck.check(app.getVersion());
  latestRelease = res.newer ? res : null;
  if (win && !win.isDestroyed()) win.webContents.send('update:available', updateInfo());
  if (res.newer && !manual && store.data.updateNotified !== res.latest && Notification.isSupported()) {
    store.data.updateNotified = res.latest;
    store.save();
    const n = new Notification({ title: `Nexus ${res.latest} is out`, body: 'Click to see what changed and download it.', icon: ICON });
    n.on('click', () => shell.openExternal(res.url));
    n.show();
  }
  return res;
}

// Total hours per game (Steam, the Overwatch profile, or typed in) so the UI can show "632h played (43h in Nexus)"
const netFetch = (u, o) => require('electron').net.fetch(u, { ...o, signal: AbortSignal.timeout(12000) });
let lifetimeBusy = false;
async function refreshLifetime() {
  if (lifetimeBusy) return;
  lifetimeBusy = true;
  try {
    const next = store.data.settings.lifetimeHours === false ? {} : await lifetime.compute(items, store, overwatchApi, netFetch);
    if (JSON.stringify(next) !== JSON.stringify(store.runtime.lifetime)) { store.runtime.lifetime = next; sendState(); }
  } finally { lifetimeBusy = false; }
}

function onPlayTick(id, elapsed, a) {
  const s = store.data.settings;
  if (!s.breakReminder) return;
  const every = Math.max(15, s.breakMinutes || 120) * 60000;
  if (!a.remindAt) a.remindAt = a.start + every;
  if (Date.now() < a.remindAt) return;
  a.remindAt += every;
  const it = items.find((i) => i.id === id);
  const mins = Math.round(elapsed / 60000);
  notifyUser('Time for a break?', `You've been playing ${it ? it.name : 'a game'} for ${Math.floor(mins / 60)}h ${mins % 60}m. Stretch, drink some water.`);
}

// Stamina full / daily reset alerts for the gacha games you have installed
function checkAlerts() {
  if (!store) return;
  const s = store.data.settings;
  const now = Date.now();
  const keys = [...new Set(items.filter((i) => i.type === 'game').map((i) => Gacha.keyFor(i)).filter(Boolean))];
  if (!keys.length) return;
  const per = Gacha.periods(now, s.region);
  const resets = [];
  let changed = false;
  for (const key of keys) {
    const def = Gacha.GAMES[key];
    const st = store.data.gacha[key];
    const n = (store.data.notified[key] = store.data.notified[key] || {});
    if (st && st.stamina) {
      const sv = Gacha.stamina(st, def, now);
      if (sv.full && st.stamina.value < sv.max && n.full !== st.stamina.at) {
        n.full = st.stamina.at;
        changed = true;
        if (s.notifyStamina) notifyUser(`${def.stamina.name} is full`, `${def.name}: ${sv.max}/${sv.max}. Don't let it overflow!`, 'gacha');
      }
    }
    if (n.daily === undefined) { n.daily = per.daily; changed = true; } // first run: remember, don't alert
    else if (n.daily !== per.daily) { n.daily = per.daily; changed = true; resets.push(def.name); }
  }
  if (resets.length && s.notifyReset) notifyUser('Daily reset', `${resets.join(', ')}: dailies are available again.`, 'gacha');
  if (changed) store.save();
}

// ---------- Library ----------
const favicon = (url) => {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=128`; } catch { return null; }
};

// Where a custom shortcut really points, so the tracker can see the game running: a .lnk's target exe, or for a
// steam://rungameid .url the Steam game's folder. Falls back to the file itself.
function shortcutTarget(file, found) {
  if (IS_LINUX || !file) return null;
  try {
    if (/\.lnk$/i.test(file)) {
      const t = shell.readShortcutLink(file).target;
      return t && fs.existsSync(t) ? t : null;
    }
    if (/\.url$/i.test(file)) {
      const url = (fs.readFileSync(file, 'utf8').match(/^URL=(.+)$/im) || [])[1] || '';
      const appid = (url.match(/^steam:\/\/rungameid\/(\d+)/i) || [])[1];
      const g = appid && (found || []).find((i) => i.appid === appid);
      return g && g.location ? g.location : null;
    }
  } catch {}
  return null;
}

function customToItem(c, found = items) {
  if (c.kind === 'web') {
    return { id: c.id, type: 'web', source: 'web', name: c.name, url: c.url, icon: favicon(c.url), custom: true, launch: { kind: 'url', target: c.url } };
  }
  let isExe = /\.exe$/i.test(c.path);
  let launch;
  if (IS_LINUX) {
    // a .desktop file has to be started through its Exec line; opened as a file it would land in a text editor
    if (/\.desktop$/i.test(c.path)) launch = { kind: 'desktop', target: c.path };
    try { fs.accessSync(c.path, fs.constants.X_OK); isExe = !fs.statSync(c.path).isDirectory() && !/\.desktop$/i.test(c.path); } catch { isExe = false; }
  }
  const target = isExe ? null : shortcutTarget(c.path, found);
  return {
    id: c.id, type: c.category === 'game' ? 'game' : 'app', source: 'custom', name: c.name, custom: true,
    iconPath: target && /\.exe$/i.test(target) ? target : c.path, location: target || c.path,
    ...(c.autoPress ? { autoPress: c.autoPress } : {}), // optional: press a launcher's Start button (edit library.json)
    ...(c.procNames ? { procNames: c.procNames } : {}),
    launch: launch || (isExe ? { kind: 'exe', target: c.path } : { kind: 'open', target: c.path }),
  };
}

function applyArt() {
  for (const it of items) {
    const own = store.data.covers[it.id];
    if (own && fs.existsSync(own)) it.cover = pathToFileURL(own).href;
    else if ((!it.cover || it.needsArt) && it.type === 'game' && store.data.artCache[it.name]) {
      if (it.cover) it.coverFallback = it.cover;
      it.cover = store.data.artCache[it.name];
      it.needsArt = false;
    }
  }
}

// Real, full-size icons pulled out of each program (cached as PNGs); web-found logos fill in the rest
async function applyIcons() {
  const requests = items.filter((i) => !i.icon).map((i) => {
    const src = i.iconSrc || (i.iconPath && { path: i.iconPath, index: 0 });
    return src && { id: i.id, path: src.path, index: src.index };
  }).filter(Boolean);
  let found = new Map();
  try {
    found = await Promise.race([
      icons.extractIcons(requests, path.join(app.getPath('userData'), 'icons')),
      new Promise((resolve) => setTimeout(() => resolve(new Map()), 60000)),
    ]);
  } catch (e) { console.error(e); }
  for (const it of items) {
    if (it.icon) continue;
    if (found.has(it.id)) it.icon = pathToFileURL(found.get(it.id)).href;
    else if (store.data.iconCache[it.name]) it.icon = store.data.iconCache[it.name];
  }
}

let scanned = false; // a real scan has finished this run
let scanGen = 0; // only the newest of overlapping scans gets to replace the library
function getLibrary(rescan) {
  if (!scanning || rescan) {
    const gen = ++scanGen;
    const job = (async () => {
      const found = await scanner.scanAll(shell);
      if (gen !== scanGen) return;
      const next = [...found, ...store.data.custom.map((c) => customToItem(c, found))];
      await addProcNames(next, store).catch(console.error); // so protected games (anti-cheat) are still recognised while they run
      if (gen !== scanGen) return;
      store.data.libCache = found; scanned = true; store.save(); // next start shows this straight away
      items = next;
      watched = watchList(items);
      refreshLifetime().catch(console.error);
      seedStarterTags();
      applyArt();
      await applyIcons();
      fetchMissingArt().then(fetchMissingIcons).catch(console.error);
    })();
    // A scan that failed must not stick: the next request scans again instead of getting the same error forever
    job.catch(() => { if (scanning === job) scanning = null; });
    scanning = job;
  }
  return scanning;
}

const RETRY_ART = 3 * 86400000;
const RETRY_ICON = 7 * 86400000;
const notify = () => { if (win && !win.isDestroyed()) win.webContents.send('library:updated'); };
let fetchingArt = false;

// Covers for games that have none locally: Steam's real image paths first, then Wikipedia / image search
async function fetchMissingArt() {
  if (fetchingArt) return;
  fetchingArt = true;
  try {
    const missing = items.filter((i) => i.type === 'game' && (!i.cover || i.needsArt) && !store.data.artCache[i.name]
      && !(Date.now() - (store.data.artMiss[i.name] || 0) < RETRY_ART));
    const steam = await gameInfo.steamStoreArt(missing.filter((i) => i.appid).map((i) => i.appid));
    for (const it of missing) {
      let url = it.appid && steam[it.appid] && steam[it.appid].cover;
      if (url && !(await gameInfo.verifyImage(url))) url = null;
      if (!url) url = await gameInfo.findCover(it.name, it.appid);
      if (url) { store.data.artCache[it.name] = url; delete store.data.artMiss[it.name]; }
      else store.data.artMiss[it.name] = Date.now(); // don't hammer the web on every start
      store.save();
      applyArt();
      if (url) notify();
    }
  } finally { fetchingArt = false; }
}

// Logos for apps whose own icon couldn't be read
async function fetchMissingIcons() {
  // Apps only: games show their cover, so they don't need a logo
  const need = items.filter((i) => i.type === 'app' && !i.icon && !(Date.now() - (store.data.iconMiss[i.name] || 0) < RETRY_ICON)).slice(0, 15);
  for (const it of need) {
    const url = await gameInfo.findAppIcon(it.name);
    if (url) { store.data.iconCache[it.name] = url; it.icon = url; delete store.data.iconMiss[it.name]; }
    else store.data.iconMiss[it.name] = Date.now();
    store.save();
    if (url) notify();
  }
}


// ---------- Tags ----------
// The first time games are found, give the ones we know a few starter tags. After that the tags are the user's.
function seedStarterTags() {
  if (store.data.tagsSeeded) return;
  const games = items.filter((i) => i.type === 'game');
  if (!games.length) return;
  store.data.tags = store.data.tags || {};
  for (const g of games) {
    const t = starterTagsFor(g.name);
    if (t && !store.data.tags[g.id]) store.data.tags[g.id] = t.slice();
  }
  store.data.tagsSeeded = true;
  store.save();
}

const cleanTags = (v) => [...new Set((Array.isArray(v) ? v : []).map((t) => String(t).trim().replace(/\s+/g, ' ').slice(0, 24)).filter(Boolean))].slice(0, 12);

// ---------- News ----------
// Works out which news items you haven't looked at yet. The first time we see a game its current news counts as seen.
function annotateNews(res) {
  store.data.newsSeen = store.data.newsSeen || {};
  const fresh = {};
  let total = 0, dirty = false;
  for (const [id, d] of Object.entries(res.byGame)) {
    const ids = d.items.map((n) => n.id);
    if (!store.data.newsSeen[id]) { store.data.newsSeen[id] = ids; dirty = true; fresh[id] = 0; d.items.forEach((n) => { n.isNew = false; }); continue; }
    d.items.forEach((n) => { n.isNew = !store.data.newsSeen[id].includes(n.id); });
    fresh[id] = d.items.filter((n) => n.isNew).length;
    total += fresh[id];
  }
  if (dirty) store.save();
  return { ...res, fresh, freshTotal: total };
}

const newsGames = () => items.filter((i) => i.type === 'game').map((i) => ({ id: i.id, name: i.name }));

async function refreshNews() {
  if (!items.length) return;
  try {
    const res = annotateNews(await feeds.getGameNews(newsGames(), false)); // the feeds' own 30-minute cache decides what is old
    if (win && !win.isDestroyed()) win.webContents.send('news:updated', res);
  } catch { /* offline: try again later */ }
}

// ---------- Launching ----------
const bnetBusy = new Set(); // Battle.net product codes Nexus is currently waiting to start

async function launch(l, it) {
  if (l.kind === 'url') return shell.openExternal(l.target);
  if (IS_LINUX && l.kind === 'desktop') { if (!(await linux.launchDesktop(l.target))) throw new Error(`Could not start ${l.target}`); return; }
  if (IS_LINUX && l.kind === 'exe') {
    if (!fs.existsSync(l.target)) throw new Error(`File not found: ${l.target}`);
    linux.launchExe(l.target, l.args);
    return;
  }
  if (l.kind === 'bnet') {
    // Not awaited: it can take a while (Battle.net starting and logging in) and the cover shows the progress meanwhile
    if (!fs.existsSync(l.target)) throw new Error(`File not found: ${l.target}`);
    if (bnetBusy.has(l.code)) return; // already waiting for Battle.net to start this game: a second click changes nothing
    bnetBusy.add(l.code);
    const name = (it && it.name) || 'Battle.net';
    const tell = (body) => { try { new Notification({ title: name, body }).show(); } catch {} };
    const mine = () => launchWait && launchWait.item === it; // phases only matter while the cover for this game is up
    bnet.launchViaBattleNet({
      exe: l.target, code: l.code,
      onPhase: (p) => { if (mine()) sendPhase(p); },
      onNeedsLogin: () => {
        tell('Battle.net is waiting for you to log in. Nexus will start the game as soon as you do.');
        if (mine()) launchWait.handoff(null); // step aside so the login screen can be used
      },
    }).then((r) => { if (r === 'timeout') tell("Battle.net didn't finish logging in, so the game wasn't started."); })
      .catch(() => {}).finally(() => bnetBusy.delete(l.code));
    return;
  }
  if (l.kind === 'open') {
    const err = await shell.openPath(l.target);
    if (err) throw new Error(err);
    return;
  }
  if (l.kind === 'uwp') {
    spawn('explorer.exe', [`shell:AppsFolder\\${l.target}`], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  if (l.kind === 'exe') {
    if (!fs.existsSync(l.target)) throw new Error(`File not found: ${l.target}`);
    // Start-Process goes through ShellExecute, so games that need admin get a normal UAC prompt,
    // and the working directory is the game's own folder (some games need that).
    // A hidden PowerShell swallowed the UAC prompt for requireAdministrator games (HSR, WuWa), so use
    // cmd's `start` instead: it calls ShellExecute from a process that can raise the prompt in front.
    const dir = path.dirname(l.target);
    const line = `start "" /D "${dir}" "${l.target}"${l.args ? ' ' + l.args : ''}`;
    // RunAsInvoker is Windows' own switch for "start this without asking for administrator rights" (the game then runs un-elevated)
    const env = it && store.data.noAdmin && store.data.noAdmin[it.id] ? { ...process.env, __COMPAT_LAYER: 'RunAsInvoker' } : process.env;
    spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe'), ['/d', '/s', '/c', `"${line}"`], { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true, env }).unref();
  }
}

function setLoginItem(on) {
  if (IS_LINUX) { try { linux.setAutostart(on, process.env.APPIMAGE || process.execPath); } catch (e) { console.error(e); } return; }
  const opts = { openAtLogin: on, args: ['--hidden'] };
  if (!app.isPackaged) Object.assign(opts, { path: process.execPath, args: [app.getAppPath(), '--hidden'] });
  // The portable build unpacks to a temp folder that changes every run; point at the real .exe instead
  else if (process.env.PORTABLE_EXECUTABLE_FILE) opts.path = process.env.PORTABLE_EXECUTABLE_FILE;
  app.setLoginItemSettings(opts);
}

// ---------- Settings side effects ----------
const zoomFor = (scale) => Math.min(1.5, Math.max(0.7, (Number(scale) || 100) / 100));
function applySetting(key, value) {
  if (key === 'startWithWindows') setLoginItem(!!value);
  if (key === 'alwaysOnTop') win.setAlwaysOnTop(!!value, 'screen-saver'); // the highest level: above the taskbar and other pop-ups
  if (key === 'uiScale') win.webContents.setZoomFactor(zoomFor(value));
  if (/^overlay|^owTag$/.test(key) && overlay) overlay.update();
  if (key === 'trackPlaytime') (value ? tracker.start() : tracker.stop());
}

// ---------- IPC ----------
function registerIpc() {
  const find = (id) => {
    const it = items.find((i) => i.id === id);
    if (!it) throw new Error('Item not found');
    return it;
  };
  const full = () => ({ items, prefs: store.public() });

  ipcMain.handle('prefs:get', () => store.public()); // instant (no library scan), used at startup

  ipcMain.handle('library:get', async (_e, rescan) => {
    // At startup: show last time's library at once and let the real scan catch up in the background
    const cache = store.data.libCache;
    if (!rescan && !scanned && !items.length && Array.isArray(cache) && cache.length) {
      items = [...cache, ...store.data.custom.map((c) => customToItem(c, cache))];
      watched = watchList(items);
      applyArt();
      getLibrary(false).then(notify).catch(console.error);
      return full();
    }
    await getLibrary(rescan);
    return full();
  });

  ipcMain.handle('open:external', (_e, url) => { if (/^https:\/\//i.test(url)) shell.openExternal(url); });

  ipcMain.handle('game:info', async (_e, id) => {
    const it = find(id);
    const cached = store.data.info[id];
    if (cached && Date.now() - cached.at < 14 * 86400000) return cached.data;
    const data = await gameInfo.getGameInfo(it);
    if (data.source || data.screenshots.length) { // don't cache total failures (e.g. offline)
      store.data.info[id] = { at: Date.now(), data };
      store.save();
    }
    return data;
  });

  ipcMain.handle('icon:get', async (_e, filePath) => {
    if (iconCache.has(filePath)) return iconCache.get(filePath);
    // Only used when the real icon couldn't be extracted (shell thumbnails return blank generic icons for many programs)
    let url = null;
    try { url = (await app.getFileIcon(filePath, { size: 'large' })).toDataURL(); } catch {}
    iconCache.set(filePath, url);
    return url;
  });

  ipcMain.handle('item:launch', async (_e, id) => {
    const it = find(id);
    await launch(it.launch, it);
    store.data.recents[id] = Date.now();
    store.save();
    hideAfterLaunch(it);
    return store.public();
  });

  // "Hide now" on the loading card: stop waiting for the game and fade away
  ipcMain.handle('launch:skip', () => { if (launchWait) launchWait.finish('skip'); });

  // ----- Nexus as the Windows desktop -----
  ipcMain.handle('shell:status', () => ({ ...shellMode.status(), active: store.runtime.shellMode === 'shell', packaged: app.isPackaged }));
  ipcMain.handle('shell:desktop', () => openWindowsDesktop());
  ipcMain.handle('shell:enable', async () => {
    if (!app.isPackaged) throw new Error('This only works from the built Nexus exe.');
    const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
    const r = await dialog.showMessageBox(win, {
      type: 'question', title: 'Nexus', buttons: ['Set it up', 'Cancel'], defaultId: 1, cancelId: 1,
      message: 'Make Nexus your Windows desktop?',
      detail: 'After you sign in, Nexus opens instead of the normal desktop: no wallpaper, taskbar or Start menu.\n\n'
        + '• Your usual startup apps (Steam, Discord and so on) are started for you.\n'
        + '• Windows notifications and the taskbar tray need the desktop, so they only show after you switch to it.\n'
        + '• Quitting Nexus, or closing it and choosing "Windows desktop", brings the normal desktop back.\n'
        + '• It takes effect the next time you sign in. If the exe is moved or deleted, Windows falls back to the normal desktop.\n\n'
        + `You can undo it in Settings, or from Task Manager (Ctrl+Shift+Esc → Run new task) with:\n"${exe}" --restore-shell`,
    });
    if (r.response !== 0) return { ok: false, cancelled: true };
    shellMode.enable({ userData: app.getPath('userData'), exe, procNames: [...new Set([path.basename(process.execPath), path.basename(exe)])] });
    return { ok: true };
  });
  ipcMain.handle('shell:disable', () => { shellMode.disable({ userData: app.getPath('userData') }); return { ok: true }; });

  ipcMain.handle('item:action', async (_e, id, kind) => {
    const it = find(id);
    if (kind === 'alt' && it.alt) {
      await launch(it.alt.launch);
      hideAfterLaunch();
    }
    if (kind === 'reveal' && it.location) {
      const isDir = fs.existsSync(it.location) && fs.statSync(it.location).isDirectory();
      isDir ? shell.openPath(it.location) : shell.showItemInFolder(it.location);
    }
  });

  ipcMain.handle('pref:set', async (_e, kind, id, value) => {
    if (kind === 'favorite') store.toggleList('favorites', id, value);
    if (kind === 'hidden') store.toggleList('hidden', id, value);
    if (kind === 'unhideAll') { store.data.hidden = []; store.save(); }
    if (kind === 'noAdmin') { store.data.noAdmin = store.data.noAdmin || {}; if (value) store.data.noAdmin[id] = true; else delete store.data.noAdmin[id]; store.save(); }
    if (kind === 'tags') { store.data.tags = store.data.tags || {}; const t = cleanTags(value); if (t.length) store.data.tags[id] = t; else delete store.data.tags[id]; store.save(); }
    if (kind === 'name') { // your own name for a game or app; empty brings the real one back
      store.data.names = store.data.names || {};
      const n = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 80);
      if (n) store.data.names[id] = n; else delete store.data.names[id];
      store.save();
    }
    if (kind === 'remove') {
      store.data.custom = store.data.custom.filter((c) => c.id !== id);
      items = items.filter((i) => i.id !== id);
      watched = watchList(items);
      store.save();
    }
    if (kind === 'cover') {
      const res = await dialog.showOpenDialog(win, { title: 'Choose cover image', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }] });
      if (res.canceled) return null;
      store.data.covers[id] = res.filePaths[0];
      store.save();
      const it = find(id);
      it.cover = pathToFileURL(res.filePaths[0]).href;
    }
    if (kind === 'resetCover') {
      delete store.data.covers[id];
      store.save();
      await getLibrary(true);
    }
    return full();
  });

  ipcMain.handle('custom:add', async (_e, data) => {
    const c = { id: `custom:${Date.now()}`, kind: data.kind, name: String(data.name || '').trim() || 'Untitled' };
    const url = String(data.url || '').trim();
    if (data.kind === 'web') c.url = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    else Object.assign(c, { path: data.path, category: data.category });
    store.data.custom.push(c);
    store.save();
    items.push(customToItem(c));
    watched = watchList(items);
    return full();
  });

  ipcMain.handle('dialog:pickFile', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Choose a program or game', properties: ['openFile'],
      filters: IS_LINUX ? [{ name: 'All files', extensions: ['*'] }] : [{ name: 'Programs', extensions: ['exe', 'lnk', 'url', 'bat', 'cmd'] }, { name: 'All files', extensions: ['*'] }],
    });
    if (res.canceled) return null;
    const p = res.filePaths[0];
    return { path: p, name: path.basename(p, path.extname(p)) };
  });

  // ----- settings -----
  ipcMain.handle('setting:set', (_e, key, value) => {
    if (!(key in SETTING_DEFAULTS) || typeof value !== typeof SETTING_DEFAULTS[key]) return store.public(); // ignore unknown keys / wrong types
    store.data.settings[key] = value;
    store.save();
    applySetting(key, value);
    return store.public();
  });

  ipcMain.handle('hotkey:set', (_e, accel) => {
    const ok = typeof accel === 'string' && accel.length < 60 && registerHotkey(accel);
    if (ok) { store.data.settings.hotkey = accel; store.save(); }
    return { ok, prefs: store.public() };
  });

  ipcMain.handle('settings:reset', () => {
    store.data.settings = { ...SETTING_DEFAULTS, welcomeDone: store.data.settings.welcomeDone };
    store.save();
    for (const k of ['startWithWindows', 'alwaysOnTop', 'uiScale', 'trackPlaytime']) applySetting(k, SETTING_DEFAULTS[k]);
    registerHotkey(SETTING_DEFAULTS.hotkey);
    return store.public();
  });

  ipcMain.handle('window:hide', () => fadeHide(220));
  ipcMain.handle('window:fullscreen', (_e, on) => { win.setFullScreen(!!on); });
  ipcMain.handle('window:titlebar', (_e, color, symbolColor) => {
    if (/^#[0-9a-f]{6}$/i.test(color) && /^#[0-9a-f]{6}$/i.test(symbolColor)) {
      try { win.setTitleBarOverlay({ color, symbolColor, height: 40 }); win.setBackgroundColor(color); } catch {}
    }
  });

  // ----- gacha helper -----
  ipcMain.handle('gacha:op', (_e, key, op, p = {}) => {
    const def = Gacha.GAMES[key];
    if (!def) return store.public();
    const now = Date.now();
    const per = Gacha.periods(now, store.data.settings.region);
    const g = (store.data.gacha[key] = store.data.gacha[key] || {});
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v) || 0)));
    const typeOk = (t) => t === 'daily' || t === 'weekly';

    if (op === 'stamina') g.stamina = { value: clamp(p.value, 0, 9999), at: now };
    if (op === 'spend') {
      const cur = Gacha.stamina(g, def, now);
      g.stamina = { value: Math.max(0, cur.value - clamp(p.amount, 0, 999)), at: now };
    }
    if (op === 'max') g.maxOverride = p.value > 0 ? clamp(p.value, 1, 9999) : null;
    if (op === 'check' && typeOk(p.type)) {
      g.done = g.done || { daily: {}, weekly: {} };
      g.done[p.type] = g.done[p.type] || {};
      if (p.done) g.done[p.type][p.id] = per[p.type]; else delete g.done[p.type][p.id];
    }
    if (op === 'checkAll' && typeOk(p.type)) {
      g.done = g.done || { daily: {}, weekly: {} };
      g.done[p.type] = {};
      if (p.done) for (const t of Gacha.tasks(g, key, p.type)) g.done[p.type][t.id] = per[p.type];
    }
    if (op === 'addTask' && typeOk(p.type) && String(p.label || '').trim()) {
      g.custom = g.custom || { daily: [], weekly: [] };
      g.custom[p.type].push({ id: `u_${now}`, label: String(p.label).trim().slice(0, 60) }); // "u_" marks tasks you added yourself
    }
    if (op === 'removeTask' && typeOk(p.type)) {
      if (String(p.id).startsWith('u_') && g.custom) g.custom[p.type] = g.custom[p.type].filter((t) => t.id !== p.id);
      else { g.removed = g.removed || []; if (!g.removed.includes(`${p.type}:${p.id}`)) g.removed.push(`${p.type}:${p.id}`); }
    }
    if (op === 'resetTasks') { g.custom = { daily: [], weekly: [] }; g.removed = []; }
    if (op === 'bannerEnd') g.bannerEnd = Number(p.value) > 0 ? Math.round(Number(p.value)) : null; // when the current banner phase ends
    if (op === 'pulls') {
      g.pulls = clamp(p.pulls, 0, 9999);
      if (p.perDay !== undefined && p.perDay !== '') g.pullsPerDay = Math.min(30, Math.max(0, Math.round((Number(p.perDay) || 0) * 100) / 100));
    }
    if (op === 'pity' && def.banners.some((b) => b.id === p.banner)) {
      g.pity = g.pity || {};
      g.pity[p.banner] = { count: clamp(p.count, 0, 200), guaranteed: !!p.guaranteed };
    }
    store.save();
    return store.public();
  });

  // ----- data tools -----
  // What a backup holds (besides the settings), and so what restoring one brings back: everything that is yours, not caches
  const BACKUP_LISTS = ['favorites', 'hidden', 'custom', 'sessions', 'matches', 'badgesSeen'];
  const BACKUP_MAPS = ['recents', 'covers', 'playtime', 'gacha', 'tags', 'manualHours', 'noAdmin', 'overlayLayout', 'names', 'newsSeen'];
  ipcMain.handle('data:export', async () => {
    const res = await dialog.showSaveDialog(win, { title: 'Export Nexus data', defaultPath: 'nexus-backup.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (res.canceled) return false;
    const out = { nexus: 1, settings: store.data.settings };
    for (const k of [...BACKUP_LISTS, ...BACKUP_MAPS]) if (store.data[k] !== undefined) out[k] = store.data[k];
    fs.writeFileSync(res.filePath, JSON.stringify(out, null, 2));
    return true;
  });

  ipcMain.handle('data:import', async () => {
    const res = await dialog.showOpenDialog(win, { title: 'Import Nexus data', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (res.canceled) return null;
    let d;
    try { d = JSON.parse(fs.readFileSync(res.filePaths[0], 'utf8')); } catch { throw new Error('That file is not valid JSON.'); }
    if (!d || d.nexus !== 1) throw new Error('That is not a Nexus backup file.');
    const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
    if (isObj(d.settings)) for (const k of Object.keys(SETTING_DEFAULTS)) if (typeof d.settings[k] === typeof SETTING_DEFAULTS[k]) store.data.settings[k] = d.settings[k];
    for (const k of BACKUP_LISTS) if (Array.isArray(d[k])) store.data[k] = d[k];
    for (const k of BACKUP_MAPS) if (isObj(d[k])) store.data[k] = d[k];
    store.save();
    for (const k of ['startWithWindows', 'alwaysOnTop', 'uiScale', 'trackPlaytime']) applySetting(k, store.data.settings[k]);
    registerHotkey(store.data.settings.hotkey);
    await getLibrary(true);
    return full();
  });

  ipcMain.handle('data:clearCache', async () => {
    Object.assign(store.data, { artCache: {}, artMiss: {}, info: {}, iconCache: {}, iconMiss: {} });
    store.save();
    try { fs.rmSync(path.join(app.getPath('userData'), 'icons'), { recursive: true, force: true }); } catch {}
    iconCache.clear();
    await getLibrary(true);
    return full();
  });

  ipcMain.handle('data:resetPlaytime', () => {
    store.data.playtime = {};
    store.data.sessions = [];
    store.save();
    return store.public();
  });

  // ----- match log (Overwatch statistics page) -----
  const matchList = () => (store.data.matches = store.data.matches || []);
  const cleanMatch = (p) => {
    const str = (v, n) => String(v == null ? '' : v).slice(0, n);
    const out = {};
    if (['w', 'l', 'd'].includes(p.r)) out.r = p.r;
    if ('hero' in p) out.hero = str(p.hero, 40);
    if ('map' in p) out.map = str(p.map, 40);
    if ('role' in p && ['tank', 'damage', 'support', ''].includes(p.role)) out.role = p.role;
    if ('sr' in p) out.sr = p.sr === '' || p.sr == null ? null : Math.max(-100, Math.min(100, Math.round((Number(p.sr) || 0) * 10) / 10)); // role rank progress in percent
    if ('note' in p) out.note = str(p.note, 200);
    if ('t' in p && Number.isFinite(Number(p.t))) out.t = Number(p.t);
    return out;
  };
  ipcMain.handle('matches:list', () => {
    let fixed = false;
    for (const m of matchList()) if (!m.id) { m.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6); fixed = true; }
    if (fixed) store.save();
    return matchList();
  });
  ipcMain.handle('ow:profile', async () => {
    try { return await overwatchApi.fetchProfile(store.data.settings.owTag, (u, o) => require('electron').net.fetch(u, o)); } catch (e) { return { error: String(e.message || e) }; }
  });
  ipcMain.handle('matches:add', (_e, p) => {
    const c = cleanMatch(p || {});
    if (!c.r) return false;
    matchList().push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: Date.now(), game: 'Overwatch 2', auto: false, ...c });
    store.save(); overlay.refresh();
    return true;
  });
  ipcMain.handle('matches:update', (_e, id, p) => {
    const m = matchList().find((x) => x.id === id);
    if (!m) return false;
    Object.assign(m, cleanMatch(p || {}));
    if (m.hero && !m.role) m.role = require('./shared/ow-data').roleOf(m.hero) || m.role;
    store.save(); overlay.refresh();
    return true;
  });
  ipcMain.handle('matches:delete', (_e, id) => { store.data.matches = matchList().filter((x) => x.id !== id); store.save(); overlay.refresh(); return true; });

  ipcMain.handle('overlay:edit', () => { overlay.setEditing(true); return true; });
  ipcMain.handle('overlay:resetToday', () => { overlay.resetToday(); return overlay.stats(); });
  ipcMain.handle('overlay:resetLayout', () => { overlay.resetLayout(); return true; });
  ipcMain.handle('overlay:stats', () => overlay.stats());
  ipcMain.handle('data:openFolder', () => shell.openPath(app.getPath('userData')));
  ipcMain.handle('update:status', () => updateInfo());
  // Downloads the installer from this project's GitHub release, checks it, and runs it. Nexus closes so the installer can replace it.
  let installing = false;
  ipcMain.handle('update:install', async () => {
    const rel = latestRelease;
    if (installing || !rel || !rel.installer || !installedCopy()) return { ok: false, error: 'No installer to run' };
    const slug = releaseCheck.repoSlug();
    if (!slug || !rel.installer.url.startsWith(`https://github.com/${slug}/releases/download/`)) return { ok: false, error: 'The installer is not from this project' };
    installing = true;
    const send = (pct) => { if (win && !win.isDestroyed()) win.webContents.send('update:progress', pct); };
    try {
      const dir = path.join(app.getPath('temp'), 'Nexus-update');
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, path.basename(rel.installer.name));
      const res = await require('electron').net.fetch(rel.installer.url, { headers: { 'User-Agent': 'Nexus-launcher' } });
      if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
      const total = Number(res.headers.get('content-length')) || rel.installer.size || 0;
      const hash = require('crypto').createHash('sha256');
      const out = fs.createWriteStream(file);
      let got = 0;
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        hash.update(value); out.write(value); got += value.length;
        if (total) send(Math.min(99, Math.round((got / total) * 100)));
      }
      await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
      if (rel.installer.size && got !== rel.installer.size) throw new Error('The download is incomplete');
      if (rel.installer.sha256 && hash.digest('hex') !== rel.installer.sha256) throw new Error('The download does not match GitHub\u2019s checksum, so it was not run');
      send(100);
      const setup = require('child_process').spawn(file, [], { detached: true, stdio: 'ignore' });
      setup.on('error', () => {});
      setup.unref();
      setTimeout(() => { app.isQuitting = true; app.quit(); }, 800);
      return { ok: true };
    } catch (e) {
      installing = false;
      return { ok: false, error: String(e && e.message || e) };
    }
  });
  ipcMain.handle('app:info', () => ({ version: app.getVersion() }));
  ipcMain.handle('lifetime:set', (_e, id, hours) => {
    const h = Math.round(Number(hours) * 10) / 10;
    store.data.manualHours = store.data.manualHours || {};
    if (!Number.isFinite(h) || h <= 0) delete store.data.manualHours[id]; else store.data.manualHours[id] = Math.min(h, 100000);
    store.save();
    return refreshLifetime().then(() => store.public());
  });
  ipcMain.handle('achievements:get', (_e, id) => lifetime.achievementsFor(items.find((i) => i.id === id), store, netFetch).catch(() => null));
  ipcMain.handle('achievements:summary', () => lifetime.summary(items).catch(() => []));
  // "What's new" appears once after an update. Nexus's own notes are bundled; nothing is downloaded.
  ipcMain.handle('whatsnew:get', (_e, force) => {
    const cur = app.getVersion(), seen = store.data.lastSeenVersion;
    if (force) return RELEASE_NOTES[cur] ? { version: cur, from: null, ...RELEASE_NOTES[cur] } : null;
    if (store.firstRun) { store.data.lastSeenVersion = cur; store.save(); return null; } // a fresh install has the welcome guide instead
    if (seen === cur || !RELEASE_NOTES[cur]) return null;
    return { version: cur, from: seen || null, ...RELEASE_NOTES[cur] };
  });
  ipcMain.handle('whatsnew:seen', () => { store.data.lastSeenVersion = app.getVersion(); store.save(); return true; });
  ipcMain.handle('update:check',async () => ({ ...(await checkRelease(true)), current: app.getVersion() }));


  // ----- Tags -----
  // handled in pref:set (kind 'tags')

  // ----- Barça + news -----
  ipcMain.handle('barca:get', async (_e, force) => {
    const cached = feeds.cachedBarca();
    const fresh = feeds.getBarca(!!force).catch(() => null);
    if (cached && !force) { // show what we have now; push the newer data when it arrives
      fresh.then((d) => { if (d && d.updated !== cached.updated && win && !win.isDestroyed()) win.webContents.send('barca:updated', d); });
      return cached;
    }
    return (await fresh) || cached || null;
  });

  ipcMain.handle('news:get', async (_e, force) => {
    const cached = feeds.cachedNews();
    const haveCache = Object.keys(cached).length > 0;
    const run = feeds.getGameNews(newsGames(), !!force).then(annotateNews).catch(() => null);
    if (haveCache && !force) {
      run.then((r) => { if (r && win && !win.isDestroyed()) win.webContents.send('news:updated', r); });
      return annotateNews({ updated: 0, byGame: cached });
    }
    return (await run) || annotateNews({ updated: 0, byGame: cached });
  });

  ipcMain.handle('news:seen', (_e, id) => {
    const d = feeds.cachedNews()[id];
    if (d) { store.data.newsSeen = store.data.newsSeen || {}; store.data.newsSeen[id] = d.items.map((n) => n.id); store.save(); }
    return annotateNews({ updated: 0, byGame: feeds.cachedNews() });
  });

  // The page works out which badges are unlocked. `fresh` are ones to announce, `quiet` are just recorded.
  ipcMain.handle('badges:seen', (_e, quiet, fresh, total) => {
    const seen = new Set(store.data.badgesSeen || []);
    for (const n of [...(quiet || []), ...(fresh || []).map((b) => b.key || b.name)]) seen.add(String(n));
    store.data.badgesSeen = [...seen];
    store.save();
    if (fresh && fresh.length && store.data.settings.badgePopups) fresh.forEach((b, i) => queueBadgeToast(b, total - fresh.length + i + 1, total));
    return store.public();
  });
  ipcMain.handle('badges:preview', () => {
    queueBadgeToast({ name: 'Test Pilot', icon: '🏆', desc: 'This is what an advancement popup looks like' }, 1, 100, true);
  });
}

// ---------- Badge popups (a small always-on-top window in the corner, like Steam's achievement toasts) ----------
const toastQueue = [];
let toastBusy = false;

function queueBadgeToast(badge, n, total, force) {
  toastQueue.push({ badge, n, total, force });
  if (!toastBusy) showNextToast();
}

function showNextToast() {
  const job = toastQueue.shift();
  if (!job) { toastBusy = false; return; }
  toastBusy = true;
  const s = store.data.settings;
  const W = 380, H = 120, margin = 18;
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const corner = String(s.toastCorner || 'bottom-right'); // Settings → Playtime → "Popup corner"
  const x = corner.endsWith('left') ? area.x + margin : area.x + area.width - W - margin;
  const y = corner.startsWith('top') ? area.y + margin : area.y + area.height - H - margin;
  const t = new BrowserWindow({
    width: W, height: H, x, y,
    frame: false, transparent: true, backgroundColor: '#00000000', resizable: false, movable: false, focusable: false,
    skipTaskbar: true, alwaysOnTop: true, show: false, hasShadow: false, fullscreenable: false,
    webPreferences: { sandbox: true, contextIsolation: true, autoplayPolicy: 'no-user-gesture-required' },
  });
  t.setAlwaysOnTop(true, 'screen-saver'); // above full-screen-windowed games too
  t.setIgnoreMouseEvents(true);
  const query = {
    name: job.badge.name, icon: job.badge.icon, desc: job.badge.desc, n: String(job.n), total: String(job.total),
    vol: String(s.sounds || job.force ? s.soundVolume : 0),
    accent: s.accent || '',
  };
  t.loadFile(path.join(__dirname, 'renderer', 'toast.html'), { query });
  t.once('ready-to-show', () => { if (!t.isDestroyed()) t.showInactive(); });
  const next = () => { if (!t.isDestroyed()) t.destroy(); setTimeout(showNextToast, 500); };
  setTimeout(next, Math.min(20, Math.max(3, Number(s.toastSeconds) || 7)) * 1000 - 200);
}
