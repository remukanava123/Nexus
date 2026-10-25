// Things to read on the "Launching…" card while a game is still starting up

const GENERAL_TIPS = [
  { tag: 'Tip', text: 'Follow the 20-20-20 rule: every 20 minutes, look at something 20 feet away for 20 seconds.' },
  { tag: 'Tip', text: 'Keep a glass of water next to your desk. Long sessions go better when you are not dehydrated.' },
  { tag: 'Tip', text: 'Stand up and stretch your wrists and shoulders every hour. Future you will say thanks.' },
  { tag: 'Tip', text: 'If a boss keeps beating you, change one thing at a time. Gear, positioning or timing, not all three.' },
  { tag: 'Tip', text: 'Take a break after three losses in a row. Tilt is real, and it never helps.' },
  { tag: 'Tip', text: 'Check the in-game settings once: sensitivity, subtitles and audio mix change how a game feels a lot.' },
  { tag: 'Tip', text: 'Headphones with the volume a bit lower beat speakers turned up, for you and the neighbours.' },
  { tag: 'Tip', text: 'Save often, and in more than one slot. Corrupted saves always happen right before the good part.' },
  { tag: 'Tip', text: 'Reading a quest or item description fully once is usually faster than guessing three times.' },
  { tag: 'Tip', text: 'Not sure what to play next? Try the "Pick a game" button and let Nexus decide.' },

  { tag: 'Nexus', text: 'Press the global hotkey anywhere to show or hide Nexus. You can change it in Settings.' },
  { tag: 'Nexus', text: 'F11 switches to big-screen mode: a controller-friendly view of your whole library.' },
  { tag: 'Nexus', text: 'Ctrl+R spins the "What should I play?" picker.' },
  { tag: 'Nexus', text: 'The Stats page has dozens of badges. Some are specific to games in your library.' },
  { tag: 'Nexus', text: 'The Gacha page keeps your daily and weekly reset timers, stamina and pity counters in one place.' },
  { tag: 'Nexus', text: 'Nexus counts playtime for anything it can see running, even games you started somewhere else.' },
  { tag: 'Nexus', text: 'The tray icon tells you at a glance whether Nexus thinks you are playing something.' },
  { tag: 'Nexus', text: 'Favourite a game with the star and it shows up on the Favourites page and your home screen.' },

  { tag: 'Did you know', text: 'Tetris was created in 1984 by Alexey Pajitnov, a software engineer in Moscow.' },
  { tag: 'Did you know', text: "Pac-Man's original Japanese name was Puck-Man. The name changed for the US release." },
  { tag: 'Did you know', text: 'Mario was first called Jumpman, in the 1981 arcade game Donkey Kong.' },
  { tag: 'Did you know', text: 'The first widely known video game Easter egg is a hidden room in Atari\'s Adventure, from 1979.' },
  { tag: 'Did you know', text: 'The Konami Code (up, up, down, down, left, right, left, right, B, A) first appeared in Gradius.' },
  { tag: 'Did you know', text: 'Pong, released by Atari in 1972, was one of the first commercially successful arcade games.' },
  { tag: 'Did you know', text: 'Super Mario Bros. launched in Japan in 1985 and helped save the console industry after the 1983 crash.' },
  { tag: 'Did you know', text: 'Steam launched in 2003 as a way to deliver updates for Valve\'s own games.' },
  { tag: 'Did you know', text: '"The cake is a lie" comes from Portal, released in 2007.' },
  { tag: 'Did you know', text: 'The Minecraft creeper reportedly started out as a bug while its creator was trying to make a pig.' },
  { tag: 'Did you know', text: 'Sonic the Hedgehog made his debut in 1991 as Sega\'s answer to Mario.' },

  { tag: 'Random', text: 'Fun challenge: play your next game for one session without checking a guide.' },
  { tag: 'Random', text: 'Somewhere out there, someone is still on the first level of a game you already finished.' },
  { tag: 'Random', text: 'A game that is "five more minutes" long is, statistically, not five minutes long.' },
  { tag: 'Random', text: 'Your backlog is not a to-do list. It is a very large, very patient shopping cart.' },
  { tag: 'Random', text: 'Quick check: shoulders down, jaw unclenched, and a straight back. You are welcome.' },
  { tag: 'Random', text: 'Achievement idea: finish a game you started more than a year ago.' },
  { tag: 'Random', text: 'Loading... loading... still loading. At least this card has tips.' },
];

// Shown first when you launch that game (the key is matched against the game's name)
const GAME_TIPS = [
  [/star rail/i, [
    'Honkai: Star Rail — Use your Trailblaze Power before it overflows, and do your Daily Training before the reset.',
    'Honkai: Star Rail — Check the weekly bosses and Simulated Universe before the weekly reset.',
    'Honkai: Star Rail — Speed (SPD) decides who acts first, so a few extra points can change a whole fight.',
  ]],
  [/wuthering/i, [
    'Wuthering Waves — Spend your Waveplates before they overflow, and do your daily tasks before the reset.',
    'Wuthering Waves — Swapping Resonators at the right moment keeps your combos going.',
    'Wuthering Waves — Parry and dodge at the last moment to counter. It feels great once it clicks.',
  ]],
  [/genshin/i, [
    'Genshin Impact — Spend Original Resin before it overflows, and do the daily commissions.',
    'Genshin Impact — Elemental reactions matter more than raw damage in most fights.',
  ]],
  [/zenless/i, [
    'Zenless Zone Zero — Do not forget your daily activity and battery charge before the reset.',
    'Zenless Zone Zero — Timing your dodges and chain attacks is the whole game.',
  ]],
  [/overwatch/i, [
    'Overwatch — Talk to your team. Calling out ultimates wins fights.',
    'Overwatch — If you are stuck, swap heroes. Countering the enemy team is not a crime.',
  ]],
  [/rocket league/i, [
    'Rocket League — Rotate. Do not all chase the ball at once.',
    'Rocket League — Practice mode is your friend: ten minutes there makes a difference.',
  ]],
  [/fortnite/i, [
    'Fortnite — Land away from the crowd if you just want to get your loot in peace.',
    'Fortnite — Build and edit practice is free in Creative. Use it.',
  ]],
  [/portal 2/i, [
    'Portal 2 — Momentum is conserved. Fall into a portal and you come out of the other one just as fast.',
    'Portal 2 — If a puzzle feels impossible, look up. The answer is often on the ceiling.',
  ]],
  [/team fortress/i, [
    'Team Fortress 2 — Heal your teammates. Medics win games.',
    'Team Fortress 2 — Stay with your team. A lone Heavy is a Spy\'s best friend.',
  ]],
  [/terraria|tmodloader/i, [
    'Terraria — Do not dig straight down. Ever.',
    'Terraria — Build a house early so an NPC can move in. You will want the Guide.',
  ]],
  [/phasmophobia/i, [
    'Phasmophobia — Keep the lights on. Your sanity drains faster in the dark.',
    'Phasmophobia — Do not go in alone unless you really mean it.',
  ]],
  [/lethal company/i, [
    'Lethal Company — Watch the clock. Staying out too late is how you do not come back.',
    'Lethal Company — Stay close to your team, and do not run toward screaming.',
  ]],
  [/beat saber/i, [
    'Beat Saber — Keep your arms loose and your wrist movement small. The swing matters more than the force.',
  ]],
  [/football manager/i, [
    'Football Manager — Check your squad\'s fitness before every match. Tired players make mistakes.',
    'Football Manager — "One more match" is how it gets to be 4 am.',
  ]],
  [/skate\./i, [
    'skate. — Learn the basics first. Flip tricks are way easier once you can ride.',
  ]],
  [/cities: skylines/i, [
    'Cities: Skylines — Traffic is always the answer. And always the problem.',
  ]],
  [/hearts of iron/i, [
    'Hearts of Iron IV — Supply is everything. An army with no supplies is just a very expensive crowd.',
  ]],
  [/deltarune/i, [
    'DELTARUNE — Talk to everyone. Then talk to them again.',
  ]],
  [/golf with/i, [
    'Co-op tip — Agree on a plan before the round starts. Then watch it fall apart. It is part of the fun.',
  ]],
];

// More per-game lines: { tag, text } where tag is Lore, Reference, Quote, Trivia or Game tip
const GAME_EXTRA = [
  [/star rail/i, [
    { tag: 'Lore', text: 'The Astral Express is a train that travels between worlds. Its crew follows the Path of the Trailblaze.' },
    { tag: 'Lore', text: 'March 7th was frozen in ice for a very long time and has no memory of who she was. She still takes a lot of photos.' },
    { tag: 'Reference', text: 'Pom-Pom, the conductor, is the one who truly keeps the Astral Express running.' },
    { tag: 'Trivia', text: 'Each Path (Destruction, Hunt, Erudition, Harmony, Nihility, Preservation, Abundance, Remembrance) names a different way of seeing the universe.' },
    { tag: 'Game tip', text: 'Break an enemy\'s Toughness with its weakness type to open it up for big damage.' },
    { tag: 'Game tip', text: 'Relic sets give big bonuses at 2 and 4 pieces. Aim for the set your character wants before rolling for substats.' },
    { tag: 'Quote', text: 'All aboard! The next stop is waiting.' },
  ]],
  [/wuthering/i, [
    { tag: 'Lore', text: 'The Lament is the catastrophe that scarred Solaris-3. Resonators are the people who woke up their powers afterwards.' },
    { tag: 'Lore', text: 'The Rover wakes up with no memories and a power that can calm Tacet Discords.' },
    { tag: 'Reference', text: 'Echoes are the remains of fallen Tacet Discords. Equipping one gives you its skill and a bonus.' },
    { tag: 'Game tip', text: 'Perform a Dodge Counter right as an enemy attack lands. The slow motion gives you free damage.' },
    { tag: 'Game tip', text: 'Use Intro and Outro skills on every swap. They carry bonuses that are easy to miss.' },
    { tag: 'Quote', text: 'The world is wide. Keep your eyes open.' },
  ]],
  [/genshin/i, [
    { tag: 'Lore', text: 'Teyvat has seven nations, each tied to an element and a god. The Traveler is looking for their lost sibling.' },
    { tag: 'Reference', text: 'Paimon is not food. Or at least, she very much insists she is not emergency food.' },
    { tag: 'Trivia', text: 'Statues of The Seven restore your party\'s health when you interact with them.' },
    { tag: 'Game tip', text: 'Plan your daily Commissions and Resin before you wander. Collecting is easier on the way.' },
    { tag: 'Game tip', text: 'Swirl, Melt and Vaporize are strong reactions. Know which elements go together.' },
    { tag: 'Quote', text: 'Go adventuring! There is always something around the next cliff.' },
  ]],
  [/zenless/i, [
    { tag: 'Lore', text: 'New Eridu is the last major city, built after the Hollows swallowed most of the world.' },
    { tag: 'Reference', text: 'Bangboo are the small robot mascots that help on missions. They are very good boys.' },
    { tag: 'Game tip', text: 'Perfect Assist is the fastest way to chain a swap. Learn the timing early.' },
  ]],
  [/overwatch/i, [
    { tag: 'Quote', text: 'Heroes never die!' },
    { tag: 'Quote', text: 'The world could always use more heroes.' },
    { tag: 'Trivia', text: 'Overwatch was born from the cancelled Blizzard MMO project "Titan".' },
  ]],
  [/rocket league/i, [
    { tag: 'Trivia', text: 'Rocket League started as a sequel to a small game called "Supersonic Acrobatic Rocket-Powered Battle-Cars".' },
    { tag: 'Quote', text: 'What a save!' },
  ]],
  [/fortnite/i, [
    { tag: 'Trivia', text: 'Fortnite began as a co-op "Save the World" game before Battle Royale took over.' },
    { tag: 'Quote', text: 'Victory Royale.' },
  ]],
  [/portal/i, [
    { tag: 'Quote', text: 'The cake is a lie.' },
    { tag: 'Reference', text: 'GLaDOS promised cake, testing, and a pleasant experience. Only one of those is certain.' },
    { tag: 'Trivia', text: 'The Weighted Companion Cube has no voice, but people remember it better than most characters.' },
  ]],
  [/team fortress/i, [
    { tag: 'Quote', text: 'Medic!' },
    { tag: 'Trivia', text: 'Team Fortress 2 launched in 2007 as part of The Orange Box. It is still getting hats.' },
  ]],
  [/terraria|tmodloader/i, [
    { tag: 'Reference', text: 'The Guide is basically a wiki with legs. Treat him kindly. Mostly.' },
    { tag: 'Quote', text: 'You feel an evil presence watching you...' },
    { tag: 'Trivia', text: 'Terraria has been getting free updates for over a decade.' },
  ]],
  [/phasmophobia/i, [
    { tag: 'Trivia', text: 'You can talk to the ghost using your real voice. It can respond to what you say.' },
    { tag: 'Quote', text: 'Is anyone there?' },
  ]],
  [/lethal company/i, [
    { tag: 'Quote', text: 'Quota not met. Management is displeased.' },
    { tag: 'Reference', text: 'Never trust the "I heard it was fine" from the person who has not come back yet.' },
  ]],
  [/beat saber/i, [
    { tag: 'Trivia', text: 'Beat Saber was made by a small Czech studio, Beat Games, and launched in 2018.' },
  ]],
  [/football manager/i, [
    { tag: 'Quote', text: 'Squad depth wins leagues. Cup finals are won by whoever stays awake.' },
    { tag: 'Trivia', text: 'Football Manager was once called "Championship Manager" before Sports Interactive went their own way.' },
  ]],
  [/skate\./i, [
    { tag: 'Quote', text: 'Land it clean, and the world is yours.' },
  ]],
  [/cities: skylines/i, [
    { tag: 'Reference', text: 'Every junction you build gets a slightly different "traffic jam" story.' },
  ]],
  [/hearts of iron/i, [
    { tag: 'Trivia', text: 'There are people who have played more than a thousand hours of Hearts of Iron IV.' },
  ]],
  [/deltarune/i, [
    { tag: 'Reference', text: 'Hee hee! Remember, the Light World only seems quiet.' },
    { tag: 'Quote', text: 'Deal with it. Or do not. Either way, the chapter ends.' },
  ]],
  [/minecraft/i, [
    { tag: 'Quote', text: 'Never dig straight down.' },
  ]],
  [/elden ring/i, [
    { tag: 'Quote', text: 'Maidenless.' },
    { tag: 'Game tip', text: 'Summon Torrent and run past what you cannot beat. There is no shame in coming back later.' },
  ]],
  [/hollow knight/i, [
    { tag: 'Quote', text: 'No cost too great.' },
    { tag: 'Game tip', text: 'Check the map shop. You will thank yourself later.' },
  ]],
  [/stardew/i, [
    { tag: 'Game tip', text: 'Water your crops, give someone a gift, then go to bed. Repeat for a hundred hours.' },
    { tag: 'Trivia', text: 'Stardew Valley was largely made by a single developer, ConcernedApe.' },
  ]],
  [/counter-strike|cs2|csgo/i, [
    { tag: 'Quote', text: 'Terrorists win.' },
    { tag: 'Game tip', text: 'Crosshair placement at head height wins more duels than flicks.' },
  ]],
  [/valorant/i, [
    { tag: 'Game tip', text: 'Do not peek the same angle three times in a row. They will be ready.' },
  ]],
  [/league of legends/i, [
    { tag: 'Quote', text: 'Welcome to Summoner\'s Rift.' },
    { tag: 'Game tip', text: 'Ward the river before the objective spawns, not after.' },
  ]],
  [/dota/i, [
    { tag: 'Quote', text: 'Gentlemen, we have the high ground.' },
  ]],
  [/apex/i, [
    { tag: 'Quote', text: 'Welcome to the Apex Games.' },
    { tag: 'Game tip', text: 'Third-party the fights. Let others thin each other out first.' },
  ]],
  [/gta|grand theft/i, [
    { tag: 'Quote', text: 'Wasted.' },
  ]],
  [/witcher/i, [
    { tag: 'Quote', text: 'Wind\'s howling.' },
    { tag: 'Game tip', text: 'Always read the monster entry in the bestiary before a fight.' },
  ]],
  [/cyberpunk/i, [
    { tag: 'Quote', text: 'Wake the f*** up, Samurai. We have a city to burn.' },
  ]],
  [/zelda|hyrule|breath of the wild|tears of the kingdom/i, [
    { tag: 'Quote', text: 'It is dangerous to go alone!' },
  ]],
  [/halo/i, [
    { tag: 'Quote', text: 'Finish the fight.' },
  ]],
  [/doom/i, [
    { tag: 'Quote', text: 'Rip and tear, until it is done.' },
  ]],
  [/skyrim/i, [
    { tag: 'Quote', text: 'I used to be an adventurer like you, then I took an arrow to the knee.' },
  ]],
  [/battle.?net|diablo/i, [
    { tag: 'Quote', text: 'Stay awhile and listen.' },
  ]],
  [/steam|epic games/i, [
    { tag: 'Random', text: 'Your Steam library is a collection of "someday" playlists.' },
  ]],
];

// Even more per-game lines (same format as GAME_EXTRA)
const GAME_FUN = [
  [/star rail/i, [
    { tag: 'Trivia', text: 'Honkai: Star Rail launched in April 2023 and had over 20 million pre-registrations before release.' },
    { tag: 'Reference', text: 'The Trailblazer cannot walk past a trash can without checking inside. It is practically a Path of its own.' },
    { tag: 'Reference', text: 'Himeko makes the coffee on the Astral Express. Nobody on board is brave enough to say what it tastes like.' },
    { tag: 'Lore', text: 'Herta built the Simulated Universe on her space station. She mostly just wanted to see what would happen.' },
    { tag: 'Lore', text: 'Jarilo-VI, the frozen world where Belobog stands, was the Express crew\'s first stop on this journey.' },
    { tag: 'Lore', text: 'The Xianzhou Luofu is a giant ship-city that has been sailing the stars for thousands of years.' },
    { tag: 'Lore', text: 'Penacony is a planet of dreams, where the party never ends. Unless you look a little too closely.' },
    { tag: 'Trivia', text: 'Welt Yang first appeared in Honkai Impact 3rd before boarding the Astral Express.' },
    { tag: 'Trivia', text: 'Trailblaze Power comes back at one point every six minutes, so a full bar takes about a day to refill.' },
    { tag: 'Game tip', text: 'Technique attacks on the overworld start fights with an advantage. Hit enemies before they hit you.' },
    { tag: 'Game tip', text: 'Save Skill Points for the characters that need them most. Not every turn needs a Skill.' },
    { tag: 'Game tip', text: 'Planar Ornaments are a separate set from Relics, so you can mix both bonuses on one character.' },
    { tag: 'Game tip', text: 'Use Auto-Battle for easy farming, but turn it off for bosses. The AI loves wasting Ultimates.' },
    { tag: 'Quote', text: 'May this journey lead us starward.' },
    { tag: 'Random', text: 'Somewhere on the Express, Pom-Pom is cleaning up after the Trailblazer again.' },
  ]],
  [/wuthering/i, [
    { tag: 'Trivia', text: 'Wuthering Waves comes from Kuro Games, the studio behind Punishing: Gray Raven. That explains the combat.' },
    { tag: 'Trivia', text: 'Wuthering Waves launched in May 2024 on PC and mobile.' },
    { tag: 'Lore', text: 'Jinzhou is the city in Huanglong where the Rover\'s journey really starts.' },
    { tag: 'Lore', text: 'Tacet Fields are places where the Lament left its mark. Echoes gather there.' },
    { tag: 'Lore', text: 'Rinascita is a region of islands and festivals, very different from the mountains of Huanglong.' },
    { tag: 'Game tip', text: 'You can run up walls and use the grappling hook. Exploring vertically saves a lot of time.' },
    { tag: 'Game tip', text: 'Match your Echo set (Sonata Effect) to your Resonator\'s element. The 5-piece bonus is big.' },
    { tag: 'Game tip', text: 'Absorb Echoes from enemies you defeat. Rarer ones drop more often as your Data Bank levels up.' },
    { tag: 'Game tip', text: 'Concerto energy fills as you fight. A full bar means your swap triggers the Outro and the next Intro.' },
    { tag: 'Game tip', text: 'Watch for the yellow flash on enemy attacks. That is your cue to counter.' },
    { tag: 'Quote', text: 'The sound of the tide never really stops.' },
    { tag: 'Random', text: 'Waveplates: the only thing in Solaris-3 that refills slower than your patience.' },
  ]],
  [/genshin/i, [
    { tag: 'Trivia', text: 'Genshin Impact launched in September 2020 on PC, mobile and PlayStation at the same time.' },
    { tag: 'Lore', text: 'Mondstadt, Liyue, Inazuma, Sumeru, Fontaine, Natlan and Snezhnaya are the seven nations of Teyvat.' },
    { tag: 'Game tip', text: 'Gliding off high places is usually faster than walking around. Climb, then glide.' },
    { tag: 'Game tip', text: 'Condensed Resin lets you claim two rewards at once. Craft it when you are about to cap.' },
    { tag: 'Quote', text: 'Ehe te nandayo!' },
  ]],
  [/zenless/i, [
    { tag: 'Trivia', text: 'Zenless Zone Zero launched in July 2024. You play a Proxy who guides people through the Hollows.' },
    { tag: 'Reference', text: 'The Proxy siblings run a video rental shop as a cover. Business is... occasionally good.' },
    { tag: 'Game tip', text: 'Daze an enemy fully to Stun it, then swap in your damage dealer for the big hits.' },
  ]],
  [/overwatch/i, [
    { tag: 'Quote', text: 'It\'s high noon.' },
    { tag: 'Quote', text: 'Nerf this!' },
    { tag: 'Quote', text: 'Hammer down!' },
    { tag: 'Quote', text: 'Cheers, love! The cavalry\'s here!' },
    { tag: 'Quote', text: 'Ryūjin no ken wo kurae!' },
    { tag: 'Trivia', text: 'Overwatch came out in 2016. Overwatch 2 replaced it in 2022, went free-to-play and switched to 5v5.' },
    { tag: 'Trivia', text: 'Ana is Pharah\'s mother. The family business is clearly flying and shooting things.' },
    { tag: 'Trivia', text: 'Winston is a genetically engineered gorilla who grew up in a research base on the Moon.' },
    { tag: 'Trivia', text: 'Torbjörn is Swedish, and his daughter Brigitte joined the roster later as a support hero.' },
    { tag: 'Trivia', text: 'Junkrat and Roadhog come from the Australian Outback, which explains a lot.' },
    { tag: 'Game tip', text: 'Group up before you push. Five people walking in one at a time is how teamfights are lost.' },
    { tag: 'Game tip', text: 'Health packs are on the map for a reason. Learn where they are on every map you play.' },
    { tag: 'Game tip', text: 'Look at the kill feed after a lost fight. It usually tells you exactly what went wrong.' },
    { tag: 'Random', text: 'Somewhere, a Mercy is waiting to res the team. And a Genji is waiting for a Nano.' },
  ]],
  [/rocket league/i, [
    { tag: 'Trivia', text: 'Rocket League came out in 2015 from Psyonix. Epic Games bought the studio in 2019, and the game went free-to-play in 2020.' },
    { tag: 'Trivia', text: 'Small boost pads give 12 boost. The big orange ones fill you to 100.' },
    { tag: 'Quote', text: 'Calculated.' },
    { tag: 'Quote', text: 'Nice shot!' },
    { tag: 'Quote', text: 'Wow!' },
    { tag: 'Game tip', text: 'Toggle ball cam on and off. Ball cam for following play, off for lining up shots and boost.' },
    { tag: 'Game tip', text: 'Collect the small boost pads on your way. Driving across the field for a big one leaves your goal open.' },
    { tag: 'Game tip', text: 'Learn a fast kickoff. Winning the first touch decides a lot of games.' },
    { tag: 'Game tip', text: 'Do not jump at a ball you cannot reach first. Staying on the ground keeps you in the play.' },
    { tag: 'Random', text: '"Chat disabled for 3 seconds" is a valid strategy.' },
  ]],
  [/fortnite/i, [
    { tag: 'Trivia', text: 'Fortnite\'s Battle Royale mode arrived in September 2017, just a couple of months after Save the World.' },
    { tag: 'Trivia', text: 'Millions of players watched live in-game concerts in Fortnite, including Travis Scott\'s in 2020.' },
    { tag: 'Reference', text: 'Peely is a banana in a suit of armour. Somehow it works.' },
    { tag: 'Reference', text: 'Thank the bus driver. Every single time.' },
    { tag: 'Game tip', text: 'Watch the storm timer. Rotating early beats running through the storm with no shield.' },
    { tag: 'Game tip', text: 'High ground is king. Even a ramp or two can win you a fight.' },
    { tag: 'Game tip', text: 'Listen for footsteps and chests. Good headphones are basically a cheat code here.' },
  ]],
  [/portal/i, [
    { tag: 'Trivia', text: 'Wheatley is voiced by Stephen Merchant, and Cave Johnson by J.K. Simmons.' },
    { tag: 'Trivia', text: 'Portal 2\'s co-op mode stars two robots, Atlas and P-Body.' },
    { tag: 'Reference', text: 'Space. Space. Wanna go to space. (The Space Core made it in the end.)' },
    { tag: 'Reference', text: 'For part of Portal 2, GLaDOS runs on a potato. She is not thrilled about it.' },
    { tag: 'Game tip', text: 'Blue gel bounces you, orange gel speeds you up, and white gel lets you place portals almost anywhere.' },
    { tag: 'Game tip', text: 'Stuck? Look for the surfaces that take portals. Everything else is set dressing.' },
    { tag: 'Quote', text: 'When life gives you lemons, don\'t make lemonade.' },
  ]],
  [/team fortress/i, [
    { tag: 'Trivia', text: 'Team Fortress 2 went free-to-play in 2011, four years after launch.' },
    { tag: 'Trivia', text: 'The Heavy\'s minigun is named Sasha. He loves her very much.' },
    { tag: 'Trivia', text: 'There are nine classes: Scout, Soldier, Pyro, Demoman, Heavy, Engineer, Medic, Sniper and Spy.' },
    { tag: 'Reference', text: 'The Sandvich heals you. It also turns lunch into a battle strategy.' },
    { tag: 'Quote', text: 'Spy\'s sappin\' my sentry!' },
    { tag: 'Quote', text: 'Nope.' },
    { tag: 'Game tip', text: 'Spy-check your teammates. A friendly Pyro bumping into you is a good sign.' },
    { tag: 'Game tip', text: 'Engineers: put the dispenser and sentry where they cover each other, not out in the open.' },
  ]],
  [/terraria|tmodloader/i, [
    { tag: 'Trivia', text: 'Terraria came out in 2011 from Re-Logic. Its 1.4 update was called "Journey\'s End", and it still was not the end.' },
    { tag: 'Trivia', text: 'Beating the Wall of Flesh turns your world into Hardmode, with new ores, biomes and much nastier enemies.' },
    { tag: 'Reference', text: 'The Zenith sword is made from many of the game\'s other swords. Getting it is a journey in itself.' },
    { tag: 'Reference', text: 'The Guide Voodoo Doll exists. The Guide does not know about it. Keep it that way.' },
    { tag: 'Quote', text: 'The air is getting colder around you...' },
    { tag: 'Quote', text: 'Screams echo around you...' },
    { tag: 'Game tip', text: 'Put up a few torches and a bed in every base. Your spawn point is set by the bed.' },
    { tag: 'Game tip', text: 'Build an arena with platforms and campfires before a boss. It makes a huge difference.' },
    { tag: 'Game tip', text: 'Use a Magic Mirror or recall potions to get home from deep caves.' },
    { tag: 'Game tip', text: 'tModLoader: check which mods your world uses before removing any. Some leave items behind as "unloaded".' },
  ]],
  [/phasmophobia/i, [
    { tag: 'Trivia', text: 'Phasmophobia comes from Kinetic Games and went into early access in September 2020.' },
    { tag: 'Trivia', text: 'Each ghost type leaves three kinds of evidence. Finding them is how you name it.' },
    { tag: 'Game tip', text: 'Set up a crucifix and a video camera in the ghost room early. They do the work while you look for evidence.' },
    { tag: 'Game tip', text: 'During a hunt, break line of sight and hide. Running in circles in the open rarely works.' },
    { tag: 'Game tip', text: 'Smudge sticks can buy you time during a hunt. Keep one on you.' },
    { tag: 'Quote', text: 'Give us a sign.' },
    { tag: 'Quote', text: 'Where are you?' },
    { tag: 'Random', text: 'Saying the ghost\'s name out loud: brave, or a very bad idea. Usually both.' },
  ]],
  [/lethal company/i, [
    { tag: 'Trivia', text: 'Lethal Company was made by a single developer, Zeekerss, and blew up in late 2023.' },
    { tag: 'Reference', text: 'Hoarding bugs just want your stuff. Yippee!' },
    { tag: 'Reference', text: 'The Company buys scrap. The Company does not ask how you got it.' },
    { tag: 'Game tip', text: 'Keep someone on the ship watching the monitor. They can open doors and warn you about monsters.' },
    { tag: 'Game tip', text: 'Do not look away from a Coil-Head. Keep eyes on it while you back off.' },
    { tag: 'Game tip', text: 'Sell your scrap on the last day of the quota. The price goes up as the deadline nears.' },
    { tag: 'Quote', text: 'Stay safe out there, employee.' },
  ]],
  [/beat saber/i, [
    { tag: 'Trivia', text: 'Facebook (now Meta) bought Beat Games in 2019.' },
    { tag: 'Trivia', text: 'Red blocks are for your left saber, blue for your right. Your arms will remember that forever.' },
    { tag: 'Game tip', text: 'Let your wrists do the work and keep your elbows close. You last much longer that way.' },
    { tag: 'Game tip', text: 'Look at blocks coming toward you, not at your sabers.' },
    { tag: 'Game tip', text: 'Clear some space around you. Ceiling fans, lamps and pets will thank you.' },
    { tag: 'Random', text: 'Beat Saber counts as cardio. That is the official story and we are sticking to it.' },
  ]],
  [/football manager/i, [
    { tag: 'Trivia', text: 'Sports Interactive has been owned by SEGA since 2006.' },
    { tag: 'Game tip', text: 'Use team talks carefully. Shouting at a team that is already nervous rarely helps.' },
    { tag: 'Game tip', text: 'Scout young players early. Today\'s wonderkid is cheap for about one season.' },
    { tag: 'Game tip', text: 'Do not change your tactic every match. Familiarity matters.' },
    { tag: 'Quote', text: 'The board are delighted with your appointment. For now.' },
    { tag: 'Random', text: 'Somewhere out there, someone has managed the same club for fifty in-game seasons.' },
  ]],
  [/efootball/i, [
    { tag: 'Trivia', text: 'eFootball used to be called Pro Evolution Soccer (PES). Konami renamed it and made it free-to-play in 2021.' },
    { tag: 'Game tip', text: 'Short passes beat long balls most of the time. Keep possession and wait for the gap.' },
    { tag: 'Game tip', text: 'Do not hold sprint all the time. Your players lose control and run out of stamina.' },
    { tag: 'Game tip', text: 'Switch defenders manually when the opponent breaks through. The AI will not always do it for you.' },
    { tag: 'Quote', text: 'Visca el Barça!' },
  ]],
  [/skate\./i, [
    { tag: 'Trivia', text: 'skate. is set in San Vansterdam, a city made for skating.' },
    { tag: 'Game tip', text: 'Flick-it controls: the stick motion is the trick. Slow and smooth beats fast and messy.' },
    { tag: 'Game tip', text: 'Use the replay editor. Half the fun is making a clip of the line you finally landed.' },
    { tag: 'Random', text: 'Every bail is just data for the next attempt.' },
  ]],
  [/cities: skylines/i, [
    { tag: 'Trivia', text: 'Cities: Skylines was made by Colossal Order, a Finnish studio from Tampere.' },
    { tag: 'Trivia', text: 'Chirper is the little blue bird that tells you everything your citizens complain about.' },
    { tag: 'Game tip', text: 'Use roundabouts and avoid connecting small roads directly to highways.' },
    { tag: 'Game tip', text: 'Public transport really helps traffic. One good metro line can fix a whole district.' },
    { tag: 'Game tip', text: 'Keep industry away from homes. Nobody likes living next to a factory.' },
    { tag: 'Random', text: 'Every city starts with one road. Then it becomes forty-seven interchanges.' },
  ]],
  [/hearts of iron/i, [
    { tag: 'Trivia', text: 'Hearts of Iron IV is made by Paradox Development Studio in Stockholm.' },
    { tag: 'Game tip', text: 'Build civilian factories early, then switch to military. Your economy grows faster that way.' },
    { tag: 'Game tip', text: 'Check your focus tree before you start. Some paths lock out others.' },
    { tag: 'Game tip', text: 'Air superiority makes your divisions much stronger. Do not ignore the planes.' },
    { tag: 'Random', text: 'One more year. Just one more year. (It is now 1952.)' },
  ]],
  [/deltarune/i, [
    { tag: 'Trivia', text: 'DELTARUNE is by Toby Fox, the creator of UNDERTALE. Chapter 1 came out for free on Halloween 2018.' },
    { tag: 'Trivia', text: 'Chapters 3 and 4 came out together in June 2025.' },
    { tag: 'Reference', text: 'Ralsei bakes cakes. Susie eats chalk. Kris is... Kris.' },
    { tag: 'Reference', text: 'NOW\'S YOUR CHANCE TO BE A [[BIG SHOT]]!' },
    { tag: 'Reference', text: 'Lancer is a very bad bad guy. He tells you this himself.' },
    { tag: 'Game tip', text: 'You can ACT instead of fighting. Sparing enemies is often the more interesting choice.' },
    { tag: 'Game tip', text: 'Use Defend when your TP is low. It builds TP back up.' },
  ]],
  [/golf with/i, [
    { tag: 'Trivia', text: 'Golf With Your Friends supports up to 12 players in one game.' },
    { tag: 'Game tip', text: 'A gentle shot that stays on course beats a power shot into the void.' },
    { tag: 'Game tip', text: 'Try the power-ups in custom games. Sticky balls and ice blocks turn friendships into rivalries.' },
    { tag: 'Quote', text: 'Fore!' },
    { tag: 'Random', text: 'Out of bounds again. The course is clearly rigged.' },
  ]],
  [/supermarket together/i, [
    { tag: 'Game tip', text: 'Split the work: one person on the till, the others restocking. The queue grows fast otherwise.' },
    { tag: 'Game tip', text: 'Keep popular items stocked before you expand. Empty shelves cost more than they look.' },
    { tag: 'Game tip', text: 'Check your prices after a delivery. A little profit on every item adds up.' },
    { tag: 'Random', text: 'Customer service tip: the customer is always right. Unless they are a shoplifter.' },
    { tag: 'Random', text: 'Nothing tests a friendship like deciding who restocks the frozen aisle.' },
  ]],
  [/orange juice/i, [
    { tag: 'Trivia', text: '100% Orange Juice is a board game by Orange_Juice. You win by reaching Norma level 5.' },
    { tag: 'Trivia', text: 'Many of its characters come from other Orange_Juice games, like Suguri and QP.' },
    { tag: 'Game tip', text: 'Choose your Norma carefully: stars are safer, wins are faster if you are strong.' },
    { tag: 'Game tip', text: 'Hold on to a defensive card. A bad roll at the wrong time can undo a whole game.' },
    { tag: 'Random', text: 'The dice are random. The dice are fair. The dice hate you personally.' },
  ]],
  [/^rounds$|\brounds\b/i, [
    { tag: 'Trivia', text: 'ROUNDS is by Landfall, the Swedish studio behind Totally Accurate Battle Simulator.' },
    { tag: 'Trivia', text: 'In ROUNDS the loser of each round picks a new card, so the game always tries to stay close.' },
    { tag: 'Game tip', text: 'Read the downsides on cards. A big damage boost with a long reload can lose you the next round.' },
    { tag: 'Game tip', text: 'Use cover and keep moving. Standing still is how you get bounced to death.' },
    { tag: 'Random', text: 'One more round. Then another. The name is a warning.' },
  ]],
  [/minecraft dungeons/i, [
    { tag: 'Trivia', text: 'Minecraft Dungeons is a dungeon crawler spin-off made by Mojang Studios.' },
    { tag: 'Game tip', text: 'There are no fixed classes: your gear and enchantments decide your build.' },
    { tag: 'Game tip', text: 'Salvage gear you will not use. You get back the enchantment points you spent on it.' },
    { tag: 'Game tip', text: 'Artifacts have cooldowns. Use them often instead of saving them for the perfect moment.' },
    { tag: 'Random', text: 'Aw man.' },
  ]],
];

// Even more general lines (shown for every game, after its own)
const GENERAL_FUN = [
  { tag: 'Tip', text: 'Turn on the in-game FPS limit to just under your monitor\'s refresh rate. Smoother, and cooler for your PC.' },
  { tag: 'Tip', text: 'Close the browser tabs you do not need while gaming. Your RAM has better things to do.' },
  { tag: 'Tip', text: 'Update your graphics drivers once in a while. New games often run noticeably better after.' },
  { tag: 'Tip', text: 'Blink. Seriously. People blink much less while staring at a screen.' },
  { tag: 'Tip', text: 'Snack with a fork, not your fingers. Your controller and keyboard will stay much cleaner.' },
  { tag: 'Tip', text: 'Losing a lot? Watch one replay of your own play. It teaches more than ten more matches.' },
  { tag: 'Tip', text: 'Set a stop time before a long session, not during it. "When this ends" never comes.' },

  { tag: 'Did you know', text: 'Nintendo was founded in 1889 as a company that made playing cards.' },
  { tag: 'Did you know', text: 'Minecraft is the best-selling video game of all time, with well over 300 million copies sold.' },
  { tag: 'Did you know', text: 'The original PlayStation started as a CD add-on that Sony was building with Nintendo.' },
  { tag: 'Did you know', text: 'The Game Boy came out in 1989, and Tetris was packed in with it in many regions.' },
  { tag: 'Did you know', text: 'DOOM (1993) has been made to run on calculators, printers and even a pregnancy test display.' },
  { tag: 'Did you know', text: 'Speedrunning marathons like Games Done Quick have raised millions for charity.' },
  { tag: 'Did you know', text: 'The term "Easter egg" for hidden secrets came from Atari\'s Adventure, where a developer hid his own name.' },
  { tag: 'Did you know', text: 'Space Invaders came out in 1978 and its aliens speed up as you shoot them. That was originally a hardware quirk.' },
  { tag: 'Did you know', text: 'The first Pokémon games came out in Japan in 1996 as Pocket Monsters Red and Green.' },

  { tag: 'Finland', text: 'Supercell, the makers of Clash of Clans and Brawl Stars, is based in Helsinki.' },
  { tag: 'Finland', text: 'Remedy Entertainment, the studio behind Max Payne, Alan Wake and Control, is from Espoo.' },
  { tag: 'Finland', text: 'Angry Birds was made by Rovio, a Finnish studio from Espoo, in 2009.' },
  { tag: 'Finland', text: 'Housemarque, the studio behind Returnal, is based in Helsinki.' },
  { tag: 'Finland', text: 'Cities: Skylines was made in Tampere by Colossal Order.' },
  { tag: 'Finland', text: 'Wreckfest, the demolition derby racer, was made by Bugbear, a Finnish studio from Helsinki.' },

  { tag: 'Random', text: 'Every game you own was somebody\'s favourite project at some point.' },
  { tag: 'Random', text: 'Loading screens exist so you can fix your posture. That is what this one is for.' },
  { tag: 'Random', text: 'Good game is good. Bad game is still a story to tell.' },
  { tag: 'Random', text: 'Gamer fuel ranking: water, then everything else.' },
  { tag: 'Random', text: 'Patch notes say "minor bug fixes". The bugs say otherwise.' },
  { tag: 'Random', text: 'Fun fact: nobody has ever finished their entire backlog. Do not be the first, it sounds lonely.' },
  { tag: 'Random', text: 'Your character has been standing in the same spot since your last session. They are fine. Probably.' },
];

// Randomized lines that need the real time, so they stay true
function timeTip() {
  const h = new Date().getHours();
  if (h >= 0 && h < 5) return { tag: 'Random', text: 'It is the middle of the night. A glass of water and a bit of sleep will not hurt the save.' };
  if (h < 11) return { tag: 'Random', text: 'Morning session. A decent start to the day, if your coffee agrees.' };
  if (h >= 22) return { tag: 'Random', text: 'Late-night run. Dim the lights a bit and let your eyes rest between matches.' };
  return null;
}

// A shuffled list of tips for this game: its own tips first, then a mix of everything else
function tipsFor(name) {
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const own = [];
  for (const [re, tips] of GAME_TIPS) if (re.test(name || '')) own.push(...tips.map((text) => ({ tag: 'Game tip', text: text.replace(/^[^—]+— /, '') })));
  for (const [re, tips] of [...GAME_EXTRA, ...GAME_FUN]) if (re.test(name || '')) own.push(...tips);
  const tt = timeTip();
  // lines you saw recently go to the back, so a launch is not the same few lines as the last one
  const seen = seenTips();
  const fresh = (list) => { const s = shuffle(list); return [...s.filter((t) => !seen.has(t.text)), ...s.filter((t) => seen.has(t.text))]; };
  const mine = fresh(own), rest = fresh([...GENERAL_TIPS, ...GENERAL_FUN]);
  const out = [];
  if (tt) out.push(tt);
  // two of the game's own lines, then one general one, so a game with plenty of lines still gets some variety
  while (mine.length || rest.length) { for (let i = 0; i < 2 && mine.length; i++) out.push(mine.shift()); if (rest.length) out.push(rest.shift()); }
  return out;
}

const SEEN_KEY = 'nexus.tipsSeen';
function seenTips() { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { return new Set(); } }
function markTipSeen(t) {
  try { const l = [...seenTips().add(t.text)]; localStorage.setItem(SEEN_KEY, JSON.stringify(l.slice(-400))); } catch {}
}
