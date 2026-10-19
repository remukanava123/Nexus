// Overwatch heroes and maps (for the match log and its statistics). Names outside these lists still work: the log accepts anything.
const OW = (() => {
  const ROLES = { tank: 'Tank', damage: 'Damage', support: 'Support' };
  const HEROES = {
    tank: ['D.Va', 'Doomfist', 'Hazard', 'Junker Queen', 'Mauga', 'Orisa', 'Ramattra', 'Reinhardt', 'Roadhog', 'Sigma', 'Winston', 'Wrecking Ball'],
    damage: ['Ashe', 'Bastion', 'Cassidy', 'Echo', 'Freja', 'Genji', 'Hanzo', 'Junkrat', 'Mei', 'Pharah', 'Reaper', 'Sojourn', 'Soldier: 76', 'Sombra', 'Symmetra', 'Torbjörn', 'Tracer', 'Venture', 'Widowmaker'],
    support: ['Ana', 'Baptiste', 'Brigitte', 'Illari', 'Juno', 'Kiriko', 'Lifeweaver', 'Lúcio', 'Mercy', 'Moira', 'Zenyatta'],
  };
  const MAPS = {
    Control: ['Antarctic Peninsula', 'Busan', 'Ilios', 'Lijiang Tower', 'Nepal', 'Oasis', 'Samoa'],
    Escort: ['Circuit Royal', 'Dorado', 'Havana', 'Junkertown', 'Rialto', 'Route 66', 'Shambali Monastery', 'Watchpoint: Gibraltar'],
    Hybrid: ['Blizzard World', 'Eichenwalde', 'Hollywood', "King's Row", 'Midtown', 'Numbani', 'Paraíso'],
    Push: ['Colosseo', 'Esperança', 'New Queen Street', 'Runasapi'],
    Flashpoint: ['Aatlis', 'New Junk City', 'Suravasa'],
    Clash: ['Hanaoka', 'Throne of Anubis'],
  };
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const heroRole = {}, heroName = {}, mapType = {}, mapName = {};
  for (const [role, list] of Object.entries(HEROES)) for (const h of list) { heroRole[norm(h)] = role; heroName[norm(h)] = h; }
  for (const [type, list] of Object.entries(MAPS)) for (const m of list) { mapType[norm(m)] = type; mapName[norm(m)] = m; }
  return {
    ROLES, HEROES, MAPS,
    allHeroes: () => Object.values(HEROES).flat().sort(),
    allMaps: () => Object.values(MAPS).flat().sort(),
    roleOf: (hero) => heroRole[norm(hero)] || '',
    mapTypeOf: (map) => mapType[norm(map)] || '',
    // "soldier-76" (the stats site's key) or any spelling -> the proper name
    heroName: (key) => heroName[norm(key)] || String(key || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    mapName: (key) => mapName[norm(key)] || String(key || ''),
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OW;
