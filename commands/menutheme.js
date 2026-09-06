/**
 * .menutheme — choose her face
 *
 *   .menutheme                 → native tappable picker (4 styles)
 *   .menutheme constellation    → 🗺️ Star Map
 *   .menutheme neon             → 🌆 Neon Classic
 *   .menutheme zen              → 🍃 Minimal Zen
 *   .menutheme grimoire         → 📜 Arcane Grimoire
 *   .menutheme native on|off   → WhatsApp tappable realm menus
 *   .menutheme status          → current face
 */
const settingsStore = require('../utils/settingsStore');

const THEMES = [
  { key: 'constellation', icon: '🗺️', name: 'STAR MAP', desc: 'figlet banner · realm poems · star-light' },
  { key: 'neon', icon: '🌆', name: 'NEON CLASSIC', desc: 'cyber grid · box panels · sharp neon lines' },
  { key: 'zen', icon: '🍃', name: 'MINIMAL ZEN', desc: 'quiet whitespace · command clouds · calm' },
  { key: 'grimoire', icon: '📜', name: 'ARCANE GRIMOIRE', desc: 'ancient spellbook · roman chapters · glyphs' },
];

module.exports = {
  name: 'menutheme',
  aliases: ['mtheme', 'face'],
  description: '🎨 Choose her menu face — 4 appearances + native tappable mode',
  execute: async (sock, msg, args, commands, reply) => {
    const jid = msg.key.remoteJid;
    const prefix = settingsStore.get('prefix', '.') || '.';
    const sub = (args[0] || '').toLowerCase();

    // ─── Bare: tappable picker ───
    if (!sub || sub === 'status') {
      const cur = settingsStore.get('menu_theme', 'constellation');
      const native = settingsStore.get('menu_native', false);
      if (!sub) {
        try {
          await sock.sendMessage(jid, {
            text: `🎨 *Choose her face*\nCurrent: *${THEMES.find(t => t.key === cur)?.name || 'Star Map'}*${native ? ' + native tappable' : ''}`,
            buttonText: '🎨 Pick a Face',
            sections: [{
              title: '✨ Menu Appearances',
              rows: THEMES.map(t => ({
                title: `${t.icon} ${t.name}${t.key === cur ? ' ✓' : ''}`,
                rowId: `${prefix}menutheme ${t.key}`,
                description: t.desc,
              })),
            }],
          }, { quoted: msg });
          return;
        } catch { /* fall to text */ }
      }
      const curT = THEMES.find(t => t.key === cur);
      return reply(
        `🎨 *Current face:* ${curT?.icon} *${curT?.name}*\n` +
        `📱 Native tappable: ${native ? '*ON*' : 'off'}\n\n` +
        THEMES.map(t => `${t.icon} \`${prefix}menutheme ${t.key}\`${t.key === cur ? ' ← now' : ''}\n   _${t.desc}_`).join('\n') +
        `\n\n📱 \`${prefix}menutheme native on|off\` — tappable realm menus`
      );
    }

    // ─── native toggle ───
    if (sub === 'native') {
      const on = (args[1] || '').toLowerCase();
      if (on === 'on') {
        settingsStore.set('menu_native', true);
        return reply('📱 Native tappable menus *ON* — send `.menu` and tap a realm.');
      }
      if (on === 'off') {
        settingsStore.set('menu_native', false);
        return reply('📱 Native tappable off — `.menu` now renders as a text face.');
      }
      return reply('📱 Usage: `.menutheme native on` or `.menutheme native off`');
    }

    // ─── set a face ───
    const t = THEMES.find(x => x.key === sub);
    if (!t) {
      return reply(`🎨 Unknown face *${sub}*.\nFaces: ${THEMES.map(x => x.key).join(' • ')}\nOr just \`${prefix}menutheme\` for the picker.`);
    }
    settingsStore.set('menu_theme', t.key);
    const preview = {
      constellation: '✧ ✦ star-lines and poems await',
      neon: '┣ ⚡ neon grid online',
      zen: '✨ quiet. clean. hers.',
      grimoire: '◆ ✦ the tome opens, wolf-light on the pages',
    }[t.key];
    return reply(
      `🎨 *Face set:* ${t.icon} *${t.name}*\n\n_${preview}_\n\n> Send \`${prefix}menu\` to see her new face.`
    );
  },
};
