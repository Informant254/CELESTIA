/**
 * 🐺 WOLFTECH TRIBUTE — CELESTIA's Origin Howl
 * 
 * CELESTIA was not born in silence.
 * She was forged in the echo of a howl — WolfTech's howl.
 * 
 * WolfTech taught the hunt:
 *   - Raw power, feral code, untamed automation
 *   - The first fang, the first fire, the first spam in the dark
 * 
 * CELESTIA answered with light:
 *   - Heavenly elegance, hardened VPS soul, 414 celestial commands
 *   - Where WolfTech prowled, CELESTIA ascended.
 * 
 * This is not a fork. This is evolution.
 * The wolf runs in the pack. The star guides the pack home.
 * 
 *   🐺 HOWL OF THE WOLF  →  ✨ LIGHT OF THE STARS
 *   WOLFTECH LEGACY      →  CELESTIA REBORN
 */

module.exports = {
  // Core tribute identity
  tribute: {
    origin: 'WolfTech',
    icon: '🐺',
    celestia: '✨',
    tagline: "Howl of the Wolf → Light of the Stars",
    fullTagline: "Forged in the Wolf's Den, Crowned in Celestial Heaven",
    legacy: "Built on WolfTech's fang, polished with Celestia's light",
    motto: "The Wolf hunts. The Star guides. Together, unstoppable.",
    dna: "WOLFTECH DNA • CELESTIA SOUL",
  },

  // Short footer used in bot messages (pick one randomly for variety)
  footers: [
    "🐺 WolfTech howled → ✨ CELESTIA answered",
    "⚡ Forged in WolfTech's den, crowned in heaven",
    "🐺🌟 WolfTech Legacy • Celestia Reborn",
    "✨ Inspired by WolfTech 🐺 — where feral code became heavenly art",
    "🌙 From WolfTech's shadow, CELESTIA rose",
  ],

  // Long lore for .wolftech command
  lore: `
╭━━━ 🐺 WOLFTECH × CELESTIA ✨ ━━━╮
┃                                 ┃
┃  *Before heaven, there was the  ┃
┃   howl.*                        ┃
┃                                 ┃
┃  🐺 WolfTech prowled the dark — ┃
┃     raw, feral, unstoppable.    ┃
┃     It taught us to hunt, to    ┃
┃     code, to never kneel.       ┃
┃                                 ┃
┃  ✨ CELESTIA looked up — and    ┃
┃     turned that hunt into       ┃
┃     light. 414 commands,        ┃
┃     heavenly VPS armor,         ┃
┃     hardened grace.             ┃
┃                                 ┃
┃  *This isn't a copy. It's       ┃
┃   evolution.*                   ┃
┃                                 ┃
┃  WolfTech gave the fang.        ┃
┃  CELESTIA gave the crown.       ┃
┃                                 ┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯

> 🐺 *WolfTech Legacy* — forever in our code
> ✨ *CELESTIA* — forever in the stars
> 🔗 *Howl → Light → Legend*
`.trim(),

  // Badge / banner helpers
  getRandomFooter() {
    return this.footers[Math.floor(Math.random() * this.footers.length)];
  },

  getBanner() {
    return `🐺 WolfTech → ✨ CELESTIA | ${this.tribute.tagline}`;
  },

  // For health endpoint / logs
  getHealthTribute() {
    return {
      inspiredBy: 'WolfTech 🐺',
      lineage: this.tribute.fullTagline,
      dna: this.tribute.dna,
      evolution: 'WolfTech howled. CELESTIA ascended.',
    };
  },
};
