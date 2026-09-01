const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';

function buildMap(offsetUpper, offsetLower, offsetDigit, exceptions = {}) {
  const map = {};
  if (offsetUpper !== null) {
    for (let i = 0; i < 26; i++) {
      const ch = UPPER[i];
      map[ch] = exceptions[ch] || String.fromCodePoint(offsetUpper + i);
    }
  }
  if (offsetLower !== null) {
    for (let i = 0; i < 26; i++) {
      const ch = LOWER[i];
      map[ch] = exceptions[ch] || String.fromCodePoint(offsetLower + i);
    }
  }
  if (offsetDigit !== null) {
    for (let i = 0; i < 10; i++) {
      const ch = DIGITS[i];
      map[ch] = String.fromCodePoint(offsetDigit + i);
    }
  }
  return map;
}

function applyMap(word, map) {
  return [...word].map((ch) => map[ch] || ch).join('');
}

const UPSIDE_DOWN_MAP = {
  a:'ɐ',b:'q',c:'ɔ',d:'p',e:'ǝ',f:'ɟ',g:'ƃ',h:'ɥ',i:'ᴉ',j:'ɾ',k:'ʞ',l:'l',m:'ɯ',n:'u',o:'o',p:'d',q:'b',r:'ɹ',s:'s',t:'ʇ',u:'n',v:'ʌ',w:'ʍ',x:'x',y:'ʎ',z:'z',
  A:'∀',B:'B',C:'Ɔ',D:'D',E:'Ǝ',F:'Ⅎ',G:'פ',H:'H',I:'I',J:'ſ',K:'K',L:'˥',M:'W',N:'N',O:'O',P:'Ԁ',Q:'Q',R:'R',S:'S',T:'⊥',U:'∩',V:'Λ',W:'M',X:'X',Y:'⅄',Z:'Z',
  '0':'0','1':'Ɩ','2':'ᄅ','3':'Ɛ','4':'ㄣ','5':'ϛ','6':'9','7':'ㄥ','8':'8','9':'6'
};

const SMALLCAPS_MAP = {
  a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ꜰ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',s:'s',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ'
};

const STRIKE = '\u0336';
const UNDERLINE = '\u0332';
const DOTTED = '\u0307';

function combining(word, mark) {
  return [...word].map((ch) => ch + mark).join('');
}

const styles = [
  {name:'Bold',fn:w=>applyMap(w,buildMap(0x1D400,0x1D41A,0x1D7CE))},
  {name:'Italic',fn:w=>applyMap(w,buildMap(0x1D434,0x1D44E,null,{h:'ℎ'}))},
  {name:'Bold Italic',fn:w=>applyMap(w,buildMap(0x1D468,0x1D482,null))},
  {name:'Script',fn:w=>applyMap(w,buildMap(0x1D49C,0x1D4B6,null,{B:'ℬ',E:'ℰ',F:'ℱ',H:'ℋ',I:'ℐ',L:'ℒ',M:'ℳ',R:'ℛ',e:'ℯ',g:'ℊ',o:'ℴ'}))},
  {name:'Bold Script',fn:w=>applyMap(w,buildMap(0x1D4D0,0x1D4EA,null))},
  {name:'Fraktur',fn:w=>applyMap(w,buildMap(0x1D504,0x1D51E,null,{C:'ℭ',H:'ℌ',I:'ℑ',R:'ℜ',Z:'ℨ'}))},
  {name:'Bold Fraktur',fn:w=>applyMap(w,buildMap(0x1D56C,0x1D586,null))},
  {name:'Double-Struck',fn:w=>applyMap(w,buildMap(0x1D538,0x1D552,0x1D7D8,{C:'ℂ',H:'ℍ',N:'ℕ',P:'ℙ',Q:'ℚ',R:'ℝ',Z:'ℤ'}))},
  {name:'Sans-Serif',fn:w=>applyMap(w,buildMap(0x1D5A0,0x1D5BA,0x1D7E2))},
  {name:'Sans Bold',fn:w=>applyMap(w,buildMap(0x1D5D4,0x1D5EE,0x1D7EC))},
  {name:'Sans Italic',fn:w=>applyMap(w,buildMap(0x1D608,0x1D622,null))},
  {name:'Sans Bold Italic',fn:w=>applyMap(w,buildMap(0x1D63C,0x1D656,null))},
  {name:'Monospace',fn:w=>applyMap(w,buildMap(0x1D670,0x1D68A,0x1D7F6))},
  {name:'Circled',fn:w=>applyMap(w,buildMap(0x24B6,0x24D0,0x2460))},
  {name:'Circled (Filled)',fn:w=>applyMap(w,buildMap(0x1F150,0x24D0,null))},
  {name:'Squared',fn:w=>applyMap(w,buildMap(0x1F130,0x1F130,null))},
  {name:'Fullwidth',fn:w=>applyMap(w,buildMap(0xFF21,0xFF41,0xFF10))},
  {name:'Small Caps',fn:w=>applyMap(w,SMALLCAPS_MAP)},
  {name:'Upside Down',fn:w=>[...applyMap(w,UPSIDE_DOWN_MAP)].reverse().join('')},
  {name:'Strikethrough',fn:w=>combining(w,STRIKE)},
  {name:'Underline',fn:w=>combining(w,UNDERLINE)},
  {name:'Dotted',fn:w=>combining(w,DOTTED)},
  {name:'Star Wrap',fn:w=>`★彡 ${w} 彡★`},
  {name:'Sparkle Wrap',fn:w=>`✦ ${w} ✦`},
  {name:'Corner Brackets',fn:w=>`『${w}』`},
  {name:'Lenticular Brackets',fn:w=>`【${w}】`},
  {name:'Wave Wrap',fn:w=>`〜${w}〜`},
  {name:'Arrow Wrap',fn:w=>`»${w}«`},
  {name:'Double Arrow',fn:w=>`➤${w}➤`},
  {name:'Underline Bars',fn:w=>`▁▂▃${w}▃▂▁`},
  {name:'Flower Wrap',fn:w=>`❀${w}❀`},
  {name:'Crown Wrap',fn:w=>`♛${w}♛`},
  {name:'Diamond Wrap',fn:w=>`◈${w}◈`},
  {name:'Fire Wrap',fn:w=>`🔥${w}🔥`},
  {name:'Skull Wrap',fn:w=>`💀${w}💀`},
  {name:'Lightning Wrap',fn:w=>`⚡${w}⚡`},
  {name:'Dot Spaced',fn:w=>[...w].join('·')},
  {name:'Bullet Spaced',fn:w=>[...w].join('•')},
  {name:'Vaporwave',fn:w=>applyMap(w,buildMap(0xFF21,0xFF41,0xFF10))+' 　'},
  {name:'Boxed Letters',fn:w=>`[${[...w].join('][')}]`},
  {name:'Spaced Caps',fn:w=>w.toUpperCase().split('').join(' ')},

  // 42–91: additional styles
  {name:'Parentheses',fn:w=>`(${w})`},
  {name:'Double Parentheses',fn:w=>`(( ${w} ))`},
  {name:'Angle Brackets',fn:w=>`〈${w}〉`},
  {name:'Double Angle',fn:w=>`《${w}》`},
  {name:'Japanese Brackets',fn:w=>`「${w}」`},
  {name:'Double Japanese',fn:w=>`『${w}』`},
  {name:'White Brackets',fn:w=>`〘${w}〙`},
  {name:'Black Brackets',fn:w=>`【${w}】`},
  {name:'Heavy Brackets',fn:w=>`⟦${w}⟧`},
  {name:'Mathematical Brackets',fn:w=>`⦃${w}⦄`},
  {name:'Slash Wrap',fn:w=>`// ${w} //`},
  {name:'Backslash Wrap',fn:w=>`\\\\ ${w} \\\\`},
  {name:'Vertical Bars',fn:w=>`│ ${w} │`},
  {name:'Double Bars',fn:w=>`║ ${w} ║`},
  {name:'Heavy Bars',fn:w=>`┃ ${w} ┃`},
  {name:'Dots Wrap',fn:w=>`••• ${w} •••`},
  {name:'Diamond Dots',fn:w=>`⋄ ${w} ⋄`},
  {name:'Black Diamonds',fn:w=>`◆ ${w} ◆`},
  {name:'White Diamonds',fn:w=>`◇ ${w} ◇`},
  {name:'Black Squares',fn:w=>`■ ${w} ■`},
  {name:'White Squares',fn:w=>`□ ${w} □`},
  {name:'Black Circles',fn:w=>`● ${w} ●`},
  {name:'White Circles',fn:w=>`○ ${w} ○`},
  {name:'Bullseye',fn:w=>`◉ ${w} ◉`},
  {name:'Target',fn:w=>`◎ ${w} ◎`},
  {name:'Triangles',fn:w=>`▲ ${w} ▲`},
  {name:'White Triangles',fn:w=>`△ ${w} △`},
  {name:'Stars',fn:w=>`★ ${w} ★`},
  {name:'White Stars',fn:w=>`☆ ${w} ☆`},
  {name:'Four Point Stars',fn:w=>`✦ ${w} ✦`},
  {name:'Sparkles',fn:w=>`✨ ${w} ✨`},
  {name:'Hearts',fn:w=>`♥ ${w} ♥`},
  {name:'White Hearts',fn:w=>`♡ ${w} ♡`},
  {name:'Music Notes',fn:w=>`♪ ${w} ♪`},
  {name:'Double Music',fn:w=>`♫ ${w} ♫`},
  {name:'Check Wrap',fn:w=>`✓ ${w} ✓`},
  {name:'Cross Wrap',fn:w=>`✗ ${w} ✗`},
  {name:'Plus Wrap',fn:w=>`✚ ${w} ✚`},
  {name:'Hash Wrap',fn:w=>`# ${w} #`},
  {name:'At Wrap',fn:w=>`@ ${w} @`},
  {name:'Dollar Wrap',fn:w=>`$ ${w} $`},
  {name:'Percent Wrap',fn:w=>`% ${w} %`},
  {name:'Ampersand Wrap',fn:w=>`& ${w} &`},
  {name:'Tilde Wrap',fn:w=>`~ ${w} ~`},
  {name:'Equal Wrap',fn:w=>`= ${w} =`},
  {name:'Colon Wrap',fn:w=>`:: ${w} ::`},
  {name:'Triple Dot Wrap',fn:w=>`... ${w} ...`},
  {name:'Pipe Spaced',fn:w=>[...w].join(' | ')},
  {name:'Colon Spaced',fn:w=>[...w].join(' : ')},
  {name:'Dash Spaced',fn:w=>[...w].join(' - ')},
  {name:'Slash Spaced',fn:w=>[...w].join(' / ')},
  {name:'Star Spaced',fn:w=>[...w].join(' ★ ')},
  {name:'Heart Spaced',fn:w=>[...w].join(' ♥ ')},
  {name:'Diamond Spaced',fn:w=>[...w].join(' ◆ ')},
  {name:'Circle Spaced',fn:w=>[...w].join(' ● ')},
  {name:'Arrow Spaced',fn:w=>[...w].join(' ➜ ')},
  {name:'Lightning Spaced',fn:w=>[...w].join(' ⚡ ')},
  {name:'Fire Spaced',fn:w=>[...w].join(' 🔥 ')},
  {name:'Skull Spaced',fn:w=>[...w].join(' 💀 ')},
  {name:'Crown Spaced',fn:w=>[...w].join(' ♛ ')},
  {name:'Flower Spaced',fn:w=>[...w].join(' ❀ ')},
  {name:'Sparkle Spaced',fn:w=>[...w].join(' ✦ ')},
  {name:'Wave Spaced',fn:w=>[...w].join(' 〜 ')},
  {name:'Bracket Spaced',fn:w=>[...w].join(' 『 ')},
  {name:'Heavy Dot Spaced',fn:w=>[...w].join(' • ')},
  {name:'Double Dot Spaced',fn:w=>[...w].join(' ⋅ ')},
  {name:'Underscore Spaced',fn:w=>[...w].join('_')},
  {name:'Equals Spaced',fn:w=>[...w].join('=')}
];

module.exports = {
  name: 'fancy',
  description: 'Generate fancy text styles. Usage: .fancy (list styles) | .fancy <number> <word>',
  async execute(sock,msg,args) {
    const jid = msg.key.remoteJid;
    const DEFAULT_WORD = 'CELESTIA';

    if (args.length === 0) {
      const list = styles.map((s,i)=>`${i+1}. ${s.fn(DEFAULT_WORD)}`).join('\n');
      return await sock.sendMessage(jid,{text:`🎨 *Fancy Text Styles* (${styles.length})\n\n${list}\n\n_Usage: .fancy <number> <word>_\n_Example: .fancy 7 CELESTIA_`},{quoted:msg});
    }

    const num = parseInt(args[0],10);

    if (isNaN(num)) {
      return await sock.sendMessage(jid,{text:`❌ Please provide a style number too.\n_Example: .fancy 7 ${args.join(' ')}_\n\nRun *.fancy* alone to see all ${styles.length} styles.`},{quoted:msg});
    }

    if (num < 1 || num > styles.length) {
      return await sock.sendMessage(jid,{text:`❌ Invalid style number. Choose between 1 and ${styles.length}.`},{quoted:msg});
    }

    const word = args.slice(1).join(' ').trim() || DEFAULT_WORD;
    const style = styles[num - 1];

    await sock.sendMessage(jid,{text:style.fn(word)},{quoted:msg});
  }
};
