module.exports = {
  name: 'gpass',
  aliases: ['genpassword'],
  description: 'Generate a strong password. Usage: .gpass <length> (default 16, 4-64)',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const length = parseInt(args[0]) || 16;

    if (length < 4 || length > 64) {
      return sock.sendMessage(jid, { text: 'Password length must be between 4 and 64.' }, { quoted: msg });
    }

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    let password = '';
    for (let i = 0; i < length; i++) password += chars[Math.floor(Math.random() * chars.length)];

    await sock.sendMessage(jid, { text: `🔐 *Generated Password (${length} chars):*\n\`${password}\`\n\n_Keep this safe!_` }, { quoted: msg });
    await sock.sendMessage(jid, { text: password }, { quoted: msg });
  },
};
