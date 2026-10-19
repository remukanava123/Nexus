// Settings page. Every option is described in SETTINGS_SCHEMA and rendered generically.
const VIEW_OPTIONS = [['home', 'Home'], ['games', 'Games'], ['apps', 'Apps'], ['web', 'Websites'], ['favorites', 'Favourites'], ['stats', 'Stats'], ['gacha', 'Gacha helper']];

const SETTINGS_SCHEMA = [
  { id: 'appearance', title: 'Appearance', icon: '🎨', rows: [
    { key: 'theme', label: 'Theme', type: 'themes' },
    { key: 'accent', label: 'Accent colour', type: 'accent' },
    { key: 'cardSize', label: 'Cover size', desc: 'How big game covers are', type: 'range', min: 110, max: 230, step: 5, unit: 'px' },
    { key: 'radius', label: 'Corner roundness', type: 'range', min: 0, max: 28, step: 1, unit: 'px' },
    { key: 'uiScale', label: 'Interface size', desc: 'Scales text and everything else', type: 'range', min: 80, max: 130, step: 5, unit: '%' },
    { key: 'density', label: 'Density', type: 'select', options: [['comfortable', 'Comfortable'], ['compact', 'Compact']] },
    { key: 'bgStyle', label: 'Page background', type: 'select', options: [['none', 'Plain'], ['glow', 'Accent glow'], ['art', 'Blurred art of your last game']] },
    { key: 'animations', label: 'Animations', desc: 'Hover effects, transitions and confetti', type: 'toggle' },
    { key: 'blur', label: 'Blur effects', desc: 'Turn off if the app feels slow', type: 'toggle' },
    { key: 'showBadges', label: 'Launcher badge on covers', type: 'toggle' },
    { key: 'showTitles', label: 'Game titles under covers', type: 'toggle' },
    { key: 'showPlaytime', label: 'Hours played under covers', type: 'toggle' },
  ] },
  { id: 'home', title: 'Home page', icon: '🏠', rows: [
    { key: 'greeting', label: 'Greeting', desc: '“Good evening” and a quick summary', type: 'toggle' },
    { key: 'homeHero', label: 'Jump-back-in banner', type: 'toggle' },
    { key: 'homeGameOfDay', label: 'Game of the day', desc: 'A daily pick from your library', type: 'toggle' },
    { key: 'homeGacha', label: 'Gacha dailies strip', desc: 'Stamina and reset timers', type: 'toggle' },
    { key: 'homeRecent', label: 'Recently played', type: 'toggle' },
    { key: 'homeFavorites', label: 'Favourites', type: 'toggle' },
    { key: 'homeMostPlayed', label: 'Most played', type: 'toggle' },
    { key: 'homeBacklog', label: 'Backlog (never played)', type: 'toggle' },
    { key: 'homeGames', label: 'Your games', type: 'toggle' },
    { key: 'homeApps', label: 'Recent apps', type: 'toggle' },
    { key: 'homeWeb', label: 'Websites', type: 'toggle' },
    { key: 'rowCount', label: 'Games per row', type: 'range', min: 6, max: 24, step: 1, unit: '' },
  ] },
  { id: 'library', title: 'Library', icon: '📚', rows: [
    { key: 'clickAction', label: 'Clicking a game', type: 'select', options: [['details', 'Opens its page'], ['launch', 'Launches it right away']] },
    { key: 'defaultView', label: 'Start on', type: 'select', options: VIEW_OPTIONS },
    { key: 'gamesSort', label: 'Sort games by', type: 'select', options: [['name', 'Name (A–Z)'], ['recent', 'Recently played'], ['played', 'Most played'], ['source', 'Launcher']] },
    { key: 'groupByLauncher', label: 'Group games by launcher', type: 'toggle' },
    { key: 'rescanOnShow', label: 'Look for new games when opened', desc: 'Rescans if it has been a while', type: 'toggle' },
  ] },
  { id: 'window', title: 'Window & launching', icon: '🪟', rows: [
    { key: 'hideOnLaunch', label: 'Step behind apps and sites you launch', desc: 'Nexus fades out, lets the app come to the front, and waits right behind it. It never closes itself. Games always get the launch cover', type: 'toggle' },
    { key: 'closeToTray', label: 'Closing the window keeps Nexus in the tray', desc: 'Needed for playtime tracking and alerts', type: 'toggle' },
    { key: 'startWithWindows', label: 'Start with Windows', desc: 'Starts quietly in the tray', type: 'toggle' },
    { key: 'alwaysOnTop', label: 'Always on top', type: 'toggle' },
    { key: 'startFullscreen', label: 'Open fullscreen', desc: 'Normal window, but fullscreen, when Nexus starts', type: 'toggle' },
    { key: 'startBigScreen', label: 'Open in big-screen mode', desc: 'Fullscreen couch mode on startup', type: 'toggle' },
    { key: 'launchConfetti', label: 'Confetti when launching', desc: 'Because why not', type: 'toggle' },
    { key: 'gameMode', label: 'While a game is running', desc: 'Nexus never closes. Behind: fullscreen right behind the game and locked, so stray clicks do nothing (unlock with the hotkey or by holding the button). On top: stays above it at 1% opacity and click-through, and goes solid the moment the game closes or crashes (it can cost a little performance in exclusive-fullscreen games). Behind turns into On top when “Always on top” is on.', type: 'select', options: [['behind', 'Stay behind the game'], ['ghost', 'Stay on top, nearly invisible']] },
    { key: 'returnAfterGame', label: 'Come back when the game closes', desc: 'When you quit a game, Nexus comes straight back so you never see the desktop', type: 'toggle' },
    { key: 'returnFullscreen', label: 'Come back fullscreen', type: 'toggle', when: (s) => s.returnAfterGame },
    { key: 'autoUpdate', label: 'Install game updates when launching', desc: 'If a game or its launcher needs an update, Nexus presses Update for you and shows the progress. Install and Download buttons are never pressed.', type: 'toggle' },
    { key: 'launchCover', label: 'Full-screen launch cover', desc: 'While a game starts, Nexus goes fullscreen with its art, tips and a progress bar (needs “Hide Nexus after launching”)', type: 'toggle' },
    { key: 'launchMinWidth', label: 'Smallest window that counts as the game', desc: 'Smaller windows are treated as a launcher, splash or anti-cheat and ignored (16:9, so 1600 means 1600×900). Lower it for games you play in a small window; 0 means only tiny windows are ignored.', type: 'range', min: 0, max: 1920, step: 80, unit: ' px' },
    { key: 'launchExtraWait', label: 'Extra wait before fading', desc: 'After the game window has settled. Raise it if Nexus fades too early. Nexus also waits until it hears the game\'s own sound.', type: 'range', min: 0, max: 20, step: 1, unit: ' s' },
    { key: 'hotkey', label: 'Quick-open shortcut', desc: 'Works from anywhere in Windows', type: 'hotkey' },
  ] },
  { id: 'overlay', title: 'Game overlay', icon: '🎵', rows: [
    { key: 'overlay', label: 'Show the overlay while a game runs', desc: 'A small click-through panel in the top-left corner. Press Ctrl + Alt + O any time to show or hide it. Games in exclusive fullscreen can hide it; borderless windowed works best.', type: 'toggle' },
    { key: 'overlayMusic', label: 'Music', desc: 'Cover art, a spinning CD, live sound bars and a progress bar for whatever Windows is playing (Spotify, YouTube, ...)', type: 'toggle', when: (s) => s.overlay },
    { key: 'overlayBars', label: 'Sound bars', desc: 'Bars that move with the sound your PC plays', type: 'toggle', when: (s) => s.overlay && s.overlayMusic },
    { key: 'overlayStats', label: 'Overwatch stats', desc: 'Rank, win rate, KDA and top heroes while Overwatch runs. Your Overwatch career profile must be set to public.', type: 'toggle', when: (s) => s.overlay },
    { type: 'action', label: 'Edit overlay layout', desc: 'Drag every widget wherever you want on your screen, scroll over one to resize it, and switch widgets on or off. Also Ctrl + Alt + Shift + O.', button: 'Edit…', act: 'editOverlay', when: (s) => s.overlay },
    { key: 'overlayOpacity', label: 'Overlay brightness', desc: 'Fades the whole overlay', type: 'range', min: 30, max: 100, step: 5, unit: '%', when: (s) => s.overlay },
    { type: 'action', label: 'Competitive record', desc: 'The record and last 5 games of today, from the matches you add on the Overwatch page.', button: 'Clear today', act: 'resetToday', confirm: true, danger: true, when: (s) => s.overlay },
    { key: 'owAutoTrack', label: 'Overwatch: log results automatically (experimental)', desc: 'Notices new competitive wins and losses in your Overwatch stats. The stats site updates with a delay, so it can arrive late; turn it off if you prefer adding them yourself.', type: 'toggle', when: (s) => s.overlay && s.overlayStats },
    { key: 'owTag', label: 'Your BattleTag', desc: 'For example Name#1234', type: 'text', when: (s) => s.overlay && s.overlayStats },
  ] },
  { id: 'desktop', title: 'Nexus as your desktop', icon: '🖥', rows: [
    { type: 'action', label: 'Use Nexus as my Windows desktop',
      desc: () => !shellInfo ? 'Checking…' : !shellInfo.packaged ? 'Only available in the built Nexus exe'
        : shellInfo.other ? 'Windows already has a custom desktop set, so Nexus leaves it alone'
        : shellInfo.enabled ? 'On. After your next sign-in Nexus is the desktop: no wallpaper, taskbar or Start menu'
        : 'Sign in straight to Nexus: no wallpaper, taskbar or Start menu. Easy to undo',
      button: () => (shellInfo && shellInfo.enabled ? 'Restore Windows desktop' : 'Set up…'),
      act: () => (shellInfo && shellInfo.enabled ? 'shellDisable' : 'shellEnable'),
      disabled: () => !shellInfo || !shellInfo.packaged || shellInfo.other },
    { key: 'shellRunStartup', label: 'Start my Windows startup apps', desc: 'Explorer normally starts Steam, Discord and the like at sign-in. Nexus does it when it is the desktop', type: 'toggle', when: () => shellInfo && shellInfo.enabled },
    { type: 'action', label: 'Open the Windows desktop now', desc: 'Starts the taskbar and Start menu for this session', button: 'Open', act: 'windowsDesktop', when: () => prefs.shell },
  ] },
  { id: 'sound', title: 'Sound & motion', icon: '🔊', rows: [
    { key: 'sounds', label: 'Interface sounds', desc: 'Quiet clicks, chimes and a launch sweep', type: 'toggle' },
    { key: 'soundVolume', label: 'Volume', type: 'range', min: 0, max: 100, step: 5, unit: '%', when: (s) => s.sounds },
    { key: 'ambientHum', label: 'Ambient hum in big-screen mode', desc: 'A very faint background drone', type: 'toggle', when: (s) => s.sounds },
    { key: 'bootAnimation', label: 'Startup animation', desc: 'The logo splash when Nexus opens', type: 'toggle' },
    { key: 'launchFade', label: 'Fade out when launching', desc: 'A slow fade instead of vanishing instantly (needs “Hide Nexus after launching”)', type: 'toggle' },
  ] },
  { id: 'playtime', title: 'Playtime', icon: '⏱', rows: [
    { key: 'trackPlaytime', label: 'Track playtime', desc: 'Checks which games are running every few seconds', type: 'toggle' },
    { key: 'badgePopups', label: 'Badge popups', desc: 'A Steam-style popup in the corner when you unlock a badge, even while a game is open', type: 'toggle' },
    { type: 'action', label: 'Preview badge popup', desc: 'Shows the popup and plays its sound', button: 'Preview', act: 'previewBadge', when: (s) => s.badgePopups },
    { key: 'breakReminder', label: 'Break reminders', desc: 'A notification during long sessions', type: 'toggle' },
    { key: 'breakMinutes', label: 'Remind me every', type: 'range', min: 30, max: 300, step: 15, unit: ' min', when: (s) => s.breakReminder },
  ] },
  { id: 'gacha', title: 'Gacha helper', icon: '✨', rows: [
    { key: 'region', label: 'Server region', desc: 'Decides when your daily and weekly resets happen', type: 'select', options: Object.entries(Gacha.REGIONS).map(([k, r]) => [k, r.label]) },
    { key: 'showGachaNav', label: 'Show “Gacha” in the sidebar', type: 'select', options: [['auto', 'When a gacha game is installed'], ['always', 'Always'], ['never', 'Never']] },
    { key: 'notifyStamina', label: 'Notify when stamina is full', type: 'toggle' },
    { key: 'notifyReset', label: 'Notify at daily reset', type: 'toggle' },
  ] },
  { id: 'data', title: 'Data & maintenance', icon: '🧰', rows: [
    { type: 'action', label: 'Rescan library', desc: 'Look for newly installed games and apps', button: 'Rescan', act: 'rescan' },
    { type: 'action', label: 'Restore hidden items', desc: () => `${prefs.hidden.length} hidden`, button: 'Restore all', act: 'unhide', disabled: () => !prefs.hidden.length },
    { type: 'action', label: 'Back up your data', desc: 'Favourites, playtime, gacha progress, settings', button: 'Export…', act: 'export' },
    { type: 'action', label: 'Restore from a backup', desc: 'Loads a file made by Export', button: 'Import…', act: 'import' },
    { type: 'action', label: 'Refresh covers & screenshots', desc: 'Clears downloaded art and searches again', button: 'Clear cache', act: 'clearCache', confirm: true },
    { type: 'action', label: 'Reset playtime', desc: 'Deletes all tracked hours and sessions', button: 'Reset…', act: 'resetPlaytime', confirm: true, danger: true },
    { type: 'action', label: 'Reset all settings', desc: 'Back to the defaults (your data stays)', button: 'Reset…', act: 'resetSettings', confirm: true, danger: true },
    { type: 'action', label: 'Data folder', desc: 'Where Nexus keeps its files', button: 'Open', act: 'openFolder' },
  ] },
];

const prettyAccel = (a) => String(a || '').replace('Control', 'Ctrl').replace('Super', 'Win').replace(/\+/g, ' + ');

function settingRow(row, s) {
  if (row.when && !row.when(s)) return '';
  const v = s[row.key];
  const label = `<div class="set-label">${esc(row.label)}${row.desc ? `<small>${esc(typeof row.desc === 'function' ? row.desc() : row.desc)}</small>` : ''}</div>`;
  let ctl = '';
  switch (row.type) {
    case 'toggle': ctl = `<button class="switch${v ? ' on' : ''}" role="switch" aria-checked="${!!v}" data-set="${row.key}"></button>`; break;
    case 'select': ctl = `<select data-set="${row.key}">${row.options.map(([val, name]) => `<option value="${esc(val)}"${val === v ? ' selected' : ''}>${esc(name)}</option>`).join('')}</select>`; break;
    case 'range': ctl = `<div class="range-wrap"><input type="range" data-set="${row.key}" min="${row.min}" max="${row.max}" step="${row.step}" value="${v}"><span class="range-val" data-range-for="${row.key}">${v}${row.unit}</span></div>`; break;
    case 'text': ctl = `<input type="text" class="text-in" data-set="${row.key}" value="${esc(v)}" placeholder="Name#1234" spellcheck="false" style="width:200px">`; break;
    case 'hotkey': ctl = `<button class="btn hotkey-btn" data-hotkey>${esc(prettyAccel(v))}</button>`; break;
    case 'action': ctl = `<button class="btn${row.danger ? ' danger' : ''}" data-sact="${typeof row.act === 'function' ? row.act() : row.act}"${row.confirm ? ' data-confirm' : ''}${row.disabled && row.disabled() ? ' disabled' : ''}>${esc(typeof row.button === 'function' ? row.button() : row.button)}</button>`; break;
    case 'themes': return `<div class="set-row block">${label}<div class="theme-grid">${Object.entries(THEMES).map(([k, t]) => `<button class="theme-swatch${k === v ? ' active' : ''}" data-theme-pick="${k}" style="--a:${t.bg};--b:${t.s1};--c:${t.s3}"><i></i><span>${t.label}</span></button>`).join('')}</div></div>`;
    case 'accent': return `<div class="set-row block">${label}<div class="accent-row">${ACCENTS.map((c) => `<button class="accent-dot${c.toLowerCase() === String(v).toLowerCase() ? ' active' : ''}" data-accent-pick="${c}" style="background:${c}" title="${c}"></button>`).join('')}<label class="accent-custom" title="Pick any colour"><input type="color" data-set="accent" value="${esc(v)}"><span>Custom</span></label></div></div>`;
    default: return '';
  }
  return `<div class="set-row">${label}<div class="set-ctl">${ctl}</div></div>`;
}

// Whether Nexus is set up as the Windows desktop (asked from the main process; the rows redraw when it answers)
let shellInfo = null;
function refreshShellInfo() {
  return window.api.shellStatus().then((i) => {
    const same = JSON.stringify(i) === JSON.stringify(shellInfo);
    shellInfo = i;
    const card = document.querySelector('#set-desktop .set-card');
    const sec = SETTINGS_SCHEMA.find((x) => x.id === 'desktop');
    if (!same && card) card.innerHTML = sec.rows.map((r) => settingRow(r, prefs.settings)).join('');
  }).catch(() => {});
}

function renderSettings() {
  const s = prefs.settings;
  setTimeout(refreshShellInfo, 0);
  content.innerHTML = `
    <h1 class="page-title">Settings</h1>
    <p class="page-sub">Everything saves automatically</p>
    <div class="chips set-jump">${SETTINGS_SCHEMA.map((sec) => `<button class="chip" data-jump="set-${sec.id}">${sec.icon} ${esc(sec.title)}</button>`).join('')}</div>
    ${SETTINGS_SCHEMA.map((sec) => `
      <section class="set-section" id="set-${sec.id}">
        <h2>${sec.icon} ${esc(sec.title)}</h2>
        <div class="set-card">${sec.rows.map((r) => settingRow(r, s)).join('')}</div>
      </section>`).join('')}
    <section class="set-section"><h2>⌨ Shortcuts</h2><div class="set-card"><div class="set-row block"><div class="shortcuts">
      <span><kbd>${esc(prettyAccel(s.hotkey))}</kbd> Show or hide Nexus</span><span><kbd>F11</kbd> Big-screen mode</span><span><kbd>Esc</kbd> Close / back</span>
      <span><kbd>Enter</kbd> Launch the top search result</span><span><kbd>Ctrl</kbd> + <kbd>R</kbd> Pick a game for me</span><span>Just start typing to search</span>
    </div></div></div></section>`;
}

async function saveSetting(key, value) {
  prefs.settings[key] = value; // instant feedback
  applyTheme(prefs.settings);
  prefs = await window.api.setSetting(key, value);
  applyTheme(prefs.settings);
  updateNav();
  sfx.refresh();
}

// Build an Electron accelerator ("Control+Alt+Space") from a key event; null until a real key is pressed
function toAccelerator(e) {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
  const c = e.code;
  let key = null;
  if (/^Key[A-Z]$/.test(c)) key = c.slice(3);
  else if (/^Digit\d$/.test(c)) key = c.slice(5);
  else if (/^F\d{1,2}$/.test(c)) key = c;
  else key = { Space: 'Space', Enter: 'Return', Tab: 'Tab', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Backquote: '`', Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Insert: 'Insert', Delete: 'Delete' }[c] || null;
  if (!key) return null;
  const mods = [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean);
  if (!mods.length && !/^F\d/.test(key)) return null; // a global shortcut needs a modifier (or an F-key)
  return [...mods, key].join('+');
}

let recordingHotkey = false;
function recordHotkey(btn) {
  if (recordingHotkey) return;
  recordingHotkey = true;
  const old = btn.textContent;
  btn.textContent = 'Press the new shortcut…  (Esc to cancel)';
  btn.classList.add('recording');
  const finish = () => { recordingHotkey = false; window.removeEventListener('keydown', onKey, true); btn.classList.remove('recording'); };
  async function onKey(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { finish(); btn.textContent = old; return; }
    const accel = toAccelerator(e);
    if (!accel) return;
    finish();
    const r = await window.api.setHotkey(accel);
    if (r.ok) { prefs = r.prefs; toast(`Shortcut set to ${prettyAccel(accel)}`); } else toast(`Couldn't use ${prettyAccel(accel)}. Another app may be using it.`, true);
    render();
  }
  window.addEventListener('keydown', onKey, true);
}

function confirmClick(btn, run) {
  if (btn.dataset.armed) { clearTimeout(Number(btn.dataset.armed)); delete btn.dataset.armed; return run(); }
  const text = btn.textContent;
  btn.textContent = 'Click again to confirm';
  btn.classList.add('armed');
  btn.dataset.armed = String(setTimeout(() => { delete btn.dataset.armed; btn.textContent = text; btn.classList.remove('armed'); }, 3000));
}

const SETTING_ACTIONS = {
  rescan: async (b) => { b.textContent = 'Scanning…'; await refresh(true); toast('Library refreshed'); renderSettings(); },
  previewBadge: () => window.api.previewBadge(),
  unhide: async () => { apply(await window.api.setPref('unhideAll')); toast('Hidden items restored'); },
  export: async () => { if (await window.api.exportData()) toast('Backup saved'); },
  import: async () => {
    try { const lib = await window.api.importData(); if (lib) { apply(lib); applyTheme(prefs.settings); updateNav(); toast('Backup restored'); } }
    catch (err) { toast(String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), true); }
  },
  clearCache: async () => { toast('Clearing… covers will download again'); apply(await window.api.clearCache()); },
  resetPlaytime: async () => { prefs = await window.api.resetPlaytime(); toast('Playtime reset'); render(); },
  resetSettings: async () => { prefs = await window.api.resetSettings(); applyTheme(prefs.settings); updateNav(); toast('Settings reset'); render(); },
  openFolder: () => window.api.openDataFolder(),
  editOverlay: () => window.api.overlayEdit(),
  resetToday: () => window.api.overlayResetToday(),
  shellEnable: async () => {
    try {
      const r = await window.api.shellEnable();
      if (r.ok) toast('Done. Nexus will be your desktop the next time you sign in.');
    } catch (err) { toast(String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), true); }
    refreshShellInfo();
    renderSettings();
  },
  shellDisable: async () => {
    try { await window.api.shellDisable(); toast('The Windows desktop is back from your next sign-in.'); }
    catch (err) { toast(String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), true); }
    renderSettings();
  },
  windowsDesktop: () => window.api.windowsDesktop(),
};

function initSettingsUi() {
  content.addEventListener('click', async (e) => {
    if (view !== 'settings' || query) return;
    const t = e.target;
    const jump = t.closest('[data-jump]');
    if (jump) { const el = document.getElementById(jump.dataset.jump); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const sw = t.closest('button.switch[data-set]');
    if (sw) { await saveSetting(sw.dataset.set, !prefs.settings[sw.dataset.set]); return render(); }
    const th = t.closest('[data-theme-pick]');
    if (th) { await saveSetting('theme', th.dataset.themePick); return render(); }
    const ac = t.closest('[data-accent-pick]');
    if (ac) { await saveSetting('accent', ac.dataset.accentPick); return render(); }
    const hk = t.closest('[data-hotkey]');
    if (hk) return recordHotkey(hk);
    const act = t.closest('[data-sact]');
    if (act && !act.disabled) {
      const run = () => SETTING_ACTIONS[act.dataset.sact](act);
      return act.hasAttribute('data-confirm') ? confirmClick(act, run) : run();
    }
  });

  // Sliders and colour pickers preview live while dragging, and save when released
  content.addEventListener('input', (e) => {
    const t = e.target;
    if (view !== 'settings' || !t.matches('input[data-set]')) return;
    const key = t.dataset.set;
    const v = t.type === 'range' ? Number(t.value) : t.value;
    const row = SETTINGS_SCHEMA.flatMap((s) => s.rows).find((r) => r.key === key);
    const lbl = $(`[data-range-for="${key}"]`);
    if (lbl && row) lbl.textContent = `${v}${row.unit}`;
    if (key !== 'uiScale') { prefs.settings[key] = v; applyTheme(prefs.settings); } // zoom is applied once on release
  });
  content.addEventListener('change', async (e) => {
    const t = e.target;
    if (view !== 'settings' || !t.matches('[data-set]') || t.matches('button')) return;
    const key = t.dataset.set;
    await saveSetting(key, t.type === 'range' ? Number(t.value) : t.value);
    if (t.tagName === 'SELECT' || t.type === 'color') render();
  });
}
