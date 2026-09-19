/**
 * .autochat — CELESTIA answers DMs as you.
 *
 *   .autochat on|off            → master switch (in a group: also opts it in)
 *   .autochat mode dm|all       → DMs only, or every group too
 *   .autochat group on|off      → opt THIS group in/out (send inside it)
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
const { MODE_KEY, isGroupAllowed, setGroupAllowed, groupList } = require('../autochat/index');

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
      settingsStore.set(MODE_KEY, settingsStore.get(MODE_KEY, 'off') === 'off' ? 'dm' : settingsStore.get(MODE_KEY));
      let extra = '';
      if (jid.endsWith('@g.us')) {
        setGroupAllowed(jid, true);
        extra = '\n✅ This group is opted in — she answers here now.';
      }
      if (!backend.hasKey()) {
        return reply(`🤖 *Autochat ON.*${extra}\n\n⚠️ No AI key yet — \`.autochat setkey <Gemini-key>\` or set GEMINI_API_KEY, then she can speak.`);
      }
      return reply(`🤖 *Autochat ON.*${extra}\nShe answers your DMs as you.`);
    }
    if (sub === 'off') {
      settingsStore.set(MODE_KEY, 'off');
      return reply('🤖 Autochat *OFF* everywhere — you have the phone back.');
    }
    if (sub === 'group') {
      if (!jid.endsWith('@g.us')) return reply('🤖 Send that inside the group: `.autochat group on|off`');
      const v = (args[1] || '').toLowerCase();
      if (v === 'on' || v === 'off') {
        setGroupAllowed(jid, v === 'on');
        return reply(v === 'on'
          ? '🤖 ✅ She answers *this group* now — but only when someone replies to her or tags her.'
          : '🤖 She went quiet in *this group* (DMs unaffected).');
      }
      return reply(`🤖 This group: *${isGroupAllowed(jid) ? 'ON' : 'OFF'}*.\nUsage: \`.autochat group on|off\``);
    }
    if (sub === 'mode') {
      const v = (args[1] || '').toLowerCase();
      if (v === 'dm' || v === 'all') {
        settingsStore.set(MODE_KEY, v);
        return reply(`🤖 Mode: *${v === 'all' ? 'DMs + groups' : 'DMs only'}*.`);
      }
      return reply('🤖 Usage: `.autochat mode dm|all`');
    }
    if (sub === 'local') {
      const v = (args[1] || '').toLowerCase();
      if (v === 'on' || v === 'off') {
        settingsStore.set('local_model', v === 'on');
        return reply(v === 'on'
          ? '🤖 On-server model *ENABLED* — downloads ~800MB on first use, then she thinks locally.'
          : '🤖 On-server model *OFF* — cloud providers only.');
      }
      const st = require('../autochat/local').status();
      return reply(`🤖 Local model: *${st.enabled ? 'ON' : 'OFF'}* · ${st.model}\nDownloaded: ${st.downloaded ? 'yes' : 'not yet'} · Loaded: ${st.loaded ? 'yes' : 'no'}\nUsage: \`.autochat local on|off\``);
    }
    if (sub === 'vibe') {
      const v = (args[1] || '').toLowerCase();
      if (v === 'savage' || v === 'chill') {
        settingsStore.set('autochat_vibe', v);
        return reply(v === 'savage'
          ? '🤖 Vibe: *SAVAGE* — feral teenager energy. Watch your mouth around grandma.'
          : '🤖 Vibe: *CHILL* — relaxed human texting.');
      }
      return reply('🤖 Usage: `.autochat vibe savage|chill`');
    }
    if (sub === 'learn') {
      // Rebuild from raw text — args splitting eats newlines, and bulk
      // learning needs one sample per line.
      const pfx = settingsStore.get('prefix', '.') || '.';
      const full = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      const esc = pfx.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const blob = full.replace(new RegExp(`^${esc}\\s*(autochat|ac|impersonate)\\s+learn\\s*`, 'i'), '').trim();
      if (!blob) return reply('🤖 Paste lines in your voice after it — one per line, as many as you want.');
      const added = voice.learn(blob);
      return reply(added ? `🤖 Banked ${added} line${added === 1 ? '' : 's'} (${voice.count()} samples). She sounds a little more like you now.` : '🤖 Nothing new — she already knows those lines.');
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
      const which = (args[1] || '').toLowerCase();
      // .autochat setkey apix <key> | openrouter | openai | <gemini-key>
      if (which === 'apix') {
        const key = (args[2] || '').trim();
        if (!key || key.length < 5) return reply('🤖 Usage: `.autochat setkey apix <key>`');
        settingsStore.set('apix_key', key);
        return reply('🤖 Apix key stored — unlimited brain first in line.');
      }
      if (which === 'openrouter' || which === 'or') {
        const key = (args[2] || '').trim();
        if (!key || key.length < 10) return reply('🤖 Usage: `.autochat setkey openrouter <key>`');
        settingsStore.set('openrouter_key', key);
        return reply('🤖 OpenRouter key stored — free models first, Gemini as backup.');
      }
      if (which === 'openai') {
        const key = (args[2] || '').trim();
        if (!key || key.length < 10) return reply('🤖 Usage: `.autochat setkey openai <key>`');
        settingsStore.set('openai_key', key);
        return reply('🤖 OpenAI key stored.');
      }
      const key = (args[1] || '').trim();
      if (!key || key.length < 10) return reply('🤖 Usage: `.autochat setkey <Gemini-key>` or `.autochat setkey openrouter <key>`');
      settingsStore.set('gemini_key', key);
      return reply('🤖 Key stored. She has her voice now — `.autochat on` when ready.');
    }
    if (sub === 'model') {
      const name = (args[1] || '').trim();
      if (!name) {
        return reply(`🤖 OpenAI model: *${backend.openaiModel()}*\nUsage: \`.autochat model gpt-4o\` (or \`default\` to reset).`);
      }
      if (/^default$/i.test(name)) {
        settingsStore.set('openai_model', null);
        return reply(`🤖 OpenAI model reset to default (*${backend.openaiModel()}*).`);
      }
      if (!/^[A-Za-z0-9._-]{1,64}$/.test(name)) return reply('🤖 Usage: `.autochat model gpt-4o` (letters, numbers, dots, dashes).');
      settingsStore.set('openai_model', name);
      return reply(`🤖 OpenAI model set to *${name}* — used when the OpenAI fallback answers.`);
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
      `  🎭 *Vibe* : ${(settingsStore.get('autochat_vibe', 'savage') || 'savage').toUpperCase()}`,
      `  👥 *Groups* : ${groupList().length} opted in`,
      `  🧠 *AI keys* : Apix ${backend.apixKey() ? 'SET' : '—'} · OR ${backend.openrouterKey() ? 'SET' : '—'} · Gemini ${backend.geminiKey() ? 'SET' : '—'} · OpenAI ${backend.openaiKey() ? `SET (${backend.openaiModel()})` : '—'}`,
      `  🏠 *Local* : ${require('../autochat/local').status().enabled ? 'ON' : 'OFF'}`,
      `  🎙️ *Voice* : ${voice.count()} samples`,
      '└──────────────────────────────┘',
      '',
      '_.autochat on|off · mode dm|all · group on|off · learn · style · forget · setkey · test_ (send `on`/`group on` inside a group to opt it in)_',
    ];
    return reply(L.join('\n'));
  },
};
