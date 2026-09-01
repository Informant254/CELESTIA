/**
 * commands/vcf.js
 * ------------------
 * Exports all group members as a downloadable .vcf contact file.
 * Usage: .vcf
 */
module.exports = {
  name: 'vcf',
  description: 'Exports group members as a .vcf contact file.',
  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    if (!jid.endsWith('@g.us')) {
      return sock.sendMessage(jid, { text: '❌ This command only works in groups.' }, { quoted: msg });
    }

    const metadata = await sock.groupMetadata(jid);

    const vcfEntries = metadata.participants.map((p, i) => {
      const number = (p.phoneNumber || p.id).split('@')[0];
      return `BEGIN:VCARD\nVERSION:3.0\nFN:Contact ${i + 1}\nTEL;TYPE=CELL:+${number}\nEND:VCARD`;
    });

    const vcfContent = vcfEntries.join('\n');

    await sock.sendMessage(jid, {
      document: Buffer.from(vcfContent, 'utf8'),
      mimetype: 'text/vcard',
      fileName: `${metadata.subject.replace(/[^\w\s-]/g, '')}.vcf`,
      caption: `📇 ${metadata.participants.length} contacts exported.`,
    }, { quoted: msg });
  },
};
