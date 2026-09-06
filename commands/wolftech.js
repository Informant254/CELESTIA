const wolfTech = require('../utils/wolfTech');

module.exports = {
  name: 'wolftech',
  aliases: ['howl', 'wolf', 'wt', 'origin', 'lineage', 'inspired'],
  description: '🐺 WolfTech tribute — the origin howl behind CELESTIA',
  execute: async (sock, msg, args, commands, reply) => {
    // Sub-command: --lore or just default
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'dna' || sub === 'health') {
      const t = wolfTech.tribute;
      await reply(
        `🧬 *WOLFTECH DNA → CELESTIA SOUL*\n\n` +
        `🐺 *Origin:* ${t.origin}\n` +
        `✨ *Evolution:* CELESTIA\n` +
        `🌙 *Tagline:* _${t.tagline}_\n` +
        `👑 *Full:* _${t.fullTagline}_\n` +
        `⚡ *Motto:* _${t.motto}_\n` +
        `🧬 *Code:* _${t.dna}_\n\n` +
        `> *WolfTech gave the fang. Celestia gave the crown.*`
      );
      return;
    }

    if (sub === 'howl') {
      await reply(
        `*AAAAAAAAAAAAAAAAOOOOOOOOOOUUUUUUUUU* 🐺🌕✨\n\n` +
        `_That was WolfTech howling through CELESTIA's neon veins._\n` +
        `> _${wolfTech.getRandomFooter()}_\n\n` +
        `Type *.wolftech* for the full lore.`
      );
      return;
    }

    // Default: full lore
    await reply(wolfTech.lore);

    // Follow-up with interactive DNA card after 0.8s
    setTimeout(async () => {
      try {
        await reply(
          `╭─ 🐺 *LINEAGE CARD* ✨ ─╮\n` +
          `│ 🐺 WolfTech: The Hunt\n` +
          `│    └ feral • raw • unbreakable\n` +
          `│ ✨ CELESTIA: The Heaven\n` +
          `│    └ elegant • hardened • celestial\n` +
          `│ 🔗 Bridge: \`${wolfTech.tribute.tagline}\`\n` +
          `╰──────────────────────────╯\n\n` +
          `> _${wolfTech.tribute.legacy}_\n` +
          `> Tip: *.wolftech dna* • *.wolftech howl* • *.menu*`
        );
      } catch {}
    }, 800);
  },
};
