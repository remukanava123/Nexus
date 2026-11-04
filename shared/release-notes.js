// What's new, shown once after Nexus is updated. Add an entry for each version you release (the key is the version in package.json).
module.exports = {
  '1.3.4': {
    title: 'Update labels for Battle.net games',
    items: [
      ['⬇️', 'Battle.net games that need an update', 'Overwatch and your other Blizzard games now get the Update label too, when Blizzard has a newer version than the one installed.'],
    ],
  },
  '1.3.3': {
    title: 'A clip player, and launches that never get stuck',
    items: [
      ['▶️', 'Clips play in Nexus', 'Click a clip to watch it right here, with pause, seeking, volume, speed, repeat, frame steps and full screen. The ⋯ button opens it in Medal or your own player instead.'],
      ['💬', 'Popups get through', 'If a game or launcher opens a dialog box or a login while starting, Nexus steps aside straight away so you can answer it, then goes behind the game.'],
      ['🤫', 'Quiet and windowed games', 'Games without sound now start in seconds instead of a minute, and games in a smaller window are recognised too.'],
      ['📸', 'A shutter for Clips', 'The Clips button has its own sound.'],
      ['🎞️', 'Newer clips play', 'Clips Medal saved in HEVC, or with your microphone on its own track, no longer play sound over a black picture. The first time, Nexus makes a copy that plays (a few seconds on your graphics card); after that they open at once.'],
      ['⬇️', 'Games that need an update', 'An Update label on the cover, and a row of them at the top of Games: Steam games, Star Rail, Genshin, ZZZ and Wuthering Waves.'],
      ['🎛️', 'The overlay, game by game', 'Choose which games get the overlay, and give any game its own widgets and layout. Settings → Game overlay.'],
      ['🎶', 'Bars that follow your music', 'The overlay’s sound bars listen only to the app playing music, not the game.'],
      ['🎲', 'Fairer picks', '“Favour games I’ve played less” now counts all your hours (Steam’s too), so your 500-hour games stop coming up.'],
    ],
  },
  '1.3.2': {
    title: 'Your clips, and news for the games you play',
    items: [
      ['🎬', 'Clips from Medal', 'A new Clips page shows the clips and screenshots you saved with Medal, and each game’s page shows its own. Hover a clip to preview it, click to play it. Hide the page under Settings → Sidebar.'],
      ['📰', 'Choose your news', 'News → Choose games: untick the games you don’t play and the News page leaves them out.'],
      ['🎯', 'Open queue and Stadium', 'Overwatch matches can be open queue or Stadium. Pick Tank, Damage or Support and only that role’s heroes can be added.'],
      ['🤖', 'Auto log keeps every hero', 'Results logged automatically now list every hero you played in the match, not just one.'],
      ['🐛', 'Fixes', 'The Barça page no longer gets covered by a big red shape while a match is live.'],
    ],
  },
  '1.3.1': {
    title: 'Every Overwatch hero, and more than one per match',
    items: [
      ['🦸', 'All the new heroes and maps', 'The Overwatch page knows every hero up to now (Domina, Anran, Emre, Mizuki, Jetpack Cat and the rest of 2026’s heroes, plus Zarya, who was missing) and the new maps such as Neon Junction. Nexus checks for new ones once a week, so next season’s heroes appear by themselves.'],
      ['🔀', 'Several heroes per match', 'Switched heroes mid-game? Add each one when you log the match (or later in the history). The match counts for every hero you played in “Win rate by hero”.'],
    ],
  },
  '1.3.0': {
    title: 'Games that really start, and make it yours',
    items: [
      ['🚀', 'Launchers that start the game', 'Nexus no longer gives up while a launcher is still checking its files (a greyed-out Start button). If a launcher needs you, Nexus steps aside but keeps watching, and presses Start the moment it appears. Battle.net waits while you log in and then starts the game.'],
      ['⏱️', 'Tracking that sees more games', 'Games that run as administrator (Star Rail and friends), games added as a shortcut, and games whose launcher starts another program (like Roblox) are now counted.'],
      ['⚡', 'Lighter and quicker', 'The Windows helpers no longer rebuild themselves every time they start, nothing extra runs while you play, and Nexus is back about a second after you quit a game.'],
      ['🎨', 'Customise almost everything', 'Font, cover shape, spacing and hover effect, what shows under each cover, an icons-only sidebar, hiding sidebar pages, popup corner and more. Settings → Appearance, Sidebar and Playtime.'],
      ['🕐', 'Your hours, your way', 'Show your total hours, only the hours Nexus counted, or both, as “12.5h” or “12h 30m”. Settings → Playtime → Hours to show.'],
      ['✏️', 'Rename anything', 'Right-click a game or app → Rename… to show your own name for it.'],
      ['🛟', 'Safer data', 'If your library file is ever damaged, Nexus carries on from the last good copy instead of starting over. Backups now include tags, names, Overwatch matches and typed-in hours.'],
      ['🐛', 'Fixes', 'Links on a game’s page no longer open twice, streaks survive the clock change, covers with an apostrophe in their path show up, and background updates no longer wipe what you are typing.'],
    ],
  },
  '1.2.2': {
    title: 'Hours, achievements and new advancements',
    items: [
      ['⏱️', 'Hours you already played', 'Games now show their total hours, for example “632h played · 43h in Nexus”. Steam hours come straight from Steam, Overwatch from your public profile, and for any other game you can type the number in on its page.'],
      ['🏆', 'Steam achievements', 'A game’s page shows how many achievements you have, the rarest ones, and what is still locked.'],
      ['✨', 'Advancements, rebuilt', 'Tiers, rarity, progress bars and a few hidden ones. The Stats page lists what to chase next.'],
      ['🧩', 'Roblox, Minecraft and EA games', 'They now show up under Games, and EA app games are found automatically.'],
      ['🎨', 'New logo and sounds', 'A new logo on the startup screen, the taskbar and the tray, and animated sidebar icons with their own quiet sounds (smoke from the chimney, a rising stats line, a ball hitting the net for Barça). Turn the sounds off under Settings → Sound.'],
      ['⚙️', 'Simpler settings', 'Settings has a Basic and an Advanced tab, so the everyday options are easy to find.'],
      ['👋', 'Welcome guide', 'New installs get a short setup. You can open it again from Settings → Advanced.'],
      ['🔔', 'Update notices', 'When a new version is out on GitHub, the Home page shows an "Update available" banner. One click downloads the installer, checks it, runs it and reopens Nexus. This page is shown once after you update.'],
    ],
  },
};
