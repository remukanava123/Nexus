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

module.exports = { fetchProfile, fetchCompetitive, fmtTag };
