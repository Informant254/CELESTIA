/**
 * commands/vcf.js
 * ------------------
 * Exports all group members as a downloadable .vcf contact file.
 * Usage: .vcf
 */
const { participantPhoneJid } = require('../utils/jidResolver');

module.exports = {
  name: 'vcf',
  description: 'Exports group members as a .vcf contact file.',
  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    if (!jid.endsWith('@g.us')) {
      return sock.sendMessage(jid, { text: '❌ This command only works in groups.' }, { quoted: msg });
    }

    const metadata = await sock.groupMetadata(jid);

    // A LID is not a phone number. Export only members whose real number is
    // resolvable; hidden-number members are skipped rather than faked.
    const vcfEntries = [];
    let skipped = 0;
    for (const p of metadata.participants) {
      const phoneJid = participantPhoneJid(p);
      if (!phoneJid) {
        skipped++;
        continue;
      }
      const number = phoneJid.split('@')[0];
      vcfEntries.push(`BEGIN:VCARD\nVERSION:3.0\nFN:Contact ${vcfEntries.length + 1}\nTEL;TYPE=CELL:+${number}\nEND:VCARD`);
    }

    const vcfContent = vcfEntries.join('\n');

    await sock.sendMessage(jid, {
      document: Buffer.from(vcfContent, 'utf8'),
      mimetype: 'text/vcard',
      fileName: `${metadata.subject.replace(/[^\w\s-]/g, '')}.vcf`,
      caption: `📇 ${vcfEntries.length} contacts exported.${skipped ? ` ${skipped} hidden number(s) skipped.` : ''}`,
    }, { quoted: msg });
  },
};
