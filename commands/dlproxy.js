const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'dlproxy',
  description: 'Point downloads at your own proxy (owner only). .dlproxy url|key|status',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      return sock.sendMessage(jid, { text: '❌ *Only the bot owner can use this command.*' }, { quoted: msg });
    }
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'url' && args[1]) {
      const url = String(args[1]).replace(/\/+$/, '');
      if (!/^https?:\/\/.+\..+/.test(url)) {
        return sock.sendMessage(jid, { text: '❌ *That does not look like a URL.*\n\nUsage: *.dlproxy url https://your-tunnel-url*' }, { quoted: msg });
      }
      settingsStore.set('dlproxy_url', url);
      return sock.sendMessage(jid, { text: `✅ *Download proxy set:*\n${url}\n\n_Next downloads try your proxy first._` }, { quoted: msg });
    }
    if (sub === 'key' && args[1]) {
      settingsStore.set('dlproxy_key', args[1]);
      return sock.sendMessage(jid, { text: '✅ *Proxy client key saved.*' }, { quoted: msg });
    }
    if (sub === 'off') {
      settingsStore.set('dlproxy_url', null);
      settingsStore.set('dlproxy_key', null);
      return sock.sendMessage(jid, { text: '📴 *Own proxy disabled — Apix/yt-dlp chain takes over.*' }, { quoted: msg });
    }
    let status = 'not configured';
    try {
      const self = require('../utils/dlproxy');
      status = self.configured() ? `ON → ${self.baseUrl()}` : 'not configured';
    } catch { /* ignore */ }
    return sock.sendMessage(jid, {
      text: `🔌 *OWN DOWNLOAD PROXY:* ${status}\n\n• *.dlproxy url <tunnel-url>*\n• *.dlproxy key <client-key>*\n• *.dlproxy off*\n\n_Order: your proxy → Apix → yt-dlp → free APIs._`,
    }, { quoted: msg });
  },
};
