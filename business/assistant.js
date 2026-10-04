const crypto = require('node:crypto');
const config = require('../config/config');
const { createFileBookingRepository } = require('./bookingRepository');

const SESSION_TTL_MS = 15 * 60 * 1000;
const HANDOFF_TTL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_SERVICES = [
  { name: 'Haircut', price: 500, durationMinutes: 45 },
  { name: 'Beard trim', price: 300, durationMinutes: 30 },
  { name: 'Haircut + beard', price: 700, durationMinutes: 60 },
];

function clean(value, max = 200) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

function parseServices(raw) {
  if (!raw) return DEFAULT_SERVICES;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_SERVICES;
    const services = parsed.slice(0, 20).map((service) => ({
      name: clean(service?.name, 60),
      price: Number(service?.price),
      durationMinutes: Number(service?.durationMinutes) || 30,
    })).filter((service) =>
      service.name &&
      Number.isFinite(service.price) && service.price >= 0 &&
      Number.isInteger(service.durationMinutes) && service.durationMinutes > 0 && service.durationMinutes <= 480
    );
    return services.length ? services : DEFAULT_SERVICES;
  } catch {
    return DEFAULT_SERVICES;
  }
}

function loadProfile(env = process.env) {
  const slots = clean(env.BUSINESS_BOOKING_SLOTS, 300)
    .split(',')
    .map((slot) => slot.trim())
    .filter((slot) => /^([01]\d|2[0-3]):[0-5]\d$/.test(slot));

  const openDays = clean(env.BUSINESS_OPEN_DAYS || '1,2,3,4,5,6', 30)
    .split(',')
    .map(Number)
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);

  return {
    enabled: env.BUSINESS_ASSISTANT_ENABLED === 'true',
    name: clean(env.BUSINESS_NAME || env.BOT_NAME || 'CELESTIA Business', 80),
    currency: clean(env.BUSINESS_CURRENCY || 'KES', 8).toUpperCase(),
    hours: clean(env.BUSINESS_HOURS || 'Monday-Saturday, 8:00 AM-7:00 PM', 300),
    location: clean(env.BUSINESS_LOCATION || 'Ask our team for directions.', 300),
    contactText: clean(env.BUSINESS_CONTACT_TEXT || 'A team member has been notified and will reply here.', 300),
    timezone: clean(env.TIMEZONE || 'Africa/Nairobi', 80),
    services: parseServices(env.BUSINESS_SERVICES_JSON),
    slots: slots.length ? [...new Set(slots)] : ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00'],
    openDays: openDays.length ? [...new Set(openDays)] : [1, 2, 3, 4, 5, 6],
  };
}

function mainMenu(profile) {
  return (
    `*${profile.name}*\n` +
    `Welcome. How can we help?\n\n` +
    `1. Services and prices\n` +
    `2. Book an appointment\n` +
    `3. Hours and location\n` +
    `4. Talk to a person\n\n` +
    `Reply with a number.`
  );
}

function servicesMenu(profile, booking = false) {
  const rows = profile.services.map((service, index) => {
    const duration = service.durationMinutes ? ` - ${service.durationMinutes} min` : '';
    return `${index + 1}. ${service.name} - ${profile.currency} ${service.price}${duration}`;
  });
  return `${booking ? '*Choose a service*' : '*Services and prices*'}\n\n${rows.join('\n')}\n\n${booking ? 'Reply with a service number, or 0 to cancel.' : 'Reply 2 to book, or 0 for the main menu.'}`;
}

function dateInTimezone(now, timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function validBookingDate(value, now, timezone, openDays = [1, 2, 3, 4, 5, 6, 7]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return false;
  const today = dateInTimezone(now, timezone);
  const latest = new Date(`${today}T00:00:00Z`);
  latest.setUTCDate(latest.getUTCDate() + 90);
  const isoDay = parsed.getUTCDay() || 7;
  return value >= today && value <= latest.toISOString().slice(0, 10) && openDays.includes(isoDay);
}

function bookingId(now = new Date(), randomBytes = crypto.randomBytes) {
  const suffix = randomBytes(6).toString('hex').toUpperCase();
  return `BK-${now.toISOString().slice(0, 10).replaceAll('-', '')}-${suffix}`;
}

function digits(value) {
  return String(value || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

// WhatsApp privacy addressing: DMs increasingly arrive as xxx@lid with the
// real phone number hidden. Resolve the best reachable contact for display:
//  1. explicit PN fields Baileys still hydrates (remoteJidAlt / participantPn)
//  2. a plain @s.whatsapp.net remoteJid (old addressing)
//  3. the mirror LID<->PN map learned from live traffic
// Reply routing ALWAYS uses the original remoteJid; this is display only.
function resolveCustomer(msg) {
  const remoteJid = String(msg?.key?.remoteJid || '');
  const candidates = [
    msg?.key?.remoteJidAlt,
    msg?.key?.participantAlt,
    msg?.key?.participantPn,
    msg?.key?.participant,
  ];
  let phoneJid = null;
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.endsWith('@s.whatsapp.net')) {
      const d = digits(candidate);
      if (d.length >= 8 && d.length <= 15) { phoneJid = candidate; break; }
    }
  }
  if (!phoneJid && remoteJid.endsWith('@s.whatsapp.net')) phoneJid = remoteJid;
  if (!phoneJid) {
    try {
      const learned = require('../utils/mirror').idMap();
      const lidDigits = digits(remoteJid);
      const mapped = learned && learned[lidDigits];
      const mappedDigits = digits(mapped);
      if (mappedDigits.length >= 8 && mappedDigits.length <= 15) {
        phoneJid = `${mappedDigits}@s.whatsapp.net`;
      }
    } catch { /* mapping is best-effort only */ }
  }
  const lidJid = remoteJid.endsWith('@lid') ? remoteJid : null;
  return {
    replyJid: remoteJid,
    phoneJid,
    phoneDigits: phoneJid ? digits(phoneJid) : null,
    lidJid,
    lidDigits: lidJid ? digits(lidJid) : null,
  };
}

function customerLabel(contact) {
  if (contact.phoneDigits) return `+${contact.phoneDigits} https://wa.me/${contact.phoneDigits}`;
  if (contact.lidDigits) {
    return `hidden number (LID ${contact.lidDigits}) — ask the customer to share their number; tap their chat to reply`;
  }
  return 'unknown contact';
}

function minuteOfDay(time) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function localTimeInTimezone(now, timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.hour}:${value.minute}`;
  } catch {
    return now.toISOString().slice(11, 16);
  }
}

function createAssistant(options = {}) {
  const profile = options.profile || loadProfile();
  const repository = options.repository || createFileBookingRepository();
  const now = options.now || (() => new Date());
  const randomBytes = options.randomBytes || crypto.randomBytes;
  const ownerNumber = options.ownerNumber === undefined ? config.ownerNumber : options.ownerNumber;
  const sessions = new Map();

  const getBookings = () => repository.list();

  const updateBookingStatus = (id, status) => {
    return repository.updateStatus(id, status, now().toISOString());
  };

  const slotTaken = (date, time, durationMinutes) => {
    const start = minuteOfDay(time);
    const end = start + durationMinutes;
    return getBookings().some((booking) => {
      if (booking?.status !== 'confirmed' || booking.date !== date) return false;
      const bookedStart = minuteOfDay(booking.time);
      const bookedEnd = bookedStart + (Number(booking.durationMinutes) || 30);
      return start < bookedEnd && bookedStart < end;
    });
  };

  const sendOwnerNotice = async (sock, text) => {
    const owner = clean(ownerNumber, 30).replace(/\D/g, '');
    if (!owner) return;
    try {
      await sock.sendMessage(`${owner}@s.whatsapp.net`, { text });
      return true;
    } catch {
      return false;
    }
  };

  async function handleIncoming(sock, msg, incomingText) {
    if (!profile.enabled || msg?.key?.fromMe) return false;
    const jid = String(msg?.key?.remoteJid || '');
    if (!jid.endsWith('@s.whatsapp.net') && !jid.endsWith('@lid')) return false;
    const text = clean(incomingText, 500);
    if (!text) return false;

    const reply = (body) => sock.sendMessage(jid, { text: body }, { quoted: msg });
    const normalized = text.toLowerCase();
    let session = sessions.get(jid);

    if (session && now().getTime() - session.updatedAt > (session.step === 'handoff' ? HANDOFF_TTL_MS : SESSION_TTL_MS)) {
      sessions.delete(jid);
      session = null;
    }

    if (['menu', 'start', 'hi', 'hello', 'hey', '0'].includes(normalized)) {
      sessions.delete(jid);
      await reply(mainMenu(profile));
      return true;
    }

    if (session?.step === 'handoff') return true;

    if (!session) {
      if (['1', 'services', 'prices'].includes(normalized)) {
        await reply(servicesMenu(profile));
        return true;
      }
      if (['2', 'book', 'booking', 'appointment'].includes(normalized)) {
        sessions.set(jid, { step: 'service', updatedAt: now().getTime() });
        await reply(servicesMenu(profile, true));
        return true;
      }
      if (['3', 'hours', 'location'].includes(normalized)) {
        await reply(`*Hours*\n${profile.hours}\n\n*Location*\n${profile.location}\n\nReply 0 for the main menu.`);
        return true;
      }
      if (['4', 'human', 'agent', 'person'].includes(normalized)) {
        const contact = resolveCustomer(msg);
        const notified = await sendOwnerNotice(sock, `*Customer handoff requested*\nFrom: ${customerLabel(contact)}\nMessage: ${text}`);
        sessions.set(jid, { step: 'handoff', updatedAt: now().getTime() });
        await reply(`${notified ? profile.contactText : 'Your message is visible to our team and they can reply here.'}\n\nReply MENU to return to automated options.`);
        return true;
      }
      await reply(mainMenu(profile));
      return true;
    }

    if (session.step === 'service') {
      const index = /^\d+$/.test(text) ? Number(text) - 1 : -1;
      if (!Number.isInteger(index) || !profile.services[index]) {
        await reply(`Choose a service number from 1 to ${profile.services.length}, or reply 0 to cancel.`);
        return true;
      }
      session = { ...session, step: 'date', service: profile.services[index], updatedAt: now().getTime() };
      sessions.set(jid, session);
      await reply(`You chose *${session.service.name}*.\n\nSend the appointment date as YYYY-MM-DD, for example 2026-10-15.`);
      return true;
    }

    if (session.step === 'date') {
      if (!validBookingDate(text, now(), profile.timezone, profile.openDays)) {
        await reply('Send an open business date in YYYY-MM-DD format, from today up to 90 days ahead. Reply 0 to cancel.');
        return true;
      }
      session = { ...session, step: 'slot', date: text, updatedAt: now().getTime() };
      sessions.set(jid, session);
      await reply(`*Choose a time for ${text}*\n\n${profile.slots.map((slot, index) => `${index + 1}. ${slot}`).join('\n')}\n\nReply with a time number, or 0 to cancel.`);
      return true;
    }

    if (session.step === 'slot') {
      const index = /^\d+$/.test(text) ? Number(text) - 1 : -1;
      if (!Number.isInteger(index) || !profile.slots[index]) {
        await reply(`Choose a time number from 1 to ${profile.slots.length}, or reply 0 to cancel.`);
        return true;
      }
      const selectedTime = profile.slots[index];
      const current = now();
      if (session.date === dateInTimezone(current, profile.timezone) && selectedTime <= localTimeInTimezone(current, profile.timezone)) {
        await reply('That time has already passed. Please choose another time number, or reply 0 to cancel.');
        return true;
      }
      if (slotTaken(session.date, selectedTime, session.service.durationMinutes)) {
        await reply('That time was just booked. Please choose another time number, or reply 0 to cancel.');
        return true;
      }
      session = { ...session, step: 'name', time: selectedTime, updatedAt: now().getTime() };
      sessions.set(jid, session);
      await reply('What name should we put on the booking?');
      return true;
    }

    if (session.step === 'name') {
      const customerName = clean(text, 60);
      if (customerName.length < 2) {
        await reply('Please send a name with at least 2 characters.');
        return true;
      }
      session = { ...session, step: 'confirm', customerName, updatedAt: now().getTime() };
      sessions.set(jid, session);
      await reply(
        `*Confirm appointment*\n\n` +
        `Name: ${session.customerName}\n` +
        `Service: ${session.service.name}\n` +
        `Date: ${session.date}\n` +
        `Time: ${session.time}\n` +
        `Price: ${profile.currency} ${session.service.price}\n\n` +
        `Reply YES to confirm, or 0 to cancel.`
      );
      return true;
    }

    if (session.step === 'confirm') {
      if (!['yes', 'y', 'confirm'].includes(normalized)) {
        await reply('Reply YES to confirm this appointment, or 0 to cancel.');
        return true;
      }
      if (slotTaken(session.date, session.time, session.service.durationMinutes)) {
        sessions.delete(jid);
        await reply('That time is no longer available. Reply 2 to start a new booking.');
        return true;
      }
      const createdAt = now();
      const contact = resolveCustomer(msg);
      const booking = {
        id: bookingId(createdAt, randomBytes),
        customerJid: jid,
        customerPhone: contact.phoneDigits ? `+${contact.phoneDigits}` : null,
        customerPhoneLink: contact.phoneDigits ? `https://wa.me/${contact.phoneDigits}` : null,
        customerName: session.customerName,
        service: session.service.name,
        durationMinutes: session.service.durationMinutes,
        price: session.service.price,
        currency: profile.currency,
        date: session.date,
        time: session.time,
        status: 'confirmed',
        createdAt: createdAt.toISOString(),
      };
      try {
        repository.add(booking);
      } catch (error) {
        console.error(`[business-assistant] Could not persist booking: ${error.message}`);
        await reply('We could not save the appointment right now. Reply YES to retry, or 0 to cancel.');
        return true;
      }
      sessions.delete(jid);
      await reply(`*Appointment confirmed*\n\nReference: ${booking.id}\n${booking.service}\n${booking.date} at ${booking.time}\n\nKeep this reference. Reply 0 to return to the main menu.`);
      await sendOwnerNotice(sock,
        `*New appointment*\n\nReference: ${booking.id}\nCustomer: ${booking.customerName}\nWhatsApp: ${customerLabel(contact)}\nService: ${booking.service}\nDate: ${booking.date}\nTime: ${booking.time}\nPrice: ${booking.currency} ${booking.price}`
      );
      return true;
    }

    sessions.delete(jid);
    await reply(mainMenu(profile));
    return true;
  }

  return { profile, handleIncoming, getBookings, updateBookingStatus };
}

let singleton;
function instance() {
  if (!singleton) singleton = createAssistant();
  return singleton;
}

module.exports = {
  HANDOFF_TTL_MS,
  SESSION_TTL_MS,
  bookingId,
  createAssistant,
  customerLabel,
  dateInTimezone,
  loadProfile,
  localTimeInTimezone,
  mainMenu,
  parseServices,
  resolveCustomer,
  servicesMenu,
  validBookingDate,
  handleIncoming: (...args) => instance().handleIncoming(...args),
  getBookings: () => instance().getBookings(),
  getProfile: () => instance().profile,
  updateBookingStatus: (...args) => instance().updateBookingStatus(...args),
};
