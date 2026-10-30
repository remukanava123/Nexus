// Overwatch heroes and maps (for the match log and its statistics). Names outside these lists still work: the log accepts anything.
// The lists below are as of October 2026 (from Blizzard's hero gallery via the OverFast API). Nexus also fetches the
// current lists from OverFast once a week (main.js → OW.extend), so heroes and maps released later show up without an update.
const OW = (() => {
  const ROLES = { tank: 'Tank', damage: 'Damage', support: 'Support' };
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
  };
  index();
  const nameOfHero = (key) => heroName[norm(key)] || String(key || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    ROLES, HEROES, MAPS,
    allHeroes: () => Object.values(HEROES).flat().sort((a, b) => a.localeCompare(b)),
    allMaps: () => Object.values(MAPS).flat().sort((a, b) => a.localeCompare(b)),
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
    // The role for a match with several heroes: theirs if they all share one, else the first hero's
    roleOfAll: (heroes) => {
      const roles = [...new Set(heroes.map((h) => heroRole[norm(h)]).filter(Boolean))];
      return roles.length === 1 ? roles[0] : heroRole[norm(heroes[0])] || '';
    },
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
      index();
    },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OW;
