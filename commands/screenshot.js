module.exports = {
  name: 'screenshot',
  aliases: ['ss', 'ssweb'],
  description: 'Screenshot a website',

  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const url = args.join(' ').trim();

    if (!url) {
      return await sock.sendMessage(jid, { text: 'Provide a website link to screenshot.' }, { quoted: msg });
    }

    try {
      const caption = 'Screenshot by CELESTIA';
      const image = `https://image.thum.io/get/fullpage/${url}`;
      await sock.sendMessage(jid, { image: { url: image }, caption }, { quoted: msg });
    } catch (error) {
      console.error('[SCREENSHOT ERROR]', error);
      await sock.sendMessage(jid, { text: 'An error occurred.' }, { quoted: msg });
    }
  },
};
