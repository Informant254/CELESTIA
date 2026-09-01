/**
 * commands/lyrics.js
 * -------------------
 * Fetches song lyrics from the Popcat API.
 * Usage: .lyrics <song name>
 */
const https = require('https');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

module.exports = {
  name: 'lyrics',
  description: 'Get song lyrics.',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const text = args.join(' ');

    if (!text) {
      return sock.sendMessage(jid, {
        text: '❌ Provide a song name.\n\nUsage: *.lyrics <song name>*',
      }, { quoted: msg });
    }

    try {
      const url = `https://api.popcat.xyz/v2/lyrics?song=${encodeURIComponent(text)}`;
      const data = await fetchJson(url);

      if (data.error || !data.message) {
        return sock.sendMessage(jid, { text: '😕 Lyrics not found.' }, { quoted: msg });
      }

      const song = data.message;
      const caption = [
        `🎵 *${song.title}*`,
        `👤 *Artist:* ${song.artist}`,
        '',
        song.lyrics.slice(0, 3500),
        '',
        song.url ? `🔗 ${song.url}` : null,
      ].filter(Boolean).join('\n');

      await sock.sendMessage(jid, {
        image: { url: song.image },
        caption,
      }, { quoted: msg });
    } catch (error) {
      await sock.sendMessage(jid, { text: `⚠️ Couldn't fetch lyrics: ${error.message}` }, { quoted: msg });
    }
  },
};
