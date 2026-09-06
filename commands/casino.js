/**
 * .casino — the Star Den 🎰
 *
 *   .casino slots <bet>       → 3-reel slots (3x payout on jackpot)
 *   .casino flip <heads|tails> <bet>  → 2x
 *   .casino dice <1-6> <bet>  → 5x
 *   .casino                   → the floor
 */
const crypto = require('crypto');
const settingsStore = require('../utils/settingsStore');
const { isOwner } = require('../utils/isOwner');

const KEY = 'game_state';

function load() { const s = settingsStore.get(KEY, null); return s || { stars: 10 }; }
function save(s) { settingsStore.set(KEY, s); }

const REELS = ['🐺', '⭐', '🌙', '✨', '☄️', '👑', '💫', '🌑'];

function spin() {
  const b = crypto.randomBytes(3);
  return [REELS[b[0] % 8], REELS[b[1] % 8], REELS[b[2] % 8]];
}

module.exports = {
  name: 'casino',
  aliases: ['bet', 'slots'],
  description: '🎰 The Star Den — slots, coinflip, dice. Play with star currency',
  async execute(sock, msg, args, commands, reply) {
    if (!isOwner(msg)) return reply('🎰 _The Den admits one._');
    const sub = (args[0] || '').toLowerCase();
    const s = load();

    if (!sub) {
      return reply(
        '🎰 *THE STAR DEN*\n\n' +
        `⭐ Your purse: *${s.stars}*\n\n` +
        '• `.casino slots <bet>` — match 3 to win 5×\n' +
        '• `.casino flip heads <bet>` — 2×\n' +
        '• `.casino dice 6 <bet>` — 5× if it lands\n\n' +
        '_The house is her. She still roots for you._'
      );
    }

    // ─── SLOTS ───
    if (sub === 'slots' || sub === 'slot') {
      const bet = parseInt(args[1], 10);
      if (!bet || bet < 1) return reply('🎰 `.casino slots 10`');
      if (bet > s.stars) return reply(`🎰 Not enough stars — you hold ${s.stars}⭐`);

      s.stars -= bet;
      const [a, b2, c] = spin();
      let result, payout = 0;

      if (a === b2 && b2 === c) {
        payout = bet * 5;
        result = `🎰 *JACKPOT!!!* ${a}${b2}${c}\n\n*+${payout}⭐*`;
        // casino achievement
        s.achievements = s.achievements || [];
        if (!s.achievements.includes('casino_hot')) {
          const streak = (settingsStore.get('casino_wins', 0) || 0) + 1;
          settingsStore.set('casino_wins', streak);
          if (streak >= 3) s.achievements.push('casino_hot');
        }
      } else if (a === b2 || b2 === c || a === c) {
        payout = Math.round(bet * 1.5);
        result = `🎰 ${a}${b2}${c}\n\n*Pair.* +${payout}⭐`;
        settingsStore.set('casino_wins', 0);
      } else {
        result = `🎰 ${a}${b2}${c}\n\n_Nothing. The stars tease._`;
        settingsStore.set('casino_wins', 0);
      }
      s.stars += payout;
      save(s);
      s.achievements = s.achievements || [];
      if (!s.achievements.includes('casino_first')) {
        s.achievements.push('casino_first');
        save(s);
        result += '\n\n🏆 *First Bet* unlocked (+10⭐)';
        s.stars += 10; save(s);
      }
      return reply(result + `\n\n_⭐ purse: ${s.stars}_`);
    }

    // ─── COINFLIP ───
    if (sub === 'flip' || sub === 'coin') {
      const call = (args[1] || '').toLowerCase();
      const bet = parseInt(args[2], 10);
      if (!['heads', 'tails'].includes(call) || !bet) return reply('🎰 `.casino flip heads 10`');
      if (bet > s.stars) return reply(`🎰 Not enough stars (${s.stars}⭐)`);

      s.stars -= bet;
      const isHeads = crypto.randomBytes(1)[0] % 2 === 0;
      const landed = isHeads ? 'heads' : 'tails';
      const won = landed === call;
      if (won) s.stars += bet * 2;
      save(s);
      return reply(
        `🪙 *THE COIN SPINS...*\n\n` +
        `Lands: *${landed.toUpperCase()}* ${isHeads ? '🌙' : '⭐'}\n\n` +
        (won ? `_You called it._ *+${bet * 2}⭐*` : `_The coin disagrees._ -${bet}⭐`) +
        `\n\n_⭐ purse: ${s.stars}_`
      );
    }

    // ─── DICE ───
    if (sub === 'dice' || sub === 'roll') {
      const guess = parseInt(args[1], 10);
      const bet = parseInt(args[2], 10);
      if (!(guess >= 1 && guess <= 6) || !bet) return reply('🎰 `.casino dice 6 10` — call 1-6, win 5×');
      if (bet > s.stars) return reply(`🎰 Not enough stars (${s.stars}⭐)`);

      s.stars -= bet;
      const rolled = crypto.randomBytes(1)[0] % 6 + 1;
      const won = rolled === guess;
      if (won) s.stars += bet * 5;
      save(s);
      const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
      return reply(
        `🎲 *THE DIE TUMBLES...*\n\n` +
        `${faces[rolled - 1]} — *${rolled}*\n\n` +
        (won ? `YOU CALLED ${guess}. *+${bet * 5}⭐ — the Den roars.*` : `_You called ${guess}. The bone says no._ -${bet}⭐`) +
        `\n\n_⭐ purse: ${s.stars}_`
      );
    }

    return reply('🎰 Try: `slots`, `flip`, or `dice` — `.casino` for the floor.');
  },
};
