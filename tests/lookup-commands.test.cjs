const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function load(relative, mocks = {}, fetchImpl) {
  const filename = path.resolve(__dirname, relative);
  const native = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, require: id => Object.hasOwn(mocks, id) ? mocks[id] : native(id),
    process: { env: {} }, fetch: fetchImpl, Buffer, URL, URLSearchParams,
    encodeURIComponent, Intl, AbortSignal, AbortController, setTimeout, clearTimeout,
  }, { filename });
  return module.exports;
}

function jpegLike() { return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]); }

function sockMock(sent) {
  return { sendMessage: async (jid, content) => { sent.push(content); return { key: 'progress' }; } };
}

function queueMock() {
  return {
    '../utils/downloader': { downloadBuffer: async () => jpegLike(), detectMediaType: () => 'image' },
    '../download/config': { DOWNLOAD_TIMEOUT_MS: 5000, MAX_VIDEO_BYTES: 1024 },
    '../download/queue': { run: async fn => fn() },
  };
}

function asCommand(module, name) {
  const list = Array.isArray(module) ? module : [module];
  const found = list.find(entry => entry.name === name);
  assert.ok(found, `${name} command should be registered`);
  return found;
}

test('anime and manga are separate commands sharing one lookup engine', async () => {
  const urls = [];
  const anime = load('../commands/anime.js', queueMock(), async url => {
    urls.push(String(url));
    return { ok: true, json: async () => ({ data: [{
      title: 'Frieren', score: 9.3, type: 'TV', year: 2023, status: 'Currently Airing', episodes: 28,
      genres: [{ name: 'Fantasy' }, { name: 'Adventure' }], synopsis: 'An elf mage begins a journey.  ',
      images: { jpg: { large_image_url: 'https://cdn/frieren.jpg' } },
    }] }) };
  });
  const animeCmd = asCommand(anime, 'anime');
  const mangaCmd = asCommand(anime, 'manga');
  const sent = [];
  await animeCmd.execute(sockMock(sent), { key: { remoteJid: 'chat' } }, ['Frieren']);
  const image = sent.find(m => m.image);
  assert.ok(image);
  assert.match(image.caption, /📺 \*Frieren\*/);
  assert.match(image.caption, /9\.3 · TV · 2023/);
  assert.match(image.caption, /28 episodes/);
  const sent2 = [];
  await mangaCmd.execute(sockMock(sent2), { key: { remoteJid: 'chat' } }, ['Berserk']);
  assert.ok(urls.some(url => url.includes('/v4/manga?q=')), 'manga hits the manga endpoint');
  const mangaImage = sent2.find(m => m.image);
  assert.ok(mangaImage, 'manga card is sent as an image');
  assert.match(mangaImage.caption, /📚 \*Frieren\*/);
});

test('anime reports a miss politely', async () => {
  const anime = load('../commands/anime.js', queueMock(), async () => ({ ok: true, json: async () => ({ data: [] }) }));
  const sent = [];
  await asCommand(anime, 'anime').execute(sockMock(sent), { key: { remoteJid: 'chat' } }, ['zzzz']);
  assert.match(sent.find(m => m.text?.includes('Nothing found'))?.text || '', /Nothing found/);
});

test('pokedex builds the stat card and prefers the official artwork', async () => {
  const data = {
    id: 94, name: 'gengar', height: 15, weight: 405,
    types: [{ type: { name: 'ghost' } }, { type: { name: 'poison' } }],
    abilities: [{ ability: { name: 'cursed-body' }, is_hidden: false }, { ability: { name: 'shadow-tag' }, is_hidden: true }],
    stats: [
      { base_stat: 60, stat: { name: 'hp' } },
      { base_stat: 65, stat: { name: 'attack' } },
      { base_stat: 130, stat: { name: 'special-attack' } },
    ],
    sprites: { front_default: 'https://cdn/sprite.png', other: { 'official-artwork': { front_default: 'https://cdn/art.png' } } },
  };
  const pokedex = load('../commands/pokedex.js', queueMock(), async () => ({ ok: true, json: async () => data }));
  const card = pokedex.cardFor(data);
  assert.equal(card.title, '#94');
  assert.equal(card.artwork, 'https://cdn/art.png', 'official artwork wins over the tiny sprite');
  const sent = [];
  await pokedex.execute(sockMock(sent), { key: { remoteJid: 'chat' } }, ['gengar']);
  const image = sent.find(m => m.image);
  assert.ok(image);
  assert.match(image.caption, /Gengar/);
  assert.match(image.caption, /ghost/);
  assert.match(image.caption, /\+shadow-tag hidden/);
  assert.match(image.caption, /SpA \[█+·*] 130/);
});

test('pokedex rejects unknown species', async () => {
  const pokedex = load('../commands/pokedex.js', queueMock(), async () => ({ status: 404, ok: false }));
  const sent = [];
  await pokedex.execute(sockMock(sent), { key: { remoteJid: 'chat' } }, ['missingno']);
  assert.match(sent.find(m => m.text?.includes('No Pokémon'))?.text || '', /No Pokémon/);
});

test('country prefers the exact match and renders the flag with facts', async () => {
  const dataset = [
    { name: { common: 'North Korea', official: 'Democratic People\'s Republic of Korea' }, cca2: 'KP',
      capital: ['Pyongyang'], population: 25000000, region: 'Asia', area: 120538,
      currencies: { KPW: { name: 'North Korean won', symbol: '₩' } }, languages: { kor: 'Korean' }, flag: '🇰🇵' },
    { name: { common: 'Kenya', official: 'Republic of Kenya' }, cca2: 'KE',
      capital: ['Nairobi'], population: 53000000, region: 'Africa', subregion: 'Eastern Africa', area: 580367,
      currencies: { KES: { name: 'Kenyan shilling', symbol: 'Sh' } }, languages: { eng: 'English', swa: 'Swahili' }, flag: '🇰🇪' },
  ];
  const urls = [];
  const country = load('../commands/country.js', queueMock(), async url => {
    urls.push(String(url));
    if (String(url).includes('jsdelivr.net')) return { ok: true, json: async () => dataset };
    return { status: 200, ok: true, data: jpegLike(), headers: {} };
  });
  // downloadBuffer is mocked in queueMock, so the flag fetch never happens; assert via the card instead.
  const card = country.cardFor(dataset[1]);
  assert.equal(card.flag, 'https://flagcdn.com/w1280/ke.png');
  assert.match(card.caption, /Republic of Kenya/);
  assert.match(card.caption, /53,000,000/);
  assert.match(card.caption, /Kenyan shilling Sh/);
  assert.match(card.caption, /English, Swahili/);
  assert.match(card.caption, /580,367 km²/);
  assert.equal(country.cardFor(dataset[0]).flag, 'https://flagcdn.com/w1280/kp.png');
  const sent = [];
  await country.execute(sockMock(sent), { key: { remoteJid: 'chat' } }, ['kenya']);
  const image = sent.find(m => m.image);
  assert.ok(image, 'the flag is sent as an image');
  assert.match(image.caption, /Republic of Kenya/);
  const sent2 = [];
  await country.execute(sockMock(sent2), { key: { remoteJid: 'chat' } }, ['north']);
  assert.match(sent2.find(m => m.image)?.caption || '', /North Korea/, 'partial names still resolve');
  assert.ok(urls.every(url => !url.includes('restcountries.com')), 'the deprecated restcountries API is never used');
});

test('country rejects unknown names', async () => {
  const dataset = [{ name: { common: 'Kenya', official: 'Republic of Kenya' }, cca2: 'KE',
    capital: ['Nairobi'], population: 53000000, region: 'Africa', area: 580367,
    currencies: {}, languages: {}, flag: '🇰🇪' }];
  const country = load('../commands/country.js', queueMock(), async () => ({ ok: true, json: async () => dataset }));
  const sent = [];
  await country.execute(sockMock(sent), { key: { remoteJid: 'chat' } }, ['atlantis']);
  assert.match(sent.find(m => m.text?.includes('No country'))?.text || '', /No country found/);
});

test('today parses dates, validates them, and picks a spread of events', async () => {
  const today = load('../commands/today.js');
  assert.deepEqual([...Object.values(today.parseDate('11-16'))], [11, 16]);
  assert.deepEqual([...Object.values(today.parseDate('6/21'))], [6, 21]);
  assert.ok(today.parseDate('13-1'), 'the parser only checks the shape');
  assert.equal(today.validateMonthDay(13, 5), null, 'the validator rejects bad months');
  assert.equal(today.validateMonthDay(2, 32), null);
  assert.ok(today.validateMonthDay(12, 31));
  const events = [1, 2, 3, 4, 5, 6, 7].map(year => ({ year, text: `event ${year}` }));
  const picked = today.pickEvents(events, 3);
  assert.deepEqual([...picked.map(event => event.year)], [1, 3, 5], 'three events spread evenly across the list');
  assert.equal(today.pickEvents([], 3).length, 0);
  const lines = today.formatEntries(picked);
  assert.match(lines[0], /^• 1 — event 1$/);
});

test('today sends the history card and handles misses', async () => {
  const today = load('../commands/today.js', {}, async url => {
    assert.match(String(url), /onthisday\/events\/11\/16$/);
    return { ok: true, json: async () => ({ events: [
      { year: 1532, text: 'Francisco Pizarro  ' },
      { year: 1938, text: 'Something notable happened' },
    ] }) };
  });
  const sent = [];
  await today.execute(sockMock(sent), { key: { remoteJid: 'chat' } }, ['11-16']);
  const card = sent.find(m => m.text?.includes('On this day'));
  assert.ok(card);
  assert.match(card.text, /1532 — Francisco Pizarro/);
  assert.match(card.text, /November 16/);
  assert.match(card.text, /via CELESTIA/);

  const sent2 = [];
  const invalid = today.execute(sockMock(sent2), { key: { remoteJid: 'chat' } }, ['99-99']);
  await invalid;
  assert.match(sent2.at(-1).text, /not valid|month-day/i);
});
