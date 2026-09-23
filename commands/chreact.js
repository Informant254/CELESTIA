const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');
const chreact = require('../utils/chreact');

function inviteCode(input) {
  const m = String(input || '').match(/whatsapp\.com\/channel\/([A-Za-z0-9]+)/i);
  return m ? m[1] : null;
}

module.exports = {
  name: 'chreact',
  aliases: ['channelreact'],
  description: '⚡ Auto-react to followed Channel posts (operator only). .chreact on|off|follow|unfollow|list|emojis|status',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      return sock.sendMessage(jid, { text: '❌ *Only the bot owner can use this command.*' }, { quoted: msg });
    }
    if (!chreact.isOperatorBot()) {
      return sock.sendMessage(jid, { text: '⚡ *The Channel Reactor lives on the operator bot only.*' }, { quoted: msg });
    }
    const sub = (args[0] || 'status').toLowerCase();
    const rest = args.slice(1).join(' ').trim();

    if (sub === 'on') {
      settingsStore.set(chreact.ON_KEY, true);
      return sock.sendMessage(jid, { text: '⚡ *Channel Reactor ON.*\n_She reacts to new posts in followed channels._' }, { quoted: msg });
    }
    if (sub === 'off') {
      settingsStore.set(chreact.ON_KEY, false);
      return sock.sendMessage(jid, { text: '⚡ *Channel Reactor OFF.*' }, { quoted: msg });
    }
    if (sub === 'emojis' && rest) {
      let parts;
      try {
        parts = [...new Intl.Segmenter().segment(rest)].map((s) => s.segment);
      } catch {
        parts = [...rest];
      }
      const list = [...new Set(parts.filter((c) => /\p{Emoji}/u.test(c)))].slice(0, 12);
      if (!list.length) {
        return sock.sendMessage(jid, { text: '❌ *Send emojis.* Usage: *.chreact emojis 🔥❤️👏*' }, { quoted: msg });
      }
      settingsStore.set(chreact.EMOJIS_KEY, list);
      return sock.sendMessage(jid, { text: `⚡ *Reaction set:*\n${list.join(' ')}` }, { quoted: msg });
    }
    if ((sub === 'follow' || sub === 'add') && rest) {
      try {
        let target = rest;
        const code = inviteCode(rest);
        if (code) {
          const meta = await sock.newsletterMetadata('invite', code);
          if (!meta?.id) throw new Error('invite did not resolve');
          target = meta.id;
        }
        if (!chreact.isNewsletter(target) && !/^\d+@newsletter$/.test(target) && /^\d+$/.test(target)) {
          target = `${target}@newsletter`;
        }
        await sock.newsletterFollow(target);
        const list = chreact.channels();
        if (!list.includes(target)) {
          list.push(target);
          settingsStore.set(chreact.CHANNELS_KEY, list);
        }
        return sock.sendMessage(jid, { text: `⚡ *Following + reacting:*\n${target}` }, { quoted: msg });
      } catch (e) {
        return sock.sendMessage(jid, { text: `❌ *Could not follow.* ${String(e.message || '').slice(0, 120)}` }, { quoted: msg });
      }
    }
    if ((sub === 'unfollow' || sub === 'remove') && rest) {
      try {
        const target = /^\d+$/.test(rest) ? `${rest}@newsletter` : rest;
        await sock.newsletterUnfollow(target).catch(() => {});
        settingsStore.set(chreact.CHANNELS_KEY, chreact.channels().filter((c) => c !== target));
        return sock.sendMessage(jid, { text: `⚡ *Unfollowed:*\n${target}` }, { quoted: msg });
      } catch (e) {
        return sock.sendMessage(jid, { text: `❌ *Could not unfollow.* ${String(e.message || '').slice(0, 120)}` }, { quoted: msg });
      }
    }
    if (sub === 'list') {
      const list = chreact.channels();
      return sock.sendMessage(jid, {
        text: list.length ? `⚡ *Reacting in ${list.length} channel(s):*\n${list.map((c) => `• ${c}`).join('\n')}` : '⚡ *No channels yet.*\n_Use .chreact follow <invite-link or JID>_',
      }, { quoted: msg });
    }
    if (sub === 'cycle') {
      // .chreact cycle <minutes> <emojis...> — rotate the emoji on the
      // newest seen post. Optional 3rd arg: total rotations (default 24).
      const everyMin = Math.min(120, Math.max(2, parseInt(rest.split(/\s+/)[0], 10) || 10));
      let parts;
      try {
        parts = [...new Intl.Segmenter().segment(args.slice(2).join(' '))].map((s) => s.segment);
      } catch {
        parts = [...args.slice(2).join(' ')];
      }
      let list = [...new Set(parts.filter((c) => /\p{Emoji}/u.test(c)))].slice(0, 12);
      if (!list.length) list = chreact.emojis();
      const maxCycles = Math.min(100, Math.max(1, parseInt(args[args.length - 1], 10) && /^\d+$/.test(args[args.length - 1]) ? parseInt(args[args.length - 1], 10) : 24));
      const post = chreact.lastPost();
      if (!post) {
        return sock.sendMessage(jid, { text: '❌ *No channel post seen yet.*\n_Post something first (or wait for the next post), then start the cycle._' }, { quoted: msg });
      }
      const st = chreact.startCycle({ jid: post.jid, serverId: post.serverId, emojis: list, everyMin, maxCycles });
      chreact.noteSock(sock);
      return sock.sendMessage(jid, {
        text: `🔁 *CYCLE ON:* ${list.join(' ')} every ${st.everyMin}min × ${st.cyclesLeft}\n_Post: ${post.jid}_\n\n_One reaction per account is WhatsApp's rule — cycling keeps it visibly alive instead._`,
      }, { quoted: msg });
    }
    if (sub === 'stopcycle' || sub === 'cycleoff') {
      chreact.stopCycle();
      return sock.sendMessage(jid, { text: '🔁 *Cycle stopped.*' }, { quoted: msg });
    }
    const list = chreact.channels();
    const cyc = chreact.cycleState();
    return sock.sendMessage(jid, {
      text: `⚡ *CHANNEL REACTOR:* ${chreact.isOn() ? 'ON' : 'OFF'}\n• Channels: ${list.length}\n• Emojis: ${chreact.emojis().join(' ')}\n• Cycle: ${cyc ? `ON (${cyc.emojis.join(' ')} every ${cyc.everyMin}min, ${cyc.cyclesLeft} left)` : 'off'}\n\n*.chreact on|off*\n*.chreact follow <invite-link|JID>*\n*.chreact unfollow <JID>*\n*.chreact emojis 🔥❤️👏*\n*.chreact cycle <min> <emojis> [count]*`,
    }, { quoted: msg });
  },
};
