const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { isOwner } = require('../utils/isOwner');
const { jobDir, wipeDir } = require('../download/cleanup');
const studio = require('../utils/mediaStudio');

module.exports = {
  name: 'statusstudio', aliases: ['statusai', 'statstudio'], description: 'Create AI quote cards and waveform status videos',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const post = args[0]?.toLowerCase() === 'post';
    if (post && !isOwner(msg)) return sock.sendMessage(jid, { text: '❌ Only the owner can publish a status.' }, { quoted: msg });
    if (post) args = args.slice(1);
    const mode = (args[0] || '').toLowerCase();
    const dir = jobDir('status-studio');
    try {
      if (mode === 'quote') {
        const raw = args.slice(1).join(' ').trim();
        if (!raw) throw new Error('Use `.statusstudio quote your words | author`');
        const [quote, author = 'CELESTIA'] = raw.split('|').map((s) => s.trim());
        const output = path.join(dir, 'quote.jpg');
        let background = null;
        try { background = await studio.generateImage('premium abstract celestial background, deep navy violet and cyan glow, subtle stars, vertical portrait, empty center, no text, no logo, no watermark'); } catch {}
        await studio.createCard({ text: quote.slice(0, 320), author: author.slice(0, 60), background, output });
        const image = fs.readFileSync(output);
        if (post) {
          const count = await studio.postStatus(sock, { image, caption: '' });
          return sock.sendMessage(jid, { text: `✅ Quote card posted to status (${count} recipients).` }, { quoted: msg });
        }
        return sock.sendMessage(jid, { image, caption: '✦ Created in CELESTIA Status Studio' }, { quoted: msg });
      }
      if (mode === 'waveform') {
        const ctx = msg.message?.extendedTextMessage?.contextInfo;
        const quoted = ctx?.quotedMessage;
        if (!quoted?.audioMessage && !quoted?.videoMessage) throw new Error('Reply to audio or video with `.statusstudio waveform <title>`');
        const input = path.join(dir, quoted.videoMessage ? 'input.mp4' : 'input.audio');
        const cover = path.join(dir, 'cover.jpg');
        const output = path.join(dir, 'waveform.mp4');
        const media = await downloadMediaMessage({ message: quoted, key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant } }, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
        fs.writeFileSync(input, media);
        await studio.createCard({ text: args.slice(1).join(' ') || 'NOW PLAYING', author: 'CELESTIA AUDIO', output: cover });
        await studio.createWaveform({ input, cover, output });
        if (post) {
          const count = await studio.postStatus(sock, { video: { url: output }, caption: '' });
          return sock.sendMessage(jid, { text: `✅ Waveform posted to status (${count} recipients).` }, { quoted: msg });
        }
        return sock.sendMessage(jid, { video: { url: output }, caption: '✦ CELESTIA waveform status' }, { quoted: msg });
      }
      return sock.sendMessage(jid, { text: '✦ *CELESTIA STATUS STUDIO*\n\n`.statusstudio quote <words> | <author>`\n`.statusstudio waveform <title>` (reply to audio)\n\nAdd `post` before the mode to publish directly.' }, { quoted: msg });
    } catch (error) {
      return sock.sendMessage(jid, { text: `❌ Status Studio: ${error.message}` }, { quoted: msg });
    } finally { wipeDir(dir); }
  },
};
