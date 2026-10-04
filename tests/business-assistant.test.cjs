const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createAssistant,
  customerLabel,
  loadProfile,
  parseServices,
  resolveCustomer,
  validBookingDate,
} = require('../business/assistant');

function memoryRepository() {
  let bookings = [];
  return {
    list: () => bookings.map((booking) => ({ ...booking })),
    add: (booking) => { bookings.push({ ...booking }); return { ...booking }; },
    updateStatus: (id, status, updatedAt) => {
      const booking = bookings.find((item) => item.id === id);
      if (!booking) return null;
      Object.assign(booking, { status, updatedAt });
      return { ...booking };
    },
  };
}

function fakeSock(sent) {
  return {
    sendMessage: async (jid, content) => {
      sent.push({ jid, content });
      return { key: { id: `m${sent.length}` } };
    },
  };
}

function message(id = 'customer@s.whatsapp.net') {
  return { key: { remoteJid: id, fromMe: false, id: 'incoming' } };
}

test('business profile parses tenant configuration and rejects broken services', () => {
  const profile = loadProfile({
    BUSINESS_ASSISTANT_ENABLED: 'true',
    BUSINESS_NAME: 'Amina Cuts',
    BUSINESS_SERVICES_JSON: '[{"name":"Braids","price":1200,"durationMinutes":90}]',
    BUSINESS_BOOKING_SLOTS: '08:30,invalid,14:00',
  });
  assert.equal(profile.enabled, true);
  assert.deepEqual(profile.services, [{ name: 'Braids', price: 1200, durationMinutes: 90 }]);
  assert.deepEqual(profile.slots, ['08:30', '14:00']);
  assert.equal(parseServices('{broken')[0].name, 'Haircut');
});

test('booking dates are real, current, and at most 90 days ahead', () => {
  const now = new Date('2026-10-04T12:00:00Z');
  assert.equal(validBookingDate('2026-10-04', now, 'Africa/Nairobi'), true);
  assert.equal(validBookingDate('2026-12-31', now, 'Africa/Nairobi'), true);
  assert.equal(validBookingDate('2027-02-01', now, 'Africa/Nairobi'), false);
  assert.equal(validBookingDate('2026-02-30', now, 'Africa/Nairobi'), false);
});

test('customer completes a deterministic appointment flow', async () => {
  const sent = [];
  const repository = memoryRepository();
  const assistant = createAssistant({
    profile: loadProfile({
      BUSINESS_ASSISTANT_ENABLED: 'true',
      BUSINESS_NAME: 'Amina Cuts',
      BUSINESS_SERVICES_JSON: '[{"name":"Braids","price":1200,"durationMinutes":90}]',
      BUSINESS_BOOKING_SLOTS: '09:00,14:00',
      TIMEZONE: 'Africa/Nairobi',
    }),
    repository,
    now: () => new Date('2026-10-04T12:00:00Z'),
    randomBytes: () => Buffer.from('123456789012', 'hex'),
    ownerNumber: '254700000001',
  });
  const sock = fakeSock(sent);
  const msg = message();

  for (const text of ['2', '1', '2026-10-05', '2', 'Nia', 'yes']) {
    assert.equal(await assistant.handleIncoming(sock, msg, text), true);
  }

  const bookings = assistant.getBookings();
  assert.equal(bookings.length, 1);
  assert.equal(bookings[0].customerName, 'Nia');
  assert.equal(bookings[0].service, 'Braids');
  assert.equal(bookings[0].time, '14:00');
  assert.match(sent.at(-1).content.text, /New appointment/);
  assert.ok(sent.some((entry) => /Appointment confirmed/.test(entry.content.text)));
});

test('a confirmed slot cannot be booked twice and can be cancelled', async () => {
  const repository = memoryRepository();
  const options = {
    profile: loadProfile({
      BUSINESS_ASSISTANT_ENABLED: 'true',
      BUSINESS_SERVICES_JSON: '[{"name":"Haircut","price":500,"durationMinutes":90}]',
      BUSINESS_BOOKING_SLOTS: '09:00,10:00',
      TIMEZONE: 'Africa/Nairobi',
    }),
    repository,
    now: () => new Date('2026-10-04T12:00:00Z'),
    ownerNumber: '',
  };
  const first = createAssistant(options);
  const second = createAssistant(options);
  const sent = [];
  const sock = fakeSock(sent);
  const firstMsg = message('first@s.whatsapp.net');
  const secondMsg = message('second@s.whatsapp.net');

  for (const text of ['2', '1', '2026-10-05', '1', 'Nia', 'yes']) {
    await first.handleIncoming(sock, firstMsg, text);
  }
  for (const text of ['2', '1', '2026-10-05', '2']) {
    await second.handleIncoming(sock, secondMsg, text);
  }
  assert.equal(second.getBookings().length, 1);
  assert.match(sent.at(-1).content.text, /just booked/);

  const booking = first.getBookings()[0];
  assert.equal(first.updateBookingStatus(booking.id, 'cancelled').status, 'cancelled');
  assert.equal(first.getBookings()[0].status, 'cancelled');
});

test('human handoff silences automation until the customer requests the menu', async () => {
  const sent = [];
  const assistant = createAssistant({
    profile: loadProfile({ BUSINESS_ASSISTANT_ENABLED: 'true' }),
    repository: memoryRepository(),
    ownerNumber: '254700000001',
    now: () => new Date('2026-10-04T12:00:00Z'),
  });
  const sock = fakeSock(sent);
  const msg = message();

  await assistant.handleIncoming(sock, msg, '4');
  const afterHandoff = sent.length;
  await assistant.handleIncoming(sock, msg, 'I need help choosing a style');
  assert.equal(sent.length, afterHandoff, 'assistant stays silent during handoff');
  await assistant.handleIncoming(sock, msg, 'menu');
  assert.match(sent.at(-1).content.text, /Services and prices/);
});

test('owner notices prefer the real number and stay honest on LID-only chats', () => {
  const withPn = resolveCustomer({ key: { remoteJid: '12345@lid', remoteJidAlt: '254712345678@s.whatsapp.net', fromMe: false } });
  assert.equal(withPn.phoneDigits, '254712345678');
  assert.match(customerLabel(withPn), /wa\.me\/254712345678/);

  const lidOnly = resolveCustomer({ key: { remoteJid: '12345@lid', fromMe: false } });
  assert.equal(lidOnly.phoneDigits, null);
  assert.match(customerLabel(lidOnly), /hidden number/);
});

test('disabled assistant and group chats are left untouched', async () => {
  const assistant = createAssistant({
    profile: loadProfile({ BUSINESS_ASSISTANT_ENABLED: 'false' }),
    repository: memoryRepository(),
  });
  assert.equal(await assistant.handleIncoming(fakeSock([]), message(), 'hello'), false);

  const enabled = createAssistant({
    profile: loadProfile({ BUSINESS_ASSISTANT_ENABLED: 'true' }),
    repository: memoryRepository(),
  });
  assert.equal(await enabled.handleIncoming(fakeSock([]), message('group@g.us'), 'hello'), false);
});
