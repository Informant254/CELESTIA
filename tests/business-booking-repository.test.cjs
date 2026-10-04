const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createFileBookingRepository } = require('../business/bookingRepository');

test('booking repository durably adds and updates appointments', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'celestia-bookings-'));
  const file = path.join(directory, 'bookings.json');
  try {
    const first = createFileBookingRepository(file);
    first.add({
      id: 'BK-TEST-1', status: 'confirmed', date: '2099-01-02', time: '09:00',
      customerName: 'Nia', customerJid: 'customer@s.whatsapp.net',
    });

    const restarted = createFileBookingRepository(file);
    assert.equal(restarted.list().length, 1);
    assert.equal(restarted.list()[0].customerName, 'Nia');
    assert.equal(restarted.updateStatus('BK-TEST-1', 'cancelled', '2099-01-01T00:00:00.000Z').status, 'cancelled');

    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(saved[0].status, 'cancelled');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('failed persistence does not mutate repository memory', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'celestia-bookings-fail-'));
  const blockedParent = path.join(directory, 'not-a-directory');
  fs.writeFileSync(blockedParent, 'blocked');
  try {
    const repository = createFileBookingRepository(path.join(blockedParent, 'bookings.json'));
    assert.throws(() => repository.add({ id: 'BK-FAIL', date: '2099-01-02' }));
    assert.deepEqual(repository.list(), []);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
