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
    <button class="clip-folder" data-clipreveal="${esc(c.path)}" title="Show in folder">📁</button></div>`;
}

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
    const rev = e.target.closest('[data-clipreveal]');
    if (rev) { e.stopPropagation(); window.api.clipReveal(rev.dataset.clipreveal); return true; }
    const all = e.target.closest('[data-clipsall]');
    if (all) { clipsGame = all.dataset.clipsall; clipsType = 'all'; closeDetail(); view = 'clips'; render(); return true; }
    const card = e.target.closest('[data-clip]');
    if (card) { window.api.clipOpen(card.dataset.clip); return true; }
    return false;
  };
  detail.addEventListener('click', onClick);
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
    if (on && !v) { v = document.createElement('video'); v.className = 'clip-preview'; v.muted = true; v.loop = true; v.src = c.url; pic.appendChild(v); v.play().catch(() => {}); }
    if (!on && v) { v.pause(); v.remove(); }
  };
  for (const root of [content, detail]) { root.addEventListener('mouseover', hover(true)); root.addEventListener('mouseout', hover(false)); }
}
