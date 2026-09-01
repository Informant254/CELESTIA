const os = require('os');
const config = require('../config/config');

module.exports = {
  name: 'stats',
  description: 'Displays detailed bot statistics.',

  async execute(sock, msg, args) {
    try {
      const jid = msg.key.remoteJid;

      // Uptime
      const uptime = process.uptime();
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = Math.floor(uptime % 60);

      // Memory usage
      const ramUsed = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);

      // CPU information (safe for Android)
      const cpuModel = 'ARM Cortex-A75 + Cortex-A55';
      const cpuCores = 8;
      const architecture = os.arch();

      // RAM
      const totalRam = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
      const freeRam = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);

      // System info
      const platform = `${os.type()} ${os.release()}`;
      const nodeVersion = process.version;

      // Current formatted time & date using bot timezone
      const systemDate = new Date();
      const formattedTime = new Intl.DateTimeFormat('en-US', {
        timeZone: config.timezone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }).format(systemDate);

      const formattedDate = new Intl.DateTimeFormat('en-GB', {
        timeZone: config.timezone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(systemDate);

      const text = `
📊 *BOT STATISTICS*

🤖 *Bot:* CELESTIA
🟢 *Status:* Online

⏱ *Uptime:* ${hours}h ${minutes}m ${seconds}s
💾 *RAM Used:* ${ramUsed} MB
🧠 *Total RAM:* ${totalRam} GB
📉 *Free RAM:* ${freeRam} GB

🖥 *CPU:* ${cpuModel}
⚙️ *Cores:* ${cpuCores}
🏗 *Architecture:* ${architecture}

🌐 *System:* ${platform}
🟩 *Node.js:* ${nodeVersion}

📅 *Date:* ${formattedDate}
🕒 *Time:* ${formattedTime}
`.trim();

      await sock.sendMessage(jid, { text }, { quoted: msg });
    } catch (err) {
      console.error('Stats command error:', err);
      await sock.sendMessage(
        msg.key.remoteJid,
        { text: `❌ Error: ${err.message}` },
        { quoted: msg }
      );
    }
  },
};

