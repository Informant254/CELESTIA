/**
 * .statusreact — react to statuses like a person, not a bot 👀
 *
 *   .statusreact <emoji>            → reacts to the LATEST status (uses latest key)
 *   .statusreact <emoji> <n>        → reacts to the nth latest archived status
 *   .statusreact                     → shows help + recent statuses to react to
 *
 * Uses the ghost archive's saved keys — even works on statuses
 * that already expired for viewing (WhatsApp keeps reaction ability).
 */
const ghost = require('../utils/statusVault');
const settingsStore = require('../utils/settingsStore');
const { isOwner } = require('../utils/isOwner');

// We must remember status message keys to react to them.
// The archive already tracks them — extend with key info in-memory per boot.
const KEYS_STORE = 'status_react_keys'; // { id: { key } }

module.exports = {
  name: 'statusreact',
  aliases: ['sreact', 'reactstatus'],
  description: '👀 React to any status with any emoji — .statusreact 🔥 [n]',
  async execute(sock, msg, args, commands, reply) {
    if (!isOwner(msg)) return reply('👀 _Her reactions belong to one._');

    const emoji = args.find(a => /\p{Extended_Pictographic}/u.test(a));
    if (!emoji) {
      const recent = ghost.getArchive().slice(-5).reverse();
      const L = ['👀 *STATUS REACT*', ''];
      if (recent.length) {
        L.push('Recent statuses:');
        recent.forEach((e, i) => {
          const when = new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          L.push(`${i + 1}. *${e.poster}* (${e.type}) — ${when}`);
        });
        L.push('');
      }
      L.push('Usage: `.statusreact 🔥` — latest');
      L.push('       `.statusreact ❤️ 2` — the 2nd latest');
      L.push('_Works on any emoji: 🔥 💯 😂 🤯 🐺 ✨_');
      return reply(L.join('\n'));
    }

    const n = parseInt((args.filter(a => a !== emoji)[0]) || '1', 10);
    const archive = ghost.getArchive();
    if (!archive.length) return reply('👀 No statuses archived yet to react to.');

    const entry = archive[archive.length - n];
    if (!entry) return reply(`👀 Only ${archive.length} statuses archived — can't reach #${n} from the end.`);

    // find the status key: we keep the most recent keys per status id
    const keysMap = settingsStore.get(KEYS_STORE, {});
    const keyInfo = keysMap[entry.id];

    // If we don't have the key stored this boot, try latest from archive:
    let reactKey = keyInfo?.key;
    if (!reactKey) {
      // fall back: newest status we saw this boot (tracked in statusVault)
      const latest = globalThis.__latestStatusKey;
      reactKey = latest;
    }
    if (!reactKey) {
      return reply('👀 She needs a fresh status key — statuses from before her last restart can\'t be reacted to. Wait for the next status, or use `.statusreact <emoji> 1` on the newest.');
    }

    try {
      await sock.sendMessage('status@broadcast',
        { react: { text: emoji, key: reactKey } },
        { statusJidList: [`${entry.poster}@s.whatsapp.net`] }
      );
      return reply(`👀 Reacted ${emoji} to *${entry.poster}*'s ${entry.type} status.`);
    } catch (e) {
      return reply(`👀 Reaction failed: ${e.message}`);
    }
  },
};
