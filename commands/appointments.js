const { isOwner } = require('../utils/isOwner');
const business = require('../business/assistant');

module.exports = {
  name: 'appointments',
  aliases: ['bookings'],
  description: 'Lists recent business appointments (owner only).',
  hidden: true,
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(jid, { text: 'This command is only available to the business owner.' }, { quoted: msg });
      return;
    }
    if (!jid.endsWith('@s.whatsapp.net') && !jid.endsWith('@lid')) {
      await sock.sendMessage(jid, { text: 'For customer privacy, use this command in a private chat.' }, { quoted: msg });
      return;
    }

    if (String(args[0] || '').toLowerCase() === 'cancel') {
      const reference = String(args[1] || '').trim().toUpperCase();
      if (!reference) {
        await sock.sendMessage(jid, { text: 'Usage: .appointments cancel <reference>' }, { quoted: msg });
        return;
      }
      let booking;
      try {
        booking = business.updateBookingStatus(reference, 'cancelled');
      } catch {
        await sock.sendMessage(jid, { text: 'The appointment could not be updated right now. Please try again.' }, { quoted: msg });
        return;
      }
      let customerNotified = false;
      if (booking?.customerJid) {
        customerNotified = await sock.sendMessage(booking.customerJid, {
          text: `Your appointment ${booking.id} for ${booking.date} at ${booking.time} has been cancelled. Reply MENU to make another booking.`,
        }).then(() => true).catch(() => false);
      }
      await sock.sendMessage(jid, {
        text: booking
          ? `Appointment ${booking.id} has been cancelled.${customerNotified ? ' The customer was notified.' : ' Customer notification could not be delivered.'}`
          : `No appointment found with reference ${reference}.`,
      }, { quoted: msg });
      return;
    }

    const today = business.dateInTimezone(new Date(), business.getProfile().timezone);
    const bookings = business.getBookings()
      .filter((booking) => booking?.status === 'confirmed' && booking.date >= today)
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
      .slice(0, 20);

    if (!bookings.length) {
      await sock.sendMessage(jid, { text: 'No confirmed appointments yet.' }, { quoted: msg });
      return;
    }

    const rows = bookings.map((booking) =>
      `*${booking.date} ${booking.time}*\n${booking.customerName} - ${booking.service}\n${booking.id}`
    );
    await sock.sendMessage(jid, {
      text: `*Upcoming appointments*\n\n${rows.join('\n\n')}\n\nCancel: .appointments cancel <reference>`,
    }, { quoted: msg });
  },
};
