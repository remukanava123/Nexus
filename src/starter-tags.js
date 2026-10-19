// Starter tags for games Nexus knows about. Only applied once, on first run; after that the tags are yours to edit.
const RULES = [
  [/star rail/i, ['Gacha', 'Story', 'Grinding', 'Turn-based']],
  [/wuthering/i, ['Gacha', 'Action', 'Story', 'Grinding', 'Open world']],
  [/genshin/i, ['Gacha', 'Open world', 'Story', 'Grinding', 'Co-op']],
  [/zenless/i, ['Gacha', 'Action', 'Story', 'Grinding']],
  [/overwatch/i, ['Shooter', 'Competitive', 'Multiplayer']],
  [/fortnite/i, ['Shooter', 'Competitive', 'Multiplayer']],
  [/rocket league/i, ['Sports', 'Competitive', 'Multiplayer']],
  [/beat saber/i, ['VR', 'Rhythm', 'Chill']],
  [/phasmophobia/i, ['Horror', 'Co-op', 'Multiplayer']],
  [/lethal company/i, ['Horror', 'Co-op', 'Multiplayer']],
  [/portal 2/i, ['Puzzle', 'Story', 'Singleplayer', 'Co-op']],
  [/team fortress/i, ['Shooter', 'Competitive', 'Multiplayer']],
  [/tmodloader/i, ['Sandbox', 'Mods', 'Co-op']],
  [/^terraria/i, ['Sandbox', 'Co-op', 'Grinding']],
  [/deltarune/i, ['Story', 'RPG', 'Singleplayer']],
  [/cities: skylines/i, ['Sim', 'Strategy', 'Chill', 'Singleplayer']],
  [/hearts of iron/i, ['Strategy', 'Singleplayer']],
  [/football manager/i, ['Sim', 'Sports', 'Singleplayer']],
  [/efootball/i, ['Sports', 'Multiplayer']],
  [/skate\./i, ['Sports', 'Multiplayer']],
  [/minecraft dungeons/i, ['Action', 'Co-op']],
  [/^rounds$/i, ['Party', 'Competitive', 'Multiplayer']],
  [/golf with your friends/i, ['Party', 'Sports', 'Multiplayer', 'Chill']],
  [/supermarket together/i, ['Sim', 'Co-op', 'Chill']],
  [/orange juice/i, ['Party', 'Strategy', 'Multiplayer']],
];

// Tags offered as quick picks even before any game uses them
const SUGGESTED = ['Playing', 'Finished', 'Dropped', 'Wishlist', 'Co-op', 'Multiplayer', 'Singleplayer', 'Chill', 'Grinding', 'Story', 'Competitive', 'Gacha'];

function starterTagsFor(name) {
  for (const [re, tags] of RULES) if (re.test(name || '')) return tags;
  return null;
}

module.exports = { starterTagsFor, SUGGESTED };
