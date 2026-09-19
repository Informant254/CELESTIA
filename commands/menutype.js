const settingsStore = require('../utils/settingsStore');
const { isOwner } = require('../utils/isOwner');

module.exports = {
  name: 'menutype',
  description: 'Compatibility bridge for text and native constellation menus',
  async execute(sock, msg, args) {
    if (!isOwner(msg)) return;

    const choice = (args[0] || '').toLowerCase();

    // Bridge old settings to the new theme system
    if (choice === 'button') {
      settingsStore.set('menu_native', true);
      return await sock.sendMessage(msg.key.remoteJid, {
        text: '📱 Native constellation menus *ON*.\n🎨 Visual accents remain available through `.menutheme`.',
      });
    }
    if (choice === 'list') {
      settingsStore.set('menu_native', false);
      return await sock.sendMessage(msg.key.remoteJid, {
        text: '📱 Editorial text menus *ON*.\n🎨 Visual accents remain available through `.menutheme`.',
      });
    }

    const native = settingsStore.get('menu_native', false);
    const theme = settingsStore.get('menu_theme', 'boxed');
    await sock.sendMessage(msg.key.remoteJid, {
      text: `📋 Menu config:\n• Accent: *${theme}*\n• Native constellation: *${native ? 'ON' : 'off'}*\n\n💡 \`.menutheme\` — choose one of six accents\n💡 \`.menutheme native on/off\` — tappable navigation`,
    });
  },
};
