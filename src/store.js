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
  animations: true, blur: true, bgStyle: 'glow', showBadges: true, showTitles: true, showPlaytime: true,
  // Home page sections
  greeting: true, homeHero: true, homeGameOfDay: true, homeRecent: true, homeFavorites: true, homeMostPlayed: true,
  homeBacklog: true, homeGacha: true, homeGames: true, homeApps: true, homeWeb: true, rowCount: 12,
  // Library
  clickAction: 'details', defaultView: 'home', gamesSort: 'name', groupByLauncher: false, rescanOnShow: true,
  // Window and launching
  hideOnLaunch: true, closeToTray: true, startWithWindows: false, alwaysOnTop: false, hotkey: 'Control+Alt+Space',
  launchConfetti: false, startBigScreen: false, startFullscreen: false,
  launchCover: true, launchExtraWait: 2, launchMinWidth: 1600, shellRunStartup: true,
  overlay: true, overlayMusic: true, overlayBars: true, overlayStats: true, owTag: '', owAutoTrack: false, overlayOpacity: 100,
  autoUpdate: true, returnAfterGame: true, returnFullscreen: true, gameMode: 'behind',
  // Sound & motion
  sounds: true, soundVolume: 40, ambientHum: true, bootAnimation: true, launchFade: true,
  // Playtime
  trackPlaytime: true, breakReminder: false, breakMinutes: 120, badgePopups: true,
  // Gacha helper
  region: 'europe', showGachaNav: 'auto', notifyStamina: true, notifyReset: true,
};

const DATA_VERSION = 3;

class Store {
  constructor(dir) {
    this.file = path.join(dir, 'library.json');
    this.runtime = { running: {} }; // not saved: which games are open right now
    let data = null;
    // (a file saved by PowerShell or Notepad can start with a byte-order mark, which JSON.parse rejects)
    try { data = JSON.parse(fs.readFileSync(this.file, 'utf8').replace(/^\uFEFF/, '')); } catch {}
    this.data = {
      favorites: [], hidden: [], custom: [], recents: {}, covers: {}, artCache: {}, artMiss: {}, info: {}, iconCache: {}, iconMiss: {},
      playtime: {}, sessions: [], gacha: {}, notified: {},
      ...data,
      settings: { ...DEFAULT_SETTINGS, ...((data && data.settings) || {}) },
    };
    // Nexus no longer hides itself after a launch (it steps behind instead), so the old Hide choice becomes Behind
    if (this.data.settings.gameMode === 'hide') this.data.settings.gameMode = 'behind';
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

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file); // never leave a half-written library behind
  }

  toggleList(list, id, on) {
    const arr = this.data[list].filter((x) => x !== id);
    if (on) arr.push(id);
    this.data[list] = arr;
    this.save();
  }

  // Everything the UI needs, in one object
  public() {
    const { favorites, hidden, recents, settings, covers, playtime, sessions, gacha, badgesSeen, tags, noAdmin } = this.data;
    return {
      favorites, hidden, recents, settings, customCovers: Object.keys(covers), playtime,
      tags: tags || {},
      noAdmin: noAdmin || {}, // games launched without the Windows admin prompt
      shell: this.runtime.shellMode === 'shell', // Nexus is the Windows desktop right now
      badgesSeen: badgesSeen || null, // null = never checked yet (the first check just records what is already unlocked)
      sessions: sessions.slice(-1500), gacha, running: this.runtime.running, now: Date.now(),
    };
  }
}

Store.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
module.exports = Store;
