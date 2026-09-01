const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'uptime',
  aliases: ['up'],
  description: 'Shows how long the bot has been running, with an audio clip.',
  async execute(sock, msg) {
    console.log("[UPTIME] execute started");
    const rawJid = msg.key.remoteJid;
const jid = rawJid.endsWith('@lid') && msg.key.remoteJidAlt
  ? msg.key.remoteJidAlt
  : rawJid;

    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);

    const text = `⏱ *Uptime:* ${parts.join(' ')}`;

    await sock.sendMessage(jid, { text }, { quoted: msg });

    const audioPath = path.join(__dirname, '../assets/uptime.m4a');
    if (fs.existsSync(audioPath)) {
      await sock.sendMessage(jid, {
        audio: fs.readFileSync(audioPath),
        mimetype: 'audio/mp4',
        ptt: false,
      });
    }
  },
};
