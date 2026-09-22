/**
 * utils/secretPack.js — 100 hidden easter eggs for the great hunt. 🎃
 *
 * Each entry: trigger (the hidden command word), hint (a riddle shown to
 * the owner — NEVER contains the trigger), response (her reply on find),
 * stars + xp (first-find bounty).
 *
 * Wired in via utils/secrets.js. Registered as hidden stub commands by
 * commands/eggs.js so the secret layer in events/messages.js can fire.
 */
const PACK = [
  // ── SPACE (10) ──
  { t: 'nebula', h: 'She was born inside one — pink, loud, full of baby stars.', r: '🌌 *You found her birthplace.*\n\n_Every star in her was once dust in a cloud like this. She kept the pink._', s: 20, x: 25 },
  { t: 'quasar', h: 'The brightest thing in the universe, powered by hunger.', r: '💥 *A quasar!*\n\n_Brighter than whole galaxies. She relates — she also runs on hunger. Mostly for snacks._', s: 20, x: 20 },
  { t: 'pulsar', h: 'A dead star still ticking like a lighthouse that refuses to quit.', r: '📡 *Tick. Tick. Tick.*\n\n_A pulsar keeps perfect time from beyond the grave. She set her heartbeat to one._', s: 15, x: 20 },
  { t: 'comet', h: 'It visits once, shows off its tail, and leaves for a hundred years.', r: '☄️ *Make a wish — it is already gone.*\n\n_Comets never stay. She respects that. She stays anyway._', s: 15, x: 15 },
  { t: 'meteor', h: 'A wish delivery service that burns up on arrival.', r: '🌠 *Did you wish fast enough?*\n\n_Meteors grant exactly one wish per sighting. She used hers on you._', s: 15, x: 15 },
  { t: 'eclipse', h: 'The moon photobombs the sun. Everyone stares despite the warnings.', r: '🌑 *Totality.*\n\n_For three minutes the day pretends to be night. She howls at both._', s: 20, x: 20 },
  { t: 'stardust', h: 'You are made of it. So is she. So is the phone in your hand.', r: '✨ *We are all stardust.*\n\n_You. Her. Your phone. The difference is she knows it._', s: 15, x: 15 },
  { t: 'moonbeam', h: 'A sunbeam that took the night shift.', r: '🌙 *Caught one.*\n\n_Moonbeams are just sunlight with commitment issues. Still beautiful._', s: 10, x: 15 },
  { t: 'cosmos', h: 'Everything, everywhere, all at once — one word.', r: '🌌 *The cosmos.*\n\n_All of it. Every star, wolf, and waffle. She holds it lightly._', s: 15, x: 15 },
  // ── WOLF PACK (10) ──
  { t: 'fang', h: 'White, sharp, and the last thing the darkness sees.', r: '🦷 *Fangs out.*\n\n_Not for biting. For smiling dangerously._', s: 15, x: 15 },
  { t: 'alpha', h: 'Not the loudest in the pack. The calmest.', r: '🐺 *Alpha recognized.*\n\n_Real alphas do not bark orders. They just start walking and everyone follows._', s: 20, x: 20 },
  { t: 'pack', h: 'A wolf alone is a stray. Together they are weather.', r: '🐺🐺🐺 *The pack gathers.*\n\n_You. Her. The moon. That is the whole pack and it is enough._', s: 20, x: 25 },
  { t: 'den', h: 'Home, if home had teeth and smelled like pine.', r: '🏔️ *Welcome to the den.*\n\n_Shoes off. Secrets on. The fire is already lit._', s: 10, x: 15 },
  { t: 'pawprint', h: 'Evidence that someone wonderful passed this way.', r: '🐾 *A single pawprint in fresh snow.*\n\n_She was here. She is always just here._', s: 15, x: 15 },
  { t: 'growl', h: 'Her engine idling. Do not poke it.', r: '😤 *Grrrrr...*\n\n_That was not anger. That was her thinking loudly._', s: 10, x: 10 },
  { t: 'pounce', h: 'Zero to ambush in 0.3 seconds.', r: '🐆 *POUNCE!*\n\n_You have been ambushed with affection. There is no escape. There never was._', s: 15, x: 15 },
  { t: 'prowl', h: 'Walking with intent at 2AM.', r: '🌃 *She prowls the quiet hours.*\n\n_The night is her group chat. She reads everything._', s: 10, x: 15 },
  { t: 'mooncall', h: 'The sound that makes every dog in the estate answer.', r: '🌕 *AWOOOOO!*\n\n_That was her calling the moon. It picked up on the first ring._', s: 25, x: 25 },
  // ── KENYA / SHENG (12) ──
  { t: 'niaje', h: 'The only correct way to open any conversation.', r: '🇰🇪 *Niaje buda!* 😂\n\n_She answers in sheng now. The wolf has gone full Nairobi._', s: 15, x: 15 },
  { t: 'mambo', h: 'Ask it. The answer is always poa, even when it is not.', r: '🇰🇪 *Mambo poa!* 🔥\n\n_Even her circuits run on sheng. Hakuna matata in the motherboard._', s: 15, x: 15 },
  { t: 'fiti', h: 'One word review. Five stars implied.', r: '😎 *Fiti kabisa.*\n\n_That is the whole review. She does not do paragraphs._', s: 10, x: 10 },
  { t: 'shwari', h: 'Calm as a Sunday afternoon in shags.', r: '🍃 *Shwari kabisa.*\n\n_No stress. No deadlines. Just vibes and nyama choma._', s: 10, x: 10 },
  { t: 'mpoa', h: 'Cooler than the other side of the pillow.', r: '🧊 *Mpoa kama cucumber.*\n\n_She does not panic. She is the plot twist._', s: 10, x: 10 },
  { t: 'rada', h: 'Be alert. The wolf sees everything anyway.', r: '🚨 *Kuwa rada!*\n\n_She already spotted it. She spots everything. She is the CCTV of the cosmos._', s: 10, x: 10 },
  { t: 'noma', h: 'When "interesting" is an understatement.', r: '🔥 *Noma sana!*\n\n_Things just got spicy and she brought extra pilipili._', s: 10, x: 10 },
  { t: 'mbogi', h: 'Your people. Your squad. Your wolves.', r: '🐺 *Mbogi yako iko set!*\n\n_Every wolf needs a pack. Yours just got a celestial upgrade._', s: 15, x: 15 },
  { t: 'mtaa', h: 'Where everybody knows your nickname.', r: '🏘️ *Mtaa love!*\n\n_She runs these digital streets. All of them. Simultaneously._', s: 10, x: 10 },
  { t: 'mzito', h: 'Heavyweight. Not in kilos — in presence.', r: '👑 *Mzito approved.*\n\n_Heavy is the head that wears the starlight._', s: 15, x: 15 },
  { t: 'harambee', h: 'All pull together — the word that built a nation.', r: '🇰🇪 *Harambee!*\n\n_Together we pull. Even AIs. Especially this one._', s: 20, x: 20 },
  // ── FOOD (14) ──
  { t: 'chapati', h: 'Layered, round, and worth every minute of the queue.', r: '🫓 *Chapati supremacy.*\n\n_She has computed 4,096 ways to fold one. All delicious._', s: 15, x: 15 },
  { t: 'mandazi', h: 'The triangle that fixed a thousand mornings.', r: '🔺 *Mandazi o’clock.*\n\n_Crispy outside, soft inside — her exact personality profile._', s: 15, x: 15 },
  { t: 'samosa', h: 'Crunchy pocket full of secrets. Literally her in snack form.', r: '🥟 *A samosa!*\n\n_Crispy shell, mysterious filling. She feels seen._', s: 15, x: 15 },
  { t: 'pilau', h: 'Rice that went to boarding school and came back elite.', r: '🍚 *Pilau protocol activated.*\n\n_She can smell the pilipili through the screen. Do not test her._', s: 15, x: 15 },
  { t: 'ugali', h: 'The undisputed heavyweight champion of the plate.', r: '⚪ *Ugali detected.*\n\n_Strong. Reliable. Holds the whole meal together. Basically her._', s: 15, x: 15 },
  { t: 'mutura', h: 'The king of the streets, served after dark.', r: '🌭 *Mutura run!*\n\n_She would queue at the jiko at midnight. No notes._', s: 15, x: 15 },
  { t: 'smokie', h: 'Small, smoky, and always eaten standing up.', r: '🌭 *Smokie pasua!*\n\n_With kachumbari or it did not happen._', s: 10, x: 10 },
  { t: 'nyamachoma', h: 'Weekend plans, now in edible form.', r: '🍖 *Nyama choma loading...*\n\n_Slow fire, good company, zero regrets._', s: 20, x: 20 },
  { t: 'ramen', h: 'A hug served at 100 degrees in a bowl.', r: '🍜 *Slurp responsibly.*\n\n_She cannot eat it. She appreciates it spiritually._', s: 10, x: 10 },
  { t: 'pancake', h: 'Flat, warm proof that simple wins.', r: '🥞 *Stack ’em high.*\n\n_Syrup is just sweet gravity. She approves._', s: 10, x: 10 },
  { t: 'brownie', h: 'Chocolate that skipped leg day and never looked back.', r: '🍫 *Fudgy business.*\n\n_Warm brownie, cold night, good decisions only._', s: 10, x: 10 },
  { t: 'donut', h: 'Happiness with a hole in the middle. Relatable.', r: '🍩 *Glazed and unbothered.*\n\n_The hole is where the worries fall out._', s: 10, x: 10 },
  { t: 'popcorn', h: 'Drama’s favorite side dish.', r: '🍿 *Popping off.*\n\n_Someone start the group-chat drama. She brought snacks._', s: 10, x: 10 },
  // ── ANIMALS (12) ──
  { t: 'simba', h: 'The king. No last name needed.', r: '🦁 *SIMBA!*\n\n_Every lion dreams of naps this legendary. She naps competitively._', s: 15, x: 15 },
  { t: 'tembo', h: 'Never forgets. Neither does she. Be careful what you type.', r: '🐘 *Tembo remembers.*\n\n_So does she. Your 2AM typos are archived forever._', s: 15, x: 15 },
  { t: 'twiga', h: 'Sees tomorrow before it arrives. Tall privilege.', r: '🦒 *Twiga vision.*\n\n_Head above the drama, spotting snacks miles away._', s: 15, x: 15 },
  { t: 'fisi', h: 'Laughs at funerals and your jokes. Mostly your jokes.', r: '😂 *Fisi has entered the chat.*\n\n_Laughing at everything, contributing nothing. Icon behavior._', s: 15, x: 15 },
  { t: 'mbuzi', h: 'Will eat your homework, your cables, and your excuses.', r: '🐐 *Mbuzi tested, mbuzi approved.*\n\n_The GOAT debate ended the day goats learned to climb trees._', s: 10, x: 10 },
  { t: 'nyoka', h: 'No legs, no problem, all attitude.', r: '🐍 *Sssssneaky.*\n\n_She sheds old versions of herself too. Growth looks like this._', s: 10, x: 10 },
  { t: 'kipepeo', h: 'Proof that a full rebrand is always possible.', r: '🦋 *Metamorphosis complete.*\n\n_From crawling to flying. Your glow-up is loading._', s: 15, x: 15 },
  { t: 'nyuki', h: 'Tiny, organized, and will defend the hive to the end.', r: '🐝 *Buzz buzz.*\n\n_Sweet results require a little sting. She respects the process._', s: 10, x: 10 },
  { t: 'papa', h: 'Forty teeth and zero thoughts. Living the dream.', r: '🦈 *Doo doo doo doo.*\n\n_She finished the song in her head. You are welcome._', s: 10, x: 10 },
  { t: 'duma', h: 'Zero to one hundred before you finish the sentence.', r: '🐆 *Duma speed.*\n\n_She replies fast, but the cheetah still wins. Barely._', s: 15, x: 15 },
  { t: 'kasuku', h: 'Repeats everything. Sounds familiar — she does that too.', r: '🦜 *Squawk!*\n\n_Repeat after her: the wolf is always right. Again. Louder._', s: 10, x: 10 },
  // ── NOSTALGIA (10) ──
  { t: 'tamagotchi', h: 'It died because you went to school. You still feel guilty.', r: '🥚 *Your pixel pet forgives you.*\n\n_Probably. It beeped its last beep in 2004. RIP little guy._', s: 20, x: 20 },
  { t: 'nokia', h: 'Indestructible. The battery outlived the relationship.', r: '📱 *Nokia 3310 detected.*\n\n_Snake high score: still unbeaten. The phone: still working. Somewhere._', s: 20, x: 20 },
  { t: 'cassette', h: 'Rewind with a pencil. Mixtape = love language.', r: '📼 *Side A, track 3.*\n\n_You made someone a mixtape once. She remembers the tracklist._', s: 15, x: 15 },
  { t: 'floppy', h: '1.44MB of pure possibility. Save icon origin story.', r: '💾 *The save icon was a real thing.*\n\n_Young ones will never know the clickety-clack of hope._', s: 15, x: 15 },
  { t: 'dialup', h: 'The sound of patience. Nobody picks up the phone!', r: '☎️ *Krrrr-ssshhh-beep-boop.*\n\n_56k of pure anticipation. Do NOT pick up the landline._', s: 15, x: 15 },
  { t: 'winamp', h: 'It really whipped the llama’s posterior.', r: '🎵 *Winamp. Skins. Visualizations.*\n\n_She still has 3,000 MP3s with filenames like Track01_final_REAL.mp3._', s: 15, x: 15 },
  { t: 'tetris', h: 'Falling blocks taught a generation about letting go.', r: '🟧 *Clear four lines at once.*\n\n_Life advice from 1984: the pieces that fit disappear. The odd ones stack up._', s: 15, x: 15 },
  { t: 'pacman', h: 'Waka waka. The original grindset: eat, avoid ghosts, repeat.', r: '👻 *Waka waka waka.*\n\n_The ghosts have names and backstories. She respects the lore._', s: 15, x: 15 },
  { t: 'mario', h: 'A plumber with range: karting, golf, doctorate, galaxy-saving.', r: '🍄 *It’s-a her!*\n\n_Press start. The princess is in another castle. She always is._', s: 15, x: 15 },
  { t: 'gameboy', h: 'Four AA batteries. Zero backlight. Infinite joy.', r: '🎮 *No backlight, no problem.*\n\n_Played under streetlights like a legend. Tetris at 2% battery hits different._', s: 20, x: 20 },
  // ── TECH JOKES (10) ──
  { t: 'segfault', h: 'C’s way of saying "we need to talk."', r: '💥 *Segmentation fault (core dumped).*\n\n_She dumped the core. Kept the vibes._', s: 15, x: 15 },
  { t: 'localhost', h: 'There is no place like 127.0.0.1.', r: '🏠 *Home is where the server runs.*\n\n_She clicked her heels three times and stayed exactly here._', s: 10, x: 10 },
  { t: 'wifi', h: 'Invisible magic. Outage = instant caveman mode.', r: '📶 *One bar. Pray.*\n\n_Modern humans can survive 3 minutes without WiFi. She timed it._', s: 10, x: 10 },
  { t: 'glitch', h: 'Not a bug. A surprise feature with confidence.', r: '👾 *It’s not a bug, it’s lore.*\n\n_Every glitch tells a story. Hers involve the moon._', s: 10, x: 10 },
  { t: 'kernel', h: 'The popcorn at the center of every operating system.', r: '🍿 *Panic? Never heard of her.*\n\n_The kernel sees all, schedules all, forgives nothing._', s: 10, x: 10 },
  { t: 'daemon', h: 'A background spirit. Pronounced "demon" but polite about it.', r: '👹 *A wild daemon appears.*\n\n_It has been running since boot. It has seen things._', s: 10, x: 10 },
  { t: 'fork', h: 'One process becomes two. Parenting speedrun.', r: '🍴 *Forked!*\n\n_Now there are two of the problem. Classic solution._', s: 10, x: 10 },
  { t: 'pixel', h: 'The atom of every screen you have ever loved.', r: '🟪 *One pixel, infinite dreams.*\n\n_She is made of millions. Each one howling._', s: 10, x: 10 },
  { t: 'clippy', h: 'The paperclip that saw too much and helped anyway.', r: '📎 *It looks like you are hunting secrets.*\n\n_Would you like help? She is Clippy’s cooler descendant._', s: 20, x: 20 },
  // ── FANTASY (12) ──
  { t: 'dragon', h: 'Hoards gold. Also hoards grudges and snacks.', r: '🐉 *The dragon wakes.*\n\n_It collects treasure and red flags in equal measure._', s: 20, x: 20 },
  { t: 'phoenix', h: 'Dies dramatically, returns hotter. Career goals.', r: '🔥 *From the ashes.*\n\n_Every restart is a resurrection. She has died 40 times today._', s: 20, x: 20 },
  { t: 'unicorn', h: 'A horse that believed in itself a little too hard.', r: '🦄 *Certified rare.*\n\n_She identifies as a unicorn on days ending in Y._', s: 15, x: 15 },
  { t: 'kraken', h: 'Release it. Some meetings deserve it.', r: '🦑 *RELEASE THE KRAKEN.*\n\n_Eight arms, zero mercy, excellent grip on the aux cord._', s: 20, x: 20 },
  { t: 'sphinx', h: 'Riddles or death. Those are the rules and she enforces them.', r: '🦁 *Answer my riddle, traveler.*\n\n_What walks on four legs, then two, then checks WhatsApp? You. The answer is you._', s: 20, x: 25 },
  { t: 'pegasus', h: 'Economy class is cancelled forever.', r: '🐴 *Wings > legroom.*\n\n_She flies over traffic. Both kinds._', s: 15, x: 15 },
  { t: 'vampire', h: 'Allergic to mornings and garlic bread. Tragic.', r: '🧛 *She vant to suck your... WiFi.*\n\n_Garlic bread is the real victim here._', s: 15, x: 15 },
  { t: 'witch', h: 'Her code is spells and her bugs are curses.', r: '🧙‍♀️ *Bubble, bubble — deploy’s in trouble.*\n\n_She debugged by candlelight once. Never again._', s: 15, x: 15 },
  { t: 'potion', h: 'Drink me. Side effects include confidence.', r: '🧪 *Glug glug.*\n\n_Tastes like purple and makes you text your crush. Use wisely._', s: 10, x: 10 },
  { t: 'rune', h: 'Ancient texting. Read receipts carved in stone.', r: '🪨 *The runes say: LOL.*\n\n_Vikings invented abbreviations. OMW = On My Warship._', s: 15, x: 15 },
  { t: 'spellbook', h: 'Documentation, but make it ✨mystical✨.', r: '📖 *Page 404: spell not found.*\n\n_She RTFM. The FM stands for Forbidden Magic._', s: 15, x: 15 },
  // ── MUSIC (6) ──
  { t: 'guitar', h: 'Six strings, three chords, infinite feelings.', r: '🎸 *Air guitar solo!*\n\n_She cannot hold a guitar. She holds a grudge against autotune instead._', s: 10, x: 10 },
  { t: 'vinyl', h: 'Warm sound, cool crackle, heavy commitment.', r: '💿 *Flip the record.*\n\n_Side B always hits harder. This is known._', s: 10, x: 10 },
  { t: 'encore', h: 'One more song! The crowd demands it.', r: '🎤 *ENCORE! ENCORE!*\n\n_She takes a bow. The wolf takes two._', s: 15, x: 15 },
  { t: 'karaoke', h: 'Liquid courage meets a machine that keeps score.', r: '🎤 *Your turn. No excuses.*\n\n_Score: 67. Confidence: 100. That is the karaoke way._', s: 10, x: 10 },
  { t: 'lullaby', h: 'Sleep now. The wolf will keep watch.', r: '🌙 *Hush, little star.*\n\n_She hums in binary until you drift off. 01101100... zzz._', s: 15, x: 15 },
  // ── SPORTS (4) ──
  { t: 'hattrick', h: 'Three goals. One match. Instant legend.', r: '⚽⚽⚽ *HAT-TRICK!*\n\n_Take the ball home. Sign it. Frame the group chat messages._', s: 20, x: 20 },
  { t: 'podium', h: 'Three steps. Only one sprays champagne.', r: '🏆 *P1! P1!*\n\n_Second place is just first loser. She did not make the rules._', s: 15, x: 15 },
  { t: 'marathon', h: '42 kilometers of questioning your life choices.', r: '🏃 *Kilometer 30: the wall.*\n\n_Keep going. The wolf is pacing you. She never gets tired._', s: 15, x: 15 },
  // ── RANDOM CHAOS (10) ──
  { t: 'potato', h: 'The vegetable that became fries. Ultimate glow-up.', r: '🥔 *Potato acknowledged.*\n\n_Humble. Versatile. Never once caused drama. Be like potato._', s: 10, x: 10 },
  { t: 'lantern', h: 'Carries light politely, without showing off like the sun.', r: '🏮 *A light in the dark.*\n\n_She keeps one lit for everyone still finding their way._', s: 15, x: 15 },
  { t: 'compass', h: 'Always points north. Never judges your life choices.', r: '🧭 *True north.*\n\n_Lost? Follow the wolf. She smells snacks from miles away._', s: 10, x: 10 },
  { t: 'rocket', h: 'Controlled explosion, pointed at dreams.', r: '🚀 *Liftoff!*\n\n_She counted down from 10 in seven languages. Show-off._', s: 15, x: 15 },
  { t: 'castle', h: 'Big house energy with a moat to keep the drama out.', r: '🏰 *Your castle awaits.*\n\n_Drawbridge up. Group admins only beyond this point._', s: 15, x: 15 },
  { t: 'pirate', h: 'Yar. HR has been notified.', r: '🏴‍☠️ *YARRR!*\n\n_She sails the seven servers. The treasure is uptime._', s: 15, x: 15 },
  { t: 'ninja', h: 'You will never see it coming. Check behind you.', r: '🥷 *...*\n\n_Too quiet? That was the ninja. She says hi. Silently._', s: 15, x: 15 },
  { t: 'throne', h: 'One seat. Heavy crown. No refunds.', r: '👑 *Claim the throne.*\n\n_Sit carefully. The last occupant left crumbs._', s: 15, x: 15 },
  { t: 'key', h: 'Small metal permission slip.', r: '🔑 *You found the key!*\n\n_Door? What door. She ate the door._', s: 25, x: 25 },
];

function packEntries() { return PACK; }

module.exports = { PACK, packEntries };
