const { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType } = require('docx');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

module.exports = {
  name: 'toword',
  aliases: ['word', 'makedoc', 'todocx', 'img2word', 'text2word'],
  description: 'Convert a quoted image or text to a Word (.docx) file. Usage: .toword <text>, or reply to an image with .toword',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || '';
    const inputText = args.join(' ').trim() || quotedText;
    const imageMessage = quoted?.imageMessage || null;

    if (!imageMessage && !inputText) {
      return sock.sendMessage(jid, {
        text: '📝 *Usage:*\n• Reply to an image: *.toword*\n• Convert text: *.toword Your text here*'
      }, { quoted: msg });
    }

    try {
      await sock.sendMessage(jid, { text: '⏳ Creating Word document...' }, { quoted: msg });
      let children = [];

      if (imageMessage) {
        const buffer = await downloadMediaMessage(
          { message: quoted, key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant } },
          'buffer',
          {}
        );
        const type = (imageMessage.mimetype || '').includes('png') ? 'png' : 'jpg';
        children.push(
          new Paragraph({
            children: [new ImageRun({ data: buffer, transformation: { width: 500, height: 350 }, type })],
            alignment: AlignmentType.CENTER,
          })
        );
      } else {
        for (const line of inputText.split('\n')) {
          children.push(
            line.trim()
              ? new Paragraph({ children: [new TextRun({ text: line.trim(), size: 24, font: 'Calibri' })], spacing: { after: 120 } })
              : new Paragraph({})
          );
        }
      }

      const doc = new Document({ sections: [{ properties: {}, children }] });
      const docBuffer = await Packer.toBuffer(doc);

      await sock.sendMessage(jid, {
        document: docBuffer,
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileName: `document_${Date.now()}.docx`,
        caption: '✅ *Word document created successfully!*',
      }, { quoted: msg });

    } catch (err) {
      console.error('[TOWORD ERROR]', err.message);
      await sock.sendMessage(jid, { text: '❌ Failed to create Word document. Try again.' }, { quoted: msg });
    }
  },
};

