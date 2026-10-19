// The Barça tab: next match with a live countdown, fixtures and results, the table, news and the squad.
// Data comes from the main process (ESPN + RSS feeds, cached on disk so it opens instantly).
let barca = null;          // latest data from the main process
let barcaTab = 'overview'; // overview | fixtures | table | news | squad
let barcaComp = 'all';     // competition filter on the fixtures tab
let barcaTable = 'liga';   // liga | ucl
let barcaLoading = false;
let barcaFailed = false;

const BARCA_ID = '83';
const BTABS = [['overview', 'Overview'], ['fixtures', 'Fixtures & results'], ['table', 'Table'], ['news', 'News'], ['squad', 'Squad']];

async function loadBarca(force) {
  if (barcaLoading) return;
  barcaLoading = true;
  if (force && view === 'barca') { const b = $('[data-bsync]'); if (b) b.classList.add('spin'); }
  try {
    const d = await window.api.getBarca(!!force);
    if (d) { barca = d; barcaFailed = false; } else if (!barca) barcaFailed = true;
  } catch { if (!barca) barcaFailed = true; }
  barcaLoading = false;
  if (view === 'barca' && !query) { render(); }
}

window.api.on('barca:updated', (d) => { barca = d; barcaFailed = false; if (view === 'barca' && !query) render(); });
setInterval(() => { if (view === 'barca' && !document.hidden) loadBarca(false); }, 60000);

const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;
const isBarca = (t) => t && String(t.id) === BARCA_ID;
const fmtKick = (ms) => new Date(ms).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmtDay = (ms) => new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

function barcaResult(m) { // 'W' | 'D' | 'L' from Barça's point of view
  const us = isBarca(m.home) ? m.home : m.away, them = us === m.home ? m.away : m.home;
  const a = Number(us.score), b = Number(them.score);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return '';
  return a > b ? 'W' : a < b ? 'L' : 'D';
}

const crest = (t, cls = '') => `<img class="crest ${cls}" src="${esc(t.logo)}" alt="" referrerpolicy="no-referrer" data-hide-self>`;

function matchRow(m, i = 0) {
  const done = m.state === 'post', live = m.state === 'in';
  const res = done ? barcaResult(m) : '';
  const mid = done || live
    ? `<span class="m-score${live ? ' live' : ''}">${esc(m.home.score)}<i>–</i>${esc(m.away.score)}</span>`
    : `<span class="m-time">${new Date(m.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>`;
  return `<div class="m-row b-card" style="--i:${i}" title="${esc(m.venue)}${m.tv.length ? ' · ' + esc(m.tv.join(', ')) : ''}">
    <div class="m-date"><b>${fmtDay(m.date)}</b><small style="color:${m.compColor}">${esc(m.compShort)}</small></div>
    <div class="m-team home ${isBarca(m.home) ? 'us' : ''}"><span>${esc(m.home.name)}</span>${crest(m.home)}</div>
    ${mid}
    <div class="m-team away ${isBarca(m.away) ? 'us' : ''}">${crest(m.away)}<span>${esc(m.away.name)}</span></div>
    <div class="m-end">${live ? `<span class="live-tag">LIVE ${esc(m.clock || '')}</span>` : res ? `<span class="res ${res}">${res}</span>` : `<small>${esc(m.comp)}</small>`}</div>
  </div>`;
}

// ---------- hero ----------
function heroHtml() {
  const ms = barca.matches;
  const live = ms.find((m) => m.state === 'in');
  const next = live || ms.find((m) => m.state === 'pre' && m.date > Date.now() - 3 * 3600000);
  const done = ms.filter((m) => m.state === 'post');
  const last = done[done.length - 1];
  const form = done.slice(-5).map((m) => `<span class="res ${barcaResult(m)}" title="${esc(m.home.short)} ${esc(m.home.score)}–${esc(m.away.score)} ${esc(m.away.short)}">${barcaResult(m)}</span>`).join('');
  const row = barca.standings.liga.find((r) => r.id === BARCA_ID);

  let main;
  if (next) {
    const kick = next.date;
    main = `<div class="bh-comp"><span class="comp-dot" style="background:${next.compColor}"></span>${esc(next.comp)}${next.round && !/^\d{4}/.test(next.round) && next.round !== next.comp ? ` · ${esc(next.round)}` : ''}</div>
      <div class="bh-teams">
        <div class="bh-team">${crest(next.home, 'xl')}<b>${esc(next.home.name)}</b></div>
        <div class="bh-mid">${live ? `<div class="bh-score">${esc(next.home.score)}<i>–</i>${esc(next.away.score)}</div><div class="live-tag big">LIVE ${esc(next.clock || '')}</div>` : '<div class="bh-vs">VS</div>'}</div>
        <div class="bh-team">${crest(next.away, 'xl')}<b>${esc(next.away.name)}</b></div>
      </div>
      ${live ? '' : `<div class="bh-count" data-kick="${kick}"><div><b data-k="d">0</b><small>days</small></div><div><b data-k="h">0</b><small>hours</small></div><div><b data-k="m">0</b><small>min</small></div><div><b data-k="s">0</b><small>sec</small></div></div>`}
      <div class="bh-meta">${fmtKick(kick)}${next.venue ? ` · ${esc(next.venue)}` : ''}${next.tv.length ? ` · 📺 ${esc(next.tv.slice(0, 3).join(', '))}` : ''}</div>`;
  } else if (last) {
    main = `<div class="bh-comp">Full time · ${esc(last.comp)}</div>
      <div class="bh-teams"><div class="bh-team">${crest(last.home, 'xl')}<b>${esc(last.home.name)}</b></div>
        <div class="bh-mid"><div class="bh-score">${esc(last.home.score)}<i>–</i>${esc(last.away.score)}</div></div>
        <div class="bh-team">${crest(last.away, 'xl')}<b>${esc(last.away.name)}</b></div></div>
      <div class="bh-meta">No upcoming matches listed yet</div>`;
  } else main = '<div class="bh-comp">No matches found</div>';

  return `<div class="b-hero">
    <div class="b-orb o1"></div><div class="b-orb o2"></div>
    <div class="bh-main">${main}</div>
    <div class="bh-side">
      <div class="bh-side-item"><small>Form</small><div class="form">${form || '–'}</div></div>
      ${row ? `<div class="bh-side-item"><small>La Liga</small><b>${ordinal(row.rank)} · ${row.points} pts</b></div>
      <div class="bh-side-item"><small>Record</small><b>${row.won}W ${row.drawn}D ${row.lost}L</b></div>
      <div class="bh-side-item"><small>Goals</small><b>${row.gf}–${row.ga}</b></div>` : ''}
    </div>
  </div>`;
}

// ---------- tabs ----------
function overviewHtml() {
  const ms = barca.matches;
  const upcoming = ms.filter((m) => m.state !== 'post').slice(0, 4);
  const results = ms.filter((m) => m.state === 'post').slice(-4).reverse();
  const liga = barca.standings.liga;
  const idx = liga.findIndex((r) => r.id === BARCA_ID);
  const start = Math.max(0, Math.min(idx - 2, liga.length - 6));
  const mini = liga.slice(Math.max(0, start), Math.max(0, start) + 6);
  return `<div class="b-cols">
    <div class="b-col">
      <h3 class="b-h">Coming up</h3>${upcoming.map((m, i) => matchRow(m, i)).join('') || '<div class="b-empty">Nothing scheduled</div>'}
      <h3 class="b-h">Latest results</h3>${results.map((m, i) => matchRow(m, i + 4)).join('') || '<div class="b-empty">No results yet</div>'}
    </div>
    <div class="b-col side">
      <h3 class="b-h">La Liga</h3>${tableHtml(mini, 'liga', true)}
      <h3 class="b-h">Latest news</h3>${barca.news.slice(0, 4).map((n, i) => newsRow(n, i)).join('') || '<div class="b-empty">No news</div>'}
    </div>
  </div>`;
}

function fixturesHtml() {
  const comps = barca.competitions.filter((c) => barca.matches.some((m) => m.compShort === c.short));
  const chips = [`<button class="chip${barcaComp === 'all' ? ' active' : ''}" data-bcomp="all">All</button>`]
    .concat(comps.map((c) => `<button class="chip${barcaComp === c.short ? ' active' : ''}" data-bcomp="${c.short}"><span class="dot" style="background:${c.color}"></span>${esc(c.label)}</button>`));
  const list = barca.matches.filter((m) => barcaComp === 'all' || m.compShort === barcaComp);
  const up = list.filter((m) => m.state !== 'post');
  const done = list.filter((m) => m.state === 'post').reverse();
  const group = (arr) => {
    let month = '', out = '', n = 0;
    for (const m of arr) {
      const label = new Date(m.date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      if (label !== month) { month = label; out += `<div class="b-month">${label}</div>`; }
      out += matchRow(m, Math.min(n++, 12));
    }
    return out;
  };
  return `<div class="chips">${chips.join('')}</div>
    <h3 class="b-h">Upcoming</h3>${group(up) || '<div class="b-empty">No upcoming matches</div>'}
    <h3 class="b-h">Results</h3>${group(done) || '<div class="b-empty">No results yet</div>'}`;
}

function tableHtml(rows, kind, compact) {
  if (!rows.length) return '<div class="b-empty">Table not available right now</div>';
  const n = (kind === 'liga' ? barca.standings.liga : barca.standings.ucl).length;
  const zone = (r) => {
    if (kind === 'liga') return r.rank <= 4 ? 'ucl' : r.rank <= 6 ? 'uel' : r.rank > n - 3 ? 'rel' : '';
    return r.rank <= 8 ? 'ucl' : r.rank <= 24 ? 'uel' : 'rel';
  };
  return `<div class="b-table${compact ? ' compact' : ''}">
    <div class="t-head"><span>#</span><span>Club</span><span>P</span>${compact ? '' : '<span>W</span><span>D</span><span>L</span><span>GF</span><span>GA</span>'}<span>GD</span><span>Pts</span></div>
    ${rows.map((r, i) => `<div class="t-row b-card ${isBarca(r) ? 'us' : ''} z-${zone(r)}" style="--i:${Math.min(i, 14)}"><span class="t-rank">${r.rank}</span>
      <span class="t-club">${crest(r)}${esc(r.name)}</span><span>${r.played}</span>${compact ? '' : `<span>${r.won}</span><span>${r.drawn}</span><span>${r.lost}</span><span>${r.gf}</span><span>${r.ga}</span>`}
      <span>${r.gd > 0 ? '+' : ''}${r.gd}</span><b>${r.points}</b></div>`).join('')}
  </div>`;
}

function tabTableHtml() {
  const rows = barcaTable === 'liga' ? barca.standings.liga : barca.standings.ucl;
  return `<div class="chips"><button class="chip${barcaTable === 'liga' ? ' active' : ''}" data-btable="liga">La Liga</button>
    <button class="chip${barcaTable === 'ucl' ? ' active' : ''}" data-btable="ucl">Champions League</button></div>
    ${tableHtml(rows, barcaTable, false)}
    <div class="b-legend">${barcaTable === 'liga'
      ? '<span class="z-ucl">Champions League</span><span class="z-uel">Europa / Conference</span><span class="z-rel">Relegation</span>'
      : '<span class="z-ucl">Round of 16</span><span class="z-uel">Play-off</span><span class="z-rel">Out</span>'}</div>`;
}

function newsRow(n, i) {
  return `<a class="n-row b-card" style="--i:${i}" data-ext="${esc(n.url)}" title="${esc(n.title)}">
    <div class="n-img">${n.image ? `<img src="${esc(n.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-hide-self>` : `<span>${esc((n.source || '?')[0])}</span>`}</div>
    <div class="n-body"><b>${esc(n.title)}</b><small>${esc(n.source)} · ${n.date ? timeAgo(n.date) : ''}</small></div></a>`;
}

function newsTabHtml() {
  return `<div class="n-grid">${barca.news.map((n, i) => `<a class="n-card b-card" style="--i:${Math.min(i, 14)}" data-ext="${esc(n.url)}">
    <div class="n-card-img${n.image ? '' : ' none'}">${n.image ? `<img src="${esc(n.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-hide-self>` : ''}<span class="n-src">${esc(n.source)}</span></div>
    <div class="n-card-body"><b>${esc(n.title)}</b>${n.summary ? `<p>${esc(n.summary)}</p>` : ''}<small>${n.date ? timeAgo(n.date) : ''}</small></div></a>`).join('') || '<div class="b-empty">No news right now</div>'}</div>`;
}

function squadHtml() {
  const groupOf = (p) => {
    const c = (p.pos || '').toUpperCase();
    if (c === 'G' || c === 'GK') return 0;
    if (/^(D|CB|LB|RB|WB|SW)/.test(c)) return 1;
    if (/^(M|CM|DM|AM|CDM|CAM|LM|RM)/.test(c)) return 2;
    return 3;
  };
  const names = ['Goalkeepers', 'Defenders', 'Midfielders', 'Forwards'];
  const groups = [[], [], [], []];
  for (const p of barca.roster) groups[groupOf(p)].push(p);
  let n = 0;
  return groups.map((g, gi) => g.length ? `<h3 class="b-h">${names[gi]} · ${g.length}</h3><div class="sq-grid">${g
    .sort((a, b) => (Number(a.jersey) || 99) - (Number(b.jersey) || 99))
    .map((p) => `<div class="sq-card b-card" style="--i:${Math.min(n++, 16)}"${p.url ? ` data-ext="${esc(p.url)}"` : ''}>
      <div class="sq-num">${esc(p.jersey || '')}</div>
      <div class="sq-photo">${p.photo ? `<img src="${esc(p.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-hide-self>` : `<span>${esc(p.jersey || (p.name || '?')[0])}</span>`}</div>
      <b>${esc(p.name)}</b><small>${esc(p.posName || p.pos)}${p.age ? ` · ${p.age}` : ''}${p.country ? ` · ${esc(p.country)}` : ''}</small></div>`).join('')}</div>` : '').join('') || '<div class="b-empty">Squad not available right now</div>';
}

function barcaPanel() {
  if (barcaTab === 'fixtures') return fixturesHtml();
  if (barcaTab === 'table') return tabTableHtml();
  if (barcaTab === 'news') return newsTabHtml();
  if (barcaTab === 'squad') return squadHtml();
  return overviewHtml();
}

function renderBarca() {
  if (!barca) {
    if (!barcaLoading && !barcaFailed) loadBarca(false);
    content.innerHTML = `<div class="b-head"><h1 class="page-title">Barça</h1></div>
      ${barcaFailed ? '<div class="empty"><strong>Couldn\'t load Barça data</strong>Check your internet connection, then try again.<br><button class="btn" data-bsync style="margin-top:14px">Try again</button></div>'
        : '<div class="b-skel"><div class="b-hero skel"></div><div class="b-skel-row"></div><div class="b-skel-row"></div><div class="b-skel-row"></div></div>'}`;
    return;
  }
  const tabs = BTABS.map(([k, label]) => `<button class="b-tab${barcaTab === k ? ' active' : ''}" data-btab="${k}">${label}</button>`).join('');
  content.innerHTML = `
    <div class="b-head"><div><h1 class="page-title">Barça</h1><p class="page-sub">Fixtures, results, table and news · <span data-bupdated>updated ${timeAgo(barca.updated)}</span></p></div>
      <button class="btn" data-bsync title="Refresh now">↻ Refresh</button></div>
    ${heroHtml()}
    <div class="b-tabs">${tabs}</div>
    <div class="b-panel" id="bPanel">${barcaPanel()}</div>`;
  barcaTick();
}

// Switch tabs without redrawing the hero, so the countdown keeps running and the panel can animate
function setBarcaTab(k) {
  barcaTab = k;
  $$('.b-tab', content).forEach((b) => b.classList.toggle('active', b.dataset.btab === k));
  const p = $('#bPanel');
  if (!p) return;
  p.classList.remove('swap'); void p.offsetWidth;
  p.innerHTML = barcaPanel();
  p.classList.add('swap');
  sfx.play('select');
}

// Countdown to kick-off (runs every second while the page is open)
function barcaTick() {
  const el = $('[data-kick]');
  if (!el) return;
  let left = Math.max(0, Number(el.dataset.kick) - Date.now());
  const d = Math.floor(left / 86400000); left -= d * 86400000;
  const h = Math.floor(left / 3600000); left -= h * 3600000;
  const m = Math.floor(left / 60000); left -= m * 60000;
  const s = Math.floor(left / 1000);
  for (const [k, v] of Object.entries({ d, h, m, s })) {
    const b = $(`[data-k="${k}"]`, el);
    const txt = k === 'd' ? String(v) : String(v).padStart(2, '0');
    if (b && b.textContent !== txt) { b.textContent = txt; b.classList.remove('tick'); void b.offsetWidth; b.classList.add('tick'); }
  }
  const up = $('[data-bupdated]');
  if (up && barca) up.textContent = `updated ${timeAgo(barca.updated)}`;
}
setInterval(() => { if (view === 'barca') barcaTick(); }, 1000);

function initBarca() {
  content.addEventListener('click', (e) => {
    if (view !== 'barca') return;
    const t = e.target;
    const tab = t.closest('[data-btab]');
    if (tab) return setBarcaTab(tab.dataset.btab);
    const comp = t.closest('[data-bcomp]');
    if (comp) { barcaComp = comp.dataset.bcomp; return setBarcaTab('fixtures'); }
    const tb = t.closest('[data-btable]');
    if (tb) { barcaTable = tb.dataset.btable; return setBarcaTab('table'); }
    if (t.closest('[data-bsync]')) { barcaFailed = false; return loadBarca(true); }
    const ext = t.closest('[data-ext]');
    if (ext) window.api.openExternal(ext.dataset.ext);
  });
}
