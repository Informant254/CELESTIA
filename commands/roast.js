/**
 * .roast — the Wolf's Fire 🔥
 *
 * Second-person roasts: the @mention renders their profile name,
 * and the roast addresses them directly as "you" — like a real roast.
 * NO numbers ever displayed. NO canned lines.
 *
 *   .roast (reply)        → burns the replied-to person
 *   .roast @user           → burns them
 *   .roast me              → she roasts YOU
 *   .roast me savage       → no mercy mode
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════
// THE FIRE ENGINE — pieces, never whole lines
// Every angle is written in SECOND PERSON ("you")
// so it works for any target without names.
// 30 setups × 45 burns × 25 spikes × savage layer = millions
//
// FULLY EDITABLE: drop your own lines into data/roast/*.json
// (setups.json, burns.json, spikes.json, savage.json) and they
// REPLACE the defaults below. No code edits ever needed.
// ═══════════════════════════════════════════

const ROAST_DIR = path.join(__dirname, '..', 'data', 'roast');

function loadCustom(name, fallback) {
  try {
    const p = path.join(ROAST_DIR, name);
    if (fs.existsSync(p)) {
      const arr = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (Array.isArray(arr) && arr.length) return arr.map(String);
    }
  } catch { /* corrupt file -> defaults */ }
  return fallback;
}

const SETUPS = loadCustom('setups.json', [
  "Alright, listen up.", "Let's be honest for a second.", "Fun fact:",
  "I've been holding this in all day, but", "The committee has voted, and",
  "Doctors are baffled, but", "Nobody wanted to say it, so I will:",
  "In the timeline where you peaked,", "Fun fact about you:",
  "I ran a full diagnostic, and the results are in:", "Legend says",
  "Take a seat, because", "So a little birdie told me",
  "The mirror called. It said", "I've seen printers with more personality, and",
  "Somewhere out there, a village is missing its", "Statistically speaking,",
  "Not to be dramatic, but", "Breaking news:", "History will record that",
  "The wifi router itself has decided", "They tried to warn me, but",
  "In the grand tournament of life,", "I'm not saying you're lost, but",
  "After careful scientific review,", "Fun fact:", "Fun fact:",
  "The group chat held a meeting about you, and", "A wise man once saw you and whispered:",
  "Fun fact:", "Somewhere, your potential filed a missing persons report, because",
]);

const BURNS = loadCustom('burns.json', [
  "you type like the keyboard owes you an apology and you're not leaving until you get one",
  "you treat 'tomorrow' like a legally binding contract that you break every single day",
  "your glow-up has been in beta testing since primary school and the developers have clearly given up",
  "you'd lose a chess match against a rocking chair — and the chair wouldn't even need the first move",
  "your selfies have to pass a two-week internal review before your own conscience approves them",
  "you peaked during your own introduction and it's been a group project of disappointments ever since",
  "your sleep schedule is modern art — nobody understands it and everyone's deeply disturbed",
  "even autocorrect saw one of your messages and quietly uninstalled itself",
  "you demand respect the way a printer demands paper — loudly, at the worst possible moment, for no reason",
  "your last seen says 'online' but honestly nobody has ever confirmed your existence",
  "your '5 more minutes' has compound interest by now — you owe the clock a whole day",
  "you're the human version of a '404: item not found' page, except less helpful and louder",
  "your shower thoughts probably need a helmet and adult supervision",
  "you've mastered the art of looking busy while doing absolutely nothing — honestly, respect",
  "your sense of direction once got lost in a straight corridor with one exit",
  "even your shadow asks for a second opinion before following you anywhere",
  "your confidence deserves its own documentary, purely as a mystery case",
  "your jokes need a translator, a lawyer, and a moment of silence — in that order",
  "your life goals still show a loading spinner, and the wifi isn't even the problem",
  "you've got 'main character energy' in a story nobody asked to read",
  "your personality is like free wifi — everybody connects but nobody respects it",
  "you talk big for someone whose biggest achievement today was waking up",
  "your 'about me' should just say 'works in mysterious ways, mostly from bed'",
  "even your excuses have excuses at this point, and none of them are good",
  "you'd forget your own name if it wasn't printed on your regrets",
  "your potential and you are in a long-distance relationship, and it's fading",
  "you bring 'vibes' the way a mosquito brings a party — technically present, universally unwanted",
  "your mirror probably has a support group by now",
  "you move through life like a pop-up ad — nobody wants you, everyone closes you, you keep coming back",
  "if effort were a currency you'd be in severe national debt",
  "you've been 'about to make it' for so long that making it has filed a restraining order",
  "your glow-up has been postponed so many times it's now a myth",
  "you're the reason this group needs a moderator AND a therapist",
  "even your battery percentage lives a more charged life than you",
  "your opinion walks in like it paid rent — it did not",
  "you were the 'we have food at home' of your friend group's plans",
  "your energy is a 3% notification that somehow never fully dies, just inconveniences everyone",
  "you've got the audacity of a pigeon and the direction of one too",
  "your comebacks need a cough drop, a nap, and a lawyer",
  "you're proof that confidence and competence don't have to know each other",
  "your last good idea is still waiting to be born, and it's been decades",
  "you're the group project member nobody assigned but everybody suffers",
  "even GPS says 'you have arrived' and then apologizes",
  "you have main character syndrome in a story that's mostly filler episodes",
  "your reputation arrives 20 minutes before you do, and it's already made excuses",
]);

const SPIKES = loadCustom('spikes.json', [
  "Anyway. Hydrate. Something has to help. 💧",
  "The burns are free. The therapy afterwards isn't. 🚑",
  "Roast complete. Ego: successfully recalibrated. ⚙️",
  "And THAT was the polite version. Imagine savage mode. 💀",
  "Somewhere a mirror just filed a complaint. 🪞",
  "That one came straight from the constellation. ✨",
  "She rates that comeback-free response a solid 0/10. 🎯",
  "The wolfpack is taking notes. They agree. 🐺",
  "Burn delivered. Signature not required. 📦",
  "Moral damage: calculated. Fun: hers. 🔥",
  "And the crowd goes mild. 👏",
  "Drink water. Rehydrate from that. 💧",
  "That was a light warm-up. Don't test her. 🔥",
  "No refunds on roasts. All sales final. 🧾",
  "Somewhere, your shadow just sighed. 🌑",
  "Even the keyboard needs a moment of silence. ⌨️",
  "This message will self-destruct your confidence. 💥",
  "Roses are red, violets are blue, that roast was deserved, and deep down you knew. 🌹",
  "Anyway, back to being the most beautiful bot. 💅",
  "Fun's over. Somebody check on them. 🚑",
  "Wolfpack rule: you get roasted, you take it standing. 🐺",
  "She's not mean — she's accurate at high speed. 🎯",
  "Consider that a free personality assessment. 📋",
  "Certified wolf-grade roast. ⚡",
  "And the stars looked down and said 'yeah, fair.' ✨",
]);

const SAVAGE_LAYER = loadCustom('savage.json', [
  "And I'm not done: your ancestors are watching and honestly they're just tired.",
  "Real talk: your backup plan needs a backup plan, and both need therapy.",
  "Extra spicy: even your shadow left you on read, and it's literally attached to you.",
  "Bonus round: the wifi router blocked you by MAC address. The router. Blocked you.",
  "One more: you're not the GOAT, you're the 'Greatest Of All Time-wasters'.",
  "Free of charge: your life is a 'how it started vs how it's going' meme, except it's the same picture, and it's mid.",
  "Lucky you: doctors recommend 8 glasses of water and zero more of whatever you're doing.",
  "And another thing: your future called — it wants better security questions.",
]);

function pick(arr, seed, offset = 0n) {
  return arr[Number((seed >> offset) % BigInt(arr.length))];
}

function generateEngine(savage) {
  const seed = crypto.randomBytes(8).readBigUInt64BE(0);
  const burn = pick(BURNS, seed, 13n);
  const spike = pick(SPIKES, seed, 29n);
  const savageExtra = savage ? ' ' + pick(SAVAGE_LAYER, seed, 43n) : '';

  // vary the delivery pattern so it never feels templated
  const pattern = seed % 4n;
  if (pattern === 0n) {
    return `Listen. ${cap(burn)} — and everybody here knows it.${savageExtra}\n\n${spike}`;
  }
  if (pattern === 1n) {
    return `Fun fact: ${burn}.${savageExtra}\n\n${spike}`;
  }
  if (pattern === 2n) {
    return `No shade, no lemonade, just truth: ${burn}.${savageExtra}\n\n${spike}`;
  }
  return `They say never start a sentence with "you", but: ${burn}.${savageExtra}\n\n${spike}`;
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ═══════════════════════════════════════════
// AI ROAST — primary path (second-person, no names/numbers passed)
// ═══════════════════════════════════════════

async function generateAI(savage, selfRoast, extraContext) {
  const prompt = `Write ONE brutal but hilarious roast for WhatsApp. Address the target directly as "you" (second person). Never mention phone numbers, names, or handles — pure "you" roasting.

${selfRoast ? 'CONTEXT: The person asked to be roasted themselves. Make it sting but with hidden affection, like a best friend who has receipts.' : 'CONTEXT: Roasting someone in a group chat. Make the whole group laugh AT them.'}
${extraContext ? `Known facts about the target (use 1-2, don't force): ${extraContext}` : 'No extra intel — universal comedy.'}

RULES:
- 2-4 sentences MAX. Punchy. Every sentence must land a hit.
- WhatsApp group-chat energy. Witty. Specific. Unpredictable angles.
- Funny comparisons > generic insults. "You're the human version of..." style.
- NO slurs, NO protected traits (race/religion/disability/gender/appearance-shaming), no threats. Pure comedy only.
${savage ? '- SAVAGE MODE: absolute maximum burn within the rules. Devastating.' : '- Standard: sharp but they should still laugh at themselves.'}
- End with one short mic-drop line or emoji zinger (max 2 emojis total).
- Write ONLY the roast text. No quotation marks, no preamble.`;

  // Gemini
  try {
    const key = process.env.GEMINI_API_KEY;
    if (key) {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await model.generateContent(prompt);
      const text = result.response?.text?.();
      if (text && text.trim()) return text.trim().slice(0, 600);
    }
  } catch { /* fall */ }

  // OpenAI
  try {
    const key = process.env.OPENAI_API_KEY;
    if (key) {
      const { default: OpenAI } = require('openai');
      const oa = new OpenAI({ apiKey: key });
      const res = await oa.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are the funniest roast comedian alive. Your roasts go viral because they are specific, creative, and land hard — never generic. You never punch down at protected traits; you punch at personality, habits, and absurdity.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 250,
        temperature: 1.1,
      });
      const text = res.choices?.[0]?.message?.content?.trim();
      if (text) return text.slice(0, 600);
    }
  } catch { /* fall */ }

  return null;
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════

module.exports = {
  name: 'roast',
  aliases: ['burn', 'wolffire'],
  description: '🔥 The Wolf\'s Fire — roasts so fresh they\'re still warm. Reply/tag/.roast me',
  execute: async (sock, msg, args, commands, reply) => {
    const jid = msg.key.remoteJidAlt || msg.key.remoteJid;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const savage = args.some(a => a.toLowerCase() === 'savage' || a.toLowerCase() === 'max');
    const selfRoast = (args[0] || '').toLowerCase() === 'me';

    // ─── resolve target (JID only — names/numbers NEVER displayed) ───
    let targetJid = null;
    if (selfRoast) {
      targetJid = ctx?.participant || msg.key.remoteJidAlt || msg.key.remoteJid;
    } else {
      const mentioned = ctx?.mentionedJid?.[0];
      if (mentioned) targetJid = mentioned;
      else if (ctx?.participant) targetJid = ctx.participant;
      else if (args.length && /^\+?\d{8,15}$/.test(args[0].replace(/\D/g, ''))) {
        targetJid = args[0].replace(/\D/g, '') + '@s.whatsapp.net';
      }
    }

    if (!targetJid) {
      return reply(
        '🔥 *The Wolf\'s Fire*\n\n' +
        'Reply to someone\'s message with *.roast* — she burns them\n' +
        '• *.roast @user*\n' +
        '• *.roast me* — she roasts YOU\n' +
        '• add *savage* for no mercy\n\n' +
        '_Every burn is generated fresh — AI first, a million-combination engine behind it._'
      );
    }

    // gather comedy context (their pushName from quoted msg — for AI flavor, never displayed raw)
    let extraContext = null;
    try {
      const quotedName = ctx?.quotedMsg?.pushName;
      const senderName = selfRoast ? (msg.pushName || null) : quotedName;
      if (senderName && senderName.length < 30 && !/^\d+$/.test(senderName)) {
        extraContext = `Their display name is "${senderName}" (you may playfully riff on the name ONCE, or ignore it).`;
      }
    } catch { /* none */ }

    // ─── generate: AI first, engine fallback ───
    const thinking = await reply(selfRoast ? '🔥 *Oh, you asked for it...*' : '🔥 *The wolf cracks its knuckles...*');
    let roast;
    let via;
    try {
      const ai = await generateAI(savage, selfRoast, extraContext);
      if (ai) { roast = ai; via = 'AI-forged 🔥'; }
    } catch { /* fall */ }
    if (!roast) {
      roast = generateEngine(savage);
      via = 'engine-forged ⚡';
    }

    // ─── deliver: mention renders their real name — zero digits shown ───
    const header = selfRoast
      ? `🔥 *A special order: the wolf roasts the chef.*`
      : `🔥 *The Wolf has chosen its target:*`;

    await sock.sendMessage(jid, {
      text: `${header}\n\n@${String(targetJid).split('@')[0]} — ${roast}\n\n_${via}${savage ? ' • SAVAGE MODE 💀' : ''}_`,
      mentions: [targetJid],
    }, { quoted: msg }).catch(async () => {
      await reply(`${header}\n\n${roast}\n\n_${via}_`);
    });
  },
};
