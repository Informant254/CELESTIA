module.exports = {
  name: 'define',
  description: 'Get the definition of a word. Usage: .define <word>',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const word = args.join(' ').trim();

    if (!word) {
      return sock.sendMessage(jid, { text: '❌ Usage: .define <word>' }, { quoted: msg });
    }

    await sock.sendMessage(jid, { text: `📖 Looking up "${word}"...` }, { quoted: msg });

    try {
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`);
      const data = await response.json();

      if (!data[0]) {
        return sock.sendMessage(jid, { text: `❌ "${word}" not found in dictionary.` }, { quoted: msg });
      }

      const entry = data[0];
      const meanings = entry.meanings[0];

      let out = `📖 *${entry.word.toUpperCase()}*\n\n`;
      out += `🔤 *Part of Speech:* ${meanings.partOfSpeech}\n\n`;
      out += `💡 *Definition:*\n`;
      meanings.definitions.slice(0, 2).forEach((def, i) => {
        out += `${i + 1}. ${def.definition}\n`;
      });

      if (meanings.synonyms?.length) {
        out += `\n🔗 *Synonyms:* ${meanings.synonyms.slice(0, 3).join(', ')}\n`;
      }

      if (entry.phonetic) {
        out += `\n🔊 *Pronunciation:* ${entry.phonetic}\n`;
      }

      await sock.sendMessage(jid, { text: out });
    } catch (e) {
      await sock.sendMessage(jid, { text: `❌ Error: ${e.message}` }, { quoted: msg });
    }
  }
};
