/**
 * 📱 STATUS STUDIO — beyond normal status 📱
 *
 *   .statussuite                          → the studio menu
 *   .statussuite text <style> <msg>        → styled text status
 *   .statussuite fancy <n> <msg>          → fancy fonts
 *   .statussuite gradient <msg>           → multi-line gradient look
 *   .statussuite typewriter <msg>         → one-char-per-line effect
 *   .statussuite banner <msg>              → big boxed banner
 *   .statussuite countdown <label> <when> → live countdown status text
 *   .statussuite poll <q> | <opt> | <opt>  → NOTE: WhatsApp doesn't support
 *       status polls via API — falls back to a text poll card.
 *
 * Styles: none | blocks | box | spaced | waves | sparkles | hearts | fire | sky
 */
const config = require('../config/config');
const { isOwner } = require('../utils/isOwner');

const STYLES = {
  none: (t) => t,
  blocks: (t) => t.split('').map(c => {
    const map = { a: '🅰', b: '🅱', i: '🅸', o: '🅾', u: '🅴' };
    return map[c.toLowerCase()] || c;
  }).join(''),
  box: (t) => `╔═${'═'.repeat(Math.min(t.length, 30))}═╗\n║ ${t} ║\n╚═${'═'.repeat(Math.min(t.length, 30))}═╝`,
  spaced: (t) => t.split('').join(' '),
  waves: (t) => `🌊 ${t.split(' ').join(' 🌊 ')} 🌊`,
  sparkles: (t) => `✨ ${t.replace(/ /g, ' ✨ ')} ✨`,
  hearts: (t) => `💖 ${t.replace(/ /g, ' 💖 ')} 💖`,
  fire: (t) => `🔥 ${t.replace(/ /g, ' 🔥 ')} 🔥`,
  sky: (t) => `☁️ ${t.replace(/ /g, ' ☁️ ')} ☁️`,
  aesthetic: (t) => t.split('').map(c => /[a-z]/.test(c) ? String.fromCharCode(c.charCodeAt(0) + 0x1D3F - 0x61 + 0x71 - 0x1D3F + (c.charCodeAt(0) - 97) + 0x1D3F - 0x61) : c).join(''),
};

// fancy unicode maps (fancy #1-8)
const FANCY_MAPS = [
  (t) => t.replace(/[a-z]/g, c => 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘQʀꜱᴛᴜᴠᴡxʏᴢ'[c.charCodeAt(0) - 97] || c).replace(/[A-Z]/g, c => 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘQʀꜱᴛᴜᴠᴡxʏᴢ'[c.charCodeAt(0) - 65] || c),
  (t) => t.replace(/[a-zA-Z]/g, c => ({ a:'ⓐ',b:'ⓑ',c:'ⓒ',d:'ⓓ',e:'ⓔ',f:'ⓕ',g:'ⓖ',h:'ⓗ',i:'ⓘ',j:'ⓙ',k:'ⓚ',l:'ⓛ',m:'ⓜ',n:'ⓝ',o:'ⓞ',p:'ⓟ',q:'ⓠ',r:'ⓡ',s:'ⓢ',t:'ⓣ',u:'ⓤ',v:'ⓥ',w:'ⓦ',x:'ⓧ',y:'ⓨ',z:'ⓩ',A:'Ⓐ',B:'Ⓑ',C:'Ⓒ',D:'Ⓓ',E:'Ⓔ',F:'Ⓕ',G:'Ⓖ',H:'Ⓗ',I:'Ⓘ',J:'Ⓙ',K:'Ⓚ',L:'Ⓛ',M:'Ⓜ',N:'Ⓝ',O:'Ⓞ',P:'Ⓟ',Q:'Ⓠ',R:'Ⓡ',S:'Ⓢ',T:'Ⓣ',U:'Ⓤ',V:'Ⓥ',W:'Ⓦ',X:'Ⓧ',Y:'Ⓨ',Z:'Ⓩ' }[c] || c)),
  (t) => t.replace(/[a-z]/g, c => ({ a:'𝕒',b:'𝕓',c:'𝕔',d:'𝕕',e:'𝕖',f:'𝕗',g:'𝕘',h:'𝕙',i:'𝕚',j:'𝕛',k:'𝕜',l:'𝕝',m:'𝕞',n:'𝕟',o:'𝕠',p:'𝕡',q:'𝕢',r:'𝕣',s:'𝕤',t:'𝕥',u:'𝕦',v:'𝕧',w:'𝕨',x:'𝕩',y:'𝕪',z:'𝕫' }[c] || c)),
  (t) => t.replace(/[a-z]/g, c => ({ a:'𝓪',b:'𝓫',c:'𝓬',d:'𝓭',e:'𝓮',f:'𝓯',g:'𝓰',h:'𝓱',i:'𝓲',j:'𝓳',k:'𝓴',l:'𝓵',m:'𝓶',n:'𝓷',o:'𝓸',p:'𝓹',q:'𝓺',r:'𝓻',s:'𝓼',t:'𝓽',u:'𝓾',v:'𝓿',w:'𝔀',x:'𝔁',y:'𝔂',z:'𝔃' }[c] || c)),
  (t) => t.replace(/[a-zA-Z]/g, c => ({ a:'ɐ',b:'q',c:'ɔ',d:'p',e:'ǝ',f:'ɟ',g:'ƃ',h:'ɥ',i:'ᴉ',j:'ɾ',k:'ʞ',l:'l',m:'ɯ',n:'u',o:'o',p:'d',q:'b',r:'ɹ',s:'s',t:'ʇ',u:'n',v:'ʌ',w:'ʍ',x:'x',y:'ʎ',z:'z',A:'∀',B:'𐐒',C:'Ɔ',D:'ᗡ',E:'Ǝ',F:'Ⅎ',G:'⅁',H:'H',I:'I',J:'ſ',K:'ʞ',L:'˥',M:'W',N:'N',O:'O',P:'Ԁ',Q:'Ò',R:'ᴚ',S:'S',T:'⊥',U:'∩',V:'Λ',W:'M',X:'X',Y:'⅄',Z:'Z' }[c] || c)),
  (t) => t.split(' ').map(w => w.split('').join('̇') + '̇').join(' '),
  (t) => `『 ${t} 』`,
  (t) => `▁ ▂ ▄ ▅ ▆ ▇ █\n${t}\n█ ▇ ▆ ▅ ▄ ▂ ▁`,
];

function typewriter(t) {
  const lines = [];
  for (let i = 1; i <= t.length; i++) lines.push(t.slice(0, i));
  return lines.join('\n');
}

function countdownText(label, whenMs) {
  const ms = whenMs - Date.now();
  if (ms <= 0) return `${label}: IT'S TIME. 🎉`;
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `⏳ ${label}\n${d}d ${h}h ${m}m remaining`;
}

module.exports = {
  name: 'statussuite',
  aliases: ['ssuite', 'studio'],
  description: '📱 Status Studio — styled, fancy, typewriter, countdown statuses',
  async execute(sock, msg, args, commands, reply) {
    if (!isOwner(msg)) return reply('📱 _The studio belongs to one._');
    const sub = (args[0] || '').toLowerCase();

    const menu = () => reply(
      '📱 *STATUS STUDIO*\n\n' +
      '• `.statussuite text <style> <msg>`\n   styles: ' + Object.keys(STYLES).slice(0, 8).join(' • ') + '\n' +
      '• `.statussuite fancy <1-8> <msg>`\n' +
      '• `.statussuite typewriter <msg>`\n' +
      '• `.statussuite countdown <label> <when>`\n   e.g. `.statussuite countdown Launch 3d`\n' +
      '• `.setstatus <text>` — the classic (reply to media to post media)\n\n' +
      '_Posts to her status. Delete anytime from the app._'
    );

    if (!sub) return menu();

    const rest = args.slice(1).join(' ').trim();

    // ─── styled text ───
    if (sub === 'text') {
      const style = (args[1] || '').toLowerCase();
      const text = args.slice(2).join(' ').trim();
      if (!STYLES[style] || !text) {
        return reply(`📱 Styles: ${Object.keys(STYLES).join(' • ')}\n\n_.statussuite text fire CELESTIA never sleeps_`);
      }
      const styled = STYLES[style](text);
      return postStatus(sock, msg, reply, styled);
    }

    // ─── fancy ───
    if (sub === 'fancy') {
      const n = parseInt(args[1], 10);
      const text = args.slice(2).join(' ').trim();
      if (!(n >= 1 && n <= 8) || !text) {
        return reply('📱 `.statussuite fancy <1-8> <msg>` — 8 font styles');
      }
      return postStatus(sock, msg, reply, FANCY_MAPS[n - 1](text));
    }

    // ─── typewriter ───
    if (sub === 'typewriter') {
      if (!rest) return reply('📱 `.statussuite typewriter hello world`');
      if (rest.length > 30) return reply('📱 Keep it under 30 chars — typewriter multiplies length.');
      return postStatus(sock, msg, reply, typewriter(rest));
    }

    // ─── countdown ───
    if (sub === 'countdown') {
      const label = args[1];
      const when = require('../utils/timekeeper').parseWhen(args.slice(2).join(' '));
      if (!label || !when) return reply('📱 `.statussuite countdown Launch 3d`');
      return postStatus(sock, msg, reply, countdownText(label, when.ts));
    }

    return menu();
  },
};

async function postStatus(sock, msg, reply, text) {
  try {
    const { jidNormalizedUser } = require('@whiskeysockets/baileys');
    const selfJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
    if (!selfJid) throw new Error('not connected');

    await sock.sendMessage('status@broadcast', { text });
    return reply(`📱 *Posted to status:*\n\n${text.slice(0, 300)}`);
  } catch (e) {
    return reply(`📱 Status failed: ${e.message}`);
  }
}
