const axios = require('axios');

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

module.exports = {
  name: 'runtime',
  aliases: ['stats'],
  description: 'Check bot runtime with rich card',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const text = `𝐈𝐒𝐀𝐀𝐂-𝐌𝐃 𝗵𝗮𝘀 𝗯𝗲𝗲𝗻 𝗿𝘂𝗻𝗻𝗶𝗻𝗴 𝘀𝗶𝗻𝗰𝗲 ${formatUptime(process.uptime())}`;

    // externalAdReply needs the thumbnail as an actual image buffer —
    // passing a raw URL string doesn't render reliably. Fetch it once here.
    let thumbnail;
    try {
      const res = await axios.get('https://i.ibb.co/HLWq3qVs/faab81f4a3dd.jpg', {
        responseType: 'arraybuffer',
      });
      thumbnail = Buffer.from(res.data);
    } catch (e) {
      thumbnail = undefined; // card still sends without an image if the fetch fails
    }

    await sock.sendMessage(
      jid,
      {
        text,
        contextInfo: {
          externalAdReply: {
            showAdAttribution: true,
            title: 'CELESTIA',
            body: 'https://chat.whatsapp.com/JPH5gho7uxfBMviXg7sNNs',
            thumbnail,
            sourceUrl: 'https://chat.whatsapp.com/JPH5gho7uxfBMviXg7sNNs',
            mediaType: 1,
            renderLargerThumbnail: true,
          },
        },
      },
      { quoted: msg }
    );
  },
};
