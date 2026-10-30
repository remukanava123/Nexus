// Overwatch career stats for the overlay, from the public OverFast API (needs the player's profile to be public in-game).
const BASE = 'https://overfast-api.tekrop.fr/players';

const fmtTag = (tag) => String(tag || '').trim().replace('#', '-');

async function getJson(url, fetchFn) {
  const r = await fetchFn(url, { headers: { 'User-Agent': 'Nexus-Launcher' } });
  if (!r.ok) throw new Error(r.status === 404 ? 'profile not found or private' : `HTTP ${r.status}`);
  return r.json();
}

// -> { name, title, endorsement, ranks: [{ role, division, tier }], games, winrate, kda, hours, heroes: [{ name, hours, winrate, kda }] }
async function fetchProfile(tag, fetchFn) {
  const id = fmtTag(tag);
  if (!/^[^\s/]+-\d+$/.test(id)) throw new Error('BattleTag looks like Name#1234');
  const [sum, stats] = await Promise.all([
    getJson(`${BASE}/${encodeURIComponent(id)}/summary`, fetchFn),
    getJson(`${BASE}/${encodeURIComponent(id)}/stats/summary`, fetchFn).catch(() => null),
  ]);
  const comp = (sum.competitive && (sum.competitive.pc || sum.competitive.console)) || {};
  const ranks = ['tank', 'damage', 'support', 'open'].filter((r) => comp[r]).map((r) => ({ role: r, division: comp[r].division, tier: comp[r].tier }));
  const g = (stats && stats.general) || {};
  const heroes = stats && stats.heroes
    ? Object.entries(stats.heroes).sort((a, b) => (b[1].time_played || 0) - (a[1].time_played || 0)).slice(0, 3)
      .map(([k, h]) => ({ name: k.replace(/-/g, ' '), hours: Math.round((h.time_played || 0) / 3600), winrate: h.winrate, kda: h.kda }))
    : [];
  return {
    name: sum.username, title: sum.title, endorsement: sum.endorsement && sum.endorsement.level, ranks,
    games: g.games_played, winrate: g.winrate, kda: g.kda, hours: g.time_played ? Math.round(g.time_played / 3600) : null, heroes,
  };
}

// Competitive wins and losses so far (the API's copy of the game stats; it can lag the game by a while)
async function fetchCompetitive(tag, fetchFn) {
  const id = encodeURIComponent(fmtTag(tag));
  const j = await getJson(`${BASE}/${id}/stats/summary?gamemode=competitive`, fetchFn);
  const g = (j && j.general) || {};
  const heroes = {};
  for (const [k, h] of Object.entries((j && j.heroes) || {})) heroes[k] = { played: h.games_played || 0, won: h.games_won || 0, lost: h.games_lost || 0 };
  return { won: g.games_won || 0, lost: g.games_lost || 0, heroes };
}

// The current heroes (with roles) and maps, so the match log knows heroes released after this version of Nexus.
// -> { heroes: { tank: [...], damage: [...], support: [...] }, maps: { Control: [...], ... } }. Only competitive map types.
const MAP_TYPES = { control: 'Control', escort: 'Escort', hybrid: 'Hybrid', push: 'Push', flashpoint: 'Flashpoint', clash: 'Clash', assault: 'Assault' };
async function fetchCatalog(fetchFn) {
  const root = BASE.replace(/\/players$/, '');
  const [heroList, mapList] = await Promise.all([getJson(`${root}/heroes`, fetchFn), getJson(`${root}/maps`, fetchFn)]);
  const heroes = {}, maps = {};
  for (const h of Array.isArray(heroList) ? heroList : []) if (h && h.name && h.role) (heroes[h.role] = heroes[h.role] || []).push(String(h.name).slice(0, 40));
  for (const m of Array.isArray(mapList) ? mapList : []) {
    const type = (m.gamemodes || []).map((g) => MAP_TYPES[g]).find(Boolean);
    if (m && m.name && type) (maps[type] = maps[type] || []).push(String(m.name).replace(/’/g, "'").slice(0, 40));
  }
  if (!Object.keys(heroes).length) throw new Error('no heroes in the answer');
  return { heroes, maps };
}

module.exports = { fetchProfile, fetchCompetitive, fetchCatalog, fmtTag };
