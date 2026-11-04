// Gacha game data and time maths. Loaded by the main process (require) and by the UI (<script>).
// Everything here is approximate and meant to be edited: stamina caps, rates and pity change with game updates.
const Gacha = (() => {
  const DAY = 86400000;
  const HOUR = 3600000;

  // Servers use fixed UTC offsets (no daylight saving) and reset at 04:00 server time
  const REGIONS = {
    europe: { label: 'Europe', offset: 1 },
    america: { label: 'America', offset: -5 },
    asia: { label: 'Asia / SEA', offset: 8 },
    tw: { label: 'TW / HK / MO', offset: 8 },
  };

  const SERVERS = [['America', 'UTC−5'], ['Europe', 'UTC+1'], ['Asia / SEA', 'UTC+8'], ['TW / HK / MO', 'UTC+8']];

  // info: what people google about each game. About, rates and rules are written from the games' public pages and wikis.
  const GAMES = {
    hsr: {
      name: 'Honkai: Star Rail', color: '#c9a6ff', ids: ['hoyo:hkrpg_global'], nameRe: /honkai.*star rail/i,
      stamina: { name: 'Trailblaze Power', max: 300, minutes: 6 },
      spend: [10, 30, 40, 60],
      banners: [
        { id: 'char', name: 'Character Warp', soft: 74, hard: 90, guarantee: true },
        { id: 'lc', name: 'Light Cone Warp', soft: 66, hard: 80, guarantee: true },
      ],
      info: {
        about: [['Developer', 'HoYoverse'], ['Released', 'April 26, 2023'], ['Platforms', 'PC, PlayStation 5, iOS, Android'], ['Genre', 'Turn-based space-fantasy RPG']],
        pull: [['Pull cost', '160 Stellar Jade'], ['Pull item', 'Star Rail Special Pass (limited) and Star Rail Pass (standard)'], ['Premium currency', 'Oneiric Shard → Stellar Jade']],
        rates: [['5★ character', '0.6% base · soft pity from 74 · hard pity 90'], ['5★ Light Cone', '0.8% base · soft pity from 66 · hard pity 80'], ['4★', 'Guaranteed at least once every 10 warps']],
        rules: ['Character banner: a 5★ is the featured one 50% of the time. Lose it and the next 5★ is guaranteed to be the featured one.', 'Light Cone banner: 75% featured. Lose it and the next 5★ is guaranteed.', 'Pity carries over between banners of the same type (all character event warps share one count) but not between types.'],
        cadence: 'A new version about every 6 weeks, with the banners swapping over after about 3 weeks.',
        links: [['Wiki', 'https://honkai-star-rail.fandom.com'], ['Official site', 'https://hsr.hoyoverse.com/en-us/home'], ['Redeem codes', 'https://hsr.hoyoverse.com/gift'], ['Reddit', 'https://www.reddit.com/r/HonkaiStarRail/']],
      },
    },
    wuwa: {
      name: 'Wuthering Waves', color: '#8fd6c8', ids: ['kuro:wuwa'], nameRe: /wuthering waves/i,
      stamina: { name: 'Waveplate', max: 240, minutes: 6 },
      spend: [20, 40, 60],
      banners: [
        { id: 'char', name: 'Featured Resonator', soft: 66, hard: 80, guarantee: true },
        { id: 'weapon', name: 'Featured Weapon', soft: 66, hard: 80, guarantee: true },
      ],
      info: {
        about: [['Developer', 'Kuro Games'], ['Released', 'May 22, 2024'], ['Platforms', 'PC, PlayStation 5, iOS, Android'], ['Genre', 'Open-world action RPG']],
        pull: [['Pull cost', '160 Astrite'], ['Pull item', 'Radiant Tide (resonators) and Forging Tide (weapons)'], ['Premium currency', 'Lunite → Astrite']],
        rates: [['5★ resonator or weapon', '0.8% base · soft pity from about 65 · hard pity 80'], ['4★', 'Guaranteed at least once every 10 convenes']],
        rules: ['Resonator banner: a 5★ is the featured one 50% of the time. Lose it and the next 5★ is guaranteed.', 'The pity count carries over between all featured resonator banners.', 'Weapon banner: the 5★ you get is always one of the featured weapons.'],
        cadence: 'A new version about every 6 weeks, with the banners swapping over after about 3 weeks.',
        links: [['Wiki', 'https://wutheringwaves.fandom.com'], ['Official site', 'https://wutheringwaves.kurogames.com/en'], ['Reddit', 'https://www.reddit.com/r/WutheringWaves/']],
        codes: true, // no official redeem page: codes are typed in the game, so a search is the way to find them
      },
    },
    genshin: {
      name: 'Genshin Impact', color: '#ffd27a', ids: ['hoyo:hk4e_global'], nameRe: /genshin impact/i,
      stamina: { name: 'Original Resin', max: 200, minutes: 8 },
      spend: [20, 30, 40, 60],
      banners: [
        { id: 'char', name: 'Character Event Wish', soft: 74, hard: 90, guarantee: true },
        { id: 'weapon', name: 'Weapon Event Wish', soft: 63, hard: 80, guarantee: false },
      ],
      info: {
        about: [['Developer', 'HoYoverse'], ['Released', 'September 28, 2020'], ['Platforms', 'PC, PlayStation, iOS, Android'], ['Genre', 'Open-world action RPG']],
        pull: [['Pull cost', '160 Primogems'], ['Pull item', 'Intertwined Fate (limited) and Acquaint Fate (standard)'], ['Premium currency', 'Genesis Crystal → Primogem']],
        rates: [['5★ character', '0.6% base · soft pity from 74 · hard pity 90'], ['5★ weapon', '0.7% base · soft pity from about 63 · hard pity 80'], ['4★', 'Guaranteed at least once every 10 wishes']],
        rules: ['Character banner: a 5★ is the featured one 50% of the time. Lose it and the next 5★ is guaranteed. Capturing Radiance gives a lost 50/50 a small extra chance, so it is a bit better than half in practice.', 'Pity carries over between character event banners, not to the weapon banner.', 'Original Resin refills 1 per 8 minutes.'],
        cadence: 'A new version about every 6 weeks, with the banners swapping over after about 3 weeks.',
        links: [['Wiki', 'https://genshin-impact.fandom.com'], ['Official site', 'https://genshin.hoyoverse.com/en'], ['Redeem codes', 'https://genshin.hoyoverse.com/en/gift'], ['Reddit', 'https://www.reddit.com/r/Genshin_Impact/']],
      },
    },
    zzz: {
      name: 'Zenless Zone Zero', color: '#ff9d5c', ids: ['hoyo:nap_global'], nameRe: /zenless zone zero/i,
      stamina: { name: 'Battery Charge', max: 240, minutes: 6 },
      spend: [20, 40, 60],
      banners: [
        { id: 'char', name: 'Exclusive Channel (Agent)', soft: 74, hard: 90, guarantee: true },
        { id: 'engine', name: 'W-Engine Channel', soft: 65, hard: 80, guarantee: true },
      ],
      info: {
        about: [['Developer', 'HoYoverse'], ['Released', 'July 4, 2024'], ['Platforms', 'PC, PlayStation 5, iOS, Android'], ['Genre', 'Urban-fantasy action RPG']],
        pull: [['Pull cost', '160 Polychrome'], ['Pull item', 'Encrypted Master Tape (limited channels)'], ['Premium currency', 'Monochrome → Polychrome']],
        rates: [['S-Rank agent', '0.6% base · soft pity from 74 · hard pity 90'], ['S-Rank W-Engine', '1.0% base · soft pity from about 65 · hard pity 80'], ['A-Rank', 'Guaranteed at least once every 10 pulls']],
        rules: ['Agent channel: an S-Rank is the featured one 50% of the time. Lose it and the next S-Rank is guaranteed.', 'W-Engine channel: 75% featured. Lose it and the next S-Rank is guaranteed.', 'Pity is counted separately for each channel type.'],
        cadence: 'A new version about every 6 weeks, with the banners swapping over after about 3 weeks.',
        links: [['Wiki', 'https://zenless-zone-zero.fandom.com'], ['Official site', 'https://zenless.hoyoverse.com/en-us'], ['Redeem codes', 'https://zenless.hoyoverse.com/redemption'], ['Reddit', 'https://www.reddit.com/r/ZZZ_Official/']],
      },
    },
  };

  const offsetOf = (region) => (REGIONS[region] || REGIONS.europe).offset;

  // Which gacha game (if any) a library item is
  function keyFor(item) {
    for (const [key, g] of Object.entries(GAMES)) {
      if (g.ids.includes(item.id) || g.nameRe.test(item.name || '')) return key;
    }
    return null;
  }

  // The reset day starts at 04:00 server time. Shifting by (offset - 4h) turns that into plain UTC midnight.
  const shift = (now, region) => now + (offsetOf(region) - 4) * HOUR;
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

  function periods(now, region) {
    const s = shift(now, region);
    const dayStart = Math.floor(s / DAY) * DAY;
    const sinceMonday = (new Date(dayStart).getUTCDay() + 6) % 7;
    return { daily: iso(dayStart), weekly: iso(dayStart - sinceMonday * DAY) };
  }

  function nextResets(now, region) {
    const s = shift(now, region);
    const back = (offsetOf(region) - 4) * HOUR;
    const dayStart = Math.floor(s / DAY) * DAY;
    const sinceMonday = (new Date(dayStart).getUTCDay() + 6) % 7;
    return { daily: dayStart + DAY - back, weekly: dayStart - sinceMonday * DAY + 7 * DAY - back };
  }

  // Stamina right now, from the value the user last entered and when they entered it
  function stamina(state, def, now) {
    def = def.stamina || def; // accepts a whole game entry or just its stamina settings
    const max = (state && state.maxOverride) || def.max;
    const per = def.minutes * 60000;
    if (!state || !state.stamina) return { known: false, max, value: 0, full: false, fullAt: null, msToFull: null };
    const { value, at } = state.stamina;
    if (value >= max) return { known: true, max, value, full: true, fullAt: at, msToFull: 0 };
    const gained = Math.floor((now - at) / per);
    const cur = Math.min(max, value + gained);
    const fullAt = at + (max - value) * per;
    return { known: true, max, value: cur, full: cur >= max, fullAt, msToFull: Math.max(0, fullAt - now), nextPointIn: cur >= max ? 0 : per - ((now - at) % per) };
  }

  // ----- Banner phases -----
  // The Gacha page reads the real schedule (src/gacha-banners.js). When that is not available (offline, or the sources changed),
  // Nexus falls back on remembering when the current phase ends (you can correct it) and counting forward in 21-day steps.
  const PHASE_DAYS = 21;
  const DEFAULT_BANNER_ENDS = {
    hsr: Date.UTC(2026, 10, 10, 7, 0),
    wuwa: Date.UTC(2026, 9, 22, 9, 0),
    genshin: Date.UTC(2026, 10, 3, 5, 0),
  };
  const DEFAULT_PULLS_PER_DAY = 0.45; // dailies + events + weekly rewards, roughly; editable

  // live: { start, end, nextEnd } from the real schedule, when known
  function bannerInfo(state, key, now, live) {
    if (live && live.end) {
      const len = Math.max(DAY, live.end - (live.start || live.end - PHASE_DAYS * DAY));
      return { end: live.end, start: live.end - len, msLeft: live.end - now, nextEnd: live.nextEnd || live.end + len, daysLeft: (live.end - now) / DAY, custom: false, live: true, passed: 0 };
    }
    const anchor = (state && state.bannerEnd) || DEFAULT_BANNER_ENDS[key];
    if (!anchor) return null;
    const len = ((state && state.phaseDays) || PHASE_DAYS) * DAY;
    let end = anchor, passed = 0;
    if (now >= end) { passed = Math.floor((now - end) / len) + 1; end += passed * len; }
    return { end, start: end - len, msLeft: end - now, nextEnd: end + len, daysLeft: (end - now) / DAY, custom: !!(state && state.bannerEnd), live: false, passed };
  }

  // What you could pull by the end of this banner / the next one, and whether it covers a guaranteed 5-star
  function pullPlan(state, def, key, now, live) {
    const b = bannerInfo(state, key, now, live);
    if (!b) return null;
    const pulls = (state && state.pulls) || 0;
    const perDay = state && state.pullsPerDay !== undefined ? state.pullsPerDay : DEFAULT_PULLS_PER_DAY;
    const main = def.banners[0];
    const p = (state && state.pity && state.pity[main.id]) || { count: 0, guaranteed: false };
    const toHard = Math.max(0, main.hard - p.count);
    const needed = toHard + (main.guarantee && !p.guaranteed ? main.hard : 0); // worst case if the 50/50 is lost
    return {
      pulls, perDay, needed, toHard, banner: main.name, pity: p.count,
      byEnd: Math.floor(pulls + perDay * Math.max(0, b.daysLeft)),
      byNext: Math.floor(pulls + perDay * Math.max(0, (b.nextEnd - now) / DAY)),
    };
  }

  function fmtDuration(ms) {
    if (ms <= 0) return 'now';
    const m = Math.ceil(ms / 60000);
    const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), min = m % 60;
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${String(min).padStart(2, '0')}m`;
    return `${min}m`;
  }

  return { REGIONS, SERVERS, GAMES, keyFor, periods, nextResets, stamina, fmtDuration, bannerInfo, pullPlan, PHASE_DAYS, DEFAULT_PULLS_PER_DAY, DAY, HOUR };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Gacha;
