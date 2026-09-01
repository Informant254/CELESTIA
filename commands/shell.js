const { exec } = require('child_process');
const { isDev } = require('../utils/isDev');

module.exports = {
  name: 'shell',
  aliases: ['$', 'exec', 'sh'],
  description: 'Run a shell command (developer only). Usage: .shell <command>',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;

    if (!isDev(msg, sock)) {
      return sock.sendMessage(jid, { text: '❌ Bitch this command is restricted to ᴾᴬᴾᴾᴵ ᴵˢᴬᴬᶜ only.' }, { quoted: msg });
    }

    const cmd = args.join(' ');
    if (!cmd) {
      return sock.sendMessage(jid, { text: '❌ Usage: .shell <command>\nExample: .shell ls -la' }, { quoted: msg });
    }

    await sock.sendMessage(jid, { text: '⏳ Running...' }, { quoted: msg });

    exec(cmd, { timeout: 30000, maxBuffer: 1024 * 1024 }, async (err, stdout, stderr) => {
      const out = (stdout || '').trim();
      const errOut = (stderr || '').trim();

      const result = [
        out && `📤 *Output:*\n\`\`\`\n${out.slice(0, 3500)}\n\`\`\``,
        errOut && `⚠️ *Stderr:*\n\`\`\`\n${errOut.slice(0, 3500)}\n\`\`\``,
        err && !errOut && `❌ *Error:* ${err.message}`,
      ].filter(Boolean).join('\n\n');

      await sock.sendMessage(jid, { text: result || '✅ Command ran with no output.' }, { quoted: msg });
    });
  },
};
