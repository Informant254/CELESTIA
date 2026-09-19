/**
 * .menutheme — choose her face
 *
 *   .menutheme                 → native tappable picker (6 styles)
 *   .menutheme boxed          → ❏ Ironbox (flagship boxes)
 *   .menutheme celestial      → 🌌 Celestial Reign (flagship)
 *   .menutheme constellation    → 🗺️ Star Map
 *   .menutheme neon             → 🌆 Neon Classic
 *   .menutheme zen              → 🍃 Minimal Zen
 *   .menutheme grimoire         → 📜 Arcane Grimoire
 *   .menutheme native on|off   → WhatsApp tappable realm menus
 *   .menutheme status          → current face
 */
const settingsStore = require('../utils/settingsStore');
const { isOwner } = require('../utils/isOwner');

const THEMES = [
  { key: 'boxed', icon: '✦', name: 'CELESTIA SIGNATURE', desc: 'diamond accent · precise editorial finish' },
  { key: 'celestial', icon: '✧', name: 'CELESTIAL REIGN', desc: 'soft starlight · an elegant silver accent' },
  { key: 'constellation', icon: '⋆', name: 'STAR MAP', desc: 'astral points · observatory character' },
  { key: 'neon', icon: '◆', name: 'NEON CLASSIC', desc: 'bold geometry · electric signal accent' },
  { key: 'zen', icon: '•', name: 'MINIMAL ZEN', desc: 'quiet marks · restrained visual rhythm' },
  { key: 'grimoire', icon: '❖', name: 'ARCANE GRIMOIRE', desc: 'ornate glyphs · archival mystique' },
];

module.exports = {
  name: 'menutheme',
  aliases: ['mtheme', 'face'],
  description: '🎨 Choose her menu face — 6 appearances + native tappable mode',
  execute: async (sock, msg, args, commands, reply) => {
    const jid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      return sock.sendMessage(jid, { text: '❌ Only the owner can use this command.' }, { quoted: msg });
    }

    const prefix = settingsStore.get('prefix', '.') || '.';
    const sub = (args[0] || '').toLowerCase();

    // ─── Bare: tappable picker ───
    if (!sub || sub === 'status') {
      const cur = settingsStore.get('menu_theme', 'boxed');
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
      boxed: '✦ the signature observatory now carries a diamond accent',
      celestial: '✧ the same flawless navigation, washed in silver starlight',
      constellation: '⋆ the observatory is charted in astral points',
      neon: '◆ the grid is live with a sharper electric pulse',
      zen: '• the observatory becomes quieter and more restrained',
      grimoire: '❖ every path now carries an archival celestial glyph',
    }[t.key];
    return reply(
      `🎨 *Face set:* ${t.icon} *${t.name}*\n\n_${preview}_\n\n> Send \`${prefix}menu\` to see her new face.`
    );
  },
};
