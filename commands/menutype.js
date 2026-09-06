const settingsStore = require('../utils/settingsStore');
const { isOwner } = require('../utils/isOwner');

module.exports = {
  name: 'menutype',
  description: 'Compatibility bridge → use .menutheme for the full 4-face picker',
  async execute(sock, msg, args) {
    if (!isOwner(msg)) return;

    const choice = (args[0] || '').toLowerCase();

    // Bridge old settings to the new theme system
    if (choice === 'button') {
      settingsStore.set('menu_native', true);
      return await sock.sendMessage(msg.key.remoteJid, {
        text: '📱 Native tappable menus *ON* (old menutype=button bridged).\n🎨 Faces live in `.menutheme` — 4 styles: Star Map • Neon • Zen • Grimoire',
      });
    }
    if (choice === 'list') {
      settingsStore.set('menu_native', false);
      return await sock.sendMessage(msg.key.remoteJid, {
        text: '📱 Text menus (old menutype=list bridged).\n🎨 Faces live in `.menutheme` — 4 styles: Star Map • Neon • Zen • Grimoire',
      });
    }

    const native = settingsStore.get('menu_native', false);
    const theme = settingsStore.get('menu_theme', 'constellation');
    await sock.sendMessage(msg.key.remoteJid, {
      text: `📋 Menu config:\n• Face: *${theme}*\n• Native tappable: *${native ? 'ON' : 'off'}*\n\n💡 \`.menutheme\` — the full 4-face picker\n💡 \`.menutheme native on/off\` — tappable realms`,
    });
  },
};
