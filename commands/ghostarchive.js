/**
 * .ghostarchive — browse the archive that outlives 24 hours 👻
 *
 *   .ghostarchive              → latest 15 archived statuses
 *   .ghostarchive 3            → re-send archived #3 (open media in your DM)
 *   .ghostarchive <poster-num> → filter: everything from one contact
 *   .ghostarchive deleted      → only the ones they tried to unsend
 *   .ghostarchive clear        → empty the archive
 *   .ghostarchive ghost on/off → master switch (default ON)
 *   .ghostarchive stealth on/off → don't even send view receipts (default off)
 */
const ghost = require('../utils/statusVault');
const { isOwner } = require('../utils/isOwner');

module.exports = {
  name: 'ghostarchive',
  aliases: ['garchive', 'statusarchive'],
  description: '👻 Ghost Archive — every status saved before it expires or gets deleted',
  execute: async (sock, msg, args, commands, reply) => {
    if (!isOwner(msg)) return reply('👻 _The archive belongs to one._');
    const sub = (args[0] || '').toLowerCase();
    const jid = msg.key.remoteJidAlt || msg.key.remoteJid;

    // ─── master switch ───
    if (sub === 'ghost' || sub === 'on' || sub === 'off') {
      if (sub === 'on') { ghost.setOn(true); return reply('👻 *Ghost Saver ON* — every status archived as it arrives.'); }
      if (sub === 'off') { ghost.setOn(false); return reply('👻 Ghost Saver off — nothing new archived.'); }
      return reply(`👻 Ghost Saver: *${ghost.isOn() ? 'ON' : 'off'}*\n\`.ghostarchive ghost on/off\``);
    }

    // ─── stealth ───
    if (sub === 'stealth') {
      const v = (args[1] || '').toLowerCase();
      if (v === 'on') { ghost.setStealth(true); return reply('👻 *Stealth ON.*\n\nStatuses are still archived, but she stops sending "viewed" receipts — contacts see nothing. (_Autoview must stay on for the archive to work; receipts are just suppressed._)'); }
      if (v === 'off') { ghost.setStealth(false); return reply('👻 Stealth off — view receipts resume (autolike etc. unaffected).'); }
      return reply(`👻 Stealth: *${ghost.isStealth() ? 'ON — invisible viewing' : 'off'}*\n\`.ghostarchive stealth on/off\``);
    }

    // ─── clear ───
    if (sub === 'clear') {
      const n = ghost.clearArchive();
      return reply(`👻 Archive emptied — ${n} entr${n === 1 ? 'y' : 'ies'} released. (Files stay in vault/statuses.)`);
    }

    // ─── re-send by number ───
    if (/^\d+$/.test(sub)) {
      const got = ghost.getEntry(parseInt(sub, 10));
      if (!got) return reply(`👻 No entry #${sub}. \`.ghostarchive\` lists them.`);
      try {
        await ghost.sendArchived(sock, jid, got.entry);
        return;
      } catch (e) {
        return reply(`👻 #${sub} media file missing (old restart). \`.ghostarchive clear\` to tidy.`);
      }
    }

    // ─── list (all / by poster / deleted only) ───
    const all = ghost.getArchive();
    if (!all.length) {
      return reply(
        '👻 *Archive empty.*\n\n' +
        `_She saves every incoming status the moment it lands — before the 24h clock, before the delete button can reach it._\n\n` +
        `Ghost Saver: *${ghost.isOn() ? 'ON' : 'off'}* • Stealth: *${ghost.isStealth() ? 'ON' : 'off'}*`
      );
    }

    let list = all;
    let title = `👻 *GHOST ARCHIVE — ${all.length} saved*`;
    if (/^\d{8,15}$/.test(sub)) {
      list = all.filter(e => e.poster === sub);
      title = `👻 *ARCHIVE — from ${sub}* (${list.length})`;
    }
    if (sub === 'deleted') {
      list = all.filter(e => e.deleted);
      title = `👻 *THE ONES THEY TRIED TO UNSEND* (${list.length})`;
      if (!list.length) return reply('👻 No deleted statuses caught yet. When someone deletes one, her copy survives and gets flagged.');
    }

    const L = [title, ''];
    list.slice(-15).reverse().forEach((e, i) => {
      const n = all.length - list.slice(-15).length + i + 1;
      const icon = { image: '🖼️', video: '🎬', audio: '🎙️', text: '📝', sticker: '✨' }[e.type] || '📎';
      const when = new Date(e.ts).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      L.push(`${n}. ${icon} *${e.poster}* — ${when}${e.deleted ? ' ⚠️*deleted*' : ''}`);
      if (e.caption) L.push(`   _"${e.caption.slice(0, 35)}"_`);
      if (e.text) L.push(`   _"${e.text.slice(0, 45)}"_`);
      L.push(`   ⤷ \`.ghostarchive ${n}\``);
    });
    L.push('');
    L.push(`_Ghost: ${ghost.isOn() ? 'ON' : 'off'} • Stealth: ${ghost.isStealth() ? 'ON' : 'off'} • last 15 shown_`);
    return reply(L.join('\n'));
  },
};
