const { isOwner } = require('../utils/isOwner');
const flirt = require('../autochat/flirt');

module.exports = {
  name: 'flirt', aliases: ['flirtchat'], description: 'Manage inboxes where autochat uses respectful romantic energy',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const reply = (text) => sock.sendMessage(jid, { text }, { quoted: msg });
    if (!isOwner(msg)) return reply('❌ Only the owner can configure flirt inboxes.');
    const sub = String(args[0] || '').toLowerCase();
    if (sub === 'add') {
      if (!flirt.add(args[1])) return reply('❌ Use a full international number, digits only. Example: `.flirt add 254700000000`');
      return reply(`💘 Flirt tone enabled for +${flirt.normalize(args[1])}.`);
    }
    if (sub === 'remove') {
      return reply(flirt.remove(args[1]) ? '💘 Number removed from flirt mode.' : '💘 That number was not enabled.');
    }
    if (sub === 'on') {
      if (jid.endsWith('@g.us')) return reply('❌ Use `.flirt add <number>` or send `.flirt on` inside their DM.');
      const number = flirt.candidates(msg).find((value) => /^\d{7,15}$/.test(value));
      if (!number || !flirt.add(number)) return reply('❌ I could not resolve this inbox number. Use `.flirt add <number>`.');
      return reply(`💘 Flirt tone enabled for this inbox (+${number}).`);
    }
    if (sub === 'off') {
      if (args[1]) flirt.remove(args[1]); else flirt.clear();
      return reply(args[1] ? '💘 That inbox is back to normal autochat.' : '💘 Flirt mode disabled for every inbox.');
    }
    if (sub === 'list') {
      const numbers = flirt.list();
      return reply(numbers.length ? `💘 *Flirt inboxes (${numbers.length}):*\n${numbers.map((number) => `• +${number}`).join('\n')}` : '💘 No flirt inboxes enabled.');
    }
    return reply('💘 *FLIRT AUTOCHAT*\n\n`.flirt add <number>`\n`.flirt remove <number>`\n`.flirt list`\n`.flirt off`\n\nYou can also send `.flirt on` inside their DM. Autochat must remain enabled.');
  },
};
