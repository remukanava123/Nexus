# Nexus

A game and app launcher for Windows and Linux (Fedora, Bazzite), built with Electron. Nexus finds your games from Steam, Epic, Battle.net, HoYoPlay and Kuro, plus your installed apps and favourite websites, and puts them in one place.

## Features

- **Library:** games, apps and websites in one searchable view, with covers, descriptions and screenshots.
- **Tags and filters:** per-game tags (Playing, Finished, Co-op and so on), with starter tags added for games it recognises.
- **Playtime tracking:** counts hours for anything it sees running, including games started elsewhere.
- **Stats and badges:** charts, per-game stats, 70 badges, and a Steam-style popup with a sound when you unlock one.
- **Gacha tools:** daily and weekly reset timers, stamina, banner countdowns and a pull planner for Honkai: Star Rail, Wuthering Waves and Genshin Impact.
- **News:** patch notes and announcements for your games.
- **Barça tab:** fixtures, results, tables, squad and news for FC Barcelona (La Liga, Champions League, Copa del Rey, Supercopa).
- **Launch cover:** while a game starts, Nexus shows a full-screen cover with the game's art, a progress bar and tips, lore and trivia. It only fades once the game window has settled (stopped resizing, steady title) and the game itself is playing sound (its own processes in the Windows volume mixer; a launcher's music doesn't count), then brings the game to the front. A game that stays silent (muted) still counts after a minute.
- **Always on top while launching:** the cover is fullscreen and sits above the taskbar, pop-ups and any newly opened windows until it fades, and keeps putting itself back on top if something is pushed over it. (Windows' own UAC prompt and system toasts live on a layer no app can cover.) **Hide Nexus now** or Esc always lets you out.
- **Launchers pressed for you:**
  - **Wuthering Waves:** Nexus opens the launcher and presses its main button through Windows UI Automation. It presses a button that says Start, Play, Launch (or a translation, or Play Now / Launch Game and so on). It never presses Update, Install, Continue, Accept or Download, so those are left to you: Nexus steps aside, brings the launcher forward and sends a notification.
  - **Battle.net (Overwatch and other Blizzard games):** Battle.net ignores the "launch" command while it is still starting, so Nexus opens it, waits until it is logged in, and then sends the command to the running copy. If Battle.net is waiting for you to log in, you get a notification and the game starts as soon as you do.
  - **Other launchers:** add an `autoPress` entry to a custom game in `library.json` (`proc` = the launcher's process name; `cls` is optional, and `start` defaults to the launch words above).
- **Game updates during launch:** if a game or its launcher needs an update, the cover says **Installing an update** with how much, how fast and how long is left.
  - **Steam:** exact numbers from the game's manifest (GB done of GB total, MB/s, time left).
  - **Wuthering Waves:** Nexus presses the launcher's Update button (setting: *Install game updates when launching*) and shows the launcher's own progress text.
  - **Others (Battle.net, HoYoPlay, Epic):** their progress isn't readable, so the cover shows how much your PC has downloaded since the launch and how fast. It's the whole machine's traffic and says so.
  - Install and Download buttons are never pressed, and an update never counts as a "normal" launch time.
- **While a game is running (setting, three modes):** games always get the cover and the fade, whatever "Fade Nexus away after launching apps and sites" says. Then:
  - **Stay behind the game** (default): see below.
  - **Stay on top, nearly invisible:** Nexus fades to 1% opacity and stays above the game, click-through, so your clicks and keys go to the game. When the game closes or crashes, Nexus fades back to solid and takes focus. This is also what *Stay behind* becomes when "Always on top" is on, since nothing can be behind an always-on-top window. A see-through window over an exclusive-fullscreen game can cost a little performance, so use *behind* if you notice that.
- **Stay behind the game:** Nexus never closes or hides itself after a launch. The cover fades to invisible (clicks go straight through it), the game is raised, and Nexus slips in directly behind it in the window order, even if Windows refuses to give the game focus (elevated games like Star Rail). About 5 seconds later Nexus is solid again back there, fullscreen, so quitting or alt-tabbing lands on Nexus, never your desktop. Nexus notices the game's window disappearing within a few seconds and comes back, with the playtime tracker confirming so a brief window change doesn't pop it over your game.
- **Apps and sites** (setting *Step behind apps and sites you launch*): Nexus fades out, waits for the app's window (up to 8 s), goes behind it and turns solid again about 5 s later. Not locked.
- **Hide Nexus now / Esc / giving up waiting:** the same step-behind, to the back of the window stack.
- **During the launch cover** nothing underneath can be clicked or typed into.
- **Come back when the game closes:** when you quit a game, Nexus returns fullscreen on its own so you never see the desktop (settings: *Come back when the game closes*, *Come back fullscreen*).
- **Skip the admin prompt, per game:** on a game's page, *Skip the Windows admin prompt* starts it through Windows' `RunAsInvoker` switch, so no UAC prompt appears and the game runs without admin rights. Star Rail started fine this way; some games or anti-cheats may need admin, so turn it off if one won't start.
- **Nexus as your desktop (optional):** sign in straight to Nexus with no wallpaper, taskbar or Start menu. See below.
- **Game overlay:** a full-screen, click-through layer with widgets you place yourself (Settings → Game overlay → Edit overlay layout, or Ctrl + Alt + Shift + O: drag to move, scroll to resize, tick widgets on or off, per-widget size and opacity). Widgets: music (cover, spinning CD, live sound bars, progress; the cover is looked up by song name when the player gives none, as YouTube often does), today's competitive record (W-L-D, win rate, streak, a break warning after 3 losses), last 5 games, Overwatch career (rank, win rate, KDA, top heroes; set your BattleTag, profile must be public), session timer, role progress today and clock. Ctrl + Alt + O shows or hides it. Results come from the Overwatch page (or automatically from your stats, experimental). A "role progress today" widget adds up your rank progress per role. Exclusive-fullscreen games can hide it.
- **Overwatch page:** a competitive match log with statistics: record, win rate, streaks, win rate by hero, role, map and map type, rolling trend, rank progress in percent per role, games per day, best times of day and weekdays, after-win vs after-loss win rate, session stats, fun facts, a career card from the public stats site, and an editable history. Results are typed in on the page, or (experimental, Settings → Game overlay) automatically from your stats, which also fills in the hero. Maps can't be detected, so add them in the history.
- **Big-screen mode:** a fullscreen, controller-friendly view of your library.
- **Tray and startup:** can start with Windows, open fullscreen, and keep running in the tray.
- **Customisation:** themes, accent colours, hover animations and sounds, each of which can be turned off in Settings.

## Shortcuts

| Key | Action |
| --- | --- |
| Ctrl + Alt + Space (default, changeable in Settings) | Show or hide Nexus from anywhere |
| F11 | Big-screen mode |
| Ctrl + R | Pick a game for me |
| Enter | Launch the top search result |
| Esc | Close or go back |
| Just start typing | Search |

## Nexus as your Windows desktop

Settings → "Nexus as your desktop" → **Set up…** makes Nexus the Windows shell for your user account (a per-user registry setting, no admin needed). From your next sign-in Nexus opens fullscreen instead of Explorer: no wallpaper, taskbar or Start menu.

- Nexus starts your usual startup apps (Run keys and Startup folders, except ones turned off in Task Manager) for you, since Explorer normally does that.
- When a game closes, Nexus comes back automatically.
- The sidebar gets a **Windows desktop** button (and so does the tray menu) that starts the taskbar and Start menu for the session. Closing the Nexus window offers the same.
- Quitting Nexus brings the normal desktop back. If the exe is moved or deleted, Windows falls back to the normal desktop too.
- Windows notifications and the taskbar tray need the desktop, so they only appear after you switch to it.

**Undo it:** Settings → **Restore Windows desktop**. If you can't reach Settings, press Ctrl + Shift + Esc, choose *Run new task*, and run `"<path to Nexus.exe>" --restore-shell`, then sign out and back in. Windows' own recovery works too: the setting is `Shell` under `HKCU\Software\Microsoft\Windows NT\CurrentVersion\Winlogon`, and deleting that value restores the normal desktop.

## Linux (Fedora, Bazzite and other distros)

Nexus also runs on Linux. It was written on Windows, and the Linux side has **not been tested on a real Fedora or Bazzite install yet**, so please open an issue if something is off.

**Install**
- **Bazzite (or any immutable distro):** download the `.AppImage` from the releases page, make it executable (`chmod +x Nexus-*.AppImage`) and run it, or add it with Gear Lever from Flathub. Nothing is layered onto the system.
- **Fedora Workstation:** `sudo dnf install ./nexus-*.rpm`, or use the AppImage.
- **From source:** `npm install`, then `npm start`. Build packages with `npm run dist:linux`.

**What Nexus finds**
- Steam games (native and Flatpak Steam, including extra library folders)
- Epic and GOG games installed through Heroic (native and Flatpak)
- Lutris games (if the `lutris` command is available)
- Installed apps and native games from your `.desktop` entries, including Flatpaks. Entries in the *Game* category count as games.

**What works the same:** playtime tracking and stats (read from the running processes, Proton games included), tags, favourites, the gacha helper, news, Barça, the Overwatch page, the launch cover with tips, big-screen mode, the tray and starting with your session.

**What is different**
- The launch cover waits for the game's process and then gives it about ten more seconds. It cannot see the game's window or its sound on Linux, so raise *Extra wait before fading* if it goes too early.
- Nexus cannot slot itself behind a game, so it minimises instead and comes back when the game closes.
- The overlay reads the current song from any MPRIS player (Spotify, browsers, VLC...) using `gdbus`, which comes with Fedora and Bazzite. The sound bars are decorative. On Wayland a click-through overlay over an exclusive-fullscreen game is not possible; use borderless windowed mode.
- The global shortcut uses the desktop portal on Wayland. KDE Plasma and recent GNOME ask you to approve it once.
- Windows-only features are hidden: Battle.net, HoYoPlay and Wuthering Waves launcher handling, "Nexus as your desktop", the admin-prompt switch, and launcher update progress (Steam update progress still works).

## Running from source

```bash
npm install
npm start
```

## Building the exe

```bash
npm run dist
```

This produces a Windows installer in the `dist` folder. On Windows, `electron-builder` needs `powershell.exe` on your PATH. If the build fails with `spawn powershell.exe ENOENT`, add `C:\Windows\System32\WindowsPowerShell\v1.0` and `C:\Windows\System32` to PATH first.

## Where your data lives

Nexus keeps its files in `%APPDATA%\Nexus` (Settings → Data folder opens it). Your library, favourites, playtime, tags, gacha progress and settings are in `library.json`. Settings → Back up your data exports a copy.

## Project layout

| Path | What it is |
| --- | --- |
| `main.js` | Electron main process: windows, tray, launching, IPC |
| `src/` | Scanner, playtime tracker, store, feeds (news and Barça data), cover lookup, preload bridge |
| `shared/gacha-data.js` | Gacha resets, stamina and banner maths |
| `renderer/` | The interface: pages, styles, sounds, big-screen mode |

## Notes

- Low resource mode (Settings → Data & maintenance) turns off graphics acceleration to save memory. Nexus also stops all animation while it is hidden or behind a game.
- Games that require administrator rights show a Windows UAC prompt when launched.
- Wuthering Waves opens its own launcher, and you press Start there.
- Barça and news data come from public sources (ESPN, BBC Sport, BarcaBlog, Google News, HoYoPlay, Steam news) and are cached locally, so the pages need internet only the first time.



