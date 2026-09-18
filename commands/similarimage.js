module.exports = {
  name: 'similarimage',
  aliases: ['reverse', 'similarimg', 'reverseimage', 'findimage'],
  description: 'Find similar images using reverse image search',

  async execute(sock, msg) {
    const rawJid = msg.key.remoteJid;
    const jid = rawJid.endsWith('@lid') && msg.key.remoteJidAlt
      ? msg.key.remoteJidAlt
      : rawJid;

    // No free keyless reverse-image API is currently reachable. Honest
    // message instead of a dead-end fetch — wire a provider key here
    // (e.g. SerpApi/Bing Visual Search) to re-enable.
    return await sock.sendMessage(
      jid,
      { text: '🔍 *Reverse image search is offline right now* — no image provider is configured.\n\nReply to an image with `.imagesearch <words describing it>` for closest-match results instead.' },
      { quoted: msg }
    );
  },
};
