// Game news & updates: a News page across your games, plus a "News & updates" section on each game's page.
// Sources: Steam's public news API (Steam games and Wuthering Waves) and HoYoverse's launcher feed (HSR, Genshin, ZZZ).
let newsData = null;       // { byGame: { id: { items, banners, version } }, fresh: { id: n }, freshTotal }
let newsLoading = false;
let newsFilter = 'all';    // all | updates | <game id>
let newsSnapshot = {};     // which items were new when you opened the page, so their "NEW" tags stay for this visit

async function loadNews(force) {
  if (newsLoading) return;
  newsLoading = true;
  if (force && view === 'news') { const b = $('[data-nsync]'); if (b) b.classList.add('spin'); }
  try { setNews(await window.api.getNews(!!force)); } catch { /* offline: keep what we have */ }
  newsLoading = false;
  if (view === 'news' && !query) render();
}

function setNews(d) {
  if (!d) return;
  newsData = d;
  const dot = $('#newsDot');
  if (dot) { dot.hidden = !d.freshTotal; dot.textContent = d.freshTotal > 9 ? '9+' : d.freshTotal || ''; }
}

window.api.on('news:updated', (d) => {
  setNews(d);
  if (view === 'news' && !query) render();
  refreshDetailNews();
});
setInterval(() => { if (view === 'news' && !document.hidden) loadNews(true); }, 15 * 60000);

const newsGameItems = () => items.filter((i) => i.type === 'game' && newsData && newsData.byGame[i.id] && newsData.byGame[i.id].items.length);

function newsItemHtml(n, opts = {}) {
  const isNew = !!(newsSnapshot[opts.gameId] || {})[n.id] || (opts.live && n.isNew);
  return `<a class="nw-item" data-ext="${esc(n.url)}" title="${esc(n.title)}">
    <span class="nw-badge${n.isUpdate ? ' upd' : ''}">${esc(n.isUpdate ? 'Update' : n.label || 'News')}</span>
    <span class="nw-title">${esc(n.title)}${isNew ? '<em class="nw-new">NEW</em>' : ''}</span>
    ${n.date ? `<small>${timeAgo(n.date)}</small>` : ''}</a>`;
}

function renderNews() {
  if (!newsData) {
    if (!newsLoading) loadNews(false);
    content.innerHTML = `<h1 class="page-title">News</h1><p class="page-sub">Patch notes and announcements for your games</p>
      <div class="b-skel"><div class="b-skel-row"></div><div class="b-skel-row"></div><div class="b-skel-row"></div></div>`;
    return;
  }
  const games = newsGameItems();
  if (!games.length) {
    content.innerHTML = `<h1 class="page-title">News</h1>
      <div class="empty"><strong>No news yet</strong>Nexus finds news for Steam games, Wuthering Waves, Honkai: Star Rail, Genshin Impact and Zenless Zone Zero.<br>
        <button class="btn" data-nsync style="margin-top:14px">Check now</button></div>`;
    return;
  }
  // remember what was new on arrival, then mark it seen shortly after (so the sidebar dot clears)
  for (const g of games) {
    if (!newsSnapshot[g.id]) newsSnapshot[g.id] = Object.fromEntries(newsData.byGame[g.id].items.filter((n) => n.isNew).map((n) => [n.id, true]));
  }
  clearTimeout(renderNews.timer);
  renderNews.timer = setTimeout(() => {
    if (view !== 'news') return;
    for (const g of games) if (newsData.fresh && newsData.fresh[g.id]) window.api.newsSeen(g.id).then(setNews);
  }, 2500);

  const chips = [['all', 'All'], ['updates', 'Updates only']]
    .map(([k, n]) => `<button class="chip${newsFilter === k ? ' active' : ''}" data-nfilter="${k}">${n}</button>`)
    .concat(games.map((g) => `<button class="chip${newsFilter === g.id ? ' active' : ''}" data-nfilter="${esc(g.id)}">${esc(nameOf(g))}${newsData.fresh && newsData.fresh[g.id] ? `<em class="nw-new">${newsData.fresh[g.id]}</em>` : ''}</button>`)).join('');

  // HoYoverse launcher banners ("what's on right now") for the games that have them
  const banners = games.flatMap((g) => (newsData.byGame[g.id].banners || []).slice(0, 3).map((b) => ({ ...b, game: g.name })));
  const bannerStrip = banners.length && (newsFilter === 'all' || newsFilter === 'updates') ? `<div class="nw-banners">${banners.map((b, i) => `<a class="nw-banner b-card" style="--i:${i}" data-ext="${esc(b.url || '')}" title="${esc(b.game)}"><img src="${esc(b.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-hide-self><span>${esc(b.game)}</span></a>`).join('')}</div>` : '';

  // launcher feeds (no dates) first, then the games with the freshest news
  const latest = (g) => { const it = newsData.byGame[g.id].items; return it[0] && it[0].date ? it[0].date : Number.MAX_SAFE_INTEGER; };
  const shown = (newsFilter === 'all' || newsFilter === 'updates' ? games : games.filter((g) => g.id === newsFilter)).slice().sort((a, b) => latest(b) - latest(a));
  const cards = shown.map((g, i) => {
    const d = newsData.byGame[g.id];
    let list = d.items;
    if (newsFilter === 'updates') list = list.filter((n) => n.isUpdate);
    if (!list.length) return '';
    return `<div class="nw-card b-card" style="--i:${i}">
      <div class="nw-head"><div class="nw-art">${g.cover ? `<img src="${esc(g.cover)}" alt="" loading="lazy" data-hide-self>` : ''}</div>
        <div><b data-open="${esc(g.id)}" class="nw-name">${esc(nameOf(g))}</b>${d.version ? `<span class="nw-ver">v${esc(d.version)}</span>` : ''}
          <small>${d.items[0] && d.items[0].date ? `Latest ${timeAgo(d.items[0].date)}` : 'From the game launcher'}</small></div></div>
      <div class="nw-list">${list.slice(0, 6).map((n) => newsItemHtml(n, { gameId: g.id })).join('')}</div></div>`;
  }).join('');

  content.innerHTML = `
    <div class="b-head"><div><h1 class="page-title">News</h1><p class="page-sub">Patch notes and announcements for your games${newsData.updated ? ` · updated ${timeAgo(newsData.updated)}` : ''}</p></div>
      <button class="btn" data-nsync title="Check for news now">↻ Refresh</button></div>
    <div class="chips">${chips}</div>
    ${bannerStrip}
    <div class="nw-grid">${cards || '<div class="b-empty">Nothing to show for this filter</div>'}</div>`;
}

// ----- On a game's page -----
function gameNewsHtml(id) {
  const d = newsData && newsData.byGame[id];
  if (!d || !d.items.length) return '';
  return `<div class="detail-news"><div class="dn-head"><h3>News &amp; updates</h3>${d.version ? `<span class="nw-ver">Version ${esc(d.version)}</span>` : ''}
    ${newsData.fresh && newsData.fresh[id] ? `<em class="nw-new">${newsData.fresh[id]} new</em>` : ''}</div>
    <div class="nw-list">${d.items.slice(0, 5).map((n) => newsItemHtml(n, { gameId: id, live: true })).join('')}</div></div>`;
}

function refreshDetailNews() {
  if (!detailId) return;
  const box = $('#detailNews');
  if (box) box.innerHTML = gameNewsHtml(detailId);
}

// Called when a game's page opens: show what we have, load it if we haven't, and mark it seen
async function showDetailNews(id) {
  if (!newsData && !newsLoading) await loadNews(false);
  if (detailId !== id) return;
  refreshDetailNews();
  const d = newsData && newsData.byGame[id];
  if (d && newsData.fresh && newsData.fresh[id]) setTimeout(() => { if (detailId === id) window.api.newsSeen(id).then(setNews); }, 4000);
}

function initNews() {
  const go = (e) => {
    const ext = e.target.closest('[data-ext]');
    if (ext) { e.preventDefault(); window.api.openExternal(ext.dataset.ext); return true; }
    return false;
  };
  // (links on a game's page are opened by app.js's own click handler for #detail)
  content.addEventListener('click', (e) => {
    if (view !== 'news') return;
    if (go(e)) return;
    const f = e.target.closest('[data-nfilter]');
    if (f) { newsFilter = f.dataset.nfilter; render(); return; }
    if (e.target.closest('[data-nsync]')) loadNews(true);
  });
}
