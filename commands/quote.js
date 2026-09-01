/**
 * commands/quote.js
 * -----------------
 * Fetches a random inspirational/famous quote from ZenQuotes (a free,
 * no-key-required API) and sends it to the chat. quotable.io's API has
 * gone offline, so ZenQuotes is used instead.
 *
 * Usage: !quote
 */
module.exports = {
  name: 'quote',
  description: 'Sends a random famous quote.',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    try {
      const response = await fetch('https://zenquotes.io/api/random');
      const data = await response.json();
      const text = `"${data[0].q}"\n\n— ${data[0].a}`;
      await sock.sendMessage(jid, { text }, { quoted: msg });
    } catch (error) {
      await sock.sendMessage(
        jid,
        { text: '❌ Could not fetch a quote right now, try again in a moment.' },
        { quoted: msg }
      );
    }
  },
};
