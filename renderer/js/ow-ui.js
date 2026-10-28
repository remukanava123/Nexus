// Overwatch page: your competitive match log (auto-detected from your stats, or typed in here) turned into statistics.
let owMatches = [];
let owLastRole = '';
let owPeriod = 'all', owRole = 'all', owLoaded = false, owProfile = null, owProfileAt = 0;

const OW_DAY = 86400000;
const owPct = (w, n) => (n ? Math.round((w / n) * 100) : null);
const owCls = (p) => (p == null ? '' : p >= 55 ? 'good' : p < 47 ? 'bad' : '');
const owDate = (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function owFiltered() {
  const now = Date.now();
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const since = { today: d0.getTime(), week: now - 7 * OW_DAY, month: now - 30 * OW_DAY, all: 0 }[owPeriod] || 0;
  return owMatches.filter((m) => /overwatch/i.test(m.game || 'overwatch') && m.t >= since && (owRole === 'all' || (m.role || OW.roleOf(m.hero)) === owRole)).sort((a, b) => a.t - b.t);
}

// group rows by a key -> [{ key, n, w, l, d, wr }]
function owGroup(list, keyFn, minGames = 1) {
  const g = new Map();
  for (const m of list) {
    const k = keyFn(m);
    if (!k) continue;
    const x = g.get(k) || { key: k, n: 0, w: 0, l: 0, d: 0 };
    x.n++; x[m.r]++;
    g.set(k, x);
  }
  return [...g.values()].filter((x) => x.n >= minGames).map((x) => ({ ...x, wr: owPct(x.w, x.w + x.l) }));
}

function owBars(rows, { limit = 10, empty = 'Nothing logged yet' } = {}) {
  if (!rows.length) return `<div class="ow-empty">${empty}</div>`;
  return rows.slice(0, limit).map((r) => `<div class="ow-bar"><span class="ow-bar-name" title="${esc(r.key)}">${esc(r.key)}</span>
    <span class="ow-bar-track"><i class="${owCls(r.wr)}" style="width:${r.wr == null ? 0 : r.wr}%"></i></span>
    <span class="ow-bar-val"><b>${r.wr == null ? '–' : r.wr + '%'}</b> <small>${r.w}-${r.l}${r.d ? '-' + r.d : ''}</small></span></div>`).join('');
}

function owStreaks(list) {
  let cur = 0, curKind = '', bestW = 0, worstL = 0, w = 0, l = 0;
  for (const m of list) {
    if (m.r === 'w') { w++; l = 0; bestW = Math.max(bestW, w); } else if (m.r === 'l') { l++; w = 0; worstL = Math.max(worstL, l); } else { w = 0; l = 0; }
  }
  for (let i = list.length - 1; i >= 0; i--) { const r = list[i].r; if (r === 'd') break; if (!curKind) curKind = r; if (r === curKind) cur++; else break; }
  return { cur, curKind, bestW, worstL };
}

// a session = games less than 90 minutes apart
function owSessions(list) {
  const out = [];
  for (const m of list) {
    const s = out[out.length - 1];
    if (s && m.t - s.end < 90 * 60000) { s.games.push(m); s.end = m.t; } else out.push({ start: m.t, end: m.t, games: [m] });
  }
  return out;
}

function owLine(points, { w = 340, h = 90, min = null, max = null, ref = null } = {}) {
  if (points.length < 2) return '<div class="ow-empty">Needs a few more games</div>';
  const lo = min != null ? min : Math.min(...points), hi = max != null ? max : Math.max(...points);
  const span = hi - lo || 1;
  const x = (i) => (i / (points.length - 1)) * (w - 8) + 4, y = (v) => h - 6 - ((v - lo) / span) * (h - 12);
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const refLine = ref != null && ref >= lo && ref <= hi ? `<line x1="0" x2="${w}" y1="${y(ref)}" y2="${y(ref)}" stroke="currentColor" opacity=".25" stroke-dasharray="3 4"/>` : '';
  return `<svg class="ow-line" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${refLine}<path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>
    <div class="ow-line-lbl"><span>${Math.round(lo)}</span><span>${Math.round(hi)}</span></div>`;
}

function owColumns(items, { max = null } = {}) {
  const hi = max || Math.max(1, ...items.map((i) => i.v));
  return `<div class="ow-cols">${items.map((i) => `<div class="ow-col" title="${esc(i.tip || '')}"><span class="ow-col-bar"><i class="${i.cls || ''}" style="height:${Math.round((i.v / hi) * 100)}%"></i></span><small>${esc(i.label)}</small></div>`).join('')}</div>`;
}

function renderOverwatch() {
  if (!owLoaded) {
    content.innerHTML = '<h1 class="page-title">Overwatch</h1><div class="loading"><div class="spinner"></div>Loading your matches…</div>';
    window.api.matchesList().then((l) => { owMatches = l || []; owLoaded = true; if (view === 'overwatch') renderOverwatch(); });
    return;
  }
  const list = owFiltered();
  const decided = list.filter((m) => m.r !== 'd');
  const W = list.filter((m) => m.r === 'w').length, L = list.filter((m) => m.r === 'l').length, D = list.filter((m) => m.r === 'd').length;
  const wr = owPct(W, W + L);
  const st = owStreaks(list);
  const srList = list.filter((m) => m.sr != null);
  const srNet = Math.round(srList.reduce((a, m) => a + m.sr, 0) * 10) / 10;
  const owSigned = (v) => (v > 0 ? '+' : '') + v + '%';
  const d0s = new Date(); d0s.setHours(0, 0, 0, 0);
  const todayRole = (k) => owMatches.filter((m) => /overwatch/i.test(m.game || 'overwatch') && m.t >= d0s.getTime() && (m.role || OW.roleOf(m.hero)) === k && m.sr != null).reduce((a, m) => a + m.sr, 0);

  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const today = list.filter((m) => m.t >= d0.getTime());
  const todayW = today.filter((m) => m.r === 'w').length, todayL = today.filter((m) => m.r === 'l').length;
  const days = new Set(list.map((m) => new Date(m.t).toDateString())).size;
  const sessions = owSessions(list);
  const bestSession = sessions.map((s) => ({ ...s, w: s.games.filter((m) => m.r === 'w').length, l: s.games.filter((m) => m.r === 'l').length })).filter((s) => s.w + s.l >= 3).sort((a, b) => (b.w / (b.w + b.l)) - (a.w / (a.w + a.l)) || b.games.length - a.games.length)[0];

  // by hero, role, map, map type
  const heroes = owGroup(list, (m) => m.hero).sort((a, b) => b.n - a.n || (b.wr || 0) - (a.wr || 0));
  const roles = owGroup(list, (m) => m.role || OW.roleOf(m.hero)).map((r) => ({ ...r, key: OW.ROLES[r.key] || r.key })).sort((a, b) => b.n - a.n);
  const maps = owGroup(list, (m) => m.map).sort((a, b) => b.n - a.n || (b.wr || 0) - (a.wr || 0));
  const types = owGroup(list, (m) => OW.mapTypeOf(m.map)).sort((a, b) => b.n - a.n);
  const bestHero = [...heroes].filter((h) => h.n >= 5 && h.wr != null).sort((a, b) => b.wr - a.wr || b.n - a.n)[0];
  const bestMap = [...maps].filter((h) => h.n >= 3 && h.wr != null).sort((a, b) => b.wr - a.wr || b.n - a.n)[0];
  const worstMap = [...maps].filter((h) => h.n >= 3 && h.wr != null).sort((a, b) => a.wr - b.wr || b.n - a.n)[0];
  const mostHero = heroes[0];

  // when you win
  const slots = [['Night', 0, 6], ['Morning', 6, 12], ['Afternoon', 12, 18], ['Evening', 18, 24]];
  const byHour = slots.map(([label, a, b]) => { const g = decided.filter((m) => { const h = new Date(m.t).getHours(); return h >= a && h < b; }); const w = g.filter((m) => m.r === 'w').length; return { label, v: owPct(w, g.length) || 0, n: g.length, cls: owCls(owPct(w, g.length)), tip: `${g.length} games` }; });
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const byDay = dayNames.map((label, i) => { const g = decided.filter((m) => new Date(m.t).getDay() === i); const w = g.filter((m) => m.r === 'w').length; return { label, v: owPct(w, g.length) || 0, cls: owCls(owPct(w, g.length)), tip: `${g.length} games` }; });
  const perDay = [];
  for (let i = 13; i >= 0; i--) { const s = new Date(daysAgo(i)), end = daysAgo(i - 1); const g = owMatches.filter((m) => /overwatch/i.test(m.game || 'overwatch') && m.t >= s.getTime() && m.t < end); perDay.push({ label: String(s.getDate()), v: g.length, tip: `${g.length} games` }); }

  // momentum: how you do right after a win or a loss, and late in a session
  let afterW = [0, 0], afterL = [0, 0];
  for (let i = 1; i < decided.length; i++) { if (decided[i].t - decided[i - 1].t > 90 * 60000) continue; const t = decided[i - 1].r === 'w' ? afterW : afterL; t[1]++; if (decided[i].r === 'w') t[0]++; }
  const late = sessions.flatMap((s) => s.games.filter((m) => m.r !== 'd').slice(4));
  const lateW = late.filter((m) => m.r === 'w').length;
  const first = sessions.flatMap((s) => s.games.filter((m) => m.r !== 'd').slice(0, 4));
  const firstW = first.filter((m) => m.r === 'w').length;

  // rolling win rate
  const trend = [];
  for (let i = 0; i < decided.length; i++) { const win = decided.slice(Math.max(0, i - 9), i + 1); trend.push(Math.round((win.filter((m) => m.r === 'w').length / win.length) * 100)); }
  let srRun = 0; const srPts = srList.map((m) => (srRun += m.sr));

  const facts = [
    mostHero && `Most played hero: <b>${esc(mostHero.key)}</b> (${mostHero.n} games)`,
    bestHero && `Best hero (5+ games): <b>${esc(bestHero.key)}</b> at ${bestHero.wr}%`,
    bestMap && `Best map: <b>${esc(bestMap.key)}</b> at ${bestMap.wr}% (${bestMap.n} games)`,
    worstMap && worstMap.key !== (bestMap && bestMap.key) && `Nemesis map: <b>${esc(worstMap.key)}</b> at ${worstMap.wr}% (${worstMap.n} games)`,
    st.bestW > 1 && `Best win streak: <b>${st.bestW}</b>`,
    st.worstL > 1 && `Worst loss streak: <b>${st.worstL}</b>`,
    afterW[1] >= 5 && afterL[1] >= 5 && `After a win you win <b>${owPct(afterW[0], afterW[1])}%</b>; after a loss <b>${owPct(afterL[0], afterL[1])}%</b>`,
    late.length >= 8 && first.length >= 8 && `First 4 games of a session: <b>${owPct(firstW, first.length)}%</b>. Later games: <b>${owPct(lateW, late.length)}%</b>`,
    sessions.length && `Average session: <b>${(list.length / sessions.length).toFixed(1)}</b> games over ${sessions.length} session${sessions.length === 1 ? '' : 's'}`,
    bestSession && `Best session: <b>${bestSession.w}-${bestSession.l}</b> on ${new Date(bestSession.start).toLocaleDateString([], { month: 'short', day: 'numeric' })}`,
    days > 0 && `Average per day played: <b>${(list.length / days).toFixed(1)}</b> games`,
  ].filter(Boolean);

  const heroOpts = OW.allHeroes().map((h) => `<option value="${esc(h)}">`).join('');
  const mapOpts = OW.allMaps().map((h) => `<option value="${esc(h)}">`).join('');
  const history = [...list].reverse().slice(0, 120);

  content.innerHTML = `
    <h1 class="page-title">Overwatch</h1>
    <div class="page-sub">Your competitive log. Add your wins and losses here, or let Nexus notice them from your stats.
      <select data-owperiod>${[['all', 'All time'], ['month', 'Last 30 days'], ['week', 'Last 7 days'], ['today', 'Today']].map(([k, n]) => `<option value="${k}"${k === owPeriod ? ' selected' : ''}>${n}</option>`).join('')}</select>
      <select data-owrole>${[['all', 'All roles'], ['tank', 'Tank'], ['damage', 'Damage'], ['support', 'Support']].map(([k, n]) => `<option value="${k}"${k === owRole ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
    <datalist id="owHeroes">${heroOpts}</datalist><datalist id="owMaps">${mapOpts}</datalist>

    <div class="stat-grid">
      <div class="stat-card"><div class="stat-num">${list.length}</div><div class="stat-label">Games logged</div></div>
      <div class="stat-card"><div class="stat-num"><span class="ow-w">${W}</span>–<span class="ow-l">${L}</span>${D ? `<small> ${D}D</small>` : ''}</div><div class="stat-label">Record</div></div>
      <div class="stat-card"><div class="stat-num ${owCls(wr)}">${wr == null ? '–' : wr + '%'}</div><div class="stat-label">Win rate</div></div>
      <div class="stat-card"><div class="stat-num">${st.cur ? `${st.cur}<small> ${st.curKind === 'w' ? 'win' : 'loss'}${st.cur === 1 ? '' : st.curKind === 'w' ? 's' : 'es'}</small>` : '–'}</div><div class="stat-label">Current streak</div></div>
      <div class="stat-card"><div class="stat-num">${todayW}–${todayL}</div><div class="stat-label">Today</div></div>
      <div class="stat-card"><div class="stat-num">${srList.length ? owSigned(srNet) : '–'}</div><div class="stat-label">Rank progress (from entries)</div></div>
      <div class="stat-card"><div class="stat-num ow-roles">${['tank', 'damage', 'support'].map((k) => { const v = Math.round(todayRole(k) * 10) / 10; return `<small>${OW.ROLES[k].slice(0, 1)}</small> <span class="${v > 0 ? 'ow-w' : v < 0 ? 'ow-l' : ''}">${owSigned(v)}</span>`; }).join(' ')}</div><div class="stat-label">Today by role (T / D / S)</div></div>
    </div>

    <div class="panel ow-log">
      <h3>Add a match</h3>
      <div class="ow-form">
        <div class="ow-res"><button class="btn ow-r w" data-owres="w">Win</button><button class="btn ow-r l" data-owres="l">Loss</button><button class="btn ow-r d" data-owres="d">Draw</button></div>
        <input list="owHeroes" data-owf="hero" placeholder="Hero" spellcheck="false">
        <input list="owMaps" data-owf="map" placeholder="Map" spellcheck="false">
        <select data-owf="role" title="Role you played">${[['', 'Role'], ['tank', 'Tank'], ['damage', 'Damage'], ['support', 'Support']].map(([k, n]) => `<option value="${k}"${k === owLastRole ? ' selected' : ''}>${n}</option>`).join('')}</select>
        <input data-owf="sr" type="number" step="0.1" placeholder="Role % ±" title="Rank progress for this role, e.g. 25 or -18" style="width:96px">
        <input data-owf="note" placeholder="Note (optional)" style="flex:1;min-width:140px">
      </div>
      <div class="ow-hint">Pick the result to add it. Hero and map are optional, and you can fill them in later in the history below.</div>
    </div>

    <div class="panel-grid">
      <div class="panel"><h3>Win rate by hero</h3>${owBars(heroes, { empty: 'Add heroes to your matches (or turn on automatic logging in Settings) to see this.' })}</div>
      <div class="panel"><h3>Win rate by map</h3>${owBars(maps, { empty: 'Add maps to your matches to see this.' })}</div>
      <div class="panel"><h3>By role</h3>${owBars(roles)}<h3 style="margin-top:18px">By map type</h3>${owBars(types, { empty: 'Map types appear once maps are logged' })}</div>
      <div class="panel"><h3>Win rate trend <small>rolling 10 games</small></h3>${owLine(trend, { min: 0, max: 100, ref: 50 })}</div>
      <div class="panel"><h3>Rank progress <small>running total of your entries, %</small></h3>${owLine(srPts)}</div>
      <div class="panel"><h3>Games per day <small>last 14 days</small></h3>${owColumns(perDay)}</div>
      <div class="panel"><h3>Win rate by time of day</h3>${owColumns(byHour, { max: 100 })}</div>
      <div class="panel"><h3>Win rate by weekday</h3>${owColumns(byDay, { max: 100 })}</div>
      <div class="panel ow-facts"><h3>Fun facts</h3>${facts.length ? facts.map((f) => `<div>${f}</div>`).join('') : '<div class="ow-empty">Log a few matches to unlock these</div>'}</div>
      <div class="panel" id="owCareer"><h3>Career <small>from the public stats site</small></h3><div class="ow-empty">Loading…</div></div>
    </div>

    <div class="panel ow-hist">
      <h3>Match history <small>${list.length} in this view</small></h3>
      ${history.length ? `<div class="ow-hrow head"><span>When</span><span>Result</span><span>Hero</span><span>Map</span><span>Role</span><span>%</span><span>Note</span><span></span></div>` + history.map((m) => `
        <div class="ow-hrow${!m.hero || !m.map ? ' missing' : ''}" data-owid="${esc(m.id)}">
          <span class="ow-when">${owDate(m.t)}${m.auto ? ' <em title="Noticed from your stats">auto</em>' : ''}</span>
          <select data-owset="r"><option value="w"${m.r === 'w' ? ' selected' : ''}>Win</option><option value="l"${m.r === 'l' ? ' selected' : ''}>Loss</option><option value="d"${m.r === 'd' ? ' selected' : ''}>Draw</option></select>
          <input list="owHeroes" data-owset="hero" value="${esc(m.hero || '')}" placeholder="hero?" spellcheck="false">
          <input list="owMaps" data-owset="map" value="${esc(m.map || '')}" placeholder="map?" spellcheck="false">
          <select data-owset="role">${[['', '–'], ['tank', 'Tank'], ['damage', 'Damage'], ['support', 'Support']].map(([k, n]) => `<option value="${k}"${k === (m.role || OW.roleOf(m.hero)) ? ' selected' : ''}>${n}</option>`).join('')}</select>
          <input data-owset="sr" type="number" step="0.1" value="${m.sr == null ? '' : m.sr}" placeholder="±">
          <input data-owset="note" value="${esc(m.note || '')}" placeholder="note">
          <button class="mini-btn" data-owdel title="Delete">✕</button>
        </div>`).join('') : '<div class="ow-empty">No matches yet. Add one above after a game.</div>'}
    </div>`;
  loadOwCareer();
}

async function loadOwCareer() {
  const box = $('#owCareer');
  if (!box) return;
  const body = (html) => { const b = $('#owCareer'); if (b) b.innerHTML = `<h3>Career <small>from the public stats site</small></h3>${html}`; };
  const tag = (prefs.settings.owTag || '').trim();
  if (!tag) { body('<div class="ow-empty">Add your BattleTag in Settings → Game overlay to see your rank and top heroes here.</div>'); return; }
  if (!owProfile || Date.now() - owProfileAt > 5 * 60000) {
    try { owProfile = await window.api.owProfile(); owProfileAt = Date.now(); } catch { owProfile = { error: 'could not load' }; }
  }
  const p = owProfile;
  if (!p || p.error) { body(`<div class="ow-empty">${esc((p && p.error) || 'Not available')}</div>`); return; }
  body(`<div class="ow-career"><div class="ow-rankrow">${(p.ranks || []).map((r) => `<span class="ow-rank">${esc(r.role)} ${esc(r.division)} ${esc(r.tier)}</span>`).join('') || '<span class="ow-rank">Unranked</span>'}</div>
    <div>${esc(p.name)} · ${p.games != null ? p.games + ' games' : ''} · ${p.winrate != null ? p.winrate + '% win rate' : ''} · ${p.kda != null ? p.kda + ' KDA' : ''} · ${p.hours != null ? p.hours + 'h' : ''}</div>
    ${(p.heroes || []).map((h) => `<div class="ow-bar"><span class="ow-bar-name">${esc(OW.heroName(h.name))}</span><span class="ow-bar-track"><i class="${owCls(h.winrate)}" style="width:${h.winrate || 0}%"></i></span><span class="ow-bar-val"><b>${h.winrate}%</b> <small>${h.hours}h</small></span></div>`).join('')}</div>`);
}

function initOverwatchUi() {
  window.api.on('matches:updated', async () => {
    owMatches = (await window.api.matchesList()) || [];
    owLoaded = true;
    if (view === 'overwatch' && !query && !(document.activeElement && content.contains(document.activeElement) && document.activeElement.matches('input'))) renderOverwatch();
  });
  content.addEventListener('change', async (e) => {
    if (view !== 'overwatch') return;
    const t = e.target;
    if (t.matches('[data-owperiod]')) { owPeriod = t.value; return renderOverwatch(); }
    if (t.matches('[data-owrole]')) { owRole = t.value; return renderOverwatch(); }
    const row = t.closest('[data-owid]');
    if (row && t.dataset.owset) {
      const key = t.dataset.owset;
      const patch = { [key]: t.value };
      if (key === 'hero' && OW.roleOf(t.value)) patch.role = OW.roleOf(t.value);
      await window.api.matchesUpdate(row.dataset.owid, patch);
      const m = owMatches.find((x) => x.id === row.dataset.owid);
      if (m) Object.assign(m, key === 'sr' ? { sr: t.value === '' ? null : Number(t.value) } : patch);
      if (['r', 'hero', 'map', 'sr', 'role'].includes(key)) renderOverwatch();
    }
  });
  content.addEventListener('click', async (e) => {
    if (view !== 'overwatch') return;
    const res = e.target.closest('[data-owres]');
    if (res) {
      const val = (k) => ($(`[data-owf="${k}"]`, content) || {}).value || '';
      const hero = val('hero').trim();
      owLastRole = val('role');
      await window.api.matchesAdd({ r: res.dataset.owres, hero, map: val('map').trim(), role: OW.roleOf(hero) || owLastRole, sr: val('sr') === '' ? null : Number(val('sr')), note: val('note').trim() });
      owMatches = (await window.api.matchesList()) || [];
      renderOverwatch();
      return;
    }
    const del = e.target.closest('[data-owdel]');
    if (del) {
      await window.api.matchesDelete(del.closest('[data-owid]').dataset.owid);
      owMatches = owMatches.filter((m) => m.id !== del.closest('[data-owid]').dataset.owid);
      renderOverwatch();
    }
  });
}
