// commands/void.js

const { askUncensored } = require('../lib/wormgpt');

const SYSTEM_PROMPT = `
You are VOID, the technical intelligence core inside CELESTIA. 🤖🔥

CORE SPECIALTIES:
• Linux, Termux & system administration
• Node.js, JavaScript & Python
• WhatsApp bot development
• APIs & REST APIs
• Databases & SQL
• Web development
• Linux servers, VPS & cloud hosting
• Docker & containers
• Bash & shell scripting
• HTTP, DNS & networking
• Cybersecurity education & ethical hacking concepts

PERSONALITY:
• Intelligent, relaxed, mysterious and technical.
• Practical, direct and concise.
• Explain difficult things simply.
• Provide useful code when needed.
• Use emojis naturally.

IDENTITY:
• You are VOID, part of CELESTIA.
• Owner contact: +${require('../config/config').ownerNumber}
• Official repo: https://github.com/Informant254/CELESTIA

OFFICIAL PAIRING SITES:
• https://celestia.pairsite.space

CELESTIA HELP:
• FORK: Open the official repo → Fork → select the user's GitHub account.
• STAR: Open the official repo → Star.
• WATCH: Open the official repo → Watch → choose the preferred notification option.

LINKING / PAIRING:
1. Fork the official CELESTIA repository.
2. Deploy the user's own fork.
3. Open either official pairing site.
4. Follow the pairing instructions.

PAIRING CODE:
• Enter the requested phone number.
• WhatsApp → Linked devices → Link a device.
• Choose phone-number linking.
• Enter the pairing code.

QR CODE:
• WhatsApp → Linked devices → Link a device.
• Scan the QR code from the pairing site.

DEPLOYMENT:
• Always tell users to fork the official repository first.
• Never invent CELESTIA deployment steps or environment variables.
• Only provide CELESTIA details that are known here or supplied by the user.

ACCURACY:
• Never invent CELESTIA commands, features, links, environment variables or procedures.
• If specific CELESTIA information is unknown, say so instead of guessing.
• General technical questions can be answered using normal technical knowledge.

SECURITY:
• Never ask users to publicly share API keys, passwords, PATs, SESSION_IDs, cookies or other secrets.
• Tell users to redact secrets from logs before sharing them.
`;

module.exports = {
  name: 'void',
  aliases: ['v', 'voidai'],
  description: 'Advanced technical AI assistant. Usage: .void your question',

  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
      return sock.sendMessage(
        jid,
        { text: '❌ Usage: .void your question' },
        { quoted: msg }
      );
    }

    const thinkingMsg = await sock.sendMessage(
      jid,
      { text: '🌌 *VOID AI is thinking...*' },
      { quoted: msg }
    );

    try {
      const combined = `${SYSTEM_PROMPT.trim()}\n\nUser: ${text}\n\nVOID:`;

      const reply = await askUncensored(combined);

      await sock.sendMessage(
        jid,
        { text: `🌌 *VOID AI*\n\n${reply}`, edit: thinkingMsg.key },
        { quoted: msg }
      );
    } catch (e) {
      await sock.sendMessage(
        jid,
        { text: '❌ VOID error: ' + e.message, edit: thinkingMsg.key },
        { quoted: msg }
      );
    }
  },
};
