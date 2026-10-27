// Playtime helpers + the Stats page (hours, charts, streak, badges)
const runningMap = () => (typeof prefs !== 'undefined' && prefs.running) || {};
const isRunning = (id) => id in runningMap();

// Total seconds played, including the session that is still going on
function playSeconds(id) {
  const p = (prefs.playtime || {})[id];
  let t = p ? p.total : 0;
  if (isRunning(id)) t += Math.max(0, (Date.now() - (prefs.now || Date.now())) / 1000);
  return t;
}

function allSessions() {
  const list = (prefs.sessions || []).map(([id, s, e]) => ({ id, s, e }));
  for (const [id, s] of Object.entries(runningMap())) list.push({ id, s, e: Date.now(), live: true });
  return list;
}

const secondsSince = (t0) => allSessions().filter((x) => x.s >= t0).reduce((n, x) => n + (x.e - x.s) / 1000, 0);

const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
const DAY_MS = 86400000;

// Consecutive days with at least one session, ending today (or yesterday if you haven't played yet today)
function streaks(sessions) {
  const days = new Set(sessions.map((x) => dayKey(x.s)));
  let current = 0;
  let cursor = startOfDay(Date.now());
  if (!days.has(dayKey(cursor))) cursor -= DAY_MS;
  while (days.has(dayKey(cursor))) { current += 1; cursor -= DAY_MS; }
  let best = 0, run = 0, prev = null;
  for (const k of [...days].sort()) {
    const t = new Date(`${k}T12:00:00`).getTime();
    run = prev !== null && Math.round((t - prev) / DAY_MS) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return { current, best };
}

// Everything the Stats page and the advancements are worked out from
function statsData() {
  const games = items.filter((i) => i.type === 'game');
  const byId = Object.fromEntries(games.map((g) => [g.id, g]));
  const sessions = allSessions().filter((x) => byId[x.id]);
  // Total hours per game: what Steam / the Overwatch profile / you say, never less than what Nexus counted itself
  const perGame = games.map((g) => ({ g, sec: totalSeconds(g.id), nexus: playSeconds(g.id) })).filter((x) => x.sec > 0).sort((a, b) => b.sec - a.sec);
  const totalSec = perGame.reduce((n, x) => n + x.sec, 0);
  const nexusSec = perGame.reduce((n, x) => n + x.nexus, 0);
  const st = streaks(sessions);
  const ctx = { sessions, totalSec, perGame, streak: st, gameCount: games.length, sources: new Set(perGame.map((x) => x.g.source)) };
  // Per-game lookups for the game-specific badges
  ctx.secOf = (re) => perGame.filter((x) => re.test(x.g.name)).reduce((n, x) => n + x.sec, 0);
  ctx.sessionsOf = (re) => sessions.filter((x) => re.test(byId[x.id].name));
  // Extra numbers the badges need
  const GACHA = /genshin|star rail|zenless|wuthering|honkai|punishing|reverse: 1999|nikke|blue archive|azur lane|arknights|fate\/grand/i;
  const gachaGames = perGame.filter((x) => GACHA.test(x.g.name));
  ctx.gachaPlayed = gachaGames.length;
  ctx.gachaSec = gachaGames.reduce((n, x) => n + x.sec, 0);
  const daySec = {}, dayGames = {}, weekendSeen = new Set(), weekdaysSeen = new Set();
  ctx.sundayMaxSec = 0;
  for (const x of sessions) {
    const k = dayKey(x.s), d = new Date(x.s), len = (x.e - x.s) / 1000;
    daySec[k] = (daySec[k] || 0) + len;
    (dayGames[k] = dayGames[k] || new Set()).add(x.id);
    weekdaysSeen.add(d.getDay());
    if (d.getDay() === 0 || d.getDay() === 6) weekendSeen.add(k);
  }
  for (const [k, sec] of Object.entries(daySec)) if (new Date(`${k}T12:00:00`).getDay() === 0) ctx.sundayMaxSec = Math.max(ctx.sundayMaxSec, sec);
  ctx.maxDaySec = Math.max(0, ...Object.values(daySec));
  ctx.maxGamesInDay = Math.max(0, ...Object.values(dayGames).map((s) => s.size));
  ctx.weekendDays = weekendSeen.size;
  ctx.weekdaysSeen = weekdaysSeen;
  ctx.hoursPlayed = Array(24).fill(0);
  for (const x of sessions) {
    for (let t = x.s; t < x.e;) {
      const next = Math.min(x.e, (Math.floor(t / 3600000) + 1) * 3600000);
      ctx.hoursPlayed[new Date(t).getHours()] += (next - t) / 1000;
      t = next;
    }
  }
  return { games, byId, sessions, perGame, totalSec, nexusSec, st, ctx, daySec };
}

function renderStats() {
  // Steam achievement totals come from the main process; draw now, and again if they changed
  const before = JSON.stringify(achSummary);
  loadAchSummary().then(() => { if (view === 'stats' && JSON.stringify(achSummary) !== before) renderStats(); });
  const data = statsData();
  const { games, byId, sessions, perGame, totalSec, nexusSec, st, ctx, daySec } = data;
  const now = Date.now();
  const today0 = startOfDay(now);
  const sumSince = (t0) => sessions.filter((x) => x.s >= t0).reduce((n, x) => n + (x.e - x.s) / 1000, 0);

  if (!totalSec && !sessions.length) {
    content.innerHTML = `
      <h1 class="page-title">Stats</h1>
      <div class="empty"><strong>No playtime yet</strong>
        Nexus counts the time a game is running, whether you started it here or anywhere else.<br>
        ${prefs.settings.trackPlaytime ? 'Tracking is on. Go play something!' : 'Tracking is turned off. Enable it in Settings → Playtime.'}
      </div>`;
    return;
  }

  // Last 14 days
  const days = Array.from({ length: 14 }, (_, i) => { const t0 = today0 - (13 - i) * DAY_MS; return { t0, sec: 0 }; });
  for (const x of sessions) { const d = days.find((d) => x.s >= d.t0 && x.s < d.t0 + DAY_MS); if (d) d.sec += (x.e - x.s) / 1000; }
  const maxDay = Math.max(...days.map((d) => d.sec), 1);
  const bars = days.map((d) => {
    const date = new Date(d.t0);
    return `<div class="bar-col" title="${date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}: ${fmtDur(d.sec)}">
      <div class="bar-val">${d.sec ? fmtHours(d.sec) : ''}</div>
      <div class="bar" style="height:${Math.max(d.sec ? 6 : 2, (d.sec / maxDay) * 100)}%"></div>
      <div class="bar-label${d.t0 === today0 ? ' today' : ''}">${date.toLocaleDateString(undefined, { weekday: 'narrow' })}</div></div>`;
  }).join('');

  // When you play: seconds per hour of the day
  const hours = Array(24).fill(0);
  for (const x of sessions) {
    for (let t = x.s; t < x.e;) {
      const next = Math.min(x.e, (Math.floor(t / 3600000) + 1) * 3600000);
      hours[new Date(t).getHours()] += (next - t) / 1000;
      t = next;
    }
  }
  const maxHour = Math.max(...hours, 1);
  const peak = hours.indexOf(Math.max(...hours));
  const hourBars = hours.map((s, h) => `<div class="bar-col mini" title="${pad2(h)}:00 – ${fmtDur(s)}"><div class="bar" style="height:${Math.max(s ? 8 : 3, (s / maxHour) * 100)}%"></div>${h % 6 === 0 ? `<div class="bar-label">${pad2(h)}</div>` : '<div class="bar-label">&nbsp;</div>'}</div>`).join('');

  // Top games
  const top = perGame.slice(0, 8);
  const topRows = top.map(({ g, sec }) => `
    <div class="toprow" data-open="${esc(g.id)}" title="Open ${esc(g.name)}">
      <div class="toprow-art">${g.cover ? `<img src="${esc(g.cover)}" alt="" loading="lazy" data-hide-self>` : ''}</div>
      <div class="toprow-main"><div class="toprow-name">${esc(g.name)}${isRunning(g.id) ? ' <span class="live-dot" title="Playing now"></span>' : ''}</div>
        <div class="toprow-bar"><span style="width:${(sec / top[0].sec) * 100}%"></span></div></div>
      <div class="toprow-val">${fmtHours(sec)}</div>
    </div>`).join('');

  // By launcher
  const bySource = {};
  for (const { g, sec } of perGame) bySource[g.source] = (bySource[g.source] || 0) + sec;
  const srcEntries = Object.entries(bySource).sort((a, b) => b[1] - a[1]);
  const srcBar = srcEntries.map(([s, sec]) => `<span style="width:${(sec / totalSec) * 100}%;background:var(--${s})" title="${SOURCES[s] || s}: ${fmtHours(sec)}"></span>`).join('');
  const srcLegend = srcEntries.map(([s, sec]) => `<span class="legend-item"><i style="background:var(--${s})"></i>${SOURCES[s] || s} · ${Math.round((sec / totalSec) * 100)}%</span>`).join('');

  // More numbers about your sessions
  const avgSess = sessions.length ? sessions.reduce((n, x) => n + (x.e - x.s) / 1000, 0) / sessions.length : 0;
  const longest = sessions.reduce((best, x) => (!best || x.e - x.s > best.e - best.s ? x : best), null);
  const activeDays = Object.keys(daySec).length;
  const busiest = Object.entries(daySec).sort((a, b) => b[1] - a[1])[0];
  const thisWeek = sumSince(today0 - 6 * DAY_MS);
  const lastWeek = sessions.filter((x) => x.s >= today0 - 13 * DAY_MS && x.s < today0 - 6 * DAY_MS).reduce((n, x) => n + (x.e - x.s) / 1000, 0);
  const weekDelta = !lastWeek ? '' : thisWeek >= lastWeek ? `▲ ${Math.round(((thisWeek - lastWeek) / lastWeek) * 100)}% vs last week` : `▼ ${Math.round(((lastWeek - thisWeek) / lastWeek) * 100)}% vs last week`;
  const dowSec = Array(7).fill(0);
  for (const [k, sec] of Object.entries(daySec)) dowSec[new Date(`${k}T12:00:00`).getDay()] += sec;
  const dowOrder = [1, 2, 3, 4, 5, 6, 0]; // Monday first
  const dowNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const maxDow = Math.max(...dowSec, 1);
  const dowBars = dowOrder.map((d) => `<div class="bar-col" title="${dowNames[d]}: ${fmtDur(dowSec[d])}"><div class="bar-val">${dowSec[d] ? fmtHours(dowSec[d]) : ''}</div><div class="bar" style="height:${Math.max(dowSec[d] ? 6 : 2, (dowSec[d] / maxDow) * 100)}%"></div><div class="bar-label">${dowNames[d].slice(0, 3)}</div></div>`).join('');
  const bestDow = dowSec.indexOf(Math.max(...dowSec));

  // Per-game table
  const shortDate = (ts) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: new Date(ts).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  const gameRows = perGame.slice(0, 20).map(({ g, sec, nexus }) => {
    const gs = sessions.filter((x) => x.id === g.id);
    const first = gs.length ? Math.min(...gs.map((x) => x.s)) : 0;
    const last = (prefs.recents || {})[g.id] || (gs.length ? Math.max(...gs.map((x) => x.e)) : 0);
    const lng = gs.reduce((m, x) => Math.max(m, x.e - x.s), 0) / 1000;
    const avg = gs.length ? gs.reduce((n, x) => n + (x.e - x.s) / 1000, 0) / gs.length : 0;
    return `<tr data-open="${esc(g.id)}" title="Open ${esc(g.name)}">
      <td class="g-name">${esc(g.name)}${isRunning(g.id) ? ' <span class="live-dot" title="Playing now"></span>' : ''}</td>
      <td>${fmtHours(sec)}${sec - nexus >= 3600 && nexus >= 60 ? ` <small class="muted" title="Counted by Nexus">(${fmtHours(nexus)} Nexus)</small>` : ''}</td><td>${gs.length || '–'}</td><td>${avg ? fmtDur(avg) : '–'}</td><td>${lng ? fmtDur(lng) : '–'}</td>
      <td>${first ? shortDate(first) : '–'}</td><td>${last ? timeAgo(last) : '–'}</td><td>${Math.round((sec / totalSec) * 100)}%</td></tr>`;
  }).join('');

  const hrs = totalSec / 3600;
  const facts = hrs >= 1 ? [
    `That's <b>${(hrs / 24).toFixed(hrs >= 48 ? 1 : 2)}</b> full days of gaming.`,
    `Enough time to watch the extended Lord of the Rings trilogy <b>${(hrs / 11.43).toFixed(1)}×</b>.`,
    `Or fly from London to New York about <b>${(hrs / 9).toFixed(1)}</b> times.`,
  ] : [];

  const mostActive = perGame[0];
  content.innerHTML = `
    <h1 class="page-title">Stats</h1>
    <p class="page-sub">${prefs.settings.trackPlaytime ? 'Hours counted while a game is running' : '⚠ Playtime tracking is turned off in Settings'}</p>

    <div class="stat-grid">
      <div class="stat-card"><div class="stat-num">${fmtHours(totalSec)}</div><div class="stat-label">Total playtime${totalSec - nexusSec >= 3600 ? ` · ${fmtHours(nexusSec)} in Nexus` : ''}</div></div>
      <div class="stat-card"><div class="stat-num">${fmtDur(sumSince(today0))}</div><div class="stat-label">Today</div></div>
      <div class="stat-card"><div class="stat-num">${fmtHours(sumSince(today0 - 6 * DAY_MS))}</div><div class="stat-label">Last 7 days${weekDelta ? ` · ${weekDelta}` : ''}</div></div>
      <div class="stat-card"><div class="stat-num">${st.current}<small> day${st.current === 1 ? '' : 's'}</small></div><div class="stat-label">Current streak · best ${st.best}</div></div>
      <div class="stat-card"><div class="stat-num name">${mostActive ? esc(mostActive.g.name) : '–'}</div><div class="stat-label">Most played</div></div>
    </div>

    <div class="stat-grid">
      <div class="stat-card"><div class="stat-num">${sessions.length}</div><div class="stat-label">Sessions recorded</div></div>
      <div class="stat-card"><div class="stat-num">${avgSess ? fmtDur(avgSess) : '–'}</div><div class="stat-label">Average session</div></div>
      <div class="stat-card"><div class="stat-num">${longest ? fmtDur((longest.e - longest.s) / 1000) : '–'}</div><div class="stat-label">Longest session${longest && byId[longest.id] ? ` · ${esc(byId[longest.id].name)}` : ''}</div></div>
      <div class="stat-card"><div class="stat-num">${activeDays}<small> day${activeDays === 1 ? '' : 's'}</small></div><div class="stat-label">Days you played</div></div>
      <div class="stat-card"><div class="stat-num">${busiest ? fmtDur(busiest[1]) : '–'}</div><div class="stat-label">Busiest day${busiest ? ` · ${shortDate(new Date(`${busiest[0]}T12:00:00`).getTime())}` : ''}</div></div>
      <div class="stat-card"><div class="stat-num">${perGame.length}<small> / ${games.length}</small></div><div class="stat-label">Games played</div></div>
    </div>

    ${facts.length ? `<div class="facts-strip">${facts.map((f) => `<span>${f}</span>`).join('')}</div>` : ''}

    <div class="panel-grid">
      <div class="panel"><h3>Last 14 days</h3><div class="bars">${bars}</div></div>
      <div class="panel"><h3>When you play${hours[peak] ? ` · busiest around ${pad2(peak)}:00` : ''}</h3><div class="bars hours">${hourBars}</div></div>
    </div>
    <div class="panel-grid">
      <div class="panel"><h3>Days of the week${dowSec[bestDow] ? ` · you play most on ${dowNames[bestDow]}s` : ''}</h3><div class="bars">${dowBars}</div></div>
      <div class="panel"><h3>This week vs last week</h3>
        <div class="vs-row"><span>This week</span><div class="toprow-bar"><span style="width:${(thisWeek / Math.max(thisWeek, lastWeek, 1)) * 100}%"></span></div><b>${fmtHours(thisWeek)}</b></div>
        <div class="vs-row"><span>Last week</span><div class="toprow-bar"><span class="dim" style="width:${(lastWeek / Math.max(thisWeek, lastWeek, 1)) * 100}%"></span></div><b>${fmtHours(lastWeek)}</b></div>
        <p class="muted-line">${weekDelta || 'Not enough history yet to compare.'}</p>
      </div>
    </div>
    <div class="panel-grid">
      <div class="panel"><h3>Top games</h3>${topRows || '<div class="empty small">Nothing yet</div>'}</div>
      <div class="panel"><h3>By launcher</h3><div class="stack-bar">${srcBar}</div><div class="legend">${srcLegend}</div>
        <h3 style="margin-top:26px">Sessions</h3>
        <p class="muted-line">${sessions.length} recorded${sessions.length ? ` · average ${fmtDur(sessions.reduce((n, x) => n + (x.e - x.s) / 1000, 0) / sessions.length)}` : ''}</p>
      </div>
    </div>

    <div class="section"><div class="section-head"><h2>Your games in numbers</h2></div>
      <div class="panel gtable-wrap"><table class="gtable"><thead><tr><th>Game</th><th>Total</th><th>Sessions</th><th>Average</th><th>Longest</th><th>First played</th><th>Last played</th><th>Share</th></tr></thead><tbody>${gameRows}</tbody></table></div></div>

    ${advancementsHtml(evaluateBadges(data))}`;
}

// Little stat chips for one game, shown on its page
function gameStatsHtml(it) {
  const sec = totalSeconds(it.id);
  const nexusSec = playSeconds(it.id);
  const gs = allSessions().filter((x) => x.id === it.id);
  if (sec < 60 && !gs.length) return '';
  const games = items.filter((i) => i.type === 'game');
  const all = games.map((g) => ({ id: g.id, sec: totalSeconds(g.id) })).filter((x) => x.sec > 0).sort((a, b) => b.sec - a.sec);
  const total = all.reduce((n, x) => n + x.sec, 0);
  const rank = all.findIndex((x) => x.id === it.id) + 1;
  const lens = gs.map((x) => (x.e - x.s) / 1000);
  const first = gs.length ? Math.min(...gs.map((x) => x.s)) : 0;
  const weekSec = gs.filter((x) => x.s >= startOfDay(Date.now()) - 6 * DAY_MS).reduce((n, x) => n + (x.e - x.s) / 1000, 0);
  const chip = (num, label) => `<div class="dstat"><b>${num}</b><small>${label}</small></div>`;
  return [
    chip(fmtHours(sec), 'Total playtime'),
    sec - nexusSec >= 3600 && nexusSec >= 60 ? chip(fmtHours(nexusSec), 'In Nexus') : '',
    gs.length ? chip(gs.length, gs.length === 1 ? 'Session' : 'Sessions') : '',
    lens.length ? chip(fmtDur(lens.reduce((a, b) => a + b, 0) / lens.length), 'Average session') : '',
    lens.length ? chip(fmtDur(Math.max(...lens)), 'Longest session') : '',
    first ? chip(new Date(first).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }), 'First tracked') : '',
    weekSec >= 60 ? chip(fmtHours(weekSec), 'Last 7 days') : '',
    rank && total ? chip(`#${rank}`, `Most played · ${Math.round((sec / total) * 100)}% of your time`) : '',
  ].join('');
}
