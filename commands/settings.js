const config = require('../config/config');
const settingsStore = require('../utils/settingsStore');
const groupSettingsStore = require('../utils/groupSettingsStore');

function onOff(value) {
  return value ? '✅ ON' : '❌ OFF';
}

module.exports = {
  name: 'settings',
  description: "Shows the bot's current settings.",
  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    let antilinkOn = false;
    let pdmOn = false;
    let antigmMode = 'N/A';
    let setgreetOn = false;

    if (jid.endsWith('@g.us')) {
      antilinkOn = groupSettingsStore.get(jid, 'antilink', false);
      pdmOn = groupSettingsStore.get(jid, 'pdm', false);
      antigmMode = groupSettingsStore.get(jid, 'antigm', 'off').toUpperCase();
      setgreetOn = groupSettingsStore.get(jid, 'setgreet', false);
    }

    const text = `╔══════════════════════╗
║     ⚙️  BOT SETTINGS
╚══════════════════════╝

*🔒 Security*
┣ AntiLink: ${onOff(antilinkOn)}
┣ AntiGM: ${antigmMode}
┣ AntiLinkAll: ${onOff(settingsStore.get('antilinkall', false))}
┣ AntiDelete: ${onOff(settingsStore.get('antidelete', false))}
┣ AntiEdit: ${onOff(settingsStore.get('antiedit', false))}
┣ AntiCall: ${onOff(settingsStore.get('anticall', false))}
┣ AntiBot: ${onOff(settingsStore.get('antibot', false))}
┣ AntiTag: ${onOff(settingsStore.get('antitag', false))}
┗ BadWord: ${onOff(settingsStore.get('badword', false))}

*🤖 Automation*
┣ AutoRead: ${onOff(settingsStore.get('autoread', false))}
┣ AutoLike: ${onOff(settingsStore.get('autolike', false))}
┣ AutoView: ${onOff(settingsStore.get('autoview', true))}
┣ AutoBio: ${onOff(settingsStore.get('autobio', false))}
┣ AutoRecording: ${onOff(settingsStore.get('autorecording', false))}
┣ AutoTyping: ${onOff(settingsStore.get('autotyping', false))}
┣ PDM: ${onOff(pdmOn)}
┣ WelcomeGoodbye: ${onOff(settingsStore.get('welcomegoodbye', false))}
┗ SetGreet: ${onOff(setgreetOn)}

*💬 Bot Behaviour*
┣ Mode: 🌐 ${settingsStore.get('mode', 'public').toUpperCase()}
┣ Prefix: ${settingsStore.get('prefix', config.prefix)}
┣ MenuType: 📋 ${settingsStore.get('menutype', 'list').toUpperCase()}
┗ WAPresence: ${settingsStore.get('wapresence', false) ? '🟢 ONLINE' : '🔴 OFFLINE'}`;

    await sock.sendMessage(jid, { text }, { quoted: msg });
  },
};
