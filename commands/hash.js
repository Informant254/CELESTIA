const fortress = require('../utils/cyberFortress');

module.exports = {
  name: 'hash',
  aliases: ['hashtool'],
  description: '⚔️ Hash any text with 12 algorithms (MD5, SHA family, CRC32, base64...)',
  execute: async (sock, msg, args, commands, reply) => {
    if (!args.length) {
      return reply(
        '⚔️ *Crypto Lab — Hash Forge*\n\n' +
        'Usage: *.hash <text>* or reply to a message with *.hash*\n\n' +
        'Digests: MD5 • SHA-1 • SHA-224/256/384/512 • SHA3-256/512 • RIPEMD-160 • CRC32 • Base64 • Base32 • HEX'
      );
    }

    let text = args.join(' ');
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!text && quoted) {
      text = quoted.conversation || quoted.extendedTextMessage?.text || '';
    }

    const h = fortress.hashAll(text);
    const lines = [
      '⚔️ *CRYPTO LAB — HASH FORGE*',
      '',
      `> _"${String(text).slice(0, 60)}${text.length > 60 ? '...' : ''}"_`,
      '',
      `*MD5*      ${h.md5}`,
      `*SHA-1*    ${h.sha1}`,
      `*SHA-224*  ${h.sha224}`,
      `*SHA-256*  ${h.sha256}`,
      `*SHA-384*  ${h.sha384}`,
      `*SHA-512*  ${h.sha512}`,
      `*SHA3-256* ${h.sha3_256}`,
      `*SHA3-512* ${h.sha3_512}`,
      `*RIPEMD*   ${h.ripemd160}`,
      `*CRC32*    ${h.crc32}`,
      `*Base64*   ${h.base64.slice(0, 80)}${h.base64.length > 80 ? '...' : ''}`,
      `*Base32*   ${h.base32.slice(0, 80)}${h.base32.length > 80 ? '...' : ''}`,
      `*HEX*      ${h.hex.slice(0, 80)}${h.hex.length > 80 ? '...' : ''}`,
      '',
      '> 🐺 *Identify a mystery hash: .hashid <hash>*',
    ];
    return reply(lines.join('\n'));
  },
};
