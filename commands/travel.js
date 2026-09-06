/**
 * .travel — the Travel Kit ✈️
 *
 *   .travel pack <days> <trip>    → smart packing list (trip type auto-detected)
 *   .travel jetlag <from> <to>     → jet lag adaptation plan
 *   .travel trip <city> <days>     → one card: weather + jetlag + packing + map
 *
 * Trip types: beach, business, hiking, city, safari, cold
 */
const geo = require('../utils/geoLens');
const di = require('../utils/dayIntel');

const PACKS = {
  beach: { name: 'Beach 🏖️', items: ['swimwear ×2', 'sunscreen SPF50', 'sunglasses', 'flip-flops', 'light towel', 'hat', 'power bank', 'dry bag'] },
  business: { name: 'Business 💼', items: ['laptop + charger', 'documents/ID/passport', 'formal wear ×2', 'notebook + pen', 'business cards', 'phone charger', 'medicine kit', 'iron-safe shirt'] },
  hiking: { name: 'Hiking 🥾', items: ['broken-in boots', 'water bladder/bottles', 'layered clothing', 'rain shell', 'headlamp + spare', 'first-aid kit', 'map/offline GPS', 'high-energy snacks'] },
  city: { name: 'City 🏙️', items: ['comfortable walking shoes', 'daypack', 'power adapter', 'offline maps downloaded', 'money belt', 'reusable bottle', 'light jacket', 'earphones'] },
  safari: { name: 'Safari 🦁', items: ['neutral-color clothing', 'wide hat', 'binoculars', 'dust-proof camera bag', 'malaria prophylaxis (ask doctor)', 'closed shoes', 'lip balm + sunscreen', 'warm layer for dawn drives'] },
  cold: { name: 'Cold ❄️', items: ['thermal base layers', 'insulated jacket', 'gloves + beanie', 'wool socks', 'lip balm', 'hand warmers', 'waterproof boots', 'moisturizer'] },
};

const UNIVERSAL = ['passport/ID', 'phone + charger', 'copies of docs (cloud)', 'basic meds', 'cash + card', 'toiletry kit'];

function detectTrip(text) {
  const t = text.toLowerCase();
  if (/beach|coast|ocean|mombasa|diani|sea/.test(t)) return 'beach';
  if (/business|meeting|conference|work trip/.test(t)) return 'business';
  if (/hike|hiking|mountain|trek/.test(t)) return 'hiking';
  if (/safari|park|maasai|game/.test(t)) return 'safari';
  if (/cold|winter|snow|europe/.test(t)) return 'cold';
  return 'city';
}

function packingList(days, tripText) {
  const type = detectTrip(tripText);
  const pack = PACKS[type];
  const items = [...UNIVERSAL, ...pack.items];
  // scale some items by days
  if (days >= 7) items.push('laundry plan (or pack for ~5 days + wash)');
  if (days <= 2) items.push('cabin-size bag only — pack light');
  return { type: pack.name, items };
}

// ─── jet lag plan ───
function jetlagPlan(fromTzOffset, toTzOffset) {
  const diff = toTzOffset - fromTzOffset; // hours
  const days = Math.min(7, Math.max(1, Math.round(Math.abs(diff) / 2)));
  const dir = diff > 0 ? 'east (days shorten — sleep earlier)' : 'west (days lengthen — sleep later)';
  const tips = [
    `Shift bedtime ${Math.abs(diff) >= 6 ? '1h' : '30min'} per day, ${days} days before flying`,
    'Day 1 on arrival: sunlight walk within 2h of landing (resets the clock)',
    diff > 0 ? 'On the plane: sleep on destination schedule; skip the alcohol' : 'On the plane: stay awake on destination schedule; hydrate hard',
    'First 2 nights: melatonin 30min before target bedtime (ask a pharmacist)',
    'No long naps — cap them at 25min before 3pm',
  ];
  return { diff, days, dir, tips };
}

module.exports = {
  name: 'travel',
  aliases: ['trip', 'packing'],
  description: '✈️ Travel Kit — packing lists, jet lag plans, trip-in-one-card',
  async execute(sock, msg, args, commands, reply) {
    const jid = msg.key.remoteJidAlt || msg.key.remoteJid;
    const sub = (args[0] || '').toLowerCase();

    // ─── jetlag ───
    if (sub === 'jetlag') {
      const from = args[1], to = args[2];
      if (!from || !to) return reply('✈️ *.travel jetlag Nairobi Tokyo* — adaptation plan between two cities');
      try {
        const a = await geo.geocode(from, 1);
        const b = await geo.geocode(to, 1);
        if (!a.length || !b.length) return reply('✈️ Unknown cities.');
        // local solar offset approximation: lon/15
        const offA = a[0].lon / 15, offB = b[0].lon / 15;
        const plan = jetlagPlan(offA, offB);
        const L = [
          `✈️ *JET LAG — ${a[0].name.split(',')[0]} → ${b[0].name.split(',')[0]}*`,
          '',
          `⏰ Time shift: *${Math.abs(Math.round(plan.diff))}h* ${plan.dir}`,
          `📅 Adaptation window: ~${plan.days} days`,
          '',
          '*The protocol:*',
          ...plan.tips.map((t, i) => `${i + 1}. ${t}`),
          '',
          '_She can\'t move the sun. She can move your schedule._',
        ];
        return reply(L.join('\n'));
      } catch (e) { return reply(`✈️ ${e.message}`); }
    }

    // ─── pack ───
    if (sub === 'pack') {
      const days = parseInt(args[1], 10) || 3;
      const tripText = args.slice(2).join(' ') || 'city trip';
      const list = packingList(days, tripText);
      const L = [
        `✈️ *PACKING — ${list.type}, ${days} day${days > 1 ? 's' : ''}*`,
        '',
        ...list.items.map(i => `☐ ${i}`),
        '',
        '_Tick with your brain. Repack once, lighter._',
      ];
      return reply(L.join('\n'));
    }

    // ─── trip: one card ───
    if (sub === 'trip' || sub === 'card') {
      const city = args[1];
      const days = parseInt(args[2], 10) || 3;
      if (!city) return reply('✈️ *.travel trip Nairobi 4* — weather + packing + jet lag + map, one card');
      try {
        const w = await di.weather(city);
        const links = geo.mapLinks(w.lat, w.lon, 11);
        const list = packingList(days, city + ' ' + (w.now.desc || ''));
        const L = [
          `✈️ *TRIP CARD — ${w.place}* (${days}d)`,
          '',
          `${w.now.icon} Now ${w.now.temp}°C ${w.now.desc} • next days ${Math.round(w.daily[1]?.min || 0)}–${Math.round(w.daily[1]?.max || 0)}°C, ☔${w.daily[1]?.rain ?? 0}%`,
          `🗺️ ${links.google}`,
          '',
          `*Pack (${list.type}):*`,
          list.items.slice(0, 10).map(i => `☐ ${i}`).join('\n'),
          '',
          '_`.travel jetlag <here> ${destination}_ • `.travel pack ${days} <type>`_',
        ];
        return reply(L.join('\n'));
      } catch (e) { return reply(`✈️ ${e.message}`); }
    }

    // ─── menu ───
    return reply(
      '✈️ *THE TRAVEL KIT*\n\n' +
      '• `.travel pack 5 beach` — smart packing list (beach/business/hiking/city/safari/cold)\n' +
      '• `.travel jetlag Nairobi Tokyo` — adaptation protocol\n' +
      '• `.travel trip Mombasa 4` — weather + packing + map in one card\n\n' +
      '_Pair with: `.locate`, `.satellite`, `.weather`, `.briefing set <city>`_'
    );
  },
};
