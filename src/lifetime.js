// Hours you played before Nexus (or outside it) and achievements, taken from places that already have them:
//   Steam      the Steam client's own files on this PC
//   Overwatch  your public career profile (needs the BattleTag from Settings)
//   anything   a number the user typed in on the game's page
// Epic, EA, HoYoPlay, Kuro and Battle.net keep no playtime that other programs can read, so those use the typed number.
const steamLocal = require('./steam-local');

const OW_REFRESH = 6 * 3600000;
const PERCENT_TTL = 7 * 86400000;

// -> { [gameId]: { sec, src: 'steam' | 'overwatch' | 'manual' } }
async function compute(items, store, overwatchApi, fetchFn) {
  const out = {};
  const games = items.filter((i) => i.type === 'game');

  const steamMinutes = await steamLocal.playtimes().catch(() => ({}));
  for (const g of games) {
    const min = g.source === 'steam' && g.appid ? steamMinutes[g.appid] : 0;
    if (min >= 1) out[g.id] = { sec: min * 60, src: 'steam' };
  }

  const tag = (store.data.settings.owTag || '').trim();
  const ow = games.find((g) => /overwatch/i.test(g.name));
  if (ow && tag && overwatchApi) {
    let c = store.data.owHours;
    if (!c || c.tag !== tag || Date.now() - c.at > OW_REFRESH) {
      try {
        const p = await overwatchApi.fetchProfile(tag, fetchFn);
        c = store.data.owHours = { tag, at: Date.now(), hours: p.hours || 0 };
        store.save();
      } catch (e) { c = c && c.tag === tag ? c : null; }
    }
    if (c && c.hours) out[ow.id] = { sec: c.hours * 3600, src: 'overwatch' };
  }

  for (const [id, h] of Object.entries(store.data.manualHours || {})) {
    if (games.some((g) => g.id === id) && h > 0) out[id] = { sec: h * 3600, src: 'manual' };
  }
  return out;
}

// One game's achievements (Steam only). `rare` is filled from Steam's public global percentages when they can be fetched.
async function achievementsFor(it, store, fetchFn) {
  if (!it || it.source !== 'steam' || !it.appid) return null;
  const a = await steamLocal.achievements(it.appid);
  if (!a) return null;
  const cache = (store.data.achPercent = store.data.achPercent || {});
  let pct = cache[it.appid] && Date.now() - cache[it.appid].at < PERCENT_TTL ? cache[it.appid].pct : null;
  if (!pct) {
    try { pct = await steamLocal.globalPercent(it.appid, fetchFn); cache[it.appid] = { at: Date.now(), pct }; store.save(); } catch { pct = (cache[it.appid] && cache[it.appid].pct) || null; }
  }
  for (const x of a.list) x.percent = pct && pct[x.id] !== undefined ? pct[x.id] : null;
  return { source: 'steam', ...a };
}

// Cheap overview of every Steam game that has achievements, for the Stats page and the advancements
async function summary(items) {
  const rows = [];
  for (const g of items.filter((i) => i.type === 'game' && i.source === 'steam' && i.appid)) {
    const a = await steamLocal.achievements(g.appid).catch(() => null);
    if (a) rows.push({ id: g.id, name: g.name, total: a.total, unlocked: a.unlocked });
  }
  return rows;
}

module.exports = { compute, achievementsFor, summary };
