// What's new, shown once after Nexus is updated. Add an entry for each version you release (the key is the version in package.json).
module.exports = {
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
