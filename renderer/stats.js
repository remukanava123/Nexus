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

const BADGES = [
  { icon: '🎮', name: 'First Session', desc: 'Play a game while Nexus is tracking', test: (c) => c.totalSec >= 60 },
  { icon: '🦉', name: 'Night Owl', desc: 'Start a session between midnight and 5am', test: (c) => c.sessions.some((x) => new Date(x.s).getHours() < 5) },
  { icon: '🌅', name: 'Early Bird', desc: 'Start a session between 5am and 8am', test: (c) => c.sessions.some((x) => { const h = new Date(x.s).getHours(); return h >= 5 && h < 8; }) },
  { icon: '🏃', name: 'Marathon', desc: 'A single session of 4 hours or more', test: (c) => c.sessions.some((x) => x.e - x.s >= 4 * 3600000) },
  { icon: '🎲', name: 'Variety Pack', desc: '5 different games within one week', test: (c) => c.sessions.some((x) => new Set(c.sessions.filter((y) => y.s >= x.s && y.s < x.s + 7 * DAY_MS).map((y) => y.id)).size >= 5) },
  { icon: '🔁', name: 'One More Round', desc: '3 sessions of the same game in one day', test: (c) => { const n = {}; for (const x of c.sessions) { const k = `${dayKey(x.s)}|${x.id}`; n[k] = (n[k] || 0) + 1; if (n[k] >= 3) return true; } return false; } },
  { icon: '💎', name: 'Dedicated', desc: '50 hours in a single game', test: (c) => c.perGame.some((g) => g.sec >= 50 * 3600) },
  { icon: '🔥', name: 'Week Warrior', desc: 'Play 7 days in a row', test: (c) => c.streak.best >= 7 },
  { icon: '📚', name: 'Collector', desc: 'Have 25 or more games in your library', test: (c) => c.gameCount >= 25 },
  { icon: '🧭', name: 'Explorer', desc: 'Play games from 3 different launchers', test: (c) => c.sources.size >= 3 },

  // Total time
  { icon: '⏱️', name: 'Warming Up', desc: '1 hour played in total', test: (c) => c.totalSec >= 3600 },
  { icon: '🕹️', name: 'Getting Into It', desc: '10 hours played in total', test: (c) => c.totalSec >= 10 * 3600 },
  { icon: '🪝', name: 'Hooked', desc: '50 hours played in total', test: (c) => c.totalSec >= 50 * 3600 },
  { icon: '💯', name: 'Centurion', desc: '100 hours played in total', test: (c) => c.totalSec >= 100 * 3600 },
  { icon: '🏆', name: 'Veteran', desc: '250 hours played in total', test: (c) => c.totalSec >= 250 * 3600 },
  { icon: '👑', name: 'Legend', desc: '500 hours played in total', test: (c) => c.totalSec >= 500 * 3600 },
  { icon: '🌌', name: 'Touch Grass Eventually', desc: '1,000 hours played in total', test: (c) => c.totalSec >= 1000 * 3600 },

  // One game
  { icon: '❤️', name: 'Favourite', desc: '10 hours in a single game', test: (c) => c.perGame.some((g) => g.sec >= 10 * 3600) },
  { icon: '💍', name: 'Committed', desc: '100 hours in a single game', test: (c) => c.perGame.some((g) => g.sec >= 100 * 3600) },
  { icon: '🗿', name: 'One With The Game', desc: '300 hours in a single game', test: (c) => c.perGame.some((g) => g.sec >= 300 * 3600) },
  { icon: '🥇', name: 'Main Character', desc: 'One game makes up 70%+ of your time (10h+ total)', test: (c) => c.totalSec >= 10 * 3600 && c.perGame.length > 1 && c.perGame[0].sec / c.totalSec >= 0.7 },
  { icon: '🎭', name: 'Well Rounded', desc: 'Play 5 different games for at least 1 hour each', test: (c) => c.perGame.filter((g) => g.sec >= 3600).length >= 5 },
  { icon: '🌈', name: 'Game Hopper', desc: 'Play 10 different games', test: (c) => c.perGame.length >= 10 },
  { icon: '🎪', name: 'Jack Of All Trades', desc: 'Play 20 different games', test: (c) => c.perGame.length >= 20 },

  // Session length
  { icon: '☕', name: 'Coffee Break', desc: 'A session of 1 hour or more', test: (c) => c.sessions.some((x) => x.e - x.s >= 3600000) },
  { icon: '🍿', name: 'Binge', desc: 'A single session of 2 hours or more', test: (c) => c.sessions.some((x) => x.e - x.s >= 2 * 3600000) },
  { icon: '🏔️', name: 'Ultra Marathon', desc: 'A single session of 8 hours or more', test: (c) => c.sessions.some((x) => x.e - x.s >= 8 * 3600000) },
  { icon: '⚡', name: 'Quick Fix', desc: 'A session between 1 and 10 minutes', test: (c) => c.sessions.some((x) => !x.live && x.e - x.s >= 60000 && x.e - x.s <= 10 * 60000) },

  // Number of sessions
  { icon: '🔟', name: 'Regular', desc: '10 sessions recorded', test: (c) => c.sessions.length >= 10 },
  { icon: '🎯', name: 'Creature Of Habit', desc: '50 sessions recorded', test: (c) => c.sessions.length >= 50 },
  { icon: '🔄', name: 'Loop', desc: '200 sessions recorded', test: (c) => c.sessions.length >= 200 },

  // Streaks
  { icon: '✨', name: 'On A Roll', desc: 'Play 3 days in a row', test: (c) => c.streak.best >= 3 },
  { icon: '🌋', name: 'Fortnight', desc: 'Play 14 days in a row', test: (c) => c.streak.best >= 14 },
  { icon: '🗓️', name: 'Monthly', desc: 'Play 30 days in a row', test: (c) => c.streak.best >= 30 },
  { icon: '🔥', name: 'Still Burning', desc: 'Be on a streak of 3 days or more right now', test: (c) => c.streak.current >= 3 },

  // Big days
  { icon: '📅', name: 'Big Day', desc: 'Play 4 hours or more in one day', test: (c) => c.maxDaySec >= 4 * 3600 },
  { icon: '🥵', name: 'Cancelled Plans', desc: 'Play 8 hours or more in one day', test: (c) => c.maxDaySec >= 8 * 3600 },
  { icon: '🛌', name: 'Sleep Is Optional', desc: 'Play 12 hours or more in one day', test: (c) => c.maxDaySec >= 12 * 3600 },
  { icon: '🎰', name: 'Triple Threat', desc: 'Play 3 different games in one day', test: (c) => c.maxGamesInDay >= 3 },
  { icon: '🍱', name: 'Buffet', desc: 'Play 5 different games in one day', test: (c) => c.maxGamesInDay >= 5 },

  // Time of day / week
  { icon: '🌙', name: 'Witching Hour', desc: 'Be playing at 3am', test: (c) => c.hoursPlayed[3] > 0 },
  { icon: '🍜', name: 'Lunch Break', desc: 'Start a session between 12 and 1pm', test: (c) => c.sessions.some((x) => new Date(x.s).getHours() === 12) },
  { icon: '🌆', name: 'After Work', desc: 'Start a session between 5 and 8pm', test: (c) => c.sessions.some((x) => { const h = new Date(x.s).getHours(); return h >= 17 && h < 20; }) },
  { icon: '🎉', name: 'Weekend Warrior', desc: 'Play on 4 different weekend days', test: (c) => c.weekendDays >= 4 },
  { icon: '🍻', name: 'Friday Night', desc: 'Start a session on a Friday after 8pm', test: (c) => c.sessions.some((x) => { const d = new Date(x.s); return d.getDay() === 5 && d.getHours() >= 20; }) },
  { icon: '😴', name: 'Lazy Sunday', desc: 'Play 3 hours or more on a Sunday', test: (c) => c.sundayMaxSec >= 3 * 3600 },
  { icon: '📆', name: 'Every Day Of The Week', desc: 'Play on all 7 days of the week', test: (c) => c.weekdaysSeen.size >= 7 },
  { icon: '🌍', name: 'All Hours', desc: 'Be playing during 12 different hours of the day', test: (c) => c.hoursPlayed.filter((s) => s > 0).length >= 12 },

  // Library
  { icon: '🏛️', name: 'Hoarder', desc: 'Have 40 or more games in your library', test: (c) => c.gameCount >= 40 },
  { icon: '📦', name: 'Pile Of Shame', desc: 'Have 10 or more games you have never played', test: (c) => c.gameCount - c.perGame.length >= 10 },
  { icon: '🧹', name: 'Pile Reducer', desc: 'Play 10 games and have fewer than 5 untouched', test: (c) => c.perGame.length >= 10 && c.gameCount - c.perGame.length < 5 },
  { icon: '🗺️', name: 'Launcher Tourist', desc: 'Play games from 4 different launchers', test: (c) => c.sources.size >= 4 },
  { icon: '✨', name: 'Gacha Gremlin', desc: 'Play 2 different gacha games (Genshin, HSR, ZZZ, Wuthering Waves)', test: (c) => c.gachaPlayed >= 2 },
  { icon: '🌠', name: 'Pull Addict', desc: 'Play 100 hours across gacha games', test: (c) => c.gachaSec >= 100 * 3600 },
];

// Game-specific badges. They only show up if that game is in your library.
// `h` = hours needed in that game; `fn` = a custom check (gets the context and that game's sessions)
const gb = (game, icon, name, desc, h, fn) => ({
  game, icon, name, desc,
  test: (c) => (fn ? fn(c, c.sessionsOf(game)) : c.secOf(game) >= h * 3600),
});
const sessLen = (x) => x.e - x.s;
const GAME_BADGES = [
  // Honkai: Star Rail
  gb(/star rail/i, '🚂', 'All Aboard The Express', 'Play Honkai: Star Rail for 1 hour', 1),
  gb(/star rail/i, '🌟', 'Trailblazer', 'Play Honkai: Star Rail for 25 hours', 25),
  gb(/star rail/i, '🪐', 'Stellaron Hunter', 'Play Honkai: Star Rail for 100 hours', 100),
  gb(/star rail/i, '⚡', 'Trailblaze Power Spent', 'Play Honkai: Star Rail on 7 different days', 0, (c, s) => new Set(s.map((x) => dayKey(x.s))).size >= 7),
  // Wuthering Waves
  gb(/wuthering/i, '🌊', 'Rover Awakens', 'Play Wuthering Waves for 1 hour', 1),
  gb(/wuthering/i, '🔊', 'Resonator', 'Play Wuthering Waves for 25 hours', 25),
  gb(/wuthering/i, '🎼', 'Rover Of Huanglong', 'Play Wuthering Waves for 100 hours', 100),
  gb(/wuthering/i, '📻', 'Echo Collector', 'Play Wuthering Waves on 7 different days', 0, (c, s) => new Set(s.map((x) => dayKey(x.s))).size >= 7),
  // Genshin / ZZZ
  gb(/genshin/i, '🧚', "Paimon's Best Friend", 'Play Genshin Impact for 50 hours', 50),
  gb(/zenless/i, '📼', 'Proxy', 'Play Zenless Zone Zero for 25 hours', 25),
  // Overwatch
  gb(/overwatch/i, '🤠', "It's High Noon", 'Start an Overwatch session at 12pm', 0, (c, s) => s.some((x) => new Date(x.s).getHours() === 12)),
  gb(/overwatch/i, '🎬', 'Play Of The Game', 'An Overwatch session of 2 hours or more', 0, (c, s) => s.some((x) => sessLen(x) >= 2 * 3600000)),
  gb(/overwatch/i, '🦸', 'Heroes Never Die', 'Play Overwatch for 100 hours', 100),
  // Rocket League
  gb(/rocket league/i, '🚀', 'What A Save!', 'Play Rocket League for 5 hours', 5),
  gb(/rocket league/i, '🔇', 'Chat Disabled', 'Play Rocket League for 50 hours', 50),
  gb(/rocket league/i, '🧮', 'Calculated.', 'A Rocket League session of 2 hours or more', 0, (c, s) => s.some((x) => sessLen(x) >= 2 * 3600000)),
  // Fortnite
  gb(/fortnite/i, '🏆', 'Victory Royale', 'Play Fortnite for 5 hours', 5),
  gb(/fortnite/i, '🕺', 'Default Dance', 'Play Fortnite for 25 hours', 25),
  // Valve
  gb(/portal 2/i, '🎂', 'The Cake Is Not A Lie', 'Play Portal 2 for 6 hours', 6),
  gb(/portal 2/i, '🧪', 'Thinking With Portals', 'Play Portal 2 for 1 hour', 1),
  gb(/team fortress/i, '🩺', 'Medic!', 'Play Team Fortress 2 for 5 hours', 5),
  gb(/team fortress/i, '🥪', 'Sandvich Break', 'A Team Fortress 2 session of 1 hour or more', 0, (c, s) => s.some((x) => sessLen(x) >= 3600000)),
  // Terraria (counts tModLoader too)
  gb(/terraria|tmodloader/i, '👁️', 'Eye Of Cthulhu', 'Play Terraria for 5 hours', 5),
  gb(/terraria|tmodloader/i, '🧱', 'Hardmode Unlocked', 'Play Terraria for 40 hours', 40),
  gb(/terraria|tmodloader/i, '🌙', 'Moon Lord', 'Play Terraria for 150 hours', 150),
  // Horror / co-op
  gb(/phasmophobia/i, '👻', 'Is Anyone There?', 'Play Phasmophobia between midnight and 5am', 0, (c, s) => s.some((x) => new Date(x.s).getHours() < 5)),
  gb(/phasmophobia/i, '🔦', 'Ghost Hunter', 'Play Phasmophobia for 10 hours', 10),
  gb(/lethal company/i, '📦', 'Quota Met', 'Play Lethal Company for 5 hours', 5),
  gb(/lethal company/i, '🏅', 'Employee Of The Month', 'Play Lethal Company for 20 hours', 20),
  // Rhythm / sports / sim
  gb(/beat saber/i, '🎶', 'Cut On The Beat', 'Play Beat Saber for 2 hours', 2),
  gb(/beat saber/i, '🥽', 'Full Combo', 'A Beat Saber session of 1 hour or more', 0, (c, s) => s.some((x) => sessLen(x) >= 3600000)),
  gb(/football manager/i, '📋', 'Just One More Match', 'A Football Manager session of 3 hours or more', 0, (c, s) => s.some((x) => sessLen(x) >= 3 * 3600000)),
  gb(/football manager/i, '🧢', 'Gaffer', 'Play Football Manager for 50 hours', 50),
  gb(/efootball/i, '⚽', 'Extra Time', 'An eFootball session of 2 hours or more', 0, (c, s) => s.some((x) => sessLen(x) >= 2 * 3600000)),
  gb(/skate\./i, '🛹', 'Sick Line', 'Play skate. for 5 hours', 5),
  gb(/skate\./i, '🤕', 'Bail', 'A skate. session under 10 minutes', 0, (c, s) => s.some((x) => !x.live && sessLen(x) <= 10 * 60000)),
  gb(/cities: skylines/i, '🚦', 'Traffic Jam', 'Play Cities: Skylines for 10 hours', 10),
  gb(/cities: skylines/i, '🏙️', 'Mayor', 'Play Cities: Skylines for 50 hours', 50),
  gb(/hearts of iron/i, '🗺️', 'Paint The Map', 'Play Hearts of Iron IV for 25 hours', 25),
  gb(/hearts of iron/i, '🌳', 'Focus Tree', 'Play Hearts of Iron IV for 100 hours', 100),
  // Indie / party
  gb(/deltarune/i, '🎤', '[[Big Shot]]', 'Play DELTARUNE for 2 hours', 2),
  gb(/deltarune/i, '🕳️', 'Kris, Where The Hell Are We?', 'Play DELTARUNE for 5 hours', 5),
  gb(/golf with your friends/i, '⛳', 'Fore!', 'Play Golf With Your Friends for 5 hours', 5),
  gb(/golf with your friends/i, '🕳️', 'Hole In One', 'A Golf With Your Friends session under 10 minutes', 0, (c, s) => s.some((x) => !x.live && sessLen(x) <= 10 * 60000)),
  gb(/supermarket together/i, '🛒', 'Customer Is Always Right', 'Play Supermarket Together for 5 hours', 5),
  gb(/orange juice/i, '🍊', 'Orange You Glad', 'Play 100% Orange Juice for 10 hours', 10),
  gb(/rounds/i, '🔫', 'Last Round Standing', 'Play ROUNDS for 5 hours', 5),
  gb(/minecraft dungeons/i, '💥', 'Aw Man', 'Play Minecraft Dungeons II for 10 hours', 10),
];

// Everything the Stats page and the badges are worked out from
function statsData() {
  const games = items.filter((i) => i.type === 'game');
  const byId = Object.fromEntries(games.map((g) => [g.id, g]));
  const sessions = allSessions().filter((x) => byId[x.id]);
  const perGame = games.map((g) => ({ g, sec: playSeconds(g.id) })).filter((x) => x.sec > 0).sort((a, b) => b.sec - a.sec);
  const totalSec = perGame.reduce((n, x) => n + x.sec, 0);
  const st = streaks(sessions);
  const ctx = { sessions, totalSec, perGame, streak: st, gameCount: games.length, sources: new Set(sessions.map((x) => byId[x.id].source)) };
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
  return { games, byId, sessions, perGame, totalSec, st, ctx, daySec };
}

// Every badge that applies to this library, with whether it is unlocked
function evaluateBadges(d) {
  const owned = GAME_BADGES.filter((b) => d.games.some((g) => b.game.test(g.name)));
  return [...BADGES, ...owned].map((b) => ({ ...b, got: b.test(d.ctx) }));
}

function renderStats() {
  const data = statsData();
  const { games, byId, sessions, perGame, totalSec, st, ctx, daySec } = data;
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
  const gameRows = perGame.slice(0, 20).map(({ g, sec }) => {
    const gs = sessions.filter((x) => x.id === g.id);
    const first = gs.length ? Math.min(...gs.map((x) => x.s)) : 0;
    const last = (prefs.recents || {})[g.id] || (gs.length ? Math.max(...gs.map((x) => x.e)) : 0);
    const lng = gs.reduce((m, x) => Math.max(m, x.e - x.s), 0) / 1000;
    const avg = gs.length ? gs.reduce((n, x) => n + (x.e - x.s) / 1000, 0) / gs.length : 0;
    return `<tr data-open="${esc(g.id)}" title="Open ${esc(g.name)}">
      <td class="g-name">${esc(g.name)}${isRunning(g.id) ? ' <span class="live-dot" title="Playing now"></span>' : ''}</td>
      <td>${fmtHours(sec)}</td><td>${gs.length || '–'}</td><td>${avg ? fmtDur(avg) : '–'}</td><td>${lng ? fmtDur(lng) : '–'}</td>
      <td>${first ? shortDate(first) : '–'}</td><td>${last ? timeAgo(last) : '–'}</td><td>${Math.round((sec / totalSec) * 100)}%</td></tr>`;
  }).join('');

  const badges = evaluateBadges(data).sort((a, b) => b.got - a.got); // unlocked ones first
  const badgeHtml = badges.map((b) => `<div class="badge-card${b.got ? ' got' : ''}" title="${esc(b.desc)}"><div class="badge-icon">${b.icon}</div><div><div class="badge-name">${esc(b.name)}</div><div class="badge-desc">${esc(b.got ? b.desc : `🔒 ${b.desc}`)}</div></div></div>`).join('');

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
      <div class="stat-card"><div class="stat-num">${fmtHours(totalSec)}</div><div class="stat-label">Total playtime</div></div>
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

    <div class="section"><div class="section-head"><h2>Badges · ${badges.filter((b) => b.got).length}/${badges.length}</h2></div><div class="badge-grid">${badgeHtml}</div></div>`;
}

// Little stat chips for one game, shown on its page
function gameStatsHtml(it) {
  const sec = playSeconds(it.id);
  const gs = allSessions().filter((x) => x.id === it.id);
  if (sec < 60 && !gs.length) return '';
  const games = items.filter((i) => i.type === 'game');
  const all = games.map((g) => ({ id: g.id, sec: playSeconds(g.id) })).filter((x) => x.sec > 0).sort((a, b) => b.sec - a.sec);
  const total = all.reduce((n, x) => n + x.sec, 0);
  const rank = all.findIndex((x) => x.id === it.id) + 1;
  const lens = gs.map((x) => (x.e - x.s) / 1000);
  const first = gs.length ? Math.min(...gs.map((x) => x.s)) : 0;
  const weekSec = gs.filter((x) => x.s >= startOfDay(Date.now()) - 6 * DAY_MS).reduce((n, x) => n + (x.e - x.s) / 1000, 0);
  const chip = (num, label) => `<div class="dstat"><b>${num}</b><small>${label}</small></div>`;
  return [
    chip(fmtHours(sec), 'Total playtime'),
    gs.length ? chip(gs.length, gs.length === 1 ? 'Session' : 'Sessions') : '',
    lens.length ? chip(fmtDur(lens.reduce((a, b) => a + b, 0) / lens.length), 'Average session') : '',
    lens.length ? chip(fmtDur(Math.max(...lens)), 'Longest session') : '',
    first ? chip(new Date(first).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }), 'First tracked') : '',
    weekSec >= 60 ? chip(fmtHours(weekSec), 'Last 7 days') : '',
    rank && total ? chip(`#${rank}`, `Most played · ${Math.round((sec / total) * 100)}% of your time`) : '',
  ].join('');
}
