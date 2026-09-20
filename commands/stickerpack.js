const kit = require('../utils/stickerKit');

const PACKS = Object.freeze({
  reactions: { colors: ['#7c3aed', '#06b6d4'], words: ['NO WAY!', 'SERIOUSLY?', 'I AM DONE', 'MOOD'] },
  love: { colors: ['#e11d48', '#fb7185'], words: ['LOVE YOU', 'MISS YOU', 'MY PERSON', 'FOREVER'] },
  savage: { colors: ['#111827', '#ef4444'], words: ['TRY AGAIN', 'NOT TODAY', 'STAY MAD', 'NEXT!'] },
  greetings: { colors: ['#0f766e', '#22c55e'], words: ['GOOD MORNING', 'HEY YOU!', 'GOOD NIGHT', 'WELCOME'] },
  football: { colors: ['#166534', '#84cc16'], words: ['GOAL!', 'WHAT A SAVE', 'MATCH DAY', 'CHAMPIONS'] },
  celestial: { colors: ['#312e81', '#22d3ee'], words: ['STAR POWER', 'COSMIC MOOD', 'SHINE ON', 'CELESTIA'] },
});

module.exports = {
  name: 'stickerpack', aliases: ['stickers', 'packstickers'], description: 'Send a themed CELESTIA sticker collection',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const name = String(args[0] || '').toLowerCase();
    const pack = PACKS[name];
    if (!pack) return sock.sendMessage(jid, { text: `✨ *CELESTIA STICKER PACKS*\n\n${Object.keys(PACKS).map((p) => `• \`.stickerpack ${p}\``).join('\n')}` }, { quoted: msg });
    await sock.sendMessage(jid, { text: `✨ Sending the *${name}* sticker pack...` }, { quoted: msg });
    for (const word of pack.words) {
      const art = await kit.textArt(word, pack.colors);
      const sticker = await kit.toSticker(art, { pack: `CELESTIA ${name.toUpperCase()}`, author: 'CELESTIA', categories: ['✨'] });
      await sock.sendMessage(jid, { sticker }, { quoted: msg });
    }
  },
  _internals: { PACKS },
};
