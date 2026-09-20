const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const kit = require('../utils/stickerKit');
const packs = require('../commands/stickerpack')._internals.PACKS;

async function sample() {
  return sharp({ create: { width: 120, height: 80, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
}

test('Sticker Kit normalizes images to transparent 512px PNG', async () => {
  const output = await kit.normalize(await sample());
  const meta = await sharp(output).metadata();
  assert.equal(meta.width, 512);
  assert.equal(meta.height, 512);
  assert.equal(meta.hasAlpha, true);
});

test('Sticker Kit creates valid WhatsApp WebP under 1MB', async () => {
  const output = await kit.toSticker(await sample(), { pack: 'TEST', author: 'CELESTIA' });
  assert.equal(output.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(output.subarray(8, 12).toString('ascii'), 'WEBP');
  assert.ok(output.length <= kit.MAX_STICKER);
});

test('local packs are bounded and consistently themed', () => {
  assert.ok(Object.keys(packs).length >= 6);
  for (const pack of Object.values(packs)) {
    assert.equal(pack.words.length, 4);
    assert.equal(pack.colors.length, 2);
  }
});

test('empty and oversized sticker inputs are rejected', async () => {
  await assert.rejects(() => kit.normalize(Buffer.alloc(0)), /empty or invalid/);
  await assert.rejects(() => kit.normalize(Buffer.alloc(kit.MAX_INPUT + 1)), /20MB/);
});
