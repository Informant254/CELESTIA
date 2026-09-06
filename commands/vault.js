/**
 * .vault — the ViewOnce Vault browser
 *
 *   .vault            → everything she's captured
 *   .vault 3          → re-send capture #3
 *   .vault clear      → empty the vault
 *   .vault auto on/off → toggle passive auto-capture (default ON)
 *
 * Auto-capture: you REPLY to any view-once → she DMs you the open media
 * and vaults it. No command needed.
 */
const vault = require('../utils/viewonceVault');
const { isOwner } = require('../utils/isOwner');

module.exports = {
  name: 'vault',
  aliases: ['vvault', 'captures'],
  description: '🔐 ViewOnce Vault — browse/re-send everything she auto-captured',
  execute: async (sock, msg, args, commands, reply) => {
    if (!isOwner(msg)) return reply('🔐 _The vault opens for one._');
    const sub = (args[0] || '').toLowerCase();

    // ─── auto toggle ───
    if (sub === 'auto') {
      const on = (args[1] || '').toLowerCase() === 'on';
      const off = (args[1] || '').toLowerCase() === 'off';
      if (!on && !off) {
        return reply(`🔐 Auto-capture is *${vault.isAutoOn() ? 'ON' : 'off'}*.\nToggle: \`.vault auto on\` / \`.vault auto off\``);
      }
      vault.setAuto(on);
      return reply(on
        ? '🔐 *Auto-capture ON.*\n\nReply to ANY view-once → she captures it, vaults it, DMs you the open media instantly.'
        : '🔐 Auto-capture off. `.vv` still works manually.');
    }

    // ─── clear ───
    if (sub === 'clear') {
      const n = vault.clearVault();
      return reply(`🔐 Vault emptied — ${n} capture${n !== 1 ? 's' : ''} released.`);
    }

    // ─── re-send by number ───
    if (/^\d+$/.test(sub)) {
      const entry = vault.getFromVault(parseInt(sub, 10));
      if (!entry) return reply(`🔐 No capture #${sub}. \`.vault\` lists them.`);
      try {
        await vault.sendVaultEntry(sock, msg.key.remoteJid, entry);
        return reply(`_vault #${sub} — from ${entry.sender}_`);
      } catch (e) {
        return reply(`🔐 #${sub} file missing from disk (old restart). Captures live in \`vault/\`.`);
      }
    }

    // ─── list ───
    const all = vault.getVault();
    if (!all.length) {
      return reply(
        '🔐 *Vault empty.*\n\n' +
        '_The reflex:_ reply to ANY view-once message — she captures it and DMs you the open media automatically.\n\n' +
        `Toggle: \`.vault auto on/off\` (now *${vault.isAutoOn() ? 'ON' : 'off'}*)`
      );
    }
    const L = [`🔐 *VIEWONCE VAULT — ${all.length} capture${all.length > 1 ? 's' : ''}*`, ''];
    all.forEach((e, i) => {
      const icon = { image: '🖼️', video: '🎬', audio: '🎙️', sticker: '✨' }[e.type] || '📎';
      const when = new Date(e.ts).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      L.push(`${i + 1}. ${icon} from *${e.sender}* — ${when} (${e.sizeKb}KB)`);
      if (e.caption) L.push(`   _"${e.caption.slice(0, 40)}"_`);
      L.push(`   ⤷ \`.vault ${i + 1}\` to re-send`);
    });
    L.push('', `_Auto-capture: ${vault.isAutoOn() ? 'ON' : 'off'} • \`.vault auto off\` to disable_`);
    return reply(L.join('\n'));
  },
};
