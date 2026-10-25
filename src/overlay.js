// The in-game overlay: a transparent full-screen, click-through window that draws widgets (music, today's competitive
// record, last 5 games, Overwatch career, session timer, clock) wherever the user put them. Shown while a game runs, on
// demand with Ctrl+Alt+O, and made interactive in "edit mode" so the widgets can be dragged and resized.
const path = require('path');
const media = require('./media');
const overwatch = require('./overwatch');
const OW = require('../shared/ow-data');

const DAY = 86400000;
const isOw = (g) => /overwatch/i.test(g || '');
const sameGame = (a, b) => a === b || (isOw(a) && isOw(b));
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

function createOverlay({ electron, store, runningNames, onMatches }) {
  const { BrowserWindow, screen, ipcMain, desktopCapturer, net, globalShortcut } = electron;
  let win = null, mediaJob = null, lastMedia = null, lastThumb = '', lastCover = '', manual = null, editing = false;
  let owTimer = null, owFor = '', owData = null, idleTimer = null;
  let sessionGame = '', sessionStart = 0;
  const coverCache = new Map();
  let coverKey = '', coverTimer = null;

  const cfg = () => {
    const s = store.data.settings;
    return { music: !!s.overlayMusic, bars: !!s.overlayBars, stats: !!s.overlayStats, accent: s.accent, opacity: Number(s.overlayOpacity) || 100 };
  };
  const send = (ch, d) => { if (win && !win.isDestroyed() && !win.webContents.isLoading()) win.webContents.send(ch, d); };
  const matches = () => (store.data.matches = store.data.matches || []);

  // ----- matches -----
  function gameNow() { const g = runningNames()[0] || sessionGame || (matches().length ? matches()[matches().length - 1].game : ''); return isOw(g) ? 'Overwatch 2' : g; }
  function stateFor() {
    const g = gameNow();
    const today = matches().filter((m) => m.t >= startOfToday());
    return { game: g, session: sessionStart || 0, now: Date.now(), today: today.filter((m) => !g || sameGame(m.game, g)).map((m) => ({ r: m.r, t: m.t, game: m.game })), all: today.length, editing,
      // Overwatch rank progress today (percent, per role), whatever way the games were logged
      gains: today.filter((m) => isOw(m.game)).map((m) => ({ r: m.r, role: m.role || OW.roleOf(m.hero) || '', sr: m.sr == null ? null : m.sr })) };
  }
  const pushState = () => send('state', stateFor());

  const changed = () => { if (onMatches) onMatches(); };
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function addMatch(r, auto, extra) {
    const g = gameNow();
    if (!g) { send('toast', 'Start a game first'); return; }
    matches().push({ id: newId(), t: Date.now(), game: g, r, auto: !!auto, ...(extra || {}) });
    store.data.matches = matches().slice(-5000);
    store.save();
    send('toast', `${r === 'w' ? 'Win' : r === 'l' ? 'Loss' : 'Draw'} logged${auto ? ' (auto)' : ''}`);
    pushState(); changed();
    if (win && !win.isDestroyed() && !win.isVisible()) update();
  }
  function undoMatch() {
    const list = matches();
    const g = gameNow();
    for (let i = list.length - 1; i >= 0; i--) if (!g || sameGame(list[i].game, g)) { list.splice(i, 1); store.save(); send('toast', 'Last result removed'); break; }
    pushState(); changed();
  }
  function resetToday() {
    store.data.matches = matches().filter((m) => m.t < startOfToday());
    store.save(); pushState(); changed();
  }

  // The stats site counted new competitive games (per hero). Give each one a result and hero: first to a hotkey-logged match
  // from the last 2 hours that has no hero yet (so the two don't count twice), otherwise as a new match.
  function noticeResults(before, after) {
    const g = gameNow() || 'Overwatch 2';
    const claim = (r, hero) => {
      const cutoff = Date.now() - 2 * 3600000;
      const list = matches();
      for (let i = list.length - 1; i >= 0 && list[i].t >= cutoff; i--) {
        const m = list[i];
        if (sameGame(m.game, g) && m.r === r && !m.hero && !m.auto) { m.hero = hero; m.role = OW.roleOf(hero) || m.role; m.merged = true; return true; }
      }
      return false;
    };
    let any = false;
    for (const [key, h] of Object.entries(after.heroes || {})) {
      const b = (before.heroes || {})[key] || { won: 0, lost: 0 };
      const hero = OW.heroName(key), role = OW.roleOf(hero);
      const add = (r, n) => { for (let i = 0; i < n && i < 10; i++) { any = true; if (!claim(r, hero)) addMatch(r, true, { hero, role }); } };
      add('w', h.won - b.won);
      add('l', h.lost - b.lost);
    }
    if (any) { store.save(); pushState(); changed(); }
  }

  // ----- window -----
  function ensureWindow() {
    if (win && !win.isDestroyed()) return win;
    const d = screen.getPrimaryDisplay();
    win = new BrowserWindow({
      x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
      transparent: true, frame: false, resizable: false, movable: false, skipTaskbar: true, focusable: false, show: false, hasShadow: false, thickFrame: false,
      webPreferences: { preload: path.join(__dirname, 'overlay-preload.js'), contextIsolation: true, sandbox: true, autoplayPolicy: 'no-user-gesture-required' },
    });
    win.setIgnoreMouseEvents(true);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    // the bars listen to what the PC is playing (system audio loopback)
    win.webContents.session.setDisplayMediaRequestHandler((_req, cb) => {
      desktopCapturer.getSources({ types: ['screen'] }).then((src) => cb({ video: src[0], audio: 'loopback' })).catch(() => cb({}));
    });
    win.loadFile(path.join(__dirname, '..', 'renderer', 'overlay.html'));
    win.on('closed', () => { win = null; });
    return win;
  }

  function sendAll() {
    const sendNow = (ch, d) => { if (win && !win.isDestroyed()) win.webContents.send(ch, d); }; // the page just said it is ready
    sendNow('cfg', cfg());
    sendNow('layout', store.data.overlayLayout || {});
    sendNow('state', stateFor());
    if (lastMedia) sendNow('media', { ...lastMedia, thumb: lastThumb });
    sendNow('ow', owData);
    if (lastCover) sendNow('cover', lastCover);
    sendNow('edit', editing);
  }
  ipcMain.on('overlay:ready', sendAll);
  ipcMain.on('overlay:layout', (_e, layout) => {
    if (!layout || typeof layout !== 'object') return;
    const clean = {};
    for (const [id, w] of Object.entries(layout)) {
      if (!/^[a-z0-9]{1,20}$/.test(id) || !w) continue;
      clean[id] = { on: !!w.on, x: Math.round(Number(w.x) || 0), y: Math.round(Number(w.y) || 0), s: Math.min(3, Math.max(0.4, Number(w.s) || 1)), o: Math.min(1, Math.max(0.1, Number(w.o) || 1)) };
    }
    store.data.overlayLayout = clean;
    store.save();
  });
  ipcMain.on('overlay:edit-done', () => setEditing(false));
  ipcMain.on('overlay:match', (_e, r) => { if (['w', 'l', 'd'].includes(r)) addMatch(r); });
  ipcMain.on('overlay:undo', () => undoMatch());

  // ----- music -----
  function startMedia() {
    if (mediaJob) return;
    mediaJob = media.start((m) => {
      if (m.thumb !== undefined) lastThumb = m.thumb;
      lastMedia = m;
      send('media', m);
      watchCover(m);
    });
  }
  function stopMedia() { if (mediaJob) { mediaJob.stop(); mediaJob = null; } lastMedia = null; clearTimeout(coverTimer); }

  // No picture from the player (browsers often give none): look the song up. Tidied title first, e.g. "Artist - Song (Official Video)".
  function cleanTerm(m) {
    let t = String(m.title || '').replace(/[\[(][^\])]*(official|video|lyrics?|audio|hd|4k|remaster|visuali[sz]er|mv)[^\])]*[\])]/gi, '').replace(/\s+/g, ' ').trim();
    const artist = String(m.artist || '').replace(/ - topic$/i, '').replace(/vevo$/i, '').trim();
    return t.includes(' - ') ? t : `${artist} ${t}`.trim();
  }
  async function lookupCover(term) {
    if (coverCache.has(term)) return coverCache.get(term);
    let url = '';
    try {
      const r = await net.fetch(`https://itunes.apple.com/search?entity=song&limit=1&term=${encodeURIComponent(term)}`);
      const j = await r.json();
      if (j.results && j.results[0] && j.results[0].artworkUrl100) url = j.results[0].artworkUrl100.replace('100x100', '400x400');
    } catch {}
    coverCache.set(term, url);
    return url;
  }
  function watchCover(m) {
    if (!m.ok || !m.title || m.key === coverKey) return;
    coverKey = m.key; lastCover = '';
    clearTimeout(coverTimer);
    // give the player a few seconds to publish its own picture first
    coverTimer = setTimeout(async () => {
      if (lastThumb || !lastMedia || lastMedia.key !== m.key) return;
      const url = await lookupCover(cleanTerm(m));
      if (url && lastMedia && lastMedia.key === m.key && !lastThumb) { lastCover = url; send('cover', url); }
    }, 3500);
  }

  // ----- Overwatch: career card, and (optionally) results noticed from the stats changing -----
  async function loadOw() {
    const tag = String(store.data.settings.owTag || '').trim();
    if (!tag) { owData = { error: 'add your BattleTag in Settings' }; send('ow', owData); return; }
    try {
      owData = await overwatch.fetchProfile(tag, (u, o) => net.fetch(u, o));
      if (store.data.settings.owAutoTrack) {
        const c = await overwatch.fetchCompetitive(tag, (u, o) => net.fetch(u, o)).catch(() => null);
        if (c) {
          // the last counts we saw are kept on disk, so games that finish after Overwatch closed are still noticed next time
          const base = store.data.owBase;
          if (base && c.won + c.lost >= base.won + base.lost) noticeResults(base, c);
          store.data.owBase = c; store.save();
        }
      }
    } catch (e) { owData = { error: String(e.message || e) }; }
    send('ow', owData);
  }
  function syncOw(names) {
    const s = store.data.settings;
    const playing = s.overlayStats && names.some((n) => /overwatch/i.test(n));
    if (playing) {
      const key = String(s.owTag || '');
      if (!owTimer) { owFor = key; loadOw(); owTimer = setInterval(loadOw, 3 * 60000); }
      else if (key !== owFor) { owFor = key; loadOw(); }
    } else if (owTimer) { clearInterval(owTimer); owTimer = null; owData = null; send('ow', null); }
  }

  // ----- showing and hiding -----
  function update() {
    const s = store.data.settings;
    const names = runningNames();
    if (names[0] && names[0] !== sessionGame) { sessionGame = names[0]; sessionStart = Date.now(); }
    if (!names.length) sessionStart = 0;
    const want = editing || (s.overlay && (manual !== null ? manual : names.length > 0));
    if (!s.overlay || !s.overlayMusic) stopMedia(); else if (want) startMedia();
    syncOw(names);
    clearTimeout(idleTimer); idleTimer = null;
    if (want) {
      const w = ensureWindow();
      const d = screen.getPrimaryDisplay();
      w.setBounds(d.bounds);
      sendAll();
      if (!w.isVisible()) w.showInactive();
      w.setAlwaysOnTop(true, 'screen-saver');
    } else if (win && !win.isDestroyed()) {
      if (win.isVisible()) win.hide();
      // a hidden overlay still holds a whole page in memory: close it after a minute and rebuild it when it is next needed
      idleTimer = setTimeout(() => { if (win && !win.isDestroyed() && !win.isVisible() && !editing) win.destroy(); }, 60000);
    }
    if (!want && !names.length) stopMedia();
  }

  function toggle() {
    if (editing) { setEditing(false); return; }
    const shown = !!(win && !win.isDestroyed() && win.isVisible());
    manual = !shown;
    update();
  }
  function gamesChanged() { manual = null; update(); }

  // Edit mode: the overlay catches the mouse so widgets can be dragged (wheel = size) and shows sample data
  function setEditing(on) {
    editing = !!on;
    const w = ensureWindow();
    w.setIgnoreMouseEvents(!editing);
    w.setFocusable(editing);
    update();
    send('edit', editing);
    if (editing) { w.show(); w.focus(); }
  }

  function registerKeys() {
    const reg = (k, fn) => { try { globalShortcut.register(k, fn); } catch {} };
    reg('Control+Alt+O', toggle);
    reg('Control+Alt+Shift+O', () => setEditing(!editing));
  }

  return {
    refresh: pushState, update, toggle, gamesChanged, registerKeys, addMatch, undoMatch, resetToday, setEditing,
    resetLayout() { store.data.overlayLayout = {}; store.save(); send('layout', {}); },
    stats() { const t = stateFor(); const w = t.today.filter((m) => m.r === 'w').length, l = t.today.filter((m) => m.r === 'l').length; return { game: t.game, w, l }; },
    stop() { stopMedia(); if (owTimer) clearInterval(owTimer); if (win && !win.isDestroyed()) win.destroy(); },
  };
}

module.exports = { createOverlay };
