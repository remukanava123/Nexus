// Small JSON file for user preferences, playtime and other saved data.
const fs = require('fs');
const path = require('path');

const DEFAULT_SITES = [
  ['YouTube', 'https://www.youtube.com'],
  ['Twitch', 'https://www.twitch.tv'],
  ['Reddit', 'https://www.reddit.com'],
  ['HoYoLAB', 'https://www.hoyolab.com'],
];

const DEFAULT_SETTINGS = {
  // Appearance
  theme: 'midnight', accent: '#7c5cff', cardSize: 150, radius: 14, density: 'comfortable', uiScale: 100,
  animations: true, blur: true, bgStyle: 'glow', bgStrength: 100, showBadges: true, showTitles: true,
  cardMeta: 'hours', coverShape: 'portrait', hoverEffect: 'lift', cardGap: 18, fontFamily: 'segoe',
  showFavStar: true, showRunningBadge: true,
  // Sidebar
  sidebarStyle: 'full', sidebarColors: true, navApps: true, navWeb: true, navFavorites: true, navStats: true, navBarca: true, navNews: true,
  // Home page sections
  greeting: true, homeHero: true, homeGameOfDay: true, homeRecent: true, homeFavorites: true, homeMostPlayed: true,
  homeBacklog: true, homeGacha: true, homeGames: true, homeApps: true, homeWeb: true, rowCount: 12,
  // Library
  clickAction: 'details', defaultView: 'home', gamesSort: 'name', groupByLauncher: false, rescanOnShow: true,
  searchApps: true, searchWeb: true,
  // Window and launching
  hideOnLaunch: true, closeToTray: true, startWithWindows: false, alwaysOnTop: false, hotkey: 'Control+Alt+Space',
  launchConfetti: false, startBigScreen: false, startFullscreen: false,
  launchCover: true, launchExtraWait: 2, launchMinWidth: 1600, shellRunStartup: true, coverTips: true, coverArt: true,
  lowResource: false, checkUpdates: true,
  lifetimeHours: true, welcomeDone: false, hoverSounds: true,
  overlay: true, overlayMusic: true, overlayBars: true, overlayStats: true, owTag: '', owAutoTrack: false, overlayOpacity: 100,
  autoUpdate: true, returnAfterGame: true, returnFullscreen: true, gameMode: 'behind',
  // Sound & motion
  sounds: true, soundVolume: 40, ambientHum: true, bootAnimation: true, launchFade: true,
  // Playtime
  trackPlaytime: true, breakReminder: false, breakMinutes: 120, badgePopups: true, toastCorner: 'bottom-right', toastSeconds: 7,
  hoursMode: 'total', hoursFormat: 'short', weekStart: 'monday',
  // Gacha helper
  region: 'europe', showGachaNav: 'auto', notifyStamina: true, notifyReset: true,
};

const DATA_VERSION = 3;

// Reads a JSON file: the object, undefined when there is no such file, null when it exists but can't be read
// (a file saved by PowerShell or Notepad can start with a byte-order mark, which JSON.parse rejects, so that goes first)
function readJson(file) {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch (e) { return e && e.code === 'ENOENT' ? undefined : null; }
}

const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

class Store {
  constructor(dir) {
    this.file = path.join(dir, 'library.json');
    this.lastGood = path.join(dir, 'library.last-good.json'); // a copy of the last library that loaded fine
    this.runtime = { running: {}, lifetime: {} }; // not saved: which games are open right now, and total hours from Steam and the like
    this.saveTimer = null;
    let data = readJson(this.file);
    if (data === null) {
      // The library is damaged (cut short by a crash, edited by hand...). Never write over it: keep it for the user and
      // carry on from the newest good copy, so playtime, tags and the rest survive.
      try { fs.copyFileSync(this.file, path.join(dir, `library.damaged-${Date.now()}.json`)); } catch {}
      data = readJson(`${this.file}.tmp`) || readJson(this.lastGood) || null;
      this.recovered = true;
      console.error(data ? 'library.json was damaged; loaded the last good copy' : 'library.json was damaged and no good copy was found');
    } else if (data) {
      try { fs.copyFileSync(this.file, this.lastGood); } catch {}
    }
    this.firstRun = data === undefined; // no library file yet: Nexus has never run here before
    if (!data) data = null;
    this.data = {
      favorites: [], hidden: [], custom: [], recents: {}, covers: {}, artCache: {}, artMiss: {}, info: {}, iconCache: {}, iconMiss: {},
      playtime: {}, sessions: [], gacha: {}, notified: {},
      ...data,
      settings: { ...DEFAULT_SETTINGS, ...((data && data.settings) || {}) },
    };
    // Someone who already uses Nexus doesn't need the welcome guide (it stays available in Settings)
    if (data && !(data.settings && 'welcomeDone' in data.settings)) this.data.settings.welcomeDone = true;
    // Nexus no longer hides itself after a launch (it steps behind instead), so the old Hide choice becomes Behind
    if (this.data.settings.gameMode === 'hide') this.data.settings.gameMode = 'behind';
    // "Hours played under covers" became the "Under each cover" choice
    if ('showPlaytime' in this.data.settings) {
      if (this.data.settings.showPlaytime === false && !(data.settings && 'cardMeta' in data.settings)) this.data.settings.cardMeta = 'none';
      delete this.data.settings.showPlaytime;
    }
    delete this.data.launchTimes; // learned launch times are no longer used (readiness is the settled window plus the game's sound)
    // Older versions saved some broken cover URLs and weak screenshot lists. Start those over (favourites, custom covers etc. stay).
    if (this.data.dataVersion !== DATA_VERSION) {
      Object.assign(this.data, { artCache: {}, artMiss: {}, info: {}, iconCache: {}, iconMiss: {}, dataVersion: DATA_VERSION });
      if (data) this.save();
    }
    if (!data) {
      this.data.custom = DEFAULT_SITES.map(([name, url], i) => ({ id: `web:default${i}`, kind: 'web', name, url }));
      this.save();
    }
  }

  // Many changes come in bursts (a scan, a game starting, art arriving one game at a time), so they are written together
  // a moment later instead of rewriting the whole file each time. saveNow() writes at once (used when quitting).
  save() {
    if (!this.saveTimer) this.saveTimer = setTimeout(() => { this.saveTimer = null; this.saveNow(); }, 800);
  }

  saveNow() {
    clearTimeout(this.saveTimer); this.saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      // never leave a half-written library behind. Antivirus or the search indexer can hold the file for a moment, which
      // makes the rename fail on Windows, so try a few times.
      for (let i = 0; ; i++) {
        try { fs.renameSync(tmp, this.file); break; } catch (e) {
          if (i >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
          pause(60 * (i + 1));
        }
      }
    } catch (e) {
      console.error('Could not save library.json, trying again shortly:', e.message);
      this.saveTimer = setTimeout(() => { this.saveTimer = null; this.saveNow(); }, 3000);
    }
  }

  toggleList(list, id, on) {
    const arr = this.data[list].filter((x) => x !== id);
    if (on) arr.push(id);
    this.data[list] = arr;
    this.save();
  }

  // Everything the UI needs, in one object
  public() {
    const { favorites, hidden, recents, settings, covers, playtime, sessions, gacha, badgesSeen, tags, noAdmin, manualHours, names } = this.data;
    return {
      favorites, hidden, recents, settings, customCovers: Object.keys(covers), playtime,
      tags: tags || {},
      names: names || {}, // display names the user gave games and apps (the real name stays for covers, news and so on)
      noAdmin: noAdmin || {}, // games launched without the Windows admin prompt
      lifetime: this.runtime.lifetime || {}, // { id: { sec, src } }: hours played in total, from Steam, the Overwatch profile or typed in
      manualHours: manualHours || {},
      shell: this.runtime.shellMode === 'shell', // Nexus is the Windows desktop right now
      badgesSeen: badgesSeen || null, // null = never checked yet (the first check just records what is already unlocked)
      sessions: sessions.slice(-1500), gacha, running: this.runtime.running, now: Date.now(),
      owCatalog: this.data.owCatalog || null, // the current Overwatch heroes and maps, fetched weekly (shared/ow-data.js extend())
    };
  }
}

Store.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
module.exports = Store;
