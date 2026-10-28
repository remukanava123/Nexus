// Main renderer: library views, search, game pages, menus. (Helpers are in util.js; features in their own files.)
const SOURCES = {
  steam: 'Steam', epic: 'Epic', gog: 'GOG', heroic: 'Heroic', lutris: 'Lutris', desktop: 'Installed', battlenet: 'Battle.net', hoyoplay: 'HoYoPlay', kuro: 'Kuro Games', ea: 'EA app', xbox: 'Xbox / Store',
  custom: 'Custom', app: 'App', web: 'Website',
};
const PLAY = '<svg viewBox="0 0 24 24"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>';
const STAR = '<svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z"/></svg>';

let items = [];
let prefs = { favorites: [], hidden: [], recents: {}, settings: {}, customCovers: [], playtime: {}, sessions: [], gacha: {}, running: {} };
let view = 'home';
let sourceFilter = 'all';
let query = '';
let results = [];
let selected = 0;
let lastScan = Date.now();
const iconCache = new Map();

const content = $('#content');
const search = $('#search');

// Your own name for an item (right-click → Rename), else its real one. The real name stays in it.name for covers, news and tips.
const nameOf = (it) => (prefs.names && prefs.names[it.id]) || it.name;
const byName = (a, b) => nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: 'base' });
const visible = () => { const hidden = new Set(prefs.hidden); return items.filter((i) => !hidden.has(i.id)); };
const ofType = (type) => visible().filter((i) => i.type === type).sort(byName);
const isFav = (id) => prefs.favorites.includes(id);
const recent = () => visible().filter((i) => prefs.recents[i.id]).sort((a, b) => prefs.recents[b.id] - prefs.recents[a.id]);
const domain = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
const neverPlayed = (g) => totalSeconds(g.id) < 60 && !prefs.recents[g.id];

function timeAgo(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'Yesterday' : `${d} days ago`;
}

// A number that's the same all day, so "game of the day" doesn't change on every redraw
function daySeed() {
  let h = 0;
  for (const c of dayKey(Date.now())) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function sortGames(list) {
  const cmp = {
    name: byName,
    recent: (a, b) => (prefs.recents[b.id] || 0) - (prefs.recents[a.id] || 0) || byName(a, b),
    played: (a, b) => totalSeconds(b.id) - totalSeconds(a.id) || byName(a, b),
    source: (a, b) => (SOURCES[a.source] || '').localeCompare(SOURCES[b.source] || '') || byName(a, b),
  }[prefs.settings.gamesSort] || byName;
  return [...list].sort(cmp);
}

// ---------- Building blocks ----------
function letter(it, cls = 'letter') {
  return `<span class="${cls}"${it.iconPath && !it.icon ? ` data-icon-path="${esc(it.iconPath)}"` : ''}>${esc(nameOf(it).trim()[0] || '?').toUpperCase()}</span>`;
}
function iconHtml(it) {
  return it.icon ? `<img src="${esc(it.icon)}" alt="" data-fallback-letter="${esc(nameOf(it)[0] || '?')}">` : letter(it);
}
function placeholder(it) {
  return `<div class="placeholder">${iconHtml(it)}<span>${esc(nameOf(it))}</span></div>`;
}

// The line under a cover (Settings → Appearance → "Under each cover")
function cardMetaHtml(it) {
  const what = prefs.settings.cardMeta || 'hours';
  if (what === 'hours') return totalSeconds(it.id) >= 60 ? `<div class="meta play">${esc(playedText(it.id, true))}</div>` : '';
  if (what === 'lastPlayed') return prefs.recents[it.id] ? `<div class="meta">${esc(timeAgo(prefs.recents[it.id]))}</div>` : '<div class="meta">Never played</div>';
  if (what === 'launcher') return `<div class="meta">${esc(SOURCES[it.source] || '')}</div>`;
  return '';
}

function gameCard(it, meta = '') {
  const art = it.cover
    ? `<img class="art" src="${esc(it.cover)}" data-fallback="${esc(it.coverFallback || '')}" alt="" loading="lazy"><template>${placeholder(it)}</template>`
    : placeholder(it);
  const line = meta ? `<div class="meta">${esc(meta)}</div>` : cardMetaHtml(it);
  return `
    <div class="game" data-id="${esc(it.id)}" tabindex="0" style="--src: var(--${it.source})">
      <div class="cover">
        ${art}
        <span class="badge">${SOURCES[it.source] || ''}</span>
        ${isFav(it.id) ? `<span class="fav-dot">${STAR}</span>` : ''}
        ${isRunning(it.id) ? '<span class="run-badge"><i class="live-dot"></i>PLAYING</span>' : ''}
        <div class="overlay"><div class="play" title="Play">${PLAY}</div></div>
      </div>
      <div class="title">${esc(nameOf(it))}</div>
      ${line}
    </div>`;
}

function tile(it) {
  return `
    <div class="tile ${it.type}" data-id="${esc(it.id)}" tabindex="0" title="${esc(nameOf(it))}">
      ${isFav(it.id) ? `<span class="fav-dot">${STAR}</span>` : ''}
      <div class="icon">${iconHtml(it)}</div>
      <div class="name">${esc(nameOf(it))}</div>
      ${it.type === 'web' ? `<div class="domain">${esc(domain(it.url))}</div>` : ''}
    </div>`;
}

const section = (title, body, link) => `
  <div class="section">
    <div class="section-head"><h2>${title}</h2>${link ? `<button class="link" data-goto="${link}">See all</button>` : ''}</div>
    ${body}
  </div>`;
const games = (list, cls = 'grid-games', metaFn) => `<div class="${cls}">${list.map((g) => gameCard(g, metaFn && metaFn(g))).join('')}</div>`;
const tiles = (list, addKind) => `<div class="grid-tiles">${list.map(tile).join('')}${addKind ? `<div class="tile add" data-add="${addKind}"><div class="icon">+</div><div class="name">Add ${addKind === 'web' ? 'website' : 'program'}</div></div>` : ''}</div>`;

// ---------- Views ----------
function greetingHtml(allGames) {
  const h = new Date().getHours();
  const word = h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const week = secondsSince(daysAgo(6));
  const bits = [`${allGames.length} games ready`];
  if (week >= 60) bits.push(`${fmtHours(week)} played this week`);
  const st = streaks(allSessions());
  if (st.current >= 2) bits.push(`🔥 ${st.current}-day streak`);
  return `<div class="greeting"><h1>${word}</h1><p>${bits.join(' · ')}</p></div>`;
}

function renderHome() {
  const s = prefs.settings;
  const allGames = ofType('game');
  const rec = recent();
  const recGames = rec.filter((i) => i.type === 'game');
  const heroItem = recGames[0] || allGames[0];
  const rows = s.rowCount || 12;
  const live = allGames.filter((g) => isRunning(g.id));
  let html = updateBannerHtml();

  if (s.greeting) html += greetingHtml(allGames);

  if (live.length) {
    html += live.map((g) => `
      <div class="nowplaying" style="--src: var(--${g.source})">
        <span class="live-dot"></span><div><b>Now playing: ${esc(nameOf(g))}</b><small>${esc(SOURCES[g.source] || '')} · <span data-since="${runningMap()[g.id]}"></span></small></div>
        <button class="btn" data-open="${esc(g.id)}">Open page</button>
      </div>`).join('');
  }

  if (s.homeHero && heroItem) {
    const bg = heroItem.cover ? `style="background-image:${esc(cssUrl(heroItem.cover))}"` : '';
    const sec = totalSeconds(heroItem.id);
    html += `
      <div class="hero" style="--src: var(--${heroItem.source})">
        <div class="hero-bg" ${bg}></div>
        ${heroItem.cover ? `<div class="hero-art" ${bg}></div>` : ''}
        <div class="hero-info">
          <div class="hero-label">${recGames[0] ? `Jump back in · ${timeAgo(prefs.recents[heroItem.id])}` : 'Ready to play'}${sec >= 60 ? ` · ${playedText(heroItem.id, true)}` : ''}</div>
          <h1>${esc(nameOf(heroItem))}</h1>
          <div class="hero-actions">
            <button class="play-btn" data-launch="${esc(heroItem.id)}">${PLAY} ${isRunning(heroItem.id) ? 'Open' : 'Play'}</button>
            <button class="btn glass" data-pick title="Spin the wheel (Ctrl+R)">🎲 Pick for me</button>
          </div>
        </div>
      </div>`;
  }

  if (s.homeGacha) {
    const strip = gachaStripHtml();
    if (strip) html += section('Gacha dailies', strip, 'gacha');
  }

  if (s.homeGameOfDay && allGames.length > 3) {
    const pool = allGames.filter((g) => !isRunning(g.id) && Date.now() - (prefs.recents[g.id] || 0) > 3 * DAY_MS);
    const pick = (pool.length ? pool : allGames)[daySeed() % (pool.length || allGames.length)];
    const sec = totalSeconds(pick.id);
    html += `
      <div class="gotd" style="--src: var(--${pick.source})">
        <div class="gotd-art" data-open="${esc(pick.id)}">${pick.cover ? `<img src="${esc(pick.cover)}" alt="" data-hide-self>` : ''}</div>
        <div class="gotd-main"><small>🎯 GAME OF THE DAY</small><b>${esc(nameOf(pick))}</b>
          <span>${SOURCES[pick.source] || ''} · ${sec >= 60 ? playedText(pick.id, true) : 'never played'}</span></div>
        <button class="btn" data-open="${esc(pick.id)}">Details</button><button class="play-btn small" data-launch="${esc(pick.id)}">${PLAY} Play</button>
      </div>`;
  }

  if (s.homeRecent && recGames.length > 1) html += section('Recently played', games(recGames.slice(1, rows + 1), 'row', (g) => timeAgo(prefs.recents[g.id])));

  const favs = visible().filter((i) => isFav(i.id));
  const favGames = favs.filter((i) => i.type === 'game');
  const favOther = favs.filter((i) => i.type !== 'game').sort(byName);
  if (s.homeFavorites && favs.length) {
    html += section('Favourites', (favGames.length ? games(favGames, 'row') : '') + (favOther.length ? `<div style="margin-top:${favGames.length ? 18 : 0}px">${tiles(favOther)}</div>` : ''), 'favorites');
  }

  if (s.homeMostPlayed) {
    const top = allGames.filter((g) => totalSeconds(g.id) >= 600).sort((a, b) => totalSeconds(b.id) - totalSeconds(a.id)).slice(0, rows);
    if (top.length >= 2) html += section('Most played', games(top, 'row', (g) => playedText(g.id, true)), 'stats');
  }

  if (s.homeBacklog) {
    const backlog = allGames.filter(neverPlayed);
    if (backlog.length >= 2) {
      const start = daySeed() % backlog.length;
      const shown = [...backlog.slice(start), ...backlog.slice(0, start)].slice(0, rows); // a different slice each day
      html += section(`Backlog · ${backlog.length} never played`, games(shown, 'row', () => 'Never played'));
    }
  }

  if (s.homeGames && allGames.length) html += section('Your games', games(sortGames(allGames).slice(0, rows + 2), 'row'), 'games');

  const recApps = rec.filter((i) => i.type === 'app').slice(0, 8);
  if (s.homeApps && recApps.length) html += section('Recent apps', tiles(recApps), 'apps');

  if (s.homeWeb) html += section('Websites', tiles(ofType('web'), 'web'), 'web');
  content.innerHTML = html || '<div class="empty"><strong>Your home page is empty</strong>Turn some sections back on in Settings → Home page.</div>';
}

function renderGames() {
  const all = ofType('game');
  const counts = {};
  all.forEach((g) => { counts[g.source] = (counts[g.source] || 0) + 1; });
  if (sourceFilter !== 'all' && !counts[sourceFilter]) sourceFilter = 'all';
  const tagRow = tagFilterHtml(all); // also drops tags nobody has any more from the active filter
  const list = sortGames((sourceFilter === 'all' ? all : all.filter((g) => g.source === sourceFilter)).filter((g) => matchesTags(g.id)));
  const s = prefs.settings;
  const chips = [`<button class="chip ${sourceFilter === 'all' ? 'active' : ''}" data-filter="all">All · ${all.length}</button>`]
    .concat(Object.keys(SOURCES).filter((x) => counts[x]).map((x) =>
      `<button class="chip ${sourceFilter === x ? 'active' : ''}" data-filter="${x}" style="--src: var(--${x})"><span class="dot"></span>${SOURCES[x]} · ${counts[x]}</button>`));
  let body;
  if (!list.length) body = '<div class="section"><div class="empty"><strong>No games found</strong>Use Add to point Nexus at a game\'s .exe.</div></div>';
  else if (s.groupByLauncher && sourceFilter === 'all') {
    const groups = {};
    list.forEach((g) => (groups[g.source] = groups[g.source] || []).push(g));
    body = Object.keys(SOURCES).filter((x) => groups[x]).map((x) => section(`${SOURCES[x]} · ${groups[x].length}`, games(groups[x]))).join('');
  } else body = `<div class="section">${games(list)}</div>`;
  content.innerHTML = `
    <div class="page-head"><h1 class="page-title">Games</h1>
      <div class="page-tools"><label>Sort <select data-gsort>${[['name', 'Name'], ['recent', 'Recently played'], ['played', 'Most played'], ['source', 'Launcher']].map(([k, n]) => `<option value="${k}"${s.gamesSort === k ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="mini-check"><input type="checkbox" data-ggroup${s.groupByLauncher ? ' checked' : ''}> Group</label>
        <button class="btn" data-pick>🎲 Pick for me</button></div></div>
    <div class="chips">${chips.join('')}</div>
    ${tagRow}
    ${body}`;
}

function renderApps() {
  const list = ofType('app');
  content.innerHTML = `
    <h1 class="page-title">Apps</h1>
    <p class="page-sub">${list.length} apps found in your Start menu</p>
    <div class="section">${tiles(list, 'program')}</div>`;
}

function renderWeb() {
  content.innerHTML = `
    <h1 class="page-title">Websites</h1>
    <p class="page-sub">Open in your default browser</p>
    <div class="section">${tiles(ofType('web'), 'web')}</div>`;
}

function renderFavorites() {
  const favs = visible().filter((i) => isFav(i.id)).sort(byName);
  const g = favs.filter((i) => i.type === 'game');
  const other = favs.filter((i) => i.type !== 'game');
  content.innerHTML = `<h1 class="page-title">Favourites</h1>` + (favs.length
    ? (g.length ? section('Games', games(g)) : '') + (other.length ? section('Apps & websites', tiles(other)) : '')
    : '<div class="empty"><strong>Nothing here yet</strong>Right-click any game, app or website and choose “Add to favourites”.</div>');
}

function score(it, q) {
  const n = nameOf(it).toLowerCase();
  let s = 0;
  if (n === q) s = 100;
  else if (n.startsWith(q)) s = 60;
  else if (n.split(/[\s:\-.]+/).some((w) => w.startsWith(q))) s = 40;
  else if (n.includes(q)) s = 25;
  else if (it.url && domain(it.url).includes(q)) s = 20;
  else {
    // Loose match: letters in order, e.g. "hsr" -> "Honkai: Star Rail"
    const initials = n.split(/[\s:\-.]+/).map((w) => w[0]).join('');
    if (initials.startsWith(q)) s = 30;
    else {
      let i = 0;
      for (const ch of n) if (ch === q[i]) i++;
      if (i === q.length) s = 5;
    }
  }
  if (!s) return 0;
  if (it.type === 'game') s += 3;
  if (isFav(it.id)) s += 4;
  if (prefs.recents[it.id]) s += 2;
  return s;
}

function renderSearch() {
  const q = query.toLowerCase().trim();
  const scored = visible().map((it) => [it, score(it, q)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([it]) => it);
  const g = scored.filter((i) => i.type === 'game');
  const a = prefs.settings.searchApps === false ? [] : scored.filter((i) => i.type === 'app');
  const w = prefs.settings.searchWeb === false ? [] : scored.filter((i) => i.type === 'web');
  results = [...g, ...a, ...w];
  selected = Math.min(selected, Math.max(results.length - 1, 0));
  if (!results.length) {
    content.innerHTML = `<div class="empty"><strong>No results for “${esc(query)}”</strong>Try another name, or add it with the Add button.</div>`;
    return;
  }
  content.innerHTML =
    (g.length ? section('Games', games(g)) : '') +
    (a.length ? section('Apps', tiles(a)) : '') +
    (w.length ? section('Websites', tiles(w)) : '');
  highlight();
}

function highlight() {
  $$('.selected', content).forEach((el) => el.classList.remove('selected'));
  const it = results[selected];
  if (!it) return;
  const el = content.querySelector(`[data-id="${CSS.escape(it.id)}"]`);
  if (el) { el.classList.add('selected'); el.scrollIntoView({ block: 'nearest' }); }
}

const VIEWS = { home: renderHome, games: renderGames, apps: renderApps, web: renderWeb, favorites: renderFavorites, stats: renderStats, barca: renderBarca, news: renderNews, gacha: renderGacha, overwatch: renderOverwatch, settings: renderSettings };

function render() {
  $$('.sidebar button[data-view]').forEach((b) => b.classList.toggle('active', !query && b.dataset.view === view));
  ['game', 'app', 'web'].forEach((t) => { $(`[data-count="${t}"]`).textContent = ofType(t).length || ''; });
  const scroll = content.scrollTop;
  if (query.trim()) renderSearch();
  else (VIEWS[view] || renderHome)();
  content.scrollTop = scroll;
  hydrateIcons();
  syncDetailCover();
  updatePageBg();
}

// Sidebar entries that depend on settings / what's installed
function updateNav() {
  const mode = prefs.settings.showGachaNav;
  const show = mode === 'always' || (mode !== 'never' && gachaGames().length > 0);
  $('[data-view="gacha"]').hidden = !show;
  const owShow = items.some((i) => i.type === 'game' && /overwatch/i.test(i.name));
  $('[data-view="overwatch"]').hidden = !owShow;
  if (!owShow && view === 'overwatch') view = 'home';
  $('#desktopBtn').hidden = !prefs.shell; // only when Nexus is standing in for the Windows desktop
  // Sidebar entries you switched off (Settings → Sidebar)
  for (const [v, key] of [['apps', 'navApps'], ['web', 'navWeb'], ['favorites', 'navFavorites'], ['stats', 'navStats'], ['barca', 'navBarca'], ['news', 'navNews']]) {
    const off = prefs.settings[key] === false;
    $(`.sidebar [data-view="${v}"]`).hidden = off;
    if (off && view === v) view = 'home';
  }
  if (!show && view === 'gacha') view = 'home';
  $('#hotkeyHint').textContent = prettyAccel(prefs.settings.hotkey || '');
  updateNowStatus();
}

// Sidebar line that says whether the tracker currently sees a game running
function updateNowStatus() {
  const el = $('#nowStatus');
  if (!el) return;
  const playing = items.filter((i) => isRunning(i.id));
  el.classList.toggle('on', playing.length > 0);
  el.innerHTML = playing.length
    ? `<span class="live-dot"></span><div><b>Playing: ${esc(playing.map((g) => g.name).join(', '))}</b><small data-since="${runningMap()[playing[0].id]}"></small></div>`
    : `<span class="idle-dot"></span><div><b>Not playing anything</b></div>`;
}

// Blurred art behind the page (when the background style asks for it)
function updatePageBg() {
  const bg = $('#pageBg');
  if (!bg) return;
  const hero = recent().find((i) => i.type === 'game' && i.cover) || ofType('game').find((g) => g.cover);
  bg.style.backgroundImage = prefs.settings.bgStyle === 'art' && hero ? cssUrl(hero.cover) : 'none';
}

// Cover art can arrive (from the web) while a game's page is already open
function syncDetailCover() {
  if (detail.hidden || !detailId) return;
  const it = items.find((i) => i.id === detailId);
  const holder = $('.detail-cover', detail);
  if (!it || !it.cover || !holder || holder.querySelector('img.art')) return;
  holder.innerHTML = `<img class="art" src="${esc(it.cover)}" data-fallback="${esc(it.coverFallback || '')}" alt=""><template>${placeholder(it)}</template>`;
  $('.detail-hero .bg', detail).style.backgroundImage = cssUrl(it.cover);
}

// Fade the page's blocks in one after another (only when you switch pages, not on every refresh)
let enterTimer;
function playEnter() {
  if (document.body.classList.contains('no-anim')) return;
  const sel = '.hero,.greeting,.gotd,.nowplaying,.section-head,.game,.tile,.stat-card,.panel,.g-card,.g-chip,.set-section,.facts-strip,.page-title,.page-sub,.chips';
  $$(sel, content).forEach((el, i) => el.style.setProperty('--i', Math.min(i, 20)));
  content.classList.remove('anim-in');
  void content.offsetWidth;
  content.classList.add('anim-in');
  clearTimeout(enterTimer);
  enterTimer = setTimeout(() => content.classList.remove('anim-in'), 1200);
}

function setView(v) {
  view = v;
  query = '';
  search.value = '';
  closeDetail();
  render();
  content.scrollTop = 0;
  playEnter();
}

async function hydrateIcons() {
  for (const el of $$('[data-icon-path]')) {
    const p = el.dataset.iconPath;
    el.removeAttribute('data-icon-path');
    let url = iconCache.get(p);
    if (url === undefined) { url = await window.api.getIcon(p); iconCache.set(p, url); }
    if (url && el.isConnected) {
      const img = new Image();
      img.alt = '';
      img.src = url;
      el.replaceWith(img);
    }
  }
}

// Broken images: try the fallback URL, then show the placeholder
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName !== 'IMG') return;
  if (img.id === 'lbImg') { if (img.dataset.thumb && img.src !== img.dataset.thumb) img.src = img.dataset.thumb; return; }
  if ('hide' in img.dataset) { img.closest('.shot')?.remove(); return; }
  if ('hideSelf' in img.dataset) { img.remove(); return; }
  if (img.dataset.fallback) { img.src = img.dataset.fallback; img.dataset.fallback = ''; return; }
  const tpl = img.nextElementSibling;
  if (img.classList.contains('art') && tpl && tpl.tagName === 'TEMPLATE') { img.replaceWith(tpl.content.cloneNode(true)); tpl.remove(); hydrateIcons(); return; }
  if (img.closest('.slot-card') && tpl && tpl.tagName === 'TEMPLATE') { img.replaceWith(tpl.content.cloneNode(true)); tpl.remove(); return; }
  if (img.closest('.big-card') && tpl && tpl.tagName === 'TEMPLATE') { img.replaceWith(tpl.content.cloneNode(true)); tpl.remove(); return; }
  if ('fallbackLetter' in img.dataset) {
    const span = document.createElement('span');
    span.className = 'letter';
    span.textContent = img.dataset.fallbackLetter.toUpperCase();
    img.replaceWith(span);
  }
}, true);

// ---------- Actions ----------
let toastTimer;
function toast(msg, error = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('error', error);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), error ? 4500 : 2200);
}

// Launch cover over a dimmed, blurred app: the game's art, a progress bar, and things to read. For games it stays up
// until the main process reports that the game is really on screen ('launch:phase' tells us how far along it is,
// 'launch:done' that the window is about to fade), and only then is the window faded out.
let leaveTimer, tipTimer, statusTimer;
let launchInfo = { phase: 'starting', at: 0 }; // latest word from the main process about the game that is starting
window.api.on('launch:phase', (p) => { launchInfo = { phase: p.phase, at: p.phase === 'starting' ? Date.now() : launchInfo.at }; paintLeave(); });

// While the game or its launcher is installing an update: { title, pct (0..1 or null), line } from the main process, or null
let updateInfo = null;
window.api.on('launch:update', (u) => { updateInfo = u || null; paintLeave(); });

const LEAVE_BASE = { starting: 0.1, launcher: 0.25, pressed: 0.4, updating: 0.4, window: 0.5, settling: 0.75, listening: 0.9, handoff: 1, ready: 1 }; // bar position for each stage

function paintLeave() {
  const el = $('#leave');
  if (!el || !document.body.classList.contains('leaving') || !$('.leave-bar', el)) return;
  const { phase, at } = launchInfo;
  const elapsed = Date.now() - (at || Date.now());
  const status = $('.leave-status', el), hint = $('.leave-hint', el), bar = $('.leave-bar i', el);
  status.textContent = {
    starting: elapsed < 20000 ? 'Starting up…' : 'Waiting for the game to open… it may be updating, you can hide Nexus now',
    launcher: 'The launcher is open. Nexus will start the game for you…',
    pressed: 'Start pressed. Waiting for the game…',
    handoff: 'The launcher needs you (an update or a login). Nexus is stepping aside.',
    window: 'A window opened (a launcher or anti-cheat?). Waiting for the game itself…',
    settling: 'Almost there…',
    listening: 'The game is open. Waiting to hear it, so Nexus knows it has loaded…',
    ready: 'Here we go!',
  }[phase] || 'Starting up…';
  hint.textContent = phase === 'listening' ? "Nexus fades as soon as the game plays sound (or after a minute if it stays silent)" : 'Esc hides Nexus right away';
  bar.classList.remove('indet');
  bar.style.width = `${Math.round((LEAVE_BASE[phase] || 0.1) * 100)}%`;
  if (updateInfo && phase !== 'ready' && phase !== 'handoff') {
    // an update is downloading: say so, with how much and how fast, and let the bar show the real progress
    status.textContent = updateInfo.title;
    hint.textContent = updateInfo.line;
    if (updateInfo.pct == null) bar.classList.add('indet'); else bar.style.width = `${Math.max(1, Math.round(updateInfo.pct * 100))}%`;
  }
  el.dataset.phase = updateInfo ? 'updating' : phase;
}

function leaveFx(it) {
  let el = $('#leave');
  if (!el) { el = document.createElement('div'); el.id = 'leave'; el.className = 'leave'; document.body.appendChild(el); }
  const isGame = it.type === 'game';
  el.innerHTML = `<div class="leave-bg"></div><div class="leave-box">
    <div class="leave-card">${it.cover ? `<img src="${esc(it.cover)}" alt="">` : ''}<div class="leave-text">Launching<b>${esc(nameOf(it))}</b><span class="leave-status"></span><span class="leave-hint"></span></div></div>
    ${isGame && prefs.settings.coverTips !== false ? `<div class="leave-tip"><span class="tip-tag"></span><p class="tip-text"></p></div>` : ''}
    ${isGame ? `
      <div class="leave-bar"><i></i></div>
      <button class="leave-skip" type="button">Hide Nexus now</button>` : ''}
  </div>`;
  if (it.cover && prefs.settings.coverArt !== false) $('.leave-bg', el).style.backgroundImage = cssUrl(it.cover);
  clearTimeout(leaveTimer); clearInterval(tipTimer); clearInterval(statusTimer);
  updateInfo = null;
  document.body.classList.add('leaving');
  if (!isGame) { leaveTimer = setTimeout(leaveReset, 4500); return; } // the window is already on its way out

  if (!launchInfo.at || Date.now() - launchInfo.at > 5000) launchInfo = { phase: 'starting', at: Date.now() };
  paintLeave();
  statusTimer = setInterval(paintLeave, 400);

  const tips = tipsFor(it.name);
  let n = 0;
  const box = $('.leave-tip', el);
  const showTip = () => {
    if (!box) return; // tips are turned off
    const t = tips[n++ % tips.length];
    markTipSeen(t);
    box.classList.remove('in');
    setTimeout(() => { $('.tip-tag', box).textContent = t.tag; $('.tip-text', box).textContent = t.text; box.classList.add('in'); }, box.dataset.ready ? 350 : 0);
    box.dataset.ready = '1';
  };
  showTip();
  tipTimer = setInterval(showTip, 7000);
  $('.leave-skip', el).addEventListener('click', () => window.api.skipLaunchWait());
}
function leaveReset() {
  clearTimeout(leaveTimer); clearInterval(tipTimer); clearInterval(statusTimer);
  document.body.classList.remove('leaving');
}
// Main says the game is up (or we gave up waiting): the window is about to fade, so tidy up once it has
window.api.on('launch:done', (p) => {
  clearInterval(tipTimer); clearInterval(statusTimer);
  const status = $('.leave-status');
  if (status) status.textContent = 'Here we go!';
  const bar = $('.leave-bar i');
  if (bar) bar.style.width = '100%';
  clearTimeout(leaveTimer);
  leaveTimer = setTimeout(leaveReset, p && p.behind ? 1200 : 4500); // staying behind the game: show the normal screen again after a moment
});
// While the cover is up, keys do nothing in Nexus (Esc still skips the cover). The welcome guide and What's new card
// keep keys to themselves too, so typing or Enter can't reach the page (or launch a game in big screen) behind them.
// Capture phase on window, so this runs before every other key handler.
window.addEventListener('keydown', (e) => {
  if (document.body.classList.contains('leaving')) {
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.key === 'Escape') window.api.skipLaunchWait();
    return;
  }
  const onboard = $('#onboard');
  if (onboard && !onboard.hidden && !onboard.contains(e.target)) {
    e.stopImmediatePropagation();
    if (e.key !== 'Tab') e.preventDefault();
    const first = onboard.querySelector('button, input, select, [tabindex]');
    if (first) first.focus(); // and move into the card, so the next key works there
  }
}, true);

async function launch(id) {
  const it = items.find((i) => i.id === id);
  if (!it) return;
  toast(`${it.type === 'web' ? 'Opening' : 'Launching'} ${nameOf(it)}…`);
  try {
    prefs = await window.api.launch(id);
    sfx.play('launch');
    if (prefs.settings.launchConfetti) fx.burst();
    if ((it.type === 'game' || prefs.settings.hideOnLaunch) && !document.body.classList.contains('no-anim')) leaveFx(it); // games always get the cover
    if (!query && !big.on) render();
  } catch (err) {
    toast(`Couldn't open ${nameOf(it)}: ${String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`, true);
  }
}

const apply = (lib) => { if (lib) { items = lib.items; prefs = lib.prefs; } updateNav(); render(); };

async function refresh(rescan = false) {
  if (rescan) lastScan = Date.now();
  apply(await window.api.getLibrary(rescan));
}

// ---------- Game detail ----------
const detail = $('#detail');
const lightbox = $('#lightbox');
let detailId = null;
let shots = [];
let shotIndex = 0;

function playLine(it) {
  const sec = totalSeconds(it.id);
  const parts = [];
  if (isRunning(it.id)) parts.push(`<span class="live-dot"></span> Playing now · <span data-since="${runningMap()[it.id]}"></span>`);
  else if (prefs.recents[it.id]) parts.push(`Last played ${timeAgo(prefs.recents[it.id])}`);
  else if (!(it.type === 'game' && lifeOf(it.id))) parts.push('Not played yet'); // (hours from before Nexus mean it has been played)
  if (sec >= 60) parts.push(it.type === 'game' ? playedText(it.id) : `${fmtHours(sec)} tracked`);
  const pt = (prefs.playtime || {})[it.id];
  if (pt && pt.count) parts.push(`${pt.count} session${pt.count === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

function openDetail(id) {
  const it = items.find((i) => i.id === id);
  if (!it) return;
  detailId = id;
  closeMenu();
  sfx.play('open');
  const bg = it.cover ? `style="background-image:${esc(cssUrl(it.cover))}"` : '';
  const cover = it.cover
    ? `<img class="art" src="${esc(it.cover)}" data-fallback="${esc(it.coverFallback || '')}" alt=""><template>${placeholder(it)}</template>`
    : placeholder(it);
  detail.innerHTML = `
    <button class="detail-close" title="Close (Esc)">✕</button>
    <div class="detail-hero" style="--src: var(--${it.source})">
      <div class="bg" ${bg}></div>
      <div class="detail-cover">${cover}</div>
      <div class="detail-main">
        <span class="pill">${SOURCES[it.source] || ''}</span>
        <h1>${esc(nameOf(it))}</h1>
        <div class="detail-sub">${playLine(it)}</div>
        <div class="detail-stats">${gameStatsHtml(it)}</div>
        ${it.type === 'game' ? `<div class="detail-hours" id="detailHours">${hoursLineHtml(it)}</div>` : ''}
        ${it.type === 'game' ? `<div class="detail-tags">${tagEditorHtml(it)}</div>` : ''}
        ${it.type === 'game' && it.launch && it.launch.kind === 'exe' && window.api.platform !== 'linux' ? `<label class="detail-noadmin"><input type="checkbox" data-noadmin ${prefs.noAdmin && prefs.noAdmin[it.id] ? 'checked' : ''}> Skip the Windows admin prompt <small>Starts the game without admin rights. Some games or anti-cheats need them, so if it won't start, turn this off.</small></label>` : ''}
        <div class="detail-actions">
          <button class="play-btn" data-act="play">${PLAY} ${isRunning(it.id) ? 'Open' : 'Play'}</button>
          ${it.alt ? `<button class="btn" data-act="alt">${esc(it.alt.label)}</button>` : ''}
          <button class="btn" data-act="fav">${isFav(it.id) ? '★ Favourited' : '☆ Favourite'}</button>
          ${it.location ? '<button class="btn" data-act="folder">Open folder</button>' : ''}
        </div>
      </div>
    </div>
    <div class="detail-body" id="detailBody">
      <div id="detailNews"></div>
      <div id="detailAch">${achCache[id] ? achievementsHtml(achCache[id]) : ''}</div>
      <div class="detail-about"><h3>About</h3><div class="skeleton" style="width:90%"></div><div class="skeleton" style="width:82%"></div><div class="skeleton" style="width:60%"></div></div>
      <div class="facts"></div>
    </div>`;
  unfade(detail);
  detail.scrollTop = 0;
  hydrateIcons();

  if (it.type === 'game') showDetailNews(id);
  loadAchievements(it);
  window.api.getInfo(id).then((info) => { if (detailId === id) fillDetail(it, info); })
    .catch(() => { if (detailId === id) fillDetail(it, null); });
}

function fillDetail(it, info) {
  const body = $('#detailBody');
  if (!body) return;
  info = info || { description: '', screenshots: [] };
  shots = info.screenshots || [];
  const fact = (label, value) => (value ? `<div class="fact"><small>${label}</small>${value}</div>` : '');
  const list = (a) => (a && a.length ? esc(a.join(', ')) : '');
  body.innerHTML = `
    <div id="detailNews">${it.type === 'game' ? gameNewsHtml(it.id) : ''}</div>
    <div id="detailAch">${achCache[it.id] ? achievementsHtml(achCache[it.id]) : ''}</div>
    <div class="detail-about">
      <h3>About</h3>
      <p>${info.description ? esc(info.description) : 'No description found online for this game. Check your internet connection, or it may be too obscure to find.'}</p>
    </div>
    <div class="facts">
      ${fact('Genres', list(info.genres))}
      ${fact('Developer', list(info.developers))}
      ${fact('Publisher', list(info.publishers))}
      ${fact('Released', esc(info.release || ''))}
      ${fact('Installed at', it.location ? esc(it.location) : '')}
      ${info.storeUrl ? fact('More info', `<a data-ext="${esc(info.storeUrl)}">${esc(info.source || 'Web')} page ↗</a>`) : ''}
    </div>
    ${shots.length ? `
      <div class="shots">
        <h3>Screenshots</h3>
        <div class="shot-grid">${shots.map((s, i) => `<div class="shot" data-shot="${i}"><img src="${esc(s.thumb || s.full)}" data-hide alt="" loading="lazy"></div>`).join('')}</div>
        ${info.screenshotsFromWeb ? '<div class="shots-note">Some images were found through web search, so they may not all match the game.</div>' : ''}
      </div>` : ''}`;
}

function closeDetail() {
  if (!detail.hidden && !detail.classList.contains('out')) { sfx.play('back'); fadeHide(detail, 220); }
  detailId = null;
  closeLightbox();
}

function showShot(i) {
  if (!shots.length) return;
  shotIndex = (i + shots.length) % shots.length;
  const s = shots[shotIndex];
  const img = $('#lbImg');
  img.dataset.thumb = s.thumb || '';
  img.src = s.full || s.thumb;
  $('#lbCount').textContent = `${shotIndex + 1} / ${shots.length}`;
  unfade(lightbox);
}
function closeLightbox() { fadeHide(lightbox, 160); }

detail.addEventListener('click', async (e) => {
  const t = e.target;
  if (t.closest('.detail-close')) return closeDetail();
  const shot = t.closest('[data-shot]');
  if (shot) return showShot(Number(shot.dataset.shot));
  const ext = t.closest('[data-ext]');
  if (ext) return window.api.openExternal(ext.dataset.ext);
  const act = t.closest('[data-act]');
  if (!act) return;
  const it = items.find((i) => i.id === detailId);
  if (!it) return;
  if (act.dataset.act === 'play') launch(it.id);
  if (act.dataset.act === 'alt') window.api.action(it.id, 'alt');
  if (act.dataset.act === 'folder') window.api.action(it.id, 'reveal');
  if (act.dataset.act === 'fav') {
    apply(await window.api.setPref('favorite', it.id, !isFav(it.id)));
    act.textContent = isFav(it.id) ? '★ Favourited' : '☆ Favourite';
  }
});
lightbox.addEventListener('click', (e) => {
  const nav = e.target.closest('.lb-nav');
  if (nav) { e.stopPropagation(); return showShot(shotIndex + Number(nav.dataset.dir)); }
  closeLightbox();
});

// ---------- Context menu ----------
const menu = $('#menu');
function openMenu(x, y, it) {
  const entries = [
    [it.type === 'game' ? 'Play' : 'Open', () => launch(it.id)],
    it.type === 'game' && ['View details & screenshots', () => openDetail(it.id)],
    it.alt && [it.alt.label, () => window.api.action(it.id, 'alt')],
    '-',
    [isFav(it.id) ? 'Remove from favourites' : 'Add to favourites', async () => apply(await window.api.setPref('favorite', it.id, !isFav(it.id)))],
    ['Rename…', () => openRename(it)],
    prefs.names && prefs.names[it.id] && ['Use the original name', async () => apply(await window.api.setPref('name', it.id, ''))],
    it.type === 'game' && ['Change cover image…', async () => apply(await window.api.setPref('cover', it.id))],
    it.type === 'game' && prefs.customCovers.includes(it.id) && ['Reset cover image', async () => apply(await window.api.setPref('resetCover', it.id))],
    it.location && ['Open file location', () => window.api.action(it.id, 'reveal')],
    '-',
    ['Hide', async () => { apply(await window.api.setPref('hidden', it.id, true)); toast(`${it.name} hidden. Restore it in Settings → Data.`); }],
    it.custom && ['Remove', async () => apply(await window.api.setPref('remove', it.id)), 'danger'],
  ].filter(Boolean);
  menu.innerHTML = entries.map((e, i) => (e === '-' ? '<hr>' : `<button data-i="${i}" class="${e[2] || ''}">${esc(e[0])}</button>`)).join('');
  menu.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    closeMenu();
    entries[b.dataset.i][1]();
  };
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, innerWidth - r.width - 8)}px`;
  menu.style.top = `${Math.min(y, innerHeight - r.height - 8)}px`;
}
const closeMenu = () => { menu.hidden = true; };

// ---------- Rename dialog ----------
function openRename(it) {
  modalBody.innerHTML = `
    <h3>Rename</h3>
    <form id="renameForm">
      <div class="field"><label>Name shown in Nexus</label><input name="name" value="${esc(nameOf(it))}" placeholder="${esc(it.name)}" maxlength="80"></div>
      <p class="muted-line">The real name (${esc(it.name)}) is still used to find covers, news and tips. Leave it empty to go back to it.</p>
      <div class="actions"><button type="button" class="btn" id="cancel">Cancel</button><button class="btn primary">Save</button></div>
    </form>`;
  const form = $('#renameForm');
  $('#cancel').onclick = closeModal;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    apply(await window.api.setPref('name', it.id, name === it.name ? '' : name));
    closeModal();
  };
  unfade(modal);
  form.name.focus();
  form.name.select();
}

// ---------- Add dialog ----------
const modal = $('#modal');
const modalBody = $('#modalBody');
const closeModal = () => fadeHide(modal, 180);
modal.addEventListener('mousedown', (e) => { if (e.target === modal) closeModal(); });

function openAdd(kind = 'web') {
  modalBody.innerHTML = `
    <h3>Add to Nexus</h3>
    <div class="seg"><button data-kind="web">Website</button><button data-kind="program">Program or game</button></div>
    <form id="addForm">
      <div class="field" data-for="web"><label>Website address</label><input name="url" placeholder="e.g. youtube.com"></div>
      <div class="field" data-for="program"><label>File</label><div class="input-row"><input name="path" placeholder="Choose an .exe or shortcut" readonly><button type="button" class="btn" id="browse">Browse…</button></div></div>
      <div class="field"><label>Name</label><input name="name" placeholder="Display name"></div>
      <div class="field" data-for="program"><label>Show under</label><select name="category"><option value="game">Games</option><option value="app">Apps</option></select></div>
      <div class="actions"><button type="button" class="btn" id="cancel">Cancel</button><button class="btn primary">Add</button></div>
    </form>`;
  const form = $('#addForm');
  const setKind = (k) => {
    kind = k;
    $$('.seg button', modalBody).forEach((b) => b.classList.toggle('active', b.dataset.kind === k));
    $$('[data-for]', modalBody).forEach((f) => { f.hidden = f.dataset.for !== k; });
    (k === 'web' ? form.url : form.name).focus();
  };
  $$('.seg button', modalBody).forEach((b) => b.addEventListener('click', () => setKind(b.dataset.kind)));
  $('#cancel').onclick = closeModal;
  $('#browse').onclick = async () => {
    const f = await window.api.pickFile();
    if (!f) return;
    form.path.value = f.path;
    if (!form.name.value) form.name.value = f.name;
  };
  form.url.addEventListener('input', () => {
    if (!form.name.dataset.touched) {
      const d = domain(/^https?:/.test(form.url.value) ? form.url.value : `https://${form.url.value}`).split('.')[0];
      form.name.value = d ? d[0].toUpperCase() + d.slice(1) : '';
    }
  });
  form.name.addEventListener('input', () => { form.name.dataset.touched = '1'; });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = { kind, name: form.name.value, url: form.url.value, path: form.path.value, category: form.category.value };
    if (kind === 'web' && !data.url.trim()) return form.url.focus();
    if (kind === 'program' && !data.path) return $('#browse').click();
    if (!data.name.trim()) return form.name.focus();
    apply(await window.api.addCustom(data));
    closeModal();
    toast(`Added ${data.name}`);
  };
  unfade(modal);
  setKind(kind);
}

// ---------- Events ----------
$('.sidebar').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.view) return setView(b.dataset.view);
  if (b.id === 'pickBtn') return openPicker();
  if (b.id === 'bigBtn') return enterBig();
  if (b.id === 'desktopBtn') return window.api.windowsDesktop();
  if (b.id === 'addBtn') openAdd(view === 'apps' || view === 'games' ? 'program' : 'web');
});

content.addEventListener('click', (e) => {
  const t = e.target;
  const goto = t.closest('[data-goto]');
  if (goto) return setView(goto.dataset.goto);
  if (t.closest('[data-pick]')) return openPicker();
  const open = t.closest('[data-open]');
  if (open) return openDetail(open.dataset.open);
  const filter = t.closest('[data-filter]');
  if (filter) { sourceFilter = filter.dataset.filter; return render(); }
  const add = t.closest('[data-add]');
  if (add) return openAdd(add.dataset.add);
  const target = t.closest('[data-launch], [data-id]');
  if (!target) return;
  if (target.dataset.launch) return launch(target.dataset.launch);
  // Games open their info page (or launch, per settings); the round play button on a cover always launches
  if (target.classList.contains('game') && !t.closest('.play') && prefs.settings.clickAction !== 'launch') return openDetail(target.dataset.id);
  launch(target.dataset.id);
});

content.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.matches('[data-gsort]')) await saveSetting('gamesSort', t.value);
  else if (t.matches('[data-ggroup]')) await saveSetting('groupByLauncher', t.checked);
  else return;
  render();
});

content.addEventListener('contextmenu', (e) => {
  const el = e.target.closest('[data-id]');
  if (!el) return;
  e.preventDefault();
  const it = items.find((i) => i.id === el.dataset.id);
  if (it) openMenu(e.clientX, e.clientY, it);
});
document.addEventListener('mousedown', (e) => { if (!menu.contains(e.target)) closeMenu(); });
window.addEventListener('blur', closeMenu);
content.addEventListener('scroll', closeMenu);

// Results follow the typing, but not on every single key: a fast typist would redraw the whole page each time
let searchTimer;
search.addEventListener('input', () => {
  query = search.value; selected = 0;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(render, query ? 60 : 0);
});

const TYPING = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

document.addEventListener('keydown', (e) => {
  if (recordingHotkey) return;
  if (!modal.hidden) { if (e.key === 'Escape') closeModal(); return; }
  if (!lightbox.hidden) {
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowRight') showShot(shotIndex + 1);
    if (e.key === 'ArrowLeft') showShot(shotIndex - 1);
    return;
  }
  if (pickerOpen()) {
    if (e.key === 'Escape') closePicker();
    else if (e.key === 'Enter' && picker.winner && !picker.spinning) { closePicker(); launch(picker.winner.id); }
    else if (e.key === ' ' && !picker.spinning) { e.preventDefault(); spin(); }
    return;
  }
  if (big.on) { bigKey(e); return; }
  if (e.key === 'F11') { e.preventDefault(); return enterBig(); }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R')) { e.preventDefault(); return openPicker(); }
  if (!detail.hidden && e.key === 'Escape') return closeDetail();
  if (e.key === 'Escape') {
    if (!menu.hidden) return closeMenu();
    if (query) { search.value = ''; query = ''; return render(); }
    return window.api.hide();
  }
  if (query && results.length) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight' && document.activeElement !== search) { e.preventDefault(); selected = Math.min(selected + 1, results.length - 1); return highlight(); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' && document.activeElement !== search) { e.preventDefault(); selected = Math.max(selected - 1, 0); return highlight(); }
    if (e.key === 'Enter') { e.preventDefault(); return launch(results[selected].id); }
  }
  if (e.key === 'Enter' && document.activeElement?.dataset?.id) {
    const el = document.activeElement;
    return el.classList.contains('game') && prefs.settings.clickAction !== 'launch' ? openDetail(el.dataset.id) : launch(el.dataset.id);
  }
  // Start typing anywhere to search (unless you're typing in some other box)
  if (!TYPING.has(document.activeElement.tagName) && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) search.focus();
});

// ---------- Badge unlock popups ----------
// Works out which badges are unlocked and tells the main process about new ones, which shows the corner popup
// (even while Nexus is hidden behind a game). The very first check only records what is already unlocked.
let badgeBusy = false;
async function checkBadgeUnlocks() {
  if (badgeBusy || !items.length) return;
  badgeBusy = true;
  try {
    await loadAchSummary();
    const data = statsData(true);
    if (!data.totalSec && !data.sessions.length) return;
    const unlocked = evaluateBadges(data).filter((b) => b.got);
    const seen = prefs.badgesSeen;
    const key = (b) => `adv:${b.id}`;
    // The advancements were rebuilt in 1.2 (they now count total hours and Steam achievements): the first check only records what is already unlocked
    if (!seen || !seen.includes('adv:init')) { prefs = await window.api.badgesSeen([...unlocked.map(key), 'adv:init'], [], unlocked.length); return; }
    const fresh = unlocked.filter((b) => !seen.includes(key(b)));
    if (!fresh.length) return;
    prefs = await window.api.badgesSeen([], fresh.map((b) => ({ name: b.name, key: key(b), icon: b.icon, desc: b.desc })), unlocked.length);
  } catch (err) { console.error('badge check failed', err); }
  finally { badgeBusy = false; }
}
// Hours add up while a game runs, so check now and then while something is open
setInterval(() => { if (Object.keys(runningMap()).length) checkBadgeUnlocks(); }, 30000);

let stateTimer;
// A game starting or stopping redraws the page. Not while you are typing in a box on it (a gacha number, a match note):
// that would wipe what you typed, so the redraw waits until you leave the box.
let renderWaiting = false;
function renderUnlessTyping() {
  const el = document.activeElement;
  if (el && content.contains(el) && TYPING.has(el.tagName)) {
    if (!renderWaiting) { renderWaiting = true; el.addEventListener('blur', () => { renderWaiting = false; setTimeout(render, 0); }, { once: true }); }
    return;
  }
  render();
}
window.api.on('library:updated', () => { if (renderWaiting) refreshQuietly(); else refresh(); });
async function refreshQuietly() { const lib = await window.api.getLibrary(false); if (lib) { items = lib.items; prefs = lib.prefs; } }
window.api.on('state:update', (p) => {
  prefs = p;
  updateNowStatus();
  checkBadgeUnlocks();
  clearTimeout(stateTimer);
  stateTimer = setTimeout(() => {
    if (!(view === 'settings' && !query)) renderUnlessTyping();
    if (big.on) bigRender(false);
    if (detailId) { const sub = $('.detail-sub', detail); const ds = $('.detail-stats', detail); const it = items.find((i) => i.id === detailId); if (sub && it) sub.innerHTML = playLine(it); if (ds && it) ds.innerHTML = gameStatsHtml(it); }
  }, 150);
});
window.api.on('navigate', (v) => (v === 'pick' ? openPicker() : setView(v)));
window.api.on('focus-search', () => {
  leaveReset();
  search.focus();
  search.select();
  if (prefs.settings.rescanOnShow && Date.now() - lastScan > 10 * 60000) refresh(true); // it's been a while
});

// ---------- Start ----------
const bootStarted = performance.now();

// Hold the logo splash for a moment (so it reads as a boot screen), then fade it out and bring the page in
function startBoot() {
  const boot = $('#boot');
  if (!boot) return;
  if (!prefs.settings.bootAnimation || document.body.classList.contains('no-anim')) boot.remove();
  else sfx.play('boot');
}

async function finishBoot() {
  const boot = $('#boot');
  if (!boot) return;
  await new Promise((r) => setTimeout(r, Math.max(0, 2500 - (performance.now() - bootStarted))));
  boot.classList.add('done');
  playEnter();
  setTimeout(() => boot.remove(), 700);
}

// Soft tick on sidebar / chip / switch clicks
document.addEventListener('click', (e) => { if (e.target.closest('.sidebar button, .chip, button.switch, .theme-swatch, .accent-dot')) sfx.play('tick'); });
(async function boot() {
  initGachaUi();
  initOverwatchUi();
  initTags();
  initBarca();
  initNews();
  initSettingsUi();
  initPicker();
  initBigScreen();
  search.focus();
  // Settings first (instant) so the theme and the boot chime start right away; the library scan takes longer
  prefs = await window.api.getPrefs();
  applyTheme(prefs.settings);
  startBoot();
  const lib = await window.api.getLibrary(false);
  items = lib.items;
  prefs = lib.prefs;
  applyTheme(prefs.settings);
  view = VIEWS[prefs.settings.defaultView] ? prefs.settings.defaultView : 'home';
  updateNav();
  render();
  await finishBoot();
  startOnboarding();
  checkBadgeUnlocks();
  loadNews(false); // cached news shows straight away; fresh news follows
  if (prefs.settings.startBigScreen) enterBig();
  setInterval(() => { tickLive(); if (big.on) bigTick(); }, 1000);
})();
