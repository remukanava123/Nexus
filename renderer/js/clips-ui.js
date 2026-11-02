// The Clips page and the "Clips" strip on a game's page: videos and screenshots saved by Medal (src/clips.js).
// Clicking one opens it in your video player or photo viewer; hovering a clip plays it silently.
let clipsData = null;      // { folders, clips: [{ path, url, thumb, type, game, t, size }] }
let clipsLoading = null;
let clipsGame = 'all';     // all | <Medal game folder>
let clipsType = 'all';     // all | clip | shot

function loadClips(force) {
  if (clipsLoading && !force) return clipsLoading;
  clipsLoading = window.api.clipsList(!!force).then((d) => { clipsData = d || { folders: [], clips: [] }; return clipsData; }).catch(() => clipsData).finally(() => { clipsLoading = null; });
  return clipsLoading;
}

// Medal names its folders after the game ("Overwatch", "VR Chat"); library names differ a little ("Overwatch 2", "VRChat")
const clipKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function clipMatchesGame(folder, name) {
  const a = clipKey(folder), b = clipKey(name);
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return long.startsWith(short) && /^\d+$/.test(long.slice(short.length)); // a sequel number is the only difference
}
const clipsForGame = (it) => (clipsData ? clipsData.clips.filter((c) => clipMatchesGame(c.game, it.name)) : []);
const clipSize = (n) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`);

function clipCardHtml(c, i) {
  const pic = c.thumb ? `<img src="${esc(c.thumb)}" alt="" loading="lazy" data-hide-self>` : `<video src="${esc(c.url)}#t=1" preload="metadata" muted></video>`;
  return `<div class="clip-card b-card" style="--i:${Math.min(i, 20)}" data-clip="${esc(c.path)}" title="${esc(c.path)}">
    <div class="clip-pic">${pic}${c.type === 'clip' ? '<span class="clip-play">▶</span>' : ''}</div>
    <div class="clip-meta"><b>${esc(c.game)}</b><small>${timeAgo(c.t)} · ${clipSize(c.size)}</small></div>
    <button class="clip-more" data-clipmore="${esc(c.path)}" title="More">⋯</button></div>`;
}

// ⋯ on a clip: other ways to open it (the context menu box from app.js)
function clipMenu(x, y, c) {
  const entries = [
    [c.type === 'clip' ? 'Play in Nexus' : 'View in Nexus', () => clipPlay(c.path)],
    ['Open in Medal', async () => { if (!(await window.api.clipMedal())) toast('Medal is not installed', true); }],
    [c.type === 'clip' ? 'Open in your video player' : 'Open in your photo viewer', () => window.api.clipOpen(c.path)],
    ['Show in folder', () => window.api.clipReveal(c.path)],
  ];
  menu.innerHTML = entries.map((e, i) => `<button data-i="${i}">${esc(e[0])}</button>`).join('');
  menu.onclick = (ev) => { const b = ev.target.closest('button'); if (!b) return; closeMenu(); entries[b.dataset.i][1](); };
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, innerWidth - r.width - 8)}px`;
  menu.style.top = `${Math.min(y, innerHeight - r.height - 8)}px`;
}

// ----- The player: a clip or screenshot over the whole window, with the usual video controls -----
const CLIP_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
let clipList = [], clipIndex = -1, clipEl = null;
const clipStore = (k, v) => { try { if (v === undefined) return localStorage.getItem(`clip.${k}`); localStorage.setItem(`clip.${k}`, String(v)); } catch {} return null; };
const clipTime = (s) => { s = Math.max(0, Math.floor(s || 0)); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; };

function clipPlay(p) {
  const c = clipsData && clipsData.clips.find((x) => x.path === p);
  if (!c) return;
  // the arrows step through what you were looking at: this game's clips on its page, or the filtered Clips page
  const it = detailId && !detail.hidden ? items.find((i) => i.id === detailId) : null;
  clipList = it && clipMatchesGame(c.game, it.name) ? clipsForGame(it) : clipsData.clips.filter((x) => (clipsGame === 'all' || x.game === clipsGame) && (clipsType === 'all' || x.type === clipsType));
  if (!clipList.includes(c)) clipList = [c];
  clipShow(clipList.indexOf(c));
}

// What the player loads (src/clips.js playable): the clip itself, or a copy Chromium can show. HEVC clips (newer
// Medal recordings) play sound with no picture here, and clips with several audio tracks often freeze, so those get a
// copy, made once and kept. Converting HEVC takes a few seconds; the player says how far along it is.
const clipSources = {};
async function clipSource(c, quick) {
  if (clipSources[c.path]) return clipSources[c.path];
  const r = await window.api.clipPlayable(c.path, !!quick);
  if (r && r.url && (r.converted || !quick)) clipSources[c.path] = r.url;
  return r && r.url;
}
window.api.on('clips:progress', ({ path, pct }) => {
  const prep = clipEl && !clipEl.hidden && $('.cp-prep', clipEl);
  if (prep && prep.dataset.path === path) $('span', prep).textContent = `${Math.round(pct * 100)}%`;
});

function clipShow(i) {
  if (i < 0 || i >= clipList.length) return;
  clipIndex = i;
  $$('video.clip-preview').forEach((p) => { p.pause(); p.remove(); }); // a hover preview left playing under the player
  const c = clipList[i];
  if (!clipEl) {
    clipEl = document.createElement('div');
    clipEl.className = 'cp';
    clipEl.tabIndex = -1;
    document.body.appendChild(clipEl);
    clipEl.addEventListener('click', clipClick);
    clipEl.addEventListener('input', clipInput);
    clipEl.addEventListener('change', clipInput);
    clipEl.addEventListener('mousemove', clipWake);
    clipEl.addEventListener('wheel', (e) => { const v = $('video', clipEl); if (v) { e.preventDefault(); clipVolume(v.volume + (e.deltaY < 0 ? 0.05 : -0.05)); } }, { passive: false });
  }
  const speed = Number(clipStore('speed')) || 1;
  const nav = clipList.length > 1 ? `<button class="cp-nav prev" data-cp="prev" title="Previous (Page Up)"${i ? '' : ' disabled'}>‹</button><button class="cp-nav next" data-cp="next" title="Next (Page Down)"${i < clipList.length - 1 ? '' : ' disabled'}>›</button>` : '';
  const top = `<div class="cp-top"><div><b>${esc(c.game)}</b><small>${new Date(c.t).toLocaleString()} · ${clipSize(c.size)}${clipList.length > 1 ? ` · ${i + 1} of ${clipList.length}` : ''}</small></div>
    <button class="cp-btn" data-cp="more" title="More">⋯</button><button class="cp-btn" data-cp="close" title="Close (Esc)">✕</button></div>`;
  if (c.type === 'shot') {
    clipEl.innerHTML = `${top}<div class="cp-stage"><img src="${esc(c.url)}" alt=""></div>${nav}`;
  } else {
    clipEl.innerHTML = `${top}<div class="cp-stage"><video preload="auto"></video><div class="cp-flash"></div><div class="cp-prep" data-path="${esc(c.path)}" hidden><div class="spinner"></div>Getting this clip ready to play here… <span></span></div></div>${nav}
      <div class="cp-bar">
        <input type="range" class="cp-seek" data-cp="seek" min="0" max="1000" value="0" step="1">
        <div class="cp-row">
          <button class="cp-btn" data-cp="play" title="Play / pause (Space)">❚❚</button>
          <button class="cp-btn" data-cp="back" title="Back 5 s (←)">↺5</button>
          <button class="cp-btn" data-cp="fwd" title="Forward 5 s (→)">5↻</button>
          <button class="cp-btn" data-cp="frame-" title="Previous frame (,)">⟨|</button>
          <button class="cp-btn" data-cp="frame+" title="Next frame (.)">|⟩</button>
          <span class="cp-time">0:00 / 0:00</span>
          <span class="cp-gap"></span>
          <button class="cp-btn" data-cp="mute" title="Mute (M)">🔊</button>
          <input type="range" class="cp-vol" data-cp="vol" min="0" max="100" step="1">
          <select class="cp-speed" data-cp="speed" title="Speed ([ and ])">${CLIP_SPEEDS.map((s) => `<option value="${s}"${s === speed ? ' selected' : ''}>${s}×</option>`).join('')}</select>
          <button class="cp-btn${clipStore('loop') === '1' ? ' on' : ''}" data-cp="loop" title="Repeat (L)">⟲</button>
          <button class="cp-btn" data-cp="full" title="Full screen (F)">⛶</button>
        </div>
      </div>`;
    const v = $('video', clipEl);
    v.volume = clipStore('vol') == null ? 0.8 : Math.min(1, Math.max(0, Number(clipStore('vol'))));
    v.muted = clipStore('muted') === '1';
    v.playbackRate = speed;
    v.loop = clipStore('loop') === '1';
    v.addEventListener('timeupdate', clipSync);
    v.addEventListener('loadedmetadata', clipSync);
    v.addEventListener('play', clipSync);
    v.addEventListener('pause', clipSync);
    v.addEventListener('volumechange', clipSync);
    v.addEventListener('ratechange', clipSync);
    v.addEventListener('error', () => { if (v.getAttribute('src')) toast('This clip could not be played here. Try ⋯ → Open in your video player.', true); });
    clipSync();
    // the spinner only shows when the copy takes a moment (a conversion), not for the usual instant answer
    const prep = $('.cp-prep', clipEl);
    const slow = setTimeout(() => { prep.hidden = false; }, 300);
    clipSource(c).then((url) => {
      clearTimeout(slow);
      if (clipList[clipIndex] !== c || !v.isConnected) return; // you moved on meanwhile
      prep.hidden = true;
      if (!url) { toast('Nexus could not get this clip ready. Try ⋯ → Open in your video player.', true); return; }
      v.src = url;
      if (v.dataset.held !== '1') v.play().catch(() => {}); // autoplay alone can wait while the window is in the background
    });
  }
  clipEl.hidden = false;
  clipEl.focus();
  clipWake();
}

function clipClose() {
  if (!clipEl) return;
  const v = $('video', clipEl);
  if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  clipEl.hidden = true;
  clipEl.innerHTML = '';
}

function clipSync() {
  const v = clipEl && $('video', clipEl);
  if (!v) return;
  const seek = $('.cp-seek', clipEl);
  if (seek && !seek.matches(':active') && v.duration) { seek.value = Math.round((v.currentTime / v.duration) * 1000); seek.style.setProperty('--p', `${seek.value / 10}%`); }
  $('.cp-time', clipEl).textContent = `${clipTime(v.currentTime)} / ${clipTime(v.duration)}`;
  $('[data-cp="play"]', clipEl).textContent = v.paused ? '▶' : '❚❚';
  $('[data-cp="mute"]', clipEl).textContent = v.muted || !v.volume ? '🔇' : v.volume < 0.5 ? '🔉' : '🔊';
  const vol = $('.cp-vol', clipEl);
  vol.value = Math.round((v.muted ? 0 : v.volume) * 100);
  vol.style.setProperty('--p', `${vol.value}%`);
  $('.cp-speed', clipEl).value = String(v.playbackRate);
  clipEl.classList.toggle('paused', v.paused);
}

// controls fade out while the clip plays and you leave the mouse alone
let clipIdle = 0;
function clipWake() {
  if (!clipEl) return;
  clipEl.classList.remove('idle');
  clearTimeout(clipIdle);
  clipIdle = setTimeout(() => { const v = clipEl && $('video', clipEl); if (v && !v.paused) clipEl.classList.add('idle'); }, 2500);
}

function clipVolume(x) {
  const v = $('video', clipEl);
  if (!v) return;
  v.volume = Math.min(1, Math.max(0, x));
  v.muted = v.volume === 0;
  clipStore('vol', v.volume); clipStore('muted', v.muted ? 1 : 0);
}
function clipFlash(text) {
  const f = clipEl && $('.cp-flash', clipEl);
  if (!f) return;
  f.textContent = text;
  f.classList.remove('show'); void f.offsetWidth; f.classList.add('show');
}

function clipAct(a) {
  const v = clipEl && $('video', clipEl);
  const c = clipList[clipIndex];
  if (a === 'close') return clipClose();
  if (a === 'prev') return clipShow(clipIndex - 1);
  if (a === 'next') return clipShow(clipIndex + 1);
  if (a === 'more') { const b = $('[data-cp="more"]', clipEl).getBoundingClientRect(); return clipMenu(b.left - 150, b.bottom + 6, c); }
  if (!v) return;
  if (a === 'play') { if (v.paused) { v.dataset.held = ''; v.play().catch(() => {}); } else { v.dataset.held = '1'; v.pause(); } return; }
  if (a === 'back' || a === 'fwd') { v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + (a === 'back' ? -5 : 5))); return clipFlash(a === 'back' ? '−5 s' : '+5 s'); }
  if (a === 'frame-' || a === 'frame+') { v.pause(); v.currentTime = Math.max(0, v.currentTime + (a === 'frame-' ? -1 : 1) / 60); return; }
  if (a === 'mute') { v.muted = !v.muted; if (!v.muted && !v.volume) v.volume = 0.5; clipStore('muted', v.muted ? 1 : 0); return; }
  if (a === 'loop') { v.loop = !v.loop; clipStore('loop', v.loop ? 1 : 0); $('[data-cp="loop"]', clipEl).classList.toggle('on', v.loop); return clipFlash(v.loop ? 'Repeat on' : 'Repeat off'); }
  if (a === 'full') { document.fullscreenElement ? document.exitFullscreen().catch(() => {}) : clipEl.requestFullscreen().catch(() => {}); }
}
function clipSpeed(step) {
  const v = $('video', clipEl);
  if (!v) return;
  const i = Math.max(0, Math.min(CLIP_SPEEDS.length - 1, CLIP_SPEEDS.indexOf(v.playbackRate) + step));
  v.playbackRate = CLIP_SPEEDS[i] || 1;
  clipStore('speed', v.playbackRate);
  clipFlash(`${v.playbackRate}×`);
}

function clipClick(e) {
  clipWake();
  const b = e.target.closest('[data-cp]');
  if (b && b.tagName === 'BUTTON') return clipAct(b.dataset.cp);
  if (e.target.closest('.cp-stage') && !e.target.closest('.cp-flash')) {
    // a click on the picture plays or pauses; a click on the dark edge of a screenshot closes it
    if ($('video', clipEl)) return clipAct('play');
    if (e.target.tagName !== 'IMG') clipClose();
  }
}
function clipInput(e) {
  const v = $('video', clipEl);
  const k = e.target.dataset.cp;
  if (!v) return;
  if (k === 'seek' && v.duration) { v.currentTime = (e.target.value / 1000) * v.duration; e.target.style.setProperty('--p', `${e.target.value / 10}%`); }
  if (k === 'vol') clipVolume(e.target.value / 100);
  if (k === 'speed' && e.type === 'change') { v.playbackRate = Number(e.target.value) || 1; clipStore('speed', v.playbackRate); }
}

// Keys, caught before app.js's own (Esc there would also close the game page underneath)
document.addEventListener('keydown', (e) => {
  if (!clipEl || clipEl.hidden || (e.target.matches && e.target.matches('input[type="text"], textarea'))) return;
  const v = $('video', clipEl);
  const keys = {
    Escape: () => (document.fullscreenElement ? document.exitFullscreen().catch(() => {}) : clipClose()),
    ' ': () => clipAct('play'), k: () => clipAct('play'),
    ArrowLeft: () => clipAct('back'), ArrowRight: () => clipAct('fwd'),
    j: () => v && (v.currentTime = Math.max(0, v.currentTime - 10), clipFlash('−10 s')), l: () => v && (v.currentTime = Math.min(v.duration || 0, v.currentTime + 10), clipFlash('+10 s')),
    ArrowUp: () => v && (clipVolume(v.volume + 0.05), clipFlash(`${Math.round(v.volume * 100)}%`)), ArrowDown: () => v && (clipVolume(v.volume - 0.05), clipFlash(`${Math.round(v.volume * 100)}%`)),
    m: () => clipAct('mute'), f: () => clipAct('full'), r: () => clipAct('loop'),
    ',': () => clipAct('frame-'), '.': () => clipAct('frame+'), '[': () => clipSpeed(-1), ']': () => clipSpeed(1),
    PageUp: () => clipAct('prev'), PageDown: () => clipAct('next'), Home: () => v && (v.currentTime = 0), End: () => v && (v.currentTime = v.duration || 0),
  };
  const fn = keys[e.key] || (/^[0-9]$/.test(e.key) && v && v.duration ? () => { v.currentTime = (Number(e.key) / 10) * v.duration; } : null);
  // screenshots have no video: the arrows step through them instead
  if (!v && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); e.stopImmediatePropagation(); return clipAct(e.key === 'ArrowLeft' ? 'prev' : 'next'); }
  if (!fn) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  clipWake();
  fn();
}, true);

function renderClips() {
  if (!clipsData) {
    content.innerHTML = '<h1 class="page-title">Clips</h1><div class="loading"><div class="spinner"></div>Looking for your Medal clips…</div>';
    loadClips().then(() => { if (view === 'clips') render(); });
    return;
  }
  const all = clipsData.clips;
  if (!all.length) {
    content.innerHTML = `<h1 class="page-title">Clips</h1>
      <div class="empty"><strong>No clips found</strong>${clipsData.folders.length ? `Nothing in ${esc(clipsData.folders.join(', '))} yet.` : 'Nexus shows the clips and screenshots you save with Medal. Install Medal, or set its folder under Settings → Advanced.'}<br>
        <button class="btn" data-clipsync style="margin-top:14px">Look again</button></div>`;
    return;
  }
  const games = [...new Set(all.map((c) => c.game))].sort((a, b) => a.localeCompare(b));
  if (clipsGame !== 'all' && !games.includes(clipsGame)) clipsGame = 'all';
  const shown = all.filter((c) => (clipsGame === 'all' || c.game === clipsGame) && (clipsType === 'all' || c.type === clipsType));
  const count = (g) => all.filter((c) => c.game === g).length;
  const chips = [['all', `All (${all.length})`], ...games.map((g) => [g, `${g} (${count(g)})`])]
    .map(([k, n]) => `<button class="chip${clipsGame === k ? ' active' : ''}" data-clipgame="${esc(k)}">${esc(n)}</button>`).join('');
  content.innerHTML = `
    <div class="b-head"><div><h1 class="page-title">Clips</h1><p class="page-sub">From Medal · ${esc(clipsData.folders.join(', '))}</p></div>
      <div class="b-tools"><select data-cliptype>${[['all', 'Clips and screenshots'], ['clip', 'Clips only'], ['shot', 'Screenshots only']].map(([k, n]) => `<option value="${k}"${k === clipsType ? ' selected' : ''}>${n}</option>`).join('')}</select>
        <button class="btn" data-clipsync title="Look for new clips">↻ Refresh</button></div></div>
    <div class="chips">${chips}</div>
    <div class="clip-grid">${shown.slice(0, 300).map(clipCardHtml).join('') || '<div class="b-empty">Nothing to show for this filter</div>'}</div>`;
}

// ----- On a game's page -----
function gameClipsHtml(it) {
  const list = clipsForGame(it);
  if (!list.length) return '';
  return `<div class="detail-clips"><div class="dn-head"><h3>Your clips</h3><small>${list.length} from Medal</small>${list.length > 6 ? `<button class="btn small" data-clipsall="${esc(list[0].game)}">See all</button>` : ''}</div>
    <div class="clip-grid small">${list.slice(0, 6).map(clipCardHtml).join('')}</div></div>`;
}
async function showDetailClips(it) {
  await loadClips();
  if (detailId !== it.id) return;
  const box = $('#detailClips');
  if (box) box.innerHTML = gameClipsHtml(it);
}

function initClips() {
  // one handler for the Clips page and the game page
  const onClick = (e) => {
    const more = e.target.closest('[data-clipmore]');
    if (more) { e.stopPropagation(); const r = more.getBoundingClientRect(); clipMenu(r.left - 140, r.bottom + 4, clipsData.clips.find((c) => c.path === more.dataset.clipmore)); return true; }
    const all = e.target.closest('[data-clipsall]');
    if (all) { clipsGame = all.dataset.clipsall; clipsType = 'all'; closeDetail(); view = 'clips'; render(); return true; }
    const card = e.target.closest('[data-clip]');
    if (card) { clipPlay(card.dataset.clip); return true; }
    return false;
  };
  detail.addEventListener('click', onClick);
  // right-click a clip for the same menu as ⋯
  for (const root of [content, detail]) root.addEventListener('contextmenu', (e) => {
    const card = e.target.closest('[data-clip]');
    if (!card || !clipsData) return;
    e.preventDefault(); e.stopPropagation();
    clipMenu(e.clientX, e.clientY, clipsData.clips.find((c) => c.path === card.dataset.clip));
  });
  content.addEventListener('click', (e) => {
    if (view !== 'clips') return;
    if (onClick(e)) return;
    const g = e.target.closest('[data-clipgame]');
    if (g) { clipsGame = g.dataset.clipgame; render(); return; }
    if (e.target.closest('[data-clipsync]')) { clipsData = null; render(); loadClips(true).then(() => { if (view === 'clips') render(); }); }
  });
  content.addEventListener('change', (e) => { if (view === 'clips' && e.target.matches('[data-cliptype]')) { clipsType = e.target.value; render(); } });
  // hovering a clip plays it without sound
  const hover = (on) => (e) => {
    const card = e.target.closest && e.target.closest('.clip-card');
    if (!card || (e.relatedTarget && card.contains(e.relatedTarget))) return;
    const c = clipsData && clipsData.clips.find((x) => x.path === card.dataset.clip);
    if (!c || c.type !== 'clip' || prefs.settings.animations === false) return;
    const pic = $('.clip-pic', card);
    let v = $('video.clip-preview', pic);
    card.classList.toggle('hovered', on);
    // only what plays as it is, or a copy already made: a preview never starts a conversion (the thumbnail stays instead)
    if (on && !v) clipSource(c, true).then((url) => {
      if (!url || !card.classList.contains('hovered') || $('video.clip-preview', pic)) return;
      v = document.createElement('video'); v.className = 'clip-preview'; v.muted = true; v.loop = true; v.src = url; pic.appendChild(v); v.play().catch(() => {});
    });
    if (!on && v) { v.pause(); v.remove(); }
  };
  for (const root of [content, detail]) { root.addEventListener('mouseover', hover(true)); root.addEventListener('mouseout', hover(false)); }
}
