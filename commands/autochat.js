/**
 * .autochat — CELESTIA answers DMs as you.
 *
 *   .autochat on|off            → master switch
 *   .autochat mode dm|all       → DMs only, or groups too
 *   .autochat status            → mode, key, voice samples, memory
 *   .autochat learn <line>      → teach her a line in your voice
 *   .autochat style             → show what she's learned
 *   .autochat forget            → wipe voice samples
 *   .autochat setkey <key>      → store Gemini key (no .env edit needed)
 *   .autochat test <message>    → preview what she'd reply (not sent)
 */
const settingsStore = require('../utils/settingsStore');
const { isOwner } = require('../utils/isOwner');
const backend = require('../autochat/backend');
const memory = require('../autochat/memory');
const voice = require('../autochat/voice');
const persona = require('../autochat/persona');
const { MODE_KEY } = require('../autochat/index');

module.exports = {
  name: 'autochat',
  aliases: ['ac', 'impersonate'],
  description: '🤖 CELESTIA answers chats as you — see .autochat status',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const reply = (text) => sock.sendMessage(jid, { text }, { quoted: msg });
    if (!isOwner(msg)) return reply('🤖 _She only takes that order from one voice._');

    const sub = (args[0] || '').toLowerCase();
    const mode = settingsStore.get(MODE_KEY, 'off');

    if (sub === 'on') {
      settingsStore.set(MODE_KEY, 'dm');
      if (!backend.hasKey()) {
        return reply('🤖 *Autochat ON* (DMs).\n\n⚠️ No AI key yet — `.autochat setkey <Gemini-key>` or set GEMINI_API_KEY, then she can speak.');
      }
      return reply('🤖 *Autochat ON* — she now answers your DMs as you.\n`.autochat mode all` to include groups.');
    }
    if (sub === 'off') {
      settingsStore.set(MODE_KEY, 'off');
      return reply('🤖 Autochat *OFF* — you have the phone back.');
    }
    if (sub === 'mode') {
      const v = (args[1] || '').toLowerCase();
      if (v === 'dm' || v === 'all') {
        settingsStore.set(MODE_KEY, v);
        return reply(`🤖 Mode: *${v === 'all' ? 'DMs + groups' : 'DMs only'}*.`);
      }
      return reply('🤖 Usage: `.autochat mode dm|all`');
    }
    if (sub === 'learn') {
      const line = args.slice(1).join(' ').trim();
      if (!line) return reply('🤖 Usage: `.autochat learn <a line in your voice>`');
      voice.learn(line);
      return reply(`🤖 Learned (${voice.count()} samples). She sounds a little more like you now.`);
    }
    if (sub === 'style') {
      return reply(`🤖 *Your voice so far (${voice.count()} samples):*\n\n${voice.styleBlock()}`);
    }
    if (sub === 'forget') {
      voice.forget();
      memory.clear();
      return reply('🤖 Voice + short-term memory wiped. Clean slate.');
    }
    if (sub === 'setkey') {
      const key = (args[1] || '').trim();
      if (!key || key.length < 10) return reply('🤖 Usage: `.autochat setkey <Gemini-API-key>`');
      settingsStore.set('gemini_key', key);
      return reply('🤖 Key stored. She has her voice now — `.autochat on` when ready.');
    }
    if (sub === 'test') {
      const text = args.slice(1).join(' ').trim();
      if (!text) return reply('🤖 Usage: `.autochat test <message>`');
      if (!backend.hasKey()) return reply('🤖 No AI key — `.autochat setkey <key>` first.');
      const { system, user } = persona.build({ chatId: 'test', incoming: text, pushName: null, contactName: 'a friend' });
      const res = await backend.complete(system, user);
      if (!res) return reply('🤖 Backend silent — check the key.');
      return reply(`🤖 *Draft (not sent):*\n\n${res.text}`);
    }

    // status
    const L = [
      '┌──────────────────────────────┐',
      '  🤖 *CELESTIA AUTOCHAT*',
      '  ━━━━━━━━━━━━━━━━━━━━━━━',
      `  🔌 *Mode* : ${mode.toUpperCase()}`,
      `  🧠 *AI key* : ${backend.hasKey() ? 'SET' : 'MISSING'}`,
      `  🎙️ *Voice* : ${voice.count()} samples`,
      '└──────────────────────────────┘',
      '',
      '_.autochat on|off · mode dm|all · learn · style · forget · setkey · test_',
    ];
    return reply(L.join('\n'));
  },
};
