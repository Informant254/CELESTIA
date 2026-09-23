const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');
const mirror = require('../utils/mirror');

module.exports = {
  name: 'mirror',
  aliases: ['fleet'],
  description: '🪞 Command the mirror fleet (owner only). .mirror bots|add|remove|exec',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      return sock.sendMessage(jid, { text: '❌ *Only the bot owner can use this command.*' }, { quoted: msg });
    }
    const sub = (args[0] || 'bots').toLowerCase();

    if (sub === 'bots' || sub === 'list') {
      const bots = mirror.fleetBots();
      return sock.sendMessage(jid, {
        text: bots.length ? `🪞 *FLEET (${bots.length}):*\n${bots.map((b) => `• +${b}`).join('\n')}` : '🪞 *Fleet empty.*\n_Use .mirror add <number>_',
      }, { quoted: msg });
    }
    if (sub === 'add' && args[1]) {
      const n = String(args[1]).replace(/[^0-9]/g, '');
      if (!/^\d{7,16}$/.test(n)) {
        return sock.sendMessage(jid, { text: '❌ *Bad number.* Usage: *.mirror add 2547...*' }, { quoted: msg });
      }
      const bots = mirror.fleetBots();
      if (!bots.includes(n)) {
        bots.push(n);
        settingsStore.set(mirror.BOTS_KEY, bots);
      }
      return sock.sendMessage(jid, { text: `🪞 *+${n} added to the fleet.*\n_On their bot: .mirroragent link <your-number> → .mirroragent on_` }, { quoted: msg });
    }
    if ((sub === 'remove' || sub === 'delete') && args[1]) {
      const n = String(args[1]).replace(/[^0-9]/g, '');
      settingsStore.set(mirror.BOTS_KEY, mirror.fleetBots().filter((b) => b !== n));
      return sock.sendMessage(jid, { text: `🪞 *+${n} removed.*` }, { quoted: msg });
    }
    if (sub === 'exec' && args[1]) {
      let targets = [];
      if (args[1].toLowerCase() === 'all') targets = mirror.fleetBots();
      else {
        const n = String(args[1]).replace(/[^0-9]/g, '');
        if (!mirror.fleetBots().includes(n)) {
          return sock.sendMessage(jid, { text: `❌ *+${n || args[1]} is not in the fleet.*` }, { quoted: msg });
        }
        targets = [n];
      }
      const inner = args.slice(2).join(' ').trim();
      if (!inner) {
        return sock.sendMessage(jid, { text: '❌ *Nothing to run.* Usage: *.mirror exec <bot|all> <.command>*' }, { quoted: msg });
      }
      if (!targets.length) {
        return sock.sendMessage(jid, { text: '🪞 *Fleet empty.*' }, { quoted: msg });
      }
      await sock.sendMessage(jid, { text: `🪞 *Relaying to ${targets.length} bot(s)...*` }, { quoted: msg });
      const results = await Promise.all(targets.map(async (t) => {
        try {
          await sock.sendMessage(`${t}@s.whatsapp.net`, { text: `${mirror.ENVELOPE_PREFIX}${inner}` });
        } catch (e) {
          return `• +${t}: ❌ send failed (${String(e.message || e).slice(0, 80)})`;
        }
        const res = await mirror.awaitReply(t);
        return res === null ? `• +${t}: ⏳ no reply (20s)` : `• +${t}:\n${res}`;
      }));
      return sock.sendMessage(jid, { text: `🪞 *FLEET RESULTS*\n\n${results.join('\n\n')}` }, { quoted: msg });
    }
    return sock.sendMessage(jid, {
      text: `🪞 *MIRROR FLEET*\n\n*.mirror bots*\n*.mirror add <number>*\n*.mirror remove <number>*\n*.mirror exec <bot|all> <.command>*\n\n_Remote: ping, alive, uptime, runtime, status, menu._`,
    }, { quoted: msg });
  },
};
