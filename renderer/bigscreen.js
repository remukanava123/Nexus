// Big-screen mode: fullscreen, controller-friendly game browser (keyboard or gamepad)
const big = { on: false, tab: 0, idx: 0, tabs: [], launching: false };
const bigEl = () => $('#big');

function bigBuildTabs(keepId) {
  const games = items.filter((i) => i.type === 'game' && !prefs.hidden.includes(i.id));
  const byRecent = games.filter((g) => prefs.recents[g.id]).sort((a, b) => prefs.recents[b.id] - prefs.recents[a.id]);
  const sources = [...new Set(games.map((g) => g.source))];
  big.tabs = [
    { id: 'recent', label: 'Recent', list: byRecent },
    { id: 'fav', label: 'Favourites', list: games.filter((g) => isFav(g.id)).sort(byName) },
    { id: 'all', label: 'All games', list: [...games].sort(byName) },
    // One tab per launcher (pointless when there's only one)
    ...(sources.length > 1 ? sources.map((s) => ({ id: `src:${s}`, label: SOURCES[s] || s, list: games.filter((g) => g.source === s).sort(byName) })) : []),
  ].filter((t) => t.list.length);
  if (keepId) {
    const t = big.tabs[big.tab];
    const i = t ? t.list.findIndex((g) => g.id === keepId) : -1;
    if (i >= 0) { big.idx = i; return; }
  }
  big.tab = clamp(big.tab, 0, Math.max(0, big.tabs.length - 1));
  big.idx = clamp(big.idx, 0, Math.max(0, (big.tabs[big.tab] ? big.tabs[big.tab].list.length : 1) - 1));
}

const bigList = () => (big.tabs[big.tab] ? big.tabs[big.tab].list : []);

function enterBig() {
  big.on = true;
  big.launching = false;
  bigBuildTabs();
  // Start on "Recent" once there are a few recent games, otherwise on "All games"
  const recentTab = big.tabs.findIndex((t) => t.id === 'recent');
  big.tab = recentTab >= 0 && big.tabs[recentTab].list.length >= 4 ? recentTab : Math.max(0, big.tabs.findIndex((t) => t.id === 'all'));
  big.idx = 0;
  closeMenu(); closeDetail(); closePicker();
  unfade(bigEl());
  document.body.classList.add('is-big');
  window.api.setFullscreen(true);
  bigRender();
  bigEl().focus();
  sfx.play('open');
  sfx.refresh();
}
function exitBig() {
  big.on = false;
  fadeHide(bigEl(), 380);
  document.body.classList.remove('is-big');
  setTimeout(() => { if (!big.on) window.api.setFullscreen(false); }, 320); // leave fullscreen once the fade is done
  search.focus();
  sfx.play('back');
  sfx.refresh();
}
const toggleBig = () => (big.on ? exitBig() : enterBig());

let settleTimer;
// animate=false redraws without replaying the cards' entrance
function bigRender(animate = true) {
  if (animate) {
    bigEl().classList.remove('settled');
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => bigEl().classList.add('settled'), 1500);
  }
  bigBuildTabs(big.on && bigList()[big.idx] ? bigList()[big.idx].id : null);
  const list = bigList();
  if (!list.length) {
    bigEl().innerHTML = '<div class="big-empty"><h1>No games found</h1><p>Press Esc or B to go back</p></div>';
    return;
  }
  bigEl().innerHTML = `
    <div class="big-bg" id="bigBg"></div><div class="big-bg" id="bigBg2"></div>
    <div class="big-top">
      <div class="big-tabs">${big.tabs.map((t, i) => `<button class="big-tab${i === big.tab ? ' active' : ''}" data-btab="${i}">${esc(t.label)}</button>`).join('')}</div>
      <div class="big-clock" id="bigClock"></div>
    </div>
    <div class="big-stage"><div class="big-strip" id="bigStrip">${list.map((g, i) => `
      <div class="big-card${i === big.idx ? ' sel' : ''}" data-bidx="${i}" style="--src:var(--${g.source});--n:${Math.min(i, 12)}">
        ${g.cover ? `<img src="${esc(g.cover)}" alt="" data-fallback="${esc(g.coverFallback || '')}"><template>${placeholder(g)}</template>` : placeholder(g)}
        ${isRunning(g.id) ? '<span class="big-live">PLAYING</span>' : ''}${isFav(g.id) ? `<span class="fav-dot">${STAR}</span>` : ''}
      </div>`).join('')}</div></div>
    <div class="big-info" id="bigInfo"></div>
    <div class="big-hints"><span><kbd>◀ ▶</kbd> Browse</span><span><kbd>▲ ▼</kbd>/<kbd>LB RB</kbd> Category</span><span><kbd>Enter</kbd>/<b>A</b> Play</span><span><kbd>F</kbd>/<b>X</b> Favourite</span><span><kbd>R</kbd>/<b>Y</b> Random</span><span><kbd>Esc</kbd>/<b>B</b> Exit</span></div>`;
  bigSelect(big.idx, false);
  hydrateIcons();
  bigTick();
}

function bigSelect(i, animate = true) {
  const list = bigList();
  if (!list.length) return;
  const moved = clamp(i, 0, list.length - 1) !== big.idx;
  big.idx = clamp(i, 0, list.length - 1);
  if (moved && animate) sfx.play('tick');
  const g = list[big.idx];
  const strip = $('#bigStrip');
  if (!strip) return;
  $$('.big-card', strip).forEach((c, n) => c.classList.toggle('sel', n === big.idx));
  const card = strip.children[big.idx];
  const stage = strip.parentElement;
  strip.style.transition = animate && !document.body.classList.contains('no-anim') ? '' : 'none';
  strip.style.transform = `translateX(${stage.clientWidth / 2 - (card.offsetLeft + card.offsetWidth / 2)}px)`;
  // Cross-fade the blurred backdrop between two layers
  const layers = [$('#bigBg'), $('#bigBg2')];
  if (layers[0] && layers[1]) {
    const next = layers.find((l) => !l.classList.contains('show')) || layers[0];
    next.style.backgroundImage = g.cover ? `url('${g.cover}')` : 'none';
    next.classList.add('show');
    layers.filter((l) => l !== next).forEach((l) => l.classList.remove('show'));
  }
  const sec = playSeconds(g.id);
  $('#bigInfo').innerHTML = `
    <div class="big-title">${esc(g.name)}</div>
    <div class="big-meta">${esc(SOURCES[g.source] || '')}${sec >= 60 ? ` · ${fmtHours(sec)} played` : ' · never played'}${prefs.recents[g.id] ? ` · last played ${timeAgo(prefs.recents[g.id])}` : ''}${isRunning(g.id) ? ` · <span class="live-dot"></span> playing now <span data-since="${runningMap()[g.id]}"></span>` : ''}</div>
    <div class="big-play">${PLAY} ${isRunning(g.id) ? 'Open' : 'Play'}</div>`;
}

function bigMove(dx) { bigSelect(big.idx + dx); }
function bigTab(dx) {
  if (big.tabs.length < 2) return;
  big.tab = (big.tab + dx + big.tabs.length) % big.tabs.length;
  big.idx = 0;
  sfx.play('tick');
  bigRender();
}
function bigRandom() {
  const list = bigList();
  if (list.length > 1) bigSelect((big.idx + 1 + ((Math.random() * (list.length - 1)) | 0)) % list.length);
}
async function bigPlay() {
  const g = bigList()[big.idx];
  if (!g || big.launching) return;
  big.launching = true;
  sfx.play('launch');
  bigEl().classList.add('launching');
  fx.burst(innerWidth / 2, innerHeight / 2, 60);
  await launch(g.id);
  setTimeout(() => { big.launching = false; bigEl().classList.remove('launching'); }, 1500);
}
async function bigFav() {
  const g = bigList()[big.idx];
  if (!g) return;
  apply(await window.api.setPref('favorite', g.id, !isFav(g.id)));
  sfx.play('select');
  bigRender(false);
}

function bigKey(e) {
  const k = e.key;
  if (k === 'ArrowRight') bigMove(1);
  else if (k === 'ArrowLeft') bigMove(-1);
  else if (k === 'ArrowDown') bigTab(1);
  else if (k === 'ArrowUp') bigTab(-1);
  else if (k === 'Home') bigSelect(0);
  else if (k === 'End') bigSelect(bigList().length - 1);
  else if (k === 'Enter' || k === ' ') bigPlay();
  else if (k === 'f' || k === 'F') bigFav();
  else if (k === 'r' || k === 'R') bigRandom();
  else if (k === 'Escape' || k === 'Backspace' || k === 'F11') exitBig();
  else return false;
  e.preventDefault();
  return true;
}

function bigTick() {
  const c = $('#bigClock');
  if (c) c.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ----- Click support -----
function initBigScreen() {
  bigEl().addEventListener('click', (e) => {
    const tab = e.target.closest('[data-btab]');
    if (tab) { big.tab = Number(tab.dataset.btab); big.idx = 0; return bigRender(); }
    const card = e.target.closest('[data-bidx]');
    if (card) { const i = Number(card.dataset.bidx); return i === big.idx ? bigPlay() : bigSelect(i); }
    if (e.target.closest('.big-play')) bigPlay();
  });
  bigEl().addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > 8) bigMove(e.deltaY > 0 ? 1 : -1); }, { passive: true });

  // ----- Gamepad -----
  const pad = { raf: 0, down: {}, repeatAt: {} };
  const DIRS = new Set(['left', 'right', 'up', 'down']);
  const act = {
    start: () => {}, // the Options/Start button no longer opens big-screen mode (F11 still does)
    left: () => big.on && bigMove(-1), right: () => big.on && bigMove(1),
    up: () => big.on && bigTab(-1), down: () => big.on && bigTab(1),
    lb: () => big.on && bigTab(-1), rb: () => big.on && bigTab(1),
    a: () => big.on && bigPlay(), b: () => big.on && exitBig(),
    x: () => big.on && bigFav(), y: () => big.on && bigRandom(),
  };
  function loop() {
    const pads = (navigator.getGamepads ? [...navigator.getGamepads()] : []).filter(Boolean);
    if (!pads.length) { pad.raf = 0; return; }
    const now = performance.now();
    const s = {};
    for (const p of pads) {
      const btn = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
      const ax = (i) => p.axes[i] || 0;
      s.a ||= btn(0); s.b ||= btn(1); s.x ||= btn(2); s.y ||= btn(3); s.lb ||= btn(4); s.rb ||= btn(5); s.start ||= btn(9);
      s.up ||= btn(12) || ax(1) < -0.6; s.down ||= btn(13) || ax(1) > 0.6;
      s.left ||= btn(14) || ax(0) < -0.6; s.right ||= btn(15) || ax(0) > 0.6;
    }
    const blocked = !document.hasFocus() || document.hidden || document.body.classList.contains('locked') || document.body.classList.contains('leaving'); // a game is starting or running: the controller is the game's
    for (const name of Object.keys(act)) {
      if (!s[name] || blocked) { pad.down[name] = !!s[name]; continue; }
      if (!pad.down[name]) { pad.down[name] = true; pad.repeatAt[name] = now + 380; act[name](); }
      else if (DIRS.has(name) && now >= pad.repeatAt[name]) { pad.repeatAt[name] = now + 130; act[name](); }
    }
    pad.raf = requestAnimationFrame(loop);
  }
  const start = () => { if (!pad.raf) pad.raf = requestAnimationFrame(loop); };
  window.addEventListener('gamepadconnected', () => { toast('Controller connected.'); start(); });
  start();
}
