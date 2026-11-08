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
// -> { heroes: { tank: [...], damage: [...], support: [...] }, maps: { Control: [...], ... }, stadium: { heroes, maps } }. The maps are competitive ones.
const MAP_TYPES = { control: 'Control', escort: 'Escort', hybrid: 'Hybrid', push: 'Push', flashpoint: 'Flashpoint', clash: 'Clash', assault: 'Assault' };
const wikiDecode = (s) => s.replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
const wikiText = (h) => wikiDecode(h.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

// Stadium: its roster from OverFast, its maps from the Overwatch wiki (OverFast does not list them).
// -> { heroes: { tank: [...] }, maps: { Control: ['Busan Sanctuary', ...], 'Payload Race': [...] } }
async function fetchStadium(fetchFn) {
  const root = BASE.replace(/\/players$/, '');
  const out = { heroes: {}, maps: {} };
  try {
    const list = await getJson(`${root}/heroes?gamemode=stadium`, fetchFn);
    for (const h of Array.isArray(list) ? list : []) if (h && h.name && h.role) (out.heroes[h.role] = out.heroes[h.role] || []).push(String(h.name).slice(0, 40));
  } catch { /* the built-in roster stays */ }
  try {
    const r = await fetchFn('https://overwatch.fandom.com/api.php?action=parse&page=Stadium&prop=text&format=json&redirects=1', { headers: { 'User-Agent': 'Nexus-Launcher' } });
    const html = (await r.json()).parse.text['*'];
    const from = html.indexOf('id="Maps"');
    const t0 = html.indexOf('<table', from), t1 = html.indexOf('</table>', t0);
    const rows = html.slice(t0, t1).split('<tr>').slice(1);
    const heads = [...rows[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => wikiText(m[1]));
    // One column per map type. A map with sub-areas reads "Busan Sanctuary" or "Oasis Gardens, University" after its link
    rows[1].split(/<td[^>]*>/).slice(1).forEach((cell, i) => {
      const type = heads[i];
      if (!type) return;
      for (const li of cell.split('<li>').slice(1)) {
        const body = li.split('</li>')[0];
        const link = body.match(/<a [^>]*>([^<]+)<\/a>/);
        const full = wikiText(body);
        const base = link ? wikiDecode(link[1]) : full;
        const rest = link ? full.slice(full.indexOf(base) + base.length).trim() : '';
        for (const name of rest ? rest.split(/\s*,\s*/).map((v) => `${base} ${v}`) : [base]) if (name.length < 40) (out.maps[type] = out.maps[type] || []).push(name);
      }
    });
  } catch { /* the built-in list stays */ }
  return out;
}

async function fetchCatalog(fetchFn) {
  const root = BASE.replace(/\/players$/, '');
  const [heroList, mapList, stadium] = await Promise.all([getJson(`${root}/heroes`, fetchFn), getJson(`${root}/maps`, fetchFn), fetchStadium(fetchFn)]);
  const heroes = {}, maps = {};
  for (const h of Array.isArray(heroList) ? heroList : []) if (h && h.name && h.role) (heroes[h.role] = heroes[h.role] || []).push(String(h.name).slice(0, 40));
  for (const m of Array.isArray(mapList) ? mapList : []) {
    const type = (m.gamemodes || []).map((g) => MAP_TYPES[g]).find(Boolean);
    if (m && m.name && type) (maps[type] = maps[type] || []).push(String(m.name).replace(/’/g, "'").slice(0, 40));
  }
  if (!Object.keys(heroes).length) throw new Error('no heroes in the answer');
  return { heroes, maps, stadium };
}

module.exports = { fetchProfile, fetchCompetitive, fetchCatalog, fetchStadium, fmtTag };
