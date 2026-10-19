// Gacha game data and time maths. Loaded by the main process (require) and by the UI (<script>).
// Everything here is approximate and meant to be edited: stamina caps and daily tasks change with game updates.
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

  const GAMES = {
    hsr: {
      name: 'Honkai: Star Rail', color: '#c9a6ff', ids: ['hoyo:hkrpg_global'], nameRe: /honkai.*star rail/i,
      stamina: { name: 'Trailblaze Power', max: 300, minutes: 6 },
      spend: [10, 30, 40, 60],
      daily: [
        { id: 'checkin', label: 'Daily check-in' },
        { id: 'assign', label: 'Send out Assignments' },
        { id: 'training', label: 'Daily Training (500 activity)' },
        { id: 'power', label: 'Spend Trailblaze Power' },
      ],
      weekly: [
        { id: 'echo', label: 'Echo of War (weekly boss rewards)' },
        { id: 'universe', label: 'Weekly Universe / Divergent run' },
        { id: 'shop', label: 'Spend currencies in shops' },
      ],
      banners: [
        { id: 'char', name: 'Character Warp', soft: 74, hard: 90, guarantee: true },
        { id: 'lc', name: 'Light Cone Warp', soft: 66, hard: 80, guarantee: true },
      ],
    },
    wuwa: {
      name: 'Wuthering Waves', color: '#8fd6c8', ids: ['kuro:wuwa'], nameRe: /wuthering waves/i,
      stamina: { name: 'Waveplate', max: 240, minutes: 6 },
      spend: [20, 40, 60],
      daily: [
        { id: 'checkin', label: 'Daily check-in' },
        { id: 'activity', label: 'Daily activity (100 points)' },
        { id: 'plate', label: 'Spend Waveplate' },
        { id: 'commission', label: 'Commissions' },
      ],
      weekly: [
        { id: 'boss', label: 'Weekly boss' },
        { id: 'tower', label: 'Tower of Adversity / Whimpering Wastes' },
        { id: 'shop', label: 'Spend currencies in shops' },
      ],
      banners: [
        { id: 'char', name: 'Featured Resonator', soft: 66, hard: 80, guarantee: true },
        { id: 'weapon', name: 'Featured Weapon', soft: 66, hard: 80, guarantee: true },
      ],
    },
    genshin: {
      name: 'Genshin Impact', color: '#ffd27a', ids: ['hoyo:hk4e_global'], nameRe: /genshin impact/i,
      stamina: { name: 'Original Resin', max: 200, minutes: 8 },
      spend: [20, 30, 40, 60],
      daily: [
        { id: 'checkin', label: 'Daily check-in' },
        { id: 'commissions', label: 'Daily Commissions' },
        { id: 'resin', label: 'Spend Resin' },
        { id: 'realm', label: 'Collect Realm currency' },
      ],
      weekly: [
        { id: 'bosses', label: 'Weekly bosses' },
        { id: 'shop', label: 'Paimon\'s Bargains / shops' },
      ],
      banners: [
        { id: 'char', name: 'Character Event Wish', soft: 74, hard: 90, guarantee: true },
        { id: 'weapon', name: 'Weapon Event Wish', soft: 63, hard: 80, guarantee: false },
      ],
    },
    zzz: {
      name: 'Zenless Zone Zero', color: '#ff9d5c', ids: ['hoyo:nap_global'], nameRe: /zenless zone zero/i,
      stamina: { name: 'Battery Charge', max: 240, minutes: 6 },
      spend: [20, 40, 60],
      daily: [
        { id: 'checkin', label: 'Daily check-in' },
        { id: 'engagement', label: 'Daily Engagement (400)' },
        { id: 'battery', label: 'Spend Battery Charge' },
        { id: 'scratch', label: 'Scratch card / Video Store' },
      ],
      weekly: [
        { id: 'bounty', label: 'Weekly bounty / Notorious Hunt' },
        { id: 'shop', label: 'Spend currencies in shops' },
      ],
      banners: [
        { id: 'char', name: 'Exclusive Channel (Agent)', soft: 74, hard: 90, guarantee: true },
        { id: 'engine', name: 'W-Engine Channel', soft: 65, hard: 80, guarantee: true },
      ],
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

  function tasks(state, key, type) {
    const g = GAMES[key];
    const removed = (state && state.removed) || [];
    const custom = (state && state.custom && state.custom[type]) || [];
    return [...g[type].filter((t) => !removed.includes(`${type}:${t.id}`)), ...custom];
  }

  // ----- Banner phases -----
  // Each banner phase lasts about three weeks. There is no public feed for the dates, so Nexus remembers when the
  // current phase ends (you can correct it) and counts forward in 21-day steps from there.
  const PHASE_DAYS = 21;
  const DEFAULT_BANNER_ENDS = {
    hsr: Date.UTC(2026, 10, 10, 7, 0),
    wuwa: Date.UTC(2026, 9, 22, 9, 0),
    genshin: Date.UTC(2026, 10, 3, 5, 0),
  };
  const DEFAULT_PULLS_PER_DAY = 0.45; // dailies + events + weekly rewards, roughly; editable

  function bannerInfo(state, key, now) {
    const anchor = (state && state.bannerEnd) || DEFAULT_BANNER_ENDS[key];
    if (!anchor) return null;
    const len = ((state && state.phaseDays) || PHASE_DAYS) * DAY;
    let end = anchor, passed = 0;
    if (now >= end) { passed = Math.floor((now - end) / len) + 1; end += passed * len; }
    return { end, start: end - len, msLeft: end - now, nextEnd: end + len, daysLeft: (end - now) / DAY, custom: !!(state && state.bannerEnd), passed };
  }

  // What you could pull by the end of this banner / the next one, and whether it covers a guaranteed 5-star
  function pullPlan(state, def, key, now) {
    const b = bannerInfo(state, key, now);
    if (!b) return null;
    const pulls = (state && state.pulls) || 0;
    const perDay = state && state.pullsPerDay !== undefined ? state.pullsPerDay : DEFAULT_PULLS_PER_DAY;
    const main = def.banners[0];
    const p = (state && state.pity && state.pity[main.id]) || { count: 0, guaranteed: false };
    const toHard = Math.max(0, main.hard - p.count);
    const needed = toHard + (main.guarantee && !p.guaranteed ? main.hard : 0); // worst case if the 50/50 is lost
    return {
      pulls, perDay, needed, toHard, banner: main.name, pity: p.count,
      byEnd: Math.floor(pulls + perDay * b.daysLeft),
      byNext: Math.floor(pulls + perDay * ((b.nextEnd - now) / DAY)),
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

  return { REGIONS, GAMES, keyFor, periods, nextResets, stamina, tasks, fmtDuration, bannerInfo, pullPlan, PHASE_DAYS, DEFAULT_PULLS_PER_DAY, DAY, HOUR };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Gacha;
