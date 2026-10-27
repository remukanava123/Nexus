# What is in this folder

## The three Nexus folders (in Downloads)

| Folder | What it is |
| --- | --- |
| `testi/` | This one: where the code is edited and built. `npm run dist` puts the new app in `dist/`. |
| `Nexus/` | The app you actually run (Windows startup and the shortcuts point here). To update it: close Nexus, run `npm run dist` here, then double-click `Nexus/Update Nexus.bat`. |
| `Nexus-Github/` | A clean copy of the source to upload to GitHub (no personal files, no builds). Put the installer from `dist/` on a GitHub Release instead of in the repo. |

Nexus is an Electron app: one **main process** (`main.js`, runs in the background and does the real work) and one **interface** (`renderer/`, the pages you see). They talk through `src/preload.js`.

## Top level

| Path | What it does |
| --- | --- |
| `main.js` | The brain. Creates the windows, tray icon and hotkeys, launches games, and answers requests from the interface. |
| `src/` | Everything the main process uses: finding games, tracking playtime, saving data (details below). |
| `renderer/` | The interface you see: pages, styles, sounds (details below). |
| `shared/` | Data used by both sides: gacha reset times (`gacha-data.js`), Overwatch roles/heroes (`ow-data.js`), and the "What's new" text for each version (`release-notes.js`). |
| `assets/` | The logo (`logo.svg`, `icon.png`, `tray.png`) and `sounds/` (the sidebar hover sounds, already trimmed and level-matched). |
| `.github/workflows/build.yml` | Builds the Windows installer and Linux packages on GitHub when you push a tag like `v1.0.0`. |
| `package.json` | App name, version, GitHub repo, and installer settings. Change `version` here before each release. |
| `package-lock.json` | Exact versions of the libraries. Don't edit by hand. |
| `README.md` | The public description of Nexus for GitHub. |
| `FOLDERS.md` | This file. |
| `HANDOFF.md` | Personal notes for me. Never published (listed in `.gitignore`). |

## Folders you can ignore (made by tools, not published)

| Path | What it is |
| --- | --- |
| `node_modules/` | Downloaded libraries. Recreated by `npm install`; safe to delete. |
| `dist/` | The build output (installer and runnable app). Recreated by `npm run dist`. |
| `.git/` | Git history. |

## `src/`: the main process helpers

| File | What it does |
| --- | --- |
| `scanner.js` | Finds installed games and apps: Steam, Epic, Battle.net, HoYoPlay, Wuthering Waves, EA app, Start Menu and Store apps. Roblox and Minecraft are moved to Games here. |
| `store.js` | Saves and loads your library, favourites, playtime and settings (`library.json` in the Nexus data folder). |
| `tracker.js` | Counts playtime while a game's process is running. |
| `launch-watch.js` | Watches the game's window and sound so the launch cover knows when the game is ready. |
| `launcher-press.js` | Presses "Start" in launchers that need it (Wuthering Waves). |
| `launch-wuwa.ps1` | PowerShell helper for the Wuthering Waves launcher. |
| `bnet.js` | Starts Overwatch and other Blizzard games through Battle.net. |
| `updates.js` | Shows game update progress during launch. |
| `release-check.js` | Asks GitHub whether a newer Nexus release exists. |
| `steam-local.js` | Reads Steam's own files on this PC: total hours per game and achievements. No login or key needed. |
| `lifetime.js` | Works out total hours per game (Steam, your Overwatch profile, or a number typed in) and loads achievements. |
| `info.js` | Looks up covers, screenshots and descriptions for games. |
| `icons.js`, `extract-icons.ps1` | Pull app icons out of programs. |
| `store-apps.ps1` | Lists Microsoft Store apps (Roblox, Minecraft, Game Pass). |
| `feeds.js` | Game news and the Barça page data. |
| `overwatch.js` | Overwatch career stats from the public stats site. |
| `overlay.js`, `overlay-preload.js` | The in-game overlay window. |
| `media.js` | Reads the currently playing song for the overlay. |
| `shell-mode.js` | The optional "Nexus as the Windows desktop" setting. |
| `starter-tags.js` | Default tags suggested for new games. |
| `linux.js` | All Linux support in one place (Steam, Heroic, Lutris, `.desktop` apps, playtime, music). |
| `preload.js` | The safe bridge between the main process and the interface. |

## `renderer/`: the interface

| Path | What it does |
| --- | --- |
| `index.html` | The main window. Loads the styles and scripts below. |
| `overlay.html` | The in-game overlay page. |
| `toast.html` | The small popup window (badges, reminders). |
| `css/app.css` | All styling for the main window in one file. |
| `js/` | The scripts, one per feature (below). |

Scripts in `renderer/js/`:

| File | Feature |
| --- | --- |
| `app.js` | The library, search, game pages and menus. Starts everything else. |
| `util.js`, `theme.js` | Shared helpers, colours and themes. |
| `settings-ui.js` | The Settings page. |
| `stats.js` | Playtime charts and the Stats page. |
| `advancements.js` | All the advancements (tiers, secret ones, per-game ones) and how they are drawn. |
| `lifetime-ui.js` | Total hours and Steam achievements on a game's page. |
| `onboarding.js` | The welcome guide (first run) and the "What's new" note (after an update). |
| `gacha-ui.js` | The gacha helper page. |
| `ow-ui.js` | The Overwatch match log and statistics page. |
| `barca.js`, `news.js` | The Barça page and the news page. |
| `picker.js` | "What should I play". |
| `bigscreen.js` | Controller and big-screen mode. |
| `tips.js`, `tips-more.js` | Loading-screen tips and mini challenges. |
| `tags.js` | Game tags. |
| `sound.js`, `fx-v6.js` | Sound effects and visual effects. |
| `overlay.js` | The script for `overlay.html`. |

## Releasing a new version

1. Change `version` in `package.json` and add an entry for it in `shared/release-notes.js` (shown once after the update).
2. Close Nexus, run `npm run dist`, then run `Nexus/Update Nexus.bat`.
3. Copy the source into `Nexus-Github`, push it, and create a GitHub release with the same version as its tag, attaching `dist/Nexus Setup <version>.exe`.

## Where things go

- New interface feature: add a script in `renderer/js/` and one `<script>` line in `renderer/index.html`.
- New place to look for games: add a `scan...` function in `src/scanner.js`.
- New setting: add a default in `src/store.js` and a row in `renderer/js/settings-ui.js`.
