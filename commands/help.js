const config = require('../config/config');

module.exports = {
  name: 'help',
  description: 'Shows the list of all available commands.',

  /**
   * @param {object} sock - active Baileys socket connection
   * @param {object} msg - raw incoming message object
   * @param {string[]} args - extra words typed after the command (unused)
   * @param {Map<string, object>} commands - all loaded commands, injected by the dispatcher
   */
  async execute(sock, msg, args, commands) {
    const jid = msg.key.remoteJid;

    // Build a numbered list like:
    //   1. !ping - Checks if the bot is online and responsive.
    //   2. !help - Shows the list of all available commands.
    const lines = [...commands.values()].map((cmd, index) => {
      return `${index + 1}. ${config.prefix}${cmd.name} - ${cmd.description}`;
    });

    const text = `*${config.botName} — Available Commands*\n\n${lines.join('\n')}`;

    await sock.sendMessage(jid, { text }, { quoted: msg });
  },
};
