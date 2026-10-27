// Advancements: the things you can unlock in Nexus. They are worked out from your sessions, your total hours and your
// Steam achievements, so nothing here needs to be stored: it is all calculated when the Stats page opens.
//
//   ladder(...)   a series of tiers for one number (hours, streak days, ...). Shown as one card with a progress bar.
//   SINGLES       one-off advancements, some of them secret until you unlock them.
//   GAME_ADVS     advancements for one particular game; they only appear if that game is in your library.

const RARITY = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
const ADV_CATS = [['all', 'All'], ['time', 'Playtime'], ['habits', 'Habits'], ['library', 'Library'], ['trophies', 'Trophies'], ['games', 'Games'], ['secret', 'Secret']];
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const tierRarity = (i, n) => { const x = n <= 1 ? 0 : i / (n - 1); return x < 0.3 ? 'common' : x < 0.65 ? 'rare' : x < 0.9 ? 'epic' : 'legendary'; };

const LADDERS = [];
// steps: [goal, name, description] in rising order. `value(c)` is the number being climbed.
const ladder = (id, title, icon, cat, unit, value, steps) => LADDERS.push({ id, title, icon, cat, unit, value, steps });

// ---------- Ladders ----------
ladder('hours', 'Time Sink', '⏱️', 'time', 'h', (c) => c.totalSec / 3600, [
  [10, 'Getting Into It', '10 hours across all your games'],
  [50, 'Hooked', '50 hours across all your games'],
  [100, 'Centurion', '100 hours across all your games'],
  [250, 'Veteran', '250 hours across all your games'],
  [500, 'Legend', '500 hours across all your games'],
  [1000, 'Touch Grass Eventually', '1,000 hours across all your games'],
  [2500, 'Living Room Resident', '2,500 hours across all your games'],
  [5000, 'Hall Of Fame', '5,000 hours across all your games'],
]);
ladder('onegame', 'One True Game', '❤️', 'time', 'h', (c) => (c.perGame[0] ? c.perGame[0].sec / 3600 : 0), [
  [10, 'Favourite', '10 hours in a single game'],
  [100, 'Committed', '100 hours in a single game'],
  [300, 'One With The Game', '300 hours in a single game'],
  [1000, 'Thousand-Yard Stare', '1,000 hours in a single game'],
  [2000, 'Part Of The Furniture', '2,000 hours in a single game'],
]);
ladder('streak', 'On Fire', '🔥', 'habits', 'days', (c) => c.streak.best, [
  [3, 'On A Roll', 'Play 3 days in a row'],
  [7, 'Week Warrior', 'Play 7 days in a row'],
  [14, 'Fortnight', 'Play 14 days in a row'],
  [30, 'Monthly', 'Play 30 days in a row'],
  [100, 'Unstoppable', 'Play 100 days in a row'],
]);
ladder('session', 'Long Haul', '☕', 'habits', 'h', (c) => c.longestSessionH, [
  [1, 'Coffee Break', 'A single session of 1 hour'],
  [2, 'Binge', 'A single session of 2 hours'],
  [4, 'Marathon', 'A single session of 4 hours'],
  [8, 'Ultra Marathon', 'A single session of 8 hours'],
]);
ladder('bigday', 'Big Day', '📅', 'habits', 'h', (c) => c.maxDaySec / 3600, [
  [4, 'Big Day', 'Play 4 hours in one day'],
  [8, 'Cancelled Plans', 'Play 8 hours in one day'],
  [12, 'Sleep Is Optional', 'Play 12 hours in one day'],
]);
ladder('sessions', 'Creature Of Habit', '🔁', 'habits', '', (c) => c.sessions.length, [
  [10, 'Regular', '10 sessions recorded'],
  [50, 'Habit Forming', '50 sessions recorded'],
  [200, 'Loop', '200 sessions recorded'],
  [1000, 'No Off Switch', '1,000 sessions recorded'],
]);
ladder('library', 'Collector', '📚', 'library', '', (c) => c.gameCount, [
  [10, 'Starter Shelf', '10 games in your library'],
  [25, 'Collector', '25 games in your library'],
  [40, 'Hoarder', '40 games in your library'],
  [100, 'Digital Dragon', '100 games in your library'],
]);
ladder('played', 'Game Hopper', '🌈', 'library', '', (c) => c.perGame.length, [
  [5, 'Sampler', 'Play 5 different games'],
  [10, 'Game Hopper', 'Play 10 different games'],
  [20, 'Jack Of All Trades', 'Play 20 different games'],
  [50, 'Has Seen Everything', 'Play 50 different games'],
]);
ladder('ach', 'Trophy Shelf', '🏅', 'trophies', '', (c) => c.achUnlocked, [
  [10, 'Shiny Things', 'Unlock 10 Steam achievements'],
  [50, 'Hunter', 'Unlock 50 Steam achievements'],
  [100, 'Achievement Addict', 'Unlock 100 Steam achievements'],
  [250, 'Trophy Room', 'Unlock 250 Steam achievements'],
  [500, 'Museum Curator', 'Unlock 500 Steam achievements'],
  [1000, 'Gotta Catch Em All', 'Unlock 1,000 Steam achievements'],
]);
ladder('perfect', 'Completionist', '💎', 'trophies', '', (c) => c.achPerfect, [
  [1, 'Platinum', '100% the achievements of a game'],
  [3, 'Completionist', '100% the achievements of 3 games'],
  [10, 'Perfectionist', '100% the achievements of 10 games'],
  [25, 'Needs Help', '100% the achievements of 25 games'],
]);

// ---------- One-off advancements ----------
// r: rarity. secret: shown as a mystery until unlocked (`hint` is the clue). prog: optional [current, goal, unit] for a bar.
const hourOf = (x) => new Date(x.s).getHours();
const SINGLES = [
  // Habits
  { icon: '🦉', name: 'Night Owl', desc: 'Start a session between midnight and 5am', cat: 'habits', r: 'common', test: (c) => c.sessions.some((x) => hourOf(x) < 5) },
  { icon: '🌅', name: 'Early Bird', desc: 'Start a session between 5am and 8am', cat: 'habits', r: 'common', test: (c) => c.sessions.some((x) => hourOf(x) >= 5 && hourOf(x) < 8) },
  { icon: '🍜', name: 'Lunch Break', desc: 'Start a session between 12 and 1pm', cat: 'habits', r: 'common', test: (c) => c.sessions.some((x) => hourOf(x) === 12) },
  { icon: '🌆', name: 'After Work', desc: 'Start a session between 5 and 8pm', cat: 'habits', r: 'common', test: (c) => c.sessions.some((x) => hourOf(x) >= 17 && hourOf(x) < 20) },
  { icon: '🍻', name: 'Friday Night', desc: 'Start a session on a Friday after 8pm', cat: 'habits', r: 'common', test: (c) => c.sessions.some((x) => new Date(x.s).getDay() === 5 && hourOf(x) >= 20) },
  { icon: '😴', name: 'Lazy Sunday', desc: 'Play 3 hours on a Sunday', cat: 'habits', r: 'common', test: (c) => c.sundayMaxSec >= 3 * 3600, prog: (c) => [c.sundayMaxSec / 3600, 3, 'h'] },
  { icon: '🎉', name: 'Weekend Warrior', desc: 'Play on 4 different weekend days', cat: 'habits', r: 'common', test: (c) => c.weekendDays >= 4, prog: (c) => [c.weekendDays, 4, ''] },
  { icon: '📆', name: 'Every Day Of The Week', desc: 'Play on all 7 days of the week', cat: 'habits', r: 'rare', test: (c) => c.weekdaysSeen.size >= 7, prog: (c) => [c.weekdaysSeen.size, 7, ''] },
  { icon: '🌍', name: 'All Hours', desc: 'Be playing during 12 different hours of the day', cat: 'habits', r: 'epic', test: (c) => c.hoursPlayed.filter((s) => s > 0).length >= 12, prog: (c) => [c.hoursPlayed.filter((s) => s > 0).length, 12, ''] },
  { icon: '⚡', name: 'Quick Fix', desc: 'A session between 1 and 10 minutes', cat: 'habits', r: 'common', test: (c) => c.sessions.some((x) => !x.live && x.e - x.s >= 60000 && x.e - x.s <= 600000) },
  { icon: '🎰', name: 'Triple Threat', desc: 'Play 3 different games in one day', cat: 'habits', r: 'rare', test: (c) => c.maxGamesInDay >= 3, prog: (c) => [c.maxGamesInDay, 3, ''] },
  { icon: '🍱', name: 'Buffet', desc: 'Play 5 different games in one day', cat: 'habits', r: 'epic', test: (c) => c.maxGamesInDay >= 5, prog: (c) => [c.maxGamesInDay, 5, ''] },
  { icon: '🎲', name: 'Variety Pack', desc: '5 different games within one week', cat: 'habits', r: 'rare', test: (c) => c.sessions.some((x) => new Set(c.sessions.filter((y) => y.s >= x.s && y.s < x.s + 7 * DAY_MS).map((y) => y.id)).size >= 5) },
  { icon: '🔂', name: 'One More Round', desc: '3 sessions of the same game in one day', cat: 'habits', r: 'common', test: (c) => { const n = {}; for (const x of c.sessions) { const k = `${dayKey(x.s)}|${x.id}`; n[k] = (n[k] || 0) + 1; if (n[k] >= 3) return true; } return false; } },
  { icon: '🌱', name: 'Fresh Install Energy', desc: 'Start 3 brand-new games within a week', cat: 'habits', r: 'rare', test: (c) => c.newGameWeek >= 3, prog: (c) => [c.newGameWeek, 3, ''] },
  // Library
  { icon: '🧭', name: 'Explorer', desc: 'Play games from 3 different launchers', cat: 'library', r: 'common', test: (c) => c.sources.size >= 3, prog: (c) => [c.sources.size, 3, ''] },
  { icon: '🗺️', name: 'Launcher Tourist', desc: 'Play games from 4 different launchers', cat: 'library', r: 'rare', test: (c) => c.sources.size >= 4, prog: (c) => [c.sources.size, 4, ''] },
  { icon: '🎓', name: 'Multi-Class', desc: 'Put 10 hours into games on 3 different launchers', cat: 'library', r: 'epic', test: (c) => c.sourcesWith10h >= 3, prog: (c) => [c.sourcesWith10h, 3, ''] },
  { icon: '📦', name: 'Pile Of Shame', desc: 'Have 10 or more games you have never played', cat: 'library', r: 'common', test: (c) => c.gameCount - c.perGame.length >= 10, prog: (c) => [c.gameCount - c.perGame.length, 10, ''] },
  { icon: '🧹', name: 'Pile Reducer', desc: 'Play 10 games and keep fewer than 5 untouched', cat: 'library', r: 'epic', test: (c) => c.perGame.length >= 10 && c.gameCount - c.perGame.length < 5 },
  { icon: '🎭', name: 'Well Rounded', desc: 'Play 5 different games for at least an hour each', cat: 'library', r: 'rare', test: (c) => c.perGame.filter((g) => g.sec >= 3600).length >= 5, prog: (c) => [c.perGame.filter((g) => g.sec >= 3600).length, 5, ''] },
  { icon: '🎬', name: 'Main Character', desc: 'One game makes up 70% or more of your time (10h+ in total)', cat: 'library', r: 'rare', test: (c) => c.totalSec >= 10 * 3600 && c.perGame.length > 1 && c.perGame[0].sec / c.totalSec >= 0.7 },
  { icon: '✨', name: 'Gacha Gremlin', desc: 'Play 2 different gacha games (Genshin, Star Rail, ZZZ, Wuthering Waves)', cat: 'library', r: 'rare', test: (c) => c.gachaPlayed >= 2, prog: (c) => [c.gachaPlayed, 2, ''] },
  { icon: '🌠', name: 'Pull Addict', desc: 'Play 100 hours across gacha games', cat: 'library', r: 'epic', test: (c) => c.gachaSec >= 100 * 3600, prog: (c) => [c.gachaSec / 3600, 100, 'h'] },
  // Secret ones
  { icon: '🌙', name: 'Witching Hour', desc: 'Be playing at 3am', cat: 'secret', r: 'rare', secret: true, hint: 'Some games are best played when everyone else is asleep', test: (c) => c.hoursPlayed[3] > 0 },
  { icon: '🌄', name: 'One Last Game', desc: 'Keep a session of 30 minutes or more going past 2am', cat: 'secret', r: 'epic', secret: true, hint: 'It is later than you think', test: (c) => c.sessions.some((x) => !x.live && x.e - x.s >= 30 * 60000 && new Date(x.e).getHours() >= 2 && new Date(x.e).getHours() < 6) },
  { icon: '🧟', name: 'Back From The Dead', desc: 'Return to a game after 30 days or more away from it', cat: 'secret', r: 'epic', secret: true, hint: 'Old friends are always there', test: (c) => c.comeback },
  { icon: '🔌', name: 'Have You Tried Turning It Off And On Again?', desc: 'Restart a game within 5 minutes of closing it', cat: 'secret', r: 'rare', secret: true, hint: 'Sometimes it just needs a restart', test: (c) => c.restart },
  { icon: '🚪', name: 'Wrong Game', desc: 'Close 5 games within 2 minutes of starting them', cat: 'secret', r: 'rare', secret: true, hint: 'That was not the one you meant to open', test: (c) => c.quickQuits >= 5, prog: (c) => [c.quickQuits, 5, ''] },
  { icon: '🏝️', name: 'Touch Grass (Briefly)', desc: 'Take a break of 3 days or more after playing 7 days in a row', cat: 'secret', r: 'epic', secret: true, hint: 'Rest is part of the grind', test: (c) => c.breakAfterStreak },
];

// ---------- Advancements for one game ----------
// `h` = hours needed in that game; `fn` = a custom check (gets the context and that game's sessions)
const gb = (game, icon, name, desc, h, fn) => ({
  game, icon, name, desc, cat: 'games', r: h >= 100 ? 'epic' : h >= 25 ? 'rare' : 'common',
  test: (c) => (fn ? fn(c, c.sessionsOf(game)) : c.secOf(game) >= h * 3600),
  prog: fn ? null : (c) => [c.secOf(game) / 3600, h, 'h'],
});
const sessLen = (x) => x.e - x.s;
const GAME_ADVS = [
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
  gb(/overwatch/i, '🛡️', 'Worth The Wait', 'Play Overwatch for 500 hours', 500),
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
  gb(/counter-strike/i, '💣', 'Bomb Has Been Planted', 'Play Counter-Strike for 100 hours', 100),
  // Terraria (counts tModLoader too)
  gb(/terraria|tmodloader/i, '👁️', 'Eye Of Cthulhu', 'Play Terraria for 5 hours', 5),
  gb(/terraria|tmodloader/i, '🧱', 'Hardmode Unlocked', 'Play Terraria for 40 hours', 40),
  gb(/terraria|tmodloader/i, '🌙', 'Moon Lord', 'Play Terraria for 150 hours', 150),
  // Minecraft
  gb(/^minecraft(?! dungeons)/i, '⛏️', 'Punching Trees', 'Play Minecraft for 1 hour', 1),
  gb(/^minecraft(?! dungeons)/i, '💎', 'Diamonds!', 'Play Minecraft for 50 hours', 50),
  gb(/^minecraft(?! dungeons)/i, '🐉', 'The End?', 'Play Minecraft for 200 hours', 200),
  // Roblox
  gb(/^roblox/i, '🧱', 'Oof', 'Play Roblox for 10 hours', 10),
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
  gb(/ea sports fc|fifa/i, '🥅', 'Top Bins', 'Play EA SPORTS FC for 20 hours', 20),
  gb(/f1 ?2\d|f1 manager/i, '🏁', 'Lights Out', 'Play F1 for 10 hours', 10),
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

// ---------- Work out what is unlocked ----------
let achSummary = []; // [{ id, name, total, unlocked }] for Steam games, filled by loadAchSummary()
async function loadAchSummary() {
  try { achSummary = await window.api.achievementsSummary(); } catch { achSummary = []; }
  return achSummary;
}

// Numbers the advancements need beyond what the Stats page already has
function advContext(d) {
  const c = d.ctx;
  const sessions = d.sessions;
  c.longestSessionH = sessions.reduce((m, x) => Math.max(m, x.e - x.s), 0) / 3600000;
  c.achUnlocked = achSummary.reduce((n, g) => n + g.unlocked, 0);
  c.achPerfect = achSummary.filter((g) => g.total >= 5 && g.unlocked === g.total).length;
  c.quickQuits = sessions.filter((x) => !x.live && x.e - x.s < 120000).length;

  // Gaps between sessions of the same game
  c.comeback = false; c.restart = false;
  const byGame = {};
  for (const x of sessions) (byGame[x.id] = byGame[x.id] || []).push(x);
  for (const list of Object.values(byGame)) {
    list.sort((a, b) => a.s - b.s);
    for (let i = 1; i < list.length; i++) {
      const gap = list[i].s - list[i - 1].e;
      if (list[i - 1].e - list[i - 1].s >= 60000 && gap >= 0) {
        if (gap >= 30 * DAY_MS) c.comeback = true;
        if (gap <= 5 * 60000) c.restart = true;
      }
    }
  }

  // Games first opened inside one week (ones you clearly played before Nexus don't count as new)
  const firsts = Object.entries(byGame)
    .filter(([id]) => totalSeconds(id) - playSeconds(id) < 3600)
    .map(([, list]) => list[0].s).sort((a, b) => a - b);
  c.newGameWeek = firsts.reduce((best, t, i) => Math.max(best, firsts.filter((u, j) => j >= i && u < t + 7 * DAY_MS).length), 0);

  // 3+ days off after a 7-day streak
  const days = [...new Set(sessions.map((x) => dayKey(x.s)))].sort().map((k) => new Date(`${k}T12:00:00`).getTime());
  let run = 1; c.breakAfterStreak = false;
  for (let i = 1; i < days.length; i++) {
    const gap = Math.round((days[i] - days[i - 1]) / DAY_MS);
    if (gap === 1) run += 1;
    else { if (run >= 7 && gap >= 4) c.breakAfterStreak = true; run = 1; }
  }
  if (run >= 7 && days.length && startOfDay(Date.now()) - days[days.length - 1] >= 3 * DAY_MS) c.breakAfterStreak = true;

  // Hours per launcher (a launcher counts once you have put 10 hours into it)
  const perSource = {};
  for (const { g, sec } of d.perGame) perSource[g.source] = (perSource[g.source] || 0) + sec;
  c.sourcesWith10h = Object.values(perSource).filter((s) => s >= 10 * 3600).length;
  return c;
}

// Every advancement that applies to this library, in one flat list, each with `got` and `cur` (current value for the bar)
function evaluateBadges(d) {
  const c = advContext(d);
  const list = [];
  for (const l of LADDERS) {
    const cur = l.value(c);
    l.steps.forEach(([goal, name, desc], i) => list.push({
      id: `${l.id}:${goal}`, icon: l.icon, name, desc, cat: l.cat, r: tierRarity(i, l.steps.length), ladder: l.id, tier: i, goal, unit: l.unit, cur, got: cur >= goal,
    }));
  }
  for (const s of SINGLES) {
    const pr = s.prog && s.prog(c);
    list.push({ ...s, id: slug(s.name), got: !!s.test(c), cur: pr ? pr[0] : 0, goal: pr ? pr[1] : 0, unit: pr ? pr[2] : '' });
  }
  for (const g of GAME_ADVS) {
    if (!d.games.some((x) => g.game.test(x.name))) continue;
    const pr = g.prog && g.prog(c);
    list.push({ ...g, id: `g:${slug(g.name)}`, got: !!g.test(c), cur: pr ? pr[0] : 0, goal: pr ? pr[1] : 0, unit: pr ? pr[2] : '' });
  }
  return list;
}

// ---------- Drawing them ----------
let advFilter = 'all';
const fmtProg = (v, unit) => (unit === 'h' ? (v >= 10 ? Math.round(v).toLocaleString() : v.toFixed(1)) : Math.floor(v).toLocaleString());
const bar = (cur, goal, unit) => `<div class="adv-bar"><span style="width:${clamp((cur / goal) * 100, 0, 100)}%"></span></div><div class="adv-prog">${fmtProg(Math.min(cur, goal), unit)} / ${fmtProg(goal, unit)}${unit === 'h' ? ' h' : unit === 'days' ? ' days' : ''}</div>`;

function advCard(b) {
  if (b.secret && !b.got) {
    return `<div class="adv secret r-${b.r}"><div class="adv-icon">❓</div><div class="adv-body"><div class="adv-name">Secret advancement</div><div class="adv-desc">${esc(b.hint || 'Keep playing to find out')}</div></div></div>`;
  }
  return `<div class="adv r-${b.r}${b.got ? ' got' : ''}" title="${esc(b.desc)}"><div class="adv-icon">${b.icon}</div><div class="adv-body">
    <div class="adv-name">${esc(b.name)}<span class="adv-r">${RARITY[b.r]}</span></div><div class="adv-desc">${esc(b.desc)}</div>
    ${!b.got && b.goal ? bar(b.cur, b.goal, b.unit) : ''}</div></div>`;
}

// A ladder is one card: the best tier reached so far and a bar towards the next one
function ladderCard(tiers) {
  const l = LADDERS.find((x) => x.id === tiers[0].ladder);
  const got = tiers.filter((t) => t.got);
  const best = got[got.length - 1];
  const next = tiers.find((t) => !t.got);
  const shown = best || next;
  return `<div class="adv ladder r-${shown.r}${best ? ' got' : ''}"><div class="adv-icon">${l.icon}</div><div class="adv-body">
    <div class="adv-name">${esc(l.title)}<span class="adv-r">${best ? esc(best.name) : 'Not started'}</span></div>
    <div class="adv-desc">${next ? `Next: ${esc(next.name)} · ${esc(next.desc)}` : 'Every tier unlocked 🎉'}</div>
    <div class="adv-pips">${tiers.map((t) => `<i class="pip r-${t.r}${t.got ? ' on' : ''}" title="${esc(t.name)}: ${esc(t.desc)}"></i>`).join('')}</div>
    ${next ? bar(next.cur, next.goal, next.unit) : ''}</div></div>`;
}

function advGridHtml(list) {
  const shown = list.filter((b) => advFilter === 'all' || b.cat === advFilter);
  const cards = [];
  const seen = new Set();
  for (const b of shown) {
    if (b.ladder) { if (seen.has(b.ladder)) continue; seen.add(b.ladder); cards.push(ladderCard(shown.filter((x) => x.ladder === b.ladder))); } else cards.push(advCard(b));
  }
  // Unlocked first, then the ones closest to done
  return cards.length ? cards.join('') : '<div class="empty small">Nothing here yet</div>';
}

function advancementsHtml(list) {
  const got = list.filter((b) => b.got).length;
  const close = list.filter((b) => !b.got && !b.secret && b.goal && b.cur > 0).sort((a, b) => b.cur / b.goal - a.cur / a.goal).slice(0, 3);
  return `<div class="section" id="advSection">
    <div class="section-head"><h2>Advancements · ${got}/${list.length}</h2></div>
    ${close.length ? `<div class="adv-next"><small>Closest to unlocking</small><div class="adv-grid">${close.map(advCard).join('')}</div></div>` : ''}
    <div class="chips adv-chips">${ADV_CATS.map(([k, label]) => `<button class="chip${advFilter === k ? ' active' : ''}" data-adv-cat="${k}">${label}</button>`).join('')}</div>
    <div class="adv-grid" id="advGrid">${advGridHtml(list)}</div>
  </div>`;
}

document.getElementById('content').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-adv-cat]');
  if (!chip || view !== 'stats') return;
  advFilter = chip.dataset.advCat;
  const list = evaluateBadges(statsData());
  $('#advGrid').innerHTML = advGridHtml(list);
  $$('.adv-chips .chip').forEach((c) => c.classList.toggle('active', c.dataset.advCat === advFilter));
});
