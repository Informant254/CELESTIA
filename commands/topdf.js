const fs = require('fs');
const os = require('os');
const path = require('path');
const PDFDocument = require('pdfkit');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

module.exports = {
  name: 'topdf',
  aliases: ['pdf', 'makepdf', 'img2pdf', 'text2pdf'],
  description: 'Convert a quoted image or text to a PDF file. Usage: .topdf <text>, or reply to an image with .topdf',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || '';
    const inputText = args.join(' ').trim() || quotedText;
    const imageMessage = quoted?.imageMessage || null;

    if (!imageMessage && !inputText) {
      return sock.sendMessage(jid, {
        text: '📄 *Usage:*\n• Reply to an image: *.topdf*\n• Convert text: *.topdf Your text here*'
      }, { quoted: msg });
    }

    const pdfPath = path.join(os.tmpdir(), `pdf_${Date.now()}.pdf`);

    try {
      await sock.sendMessage(jid, { text: '⏳ Creating PDF...' }, { quoted: msg });

      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const ws = fs.createWriteStream(pdfPath);
      doc.pipe(ws);

      if (imageMessage) {
        const buffer = await downloadMediaMessage(
          { message: quoted, key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant } },
          'buffer',
          {}
        );
        const pageW = doc.page.width - 80;
        const pageH = doc.page.height - 80;
        doc.image(buffer, 40, 40, { fit: [pageW, pageH], align: 'center', valign: 'center' });
      } else {
        doc.font('Helvetica').fontSize(12).text(inputText, { align: 'left', lineGap: 4 });
      }

      doc.end();
      await new Promise((resolve, reject) => {
        ws.on('finish', resolve);
        ws.on('error', reject);
      });

      await sock.sendMessage(jid, {
        document: fs.readFileSync(pdfPath),
        mimetype: 'application/pdf',
        fileName: `document_${Date.now()}.pdf`,
        caption: '✅ *PDF created successfully!*',
      }, { quoted: msg });

    } catch (err) {
      console.error('[TOPDF ERROR]', err.message);
      await sock.sendMessage(jid, { text: '❌ Failed to create PDF. Try again.' }, { quoted: msg });
    } finally {
      if (fs.existsSync(pdfPath)) { try { fs.unlinkSync(pdfPath); } catch (_) {} }
    }
  },
};

