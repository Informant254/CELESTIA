/**
 * commands/eggs.js — hidden stub registrations for the secret hunt. 🎃
 *
 * The secret layer in events/messages.js only fires for names present in the
 * commands map, so every easter egg needs a registered command. These stubs
 * are hidden from .menu (see menu.js uniqueCommands) and stay silent for
 * non-owners so the hunt never leaks.
 */
const secrets = require('../utils/secrets');

const stubs = secrets.eggNames().map((name) => ({
  name,
  aliases: [],
  hidden: true,
  description: '🎃',
  async execute() {
    // Owners never reach here (the secret layer intercepts first).
    // Everyone else gets silence — secrets stay secret.
    return null;
  },
}));

module.exports = stubs;
