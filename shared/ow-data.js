// Overwatch heroes and maps (for the match log and its statistics). Names outside these lists still work: the log accepts anything.
// The lists below are as of October 2026 (from Blizzard's hero gallery via the OverFast API). Nexus also fetches the
// current lists from OverFast once a week (main.js → OW.extend), so heroes and maps released later show up without an update.
const OW = (() => {
  const ROLES = { tank: 'Tank', damage: 'Damage', support: 'Support', open: 'Open queue' };
  const MODES = { competitive: 'Competitive', stadium: 'Stadium' };
  // Stadium has its own, smaller roster and its own versions of the maps (Busan Sanctuary, Ilios Ruins...), played as a series of
  // rounds on different maps. Competitive Stadium has the three roles but no open queue. As of November 2026; extend() refreshes both.
  const STADIUM_HEROES = {
    tank: ['D.Va', 'Doomfist', 'Hazard', 'Junker Queen', 'Orisa', 'Ramattra', 'Reinhardt', 'Sigma', 'Winston', 'Zarya'],
    damage: ['Ashe', 'Cassidy', 'Freja', 'Genji', 'Junkrat', 'Mei', 'Pharah', 'Reaper', 'Sojourn', 'Soldier: 76', 'Torbjörn', 'Tracer', 'Vendetta'],
    support: ['Ana', 'Brigitte', 'Jetpack Cat', 'Juno', 'Kiriko', 'Lúcio', 'Mercy', 'Moira', 'Wuyang', 'Zenyatta'],
  };
  const STADIUM_MAPS = {
    Clash: ['Hanaoka', 'Throne of Anubis'],
    Control: ['Arena Victoriae', 'Busan Sanctuary', 'Gogadoro', 'Ilios Ruins', 'Lijiang Tower Night Market', 'Nepal Shrine', 'Oasis Gardens', 'Oasis University', 'Samoa Volcano', 'Wuxing University Water College'],
    'Payload Race': ['Powder Keg Mine', 'Thames District'],
    Push: ['Colosseo', 'Esperança', 'Place Lacroix', 'Redwood Dam', 'Serenza'],
  };
  const HEROES = {
    tank: ['D.Mon', 'D.Va', 'Domina', 'Doomfist', 'Hazard', 'Junker Queen', 'Mauga', 'Orisa', 'Ramattra', 'Reinhardt', 'Roadhog', 'Sigma', 'Winston', 'Wrecking Ball', 'Zarya'],
    damage: ['Anran', 'Ashe', 'Bastion', 'Cassidy', 'Echo', 'Emre', 'Freja', 'Genji', 'Hanzo', 'Junkrat', 'Mei', 'Pharah', 'Reaper', 'Shion', 'Sierra', 'Sojourn', 'Soldier: 76', 'Symmetra', 'Torbjörn', 'Tracer', 'Vendetta', 'Venture', 'Widowmaker'],
    support: ['Ana', 'Baptiste', 'Brigitte', 'Doctrine', 'Illari', 'Jetpack Cat', 'Juno', 'Kiriko', 'Lifeweaver', 'Lúcio', 'Mercy', 'Mizuki', 'Moira', 'Sombra', 'Wuyang', 'Zenyatta'],
  };
  const MAPS = {
    Control: ['Antarctic Peninsula', 'Arena Victoriae', 'Busan', 'Gogadoro', 'Ilios', 'Lijiang Tower', 'Nepal', 'Oasis', 'Samoa', 'Wuxing University'],
    Escort: ['Circuit Royal', 'Dorado', 'Grímsvötn', 'Havana', 'Junkertown', 'Rialto', 'Route 66', 'Shambali Monastery', 'Watchpoint: Gibraltar'],
    Hybrid: ['Blizzard World', 'Eichenwalde', 'Hollywood', "King's Row", 'Midtown', 'Neon Junction', 'Numbani', 'Paraíso'],
    Push: ['Colosseo', 'Esperança', 'New Queen Street', 'Place Lacroix', 'Redwood Dam', 'Runasapi'],
    Flashpoint: ['Aatlis', 'New Junk City', 'Suravasa'],
    Clash: ['Hanaoka', 'Throne of Anubis'],
    Assault: ['Hanamura', 'Horizon Lunar Colony', 'Paris', 'Temple of Anubis', 'Volskaya Industries'],
  };
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const heroRole = {}, heroName = {}, mapType = {}, mapName = {};
  const index = () => {
    for (const [role, list] of Object.entries(HEROES)) for (const h of list) { heroRole[norm(h)] = role; heroName[norm(h)] = h; }
    for (const [type, list] of Object.entries(MAPS)) for (const m of list) { mapType[norm(m)] = type; mapName[norm(m)] = m; }
    for (const [type, list] of Object.entries(STADIUM_MAPS)) for (const m of list) { if (!mapType[norm(m)]) mapType[norm(m)] = type; if (!mapName[norm(m)]) mapName[norm(m)] = m; }
  };
  const uniq = (list) => [...new Set(list)].sort((a, b) => a.localeCompare(b));
  index();
  const nameOfHero = (key) => heroName[norm(key)] || String(key || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    ROLES, MODES, HEROES, MAPS, STADIUM_HEROES, STADIUM_MAPS,
    allHeroes: () => Object.values(HEROES).flat().sort((a, b) => a.localeCompare(b)),
    allMaps: () => Object.values(MAPS).flat().sort((a, b) => a.localeCompare(b)),
    // A match's mode. Entries from before modes existed were logged as role "stadium".
    modeOf: (m) => (m && (m.mode === 'stadium' || m.role === 'stadium') ? 'stadium' : 'competitive'),
    // The roles you can pick in a mode (Stadium has no open queue)
    rolesFor: (mode) => (mode === 'stadium' ? ['tank', 'damage', 'support'] : ['tank', 'damage', 'support', 'open']),
    // The maps of a mode: one in competitive, a series of rounds in Stadium (each round is its own map)
    mapsFor: (mode) => (mode === 'stadium' ? uniq(Object.values(STADIUM_MAPS).flat()) : uniq(Object.values(MAPS).flat())),
    mapsOf: (m) => {
      const list = m && Array.isArray(m.maps) && m.maps.length ? m.maps : [m && m.map];
      return [...new Set(list.map((x) => String(x || '').trim()).filter(Boolean).map((x) => mapName[norm(x)] || x))];
    },
    roleOf: (hero) => heroRole[norm(hero)] || '',
    mapTypeOf: (map) => mapType[norm(map)] || '',
    // "soldier-76" (the stats site's key) or any spelling -> the proper name
    heroName: nameOfHero,
    mapName: (key) => mapName[norm(key)] || String(key || ''),
    // The heroes of one logged match: its list, or older entries' single hero (which may hold "Ana, Kiriko")
    heroesOf: (m) => {
      const list = m && Array.isArray(m.heroes) && m.heroes.length ? m.heroes : String((m && m.hero) || '').split(/\s*[,/+&]\s*/);
      return [...new Set(list.map((h) => String(h).trim()).filter(Boolean).map(nameOfHero))];
    },
    // The role for a match with several heroes: theirs if they all share one; heroes from different roles mean open queue
    roleOfAll: (heroes) => {
      const roles = [...new Set(heroes.map((h) => heroRole[norm(h)]).filter(Boolean))];
      return roles.length === 1 ? roles[0] : roles.length > 1 ? 'open' : '';
    },
    // Heroes you can pick for a role (all of them for open queue or no role); in Stadium only its own roster
    heroesFor: (role, mode) => {
      const pool = mode === 'stadium' ? STADIUM_HEROES : HEROES;
      return pool[role] ? [...pool[role]] : uniq(Object.values(pool).flat());
    },
    inStadium: (hero) => Object.values(STADIUM_HEROES).some((l) => l.some((h) => norm(h) === norm(hero))),
    // Adds heroes and maps fetched from OverFast: { heroes: { tank: [...] }, maps: { Control: [...] } }. Known ones stay.
    extend: (cat) => {
      if (!cat) return;
      for (const [role, list] of Object.entries(cat.heroes || {})) {
        if (!HEROES[role]) continue;
        for (const h of list) {
          const k = norm(h);
          if (heroRole[k] && heroRole[k] !== role) HEROES[heroRole[k]] = HEROES[heroRole[k]].filter((x) => norm(x) !== k); // a hero that changed role
          if (!HEROES[role].some((x) => norm(x) === k)) HEROES[role].push(h);
        }
        HEROES[role].sort((a, b) => a.localeCompare(b));
      }
      for (const [type, list] of Object.entries(cat.maps || {})) {
        if (!MAPS[type]) MAPS[type] = [];
        for (const m of list) if (!mapType[norm(m)]) MAPS[type].push(m);
        MAPS[type].sort((a, b) => a.localeCompare(b));
      }
      // Stadium's roster and maps: { heroes: { tank: [...] }, maps: { Control: [...] } }
      const st = cat.stadium;
      if (st) {
        for (const [role, list] of Object.entries(st.heroes || {})) {
          if (!STADIUM_HEROES[role]) continue;
          for (const h of list) if (!STADIUM_HEROES[role].some((x) => norm(x) === norm(h))) STADIUM_HEROES[role].push(h);
          STADIUM_HEROES[role].sort((a, b) => a.localeCompare(b));
        }
        for (const [type, list] of Object.entries(st.maps || {})) {
          if (!STADIUM_MAPS[type]) STADIUM_MAPS[type] = [];
          for (const m of list) if (!STADIUM_MAPS[type].some((x) => norm(x) === norm(m))) STADIUM_MAPS[type].push(m);
          STADIUM_MAPS[type].sort((a, b) => a.localeCompare(b));
        }
      }
      index();
    },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OW;
