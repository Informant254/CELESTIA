const { isOwner } = require('../utils/isOwner');
const cookies = require('../download/cookies');

module.exports = {
  name: 'ytcookies',
  description: 'Owner-only YouTube cookie management. .ytcookies status|refresh, or reply to cookies.txt with .ytcookies upload',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const reply = text => sock.sendMessage(jid, { text }, { quoted: msg });
    if (!isOwner(msg)) return reply('Only the bot owner can manage YouTube cookies.');
    if (jid.endsWith('@g.us')) return reply('Manage cookies in a private chat with the bot.');
    const sub = (args[0] || 'status').toLowerCase();
    try {
      const state = cookies.status();
      if (state.readOnly && ['upload', 'refresh'].includes(sub)) {
        return reply('This bot uses the shared YouTube cookies. Upload or refresh them in your main CELESTIA bot; this bot will pick up the replacement automatically.');
      }
      if (sub === 'upload') {
        const { downloadMediaMessage, normalizeMessageContent } = require('@whiskeysockets/baileys');
        const message = normalizeMessageContent(msg.message);
        const ctx = message?.extendedTextMessage?.contextInfo;
        const quoted = normalizeMessageContent(ctx?.quotedMessage);
        const document = quoted?.documentMessage;
        if (!document) return reply('Send your Netscape cookies.txt file privately, then reply to that document with .ytcookies upload.');
        if (Number(document.fileLength || 0) > cookies.MAX_BYTES) return reply('Cookie file is too large (maximum 256 KB).');
        const stream = await downloadMediaMessage({
          key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant }, message: quoted,
        }, 'stream', {}, { reuploadRequest: sock.updateMediaMessage });
        const chunks = [];
        let size = 0;
        try {
          for await (const chunk of stream) {
            size += chunk.length;
            if (size > cookies.MAX_BYTES) throw new Error('Cookie file is too large (maximum 256 KB).');
            chunks.push(chunk);
          }
        } finally { stream.destroy?.(); }
        await cookies.store(Buffer.concat(chunks));
        return reply(state.shared
          ? 'Shared YouTube cookies saved privately. All linked private bots will use them on their next downloads; no restart is needed.'
          : 'YouTube cookies saved privately. New downloads will use them automatically; no restart is needed.');
      }
      if (sub === 'refresh') {
        const result = await cookies.refresh({ force: true, signal: AbortSignal.timeout(15000) });
        if (!result.configured) return reply('No automatic source is configured. Set YOUTUBE_COOKIES_URL to your private HTTPS cookies.txt source, or upload a fresh file with .ytcookies upload.');
        return reply(result.updated ? 'Fresh YouTube cookies installed.' : result.failed ? 'The cookie source could not provide a fresh valid file. Existing cookies were kept.' : 'No fresh replacement is available yet (source unchanged or refresh cooldown).');
      }
      if (sub !== 'status') return reply('Usage: .ytcookies status | .ytcookies refresh | reply to cookies.txt with .ytcookies upload');
      return reply([
        `YouTube cookies: ${state.state}`,
        ...(state.shared ? [`Storage: shared across your private bots${state.readOnly ? ' (managed by CELESTIA)' : ' (main manager)'}`] : []),
        `Expiry: ${state.expiresAt ? new Date(state.expiresAt).toISOString() : 'not specified / session-based'}`,
        `Automatic source: ${state.automaticSource ? 'configured' : 'not configured'}`,
        `Last refresh: ${state.lastRefresh}`,
        'Automatic refresh runs when a download needs cookies. Fresh login sessions must come from your browser or configured source.',
      ].join('\n'));
    } catch {
      return reply('Could not install or refresh the cookies. Use a fresh Netscape cookies.txt export containing your signed-in YouTube session (maximum 256 KB).');
    }
  },
};
