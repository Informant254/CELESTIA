const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_FILE = path.join(__dirname, '../data/business-bookings.json');
const RETENTION_DAYS = 180;

function createFileBookingRepository(filePath = DEFAULT_FILE) {
  let bookings = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (Array.isArray(parsed)) bookings = parsed;
  } catch {}

  function persist(nextBookings) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(nextBookings, null, 2), { mode: 0o600 });
      fs.renameSync(temporary, filePath);
    } catch (error) {
      try { fs.rmSync(temporary, { force: true }); } catch {}
      throw error;
    }
  }

  function purge(now = new Date()) {
    const cutoff = new Date(now);
    cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
    const cutoffDate = cutoff.toISOString().slice(0, 10);
    const kept = bookings.filter((booking) => booking?.date >= cutoffDate).slice(-1000);
    if (kept.length !== bookings.length) {
      persist(kept);
      bookings = kept;
    }
  }

  function list() {
    purge();
    return bookings.map((booking) => ({ ...booking }));
  }

  function add(booking) {
    if (bookings.some((item) => item?.id === booking.id)) throw new Error('Booking reference collision');
    const next = [...bookings, { ...booking }].slice(-1000);
    persist(next);
    bookings = next;
    return { ...booking };
  }

  function updateStatus(id, status, updatedAt) {
    const index = bookings.findIndex((item) => item?.id === id);
    if (index === -1) return null;
    const updated = { ...bookings[index], status, updatedAt };
    const next = bookings.map((booking, itemIndex) => itemIndex === index ? updated : booking);
    persist(next);
    bookings = next;
    return { ...updated };
  }

  return { list, add, updateStatus };
}

module.exports = { DEFAULT_FILE, RETENTION_DAYS, createFileBookingRepository };
