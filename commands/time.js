// Country name -> ISO 3166-1 alpha-2 code.
const COUNTRY_CODES = {
  'afghanistan': 'AF', 'albania': 'AL', 'algeria': 'DZ', 'andorra': 'AD', 'angola': 'AO',
  'antigua and barbuda': 'AG', 'argentina': 'AR', 'armenia': 'AM', 'australia': 'AU', 'austria': 'AT',
  'azerbaijan': 'AZ', 'bahamas': 'BS', 'bahrain': 'BH', 'bangladesh': 'BD', 'barbados': 'BB',
  'belarus': 'BY', 'belgium': 'BE', 'belize': 'BZ', 'benin': 'BJ', 'bhutan': 'BT',
  'bolivia': 'BO', 'bosnia and herzegovina': 'BA', 'bosnia': 'BA', 'botswana': 'BW', 'brazil': 'BR',
  'brunei': 'BN', 'bulgaria': 'BG', 'burkina faso': 'BF', 'burundi': 'BI', 'cambodia': 'KH',
  'cameroon': 'CM', 'canada': 'CA', 'cape verde': 'CV', 'central african republic': 'CF', 'chad': 'TD',
  'chile': 'CL', 'china': 'CN', 'colombia': 'CO', 'comoros': 'KM', 'congo': 'CG',
  'dr congo': 'CD', 'democratic republic of congo': 'CD', 'costa rica': 'CR', 'croatia': 'HR', 'cuba': 'CU',
  'cyprus': 'CY', 'czech republic': 'CZ', 'czechia': 'CZ', 'denmark': 'DK', 'djibouti': 'DJ',
  'dominica': 'DM', 'dominican republic': 'DO', 'ecuador': 'EC', 'egypt': 'EG', 'el salvador': 'SV',
  'equatorial guinea': 'GQ', 'eritrea': 'ER', 'estonia': 'EE', 'eswatini': 'SZ', 'swaziland': 'SZ',
  'ethiopia': 'ET', 'fiji': 'FJ', 'finland': 'FI', 'france': 'FR', 'gabon': 'GA',
  'gambia': 'GM', 'georgia': 'GE', 'germany': 'DE', 'ghana': 'GH', 'greece': 'GR',
  'grenada': 'GD', 'guatemala': 'GT', 'guinea': 'GN', 'guinea-bissau': 'GW', 'guyana': 'GY',
  'haiti': 'HT', 'honduras': 'HN', 'hungary': 'HU', 'iceland': 'IS', 'india': 'IN',
  'indonesia': 'ID', 'iran': 'IR', 'iraq': 'IQ', 'ireland': 'IE', 'israel': 'IL',
  'italy': 'IT', 'ivory coast': 'CI', "cote d'ivoire": 'CI', 'jamaica': 'JM', 'japan': 'JP',
  'jordan': 'JO', 'kazakhstan': 'KZ', 'kenya': 'KE', 'kiribati': 'KI', 'kosovo': 'XK',
  'kuwait': 'KW', 'kyrgyzstan': 'KG', 'laos': 'LA', 'latvia': 'LV', 'lebanon': 'LB',
  'lesotho': 'LS', 'liberia': 'LR', 'libya': 'LY', 'liechtenstein': 'LI', 'lithuania': 'LT',
  'luxembourg': 'LU', 'madagascar': 'MG', 'malawi': 'MW', 'malaysia': 'MY', 'maldives': 'MV',
  'mali': 'ML', 'malta': 'MT', 'mauritania': 'MR', 'mauritius': 'MU', 'mexico': 'MX',
  'moldova': 'MD', 'monaco': 'MC', 'mongolia': 'MN', 'montenegro': 'ME', 'morocco': 'MA',
  'mozambique': 'MZ', 'myanmar': 'MM', 'burma': 'MM', 'namibia': 'NA', 'nauru': 'NR',
  'nepal': 'NP', 'netherlands': 'NL', 'new zealand': 'NZ', 'nicaragua': 'NI', 'niger': 'NE',
  'nigeria': 'NG', 'north korea': 'KP', 'north macedonia': 'MK', 'macedonia': 'MK', 'norway': 'NO',
  'oman': 'OM', 'pakistan': 'PK', 'palau': 'PW', 'palestine': 'PS', 'panama': 'PA',
  'papua new guinea': 'PG', 'paraguay': 'PY', 'peru': 'PE', 'philippines': 'PH', 'poland': 'PL',
  'portugal': 'PT', 'qatar': 'QA', 'romania': 'RO', 'russia': 'RU', 'rwanda': 'RW',
  'saint kitts and nevis': 'KN', 'saint lucia': 'LC', 'saint vincent and the grenadines': 'VC', 'samoa': 'WS', 'san marino': 'SM',
  'saudi arabia': 'SA', 'senegal': 'SN', 'serbia': 'RS', 'seychelles': 'SC', 'sierra leone': 'SL',
  'singapore': 'SG', 'slovakia': 'SK', 'slovenia': 'SI', 'solomon islands': 'SB', 'somalia': 'SO',
  'south africa': 'ZA', 'south korea': 'KR', 'korea': 'KR', 'south sudan': 'SS', 'spain': 'ES',
  'sri lanka': 'LK', 'sudan': 'SD', 'suriname': 'SR', 'sweden': 'SE', 'switzerland': 'CH',
  'syria': 'SY', 'taiwan': 'TW', 'tajikistan': 'TJ', 'tanzania': 'TZ', 'thailand': 'TH',
  'timor-leste': 'TL', 'east timor': 'TL', 'togo': 'TG', 'tonga': 'TO', 'trinidad and tobago': 'TT',
  'tunisia': 'TN', 'turkey': 'TR', 'turkmenistan': 'TM', 'tuvalu': 'TV', 'uganda': 'UG',
  'ukraine': 'UA', 'united arab emirates': 'AE', 'uae': 'AE', 'dubai': 'AE',
  'united kingdom': 'GB', 'uk': 'GB', 'britain': 'GB', 'great britain': 'GB', 'england': 'GB',
  'united states': 'US', 'united states of america': 'US', 'usa': 'US', 'us': 'US', 'america': 'US',
  'uruguay': 'UY', 'uzbekistan': 'UZ', 'vanuatu': 'VU', 'vatican city': 'VA', 'venezuela': 'VE',
  'vietnam': 'VN', 'yemen': 'YE', 'zambia': 'ZM', 'zimbabwe': 'ZW',
};

// ISO code -> a representative IANA zone for that country (its capital's
// zone, or the largest/most common one for multi-zone countries).
const COUNTRY_TIMEZONES = {
  AF: 'Asia/Kabul', AL: 'Europe/Tirane', DZ: 'Africa/Algiers', AD: 'Europe/Andorra', AO: 'Africa/Luanda',
  AG: 'America/Antigua', AR: 'America/Argentina/Buenos_Aires', AM: 'Asia/Yerevan', AU: 'Australia/Sydney', AT: 'Europe/Vienna',
  AZ: 'Asia/Baku', BS: 'America/Nassau', BH: 'Asia/Bahrain', BD: 'Asia/Dhaka', BB: 'America/Barbados',
  BY: 'Europe/Minsk', BE: 'Europe/Brussels', BZ: 'America/Belize', BJ: 'Africa/Porto-Novo', BT: 'Asia/Thimphu',
  BO: 'America/La_Paz', BA: 'Europe/Sarajevo', BW: 'Africa/Gaborone', BR: 'America/Sao_Paulo', BN: 'Asia/Brunei',
  BG: 'Europe/Sofia', BF: 'Africa/Ouagadougou', BI: 'Africa/Bujumbura', KH: 'Asia/Phnom_Penh', CM: 'Africa/Douala',
  CA: 'America/Toronto', CV: 'Atlantic/Cape_Verde', CF: 'Africa/Bangui', TD: 'Africa/Ndjamena', CL: 'America/Santiago',
  CN: 'Asia/Shanghai', CO: 'America/Bogota', KM: 'Indian/Comoro', CG: 'Africa/Brazzaville', CD: 'Africa/Kinshasa',
  CR: 'America/Costa_Rica', HR: 'Europe/Zagreb', CU: 'America/Havana', CY: 'Asia/Nicosia', CZ: 'Europe/Prague',
  DK: 'Europe/Copenhagen', DJ: 'Africa/Djibouti', DM: 'America/Dominica', DO: 'America/Santo_Domingo', EC: 'America/Guayaquil',
  EG: 'Africa/Cairo', SV: 'America/El_Salvador', GQ: 'Africa/Malabo', ER: 'Africa/Asmara', EE: 'Europe/Tallinn',
  SZ: 'Africa/Mbabane', ET: 'Africa/Addis_Ababa', FJ: 'Pacific/Fiji', FI: 'Europe/Helsinki', FR: 'Europe/Paris',
  GA: 'Africa/Libreville', GM: 'Africa/Banjul', GE: 'Asia/Tbilisi', DE: 'Europe/Berlin', GH: 'Africa/Accra',
  GR: 'Europe/Athens', GD: 'America/Grenada', GT: 'America/Guatemala', GN: 'Africa/Conakry', GW: 'Africa/Bissau',
  GY: 'America/Guyana', HT: 'America/Port-au-Prince', HN: 'America/Tegucigalpa', HU: 'Europe/Budapest', IS: 'Atlantic/Reykjavik',
  IN: 'Asia/Kolkata', ID: 'Asia/Jakarta', IR: 'Asia/Tehran', IQ: 'Asia/Baghdad', IE: 'Europe/Dublin',
  IL: 'Asia/Jerusalem', IT: 'Europe/Rome', CI: 'Africa/Abidjan', JM: 'America/Jamaica', JP: 'Asia/Tokyo',
  JO: 'Asia/Amman', KZ: 'Asia/Almaty', KE: 'Africa/Nairobi', KI: 'Pacific/Tarawa', XK: 'Europe/Belgrade',
  KW: 'Asia/Kuwait', KG: 'Asia/Bishkek', LA: 'Asia/Vientiane', LV: 'Europe/Riga', LB: 'Asia/Beirut',
  LS: 'Africa/Maseru', LR: 'Africa/Monrovia', LY: 'Africa/Tripoli', LI: 'Europe/Vaduz', LT: 'Europe/Vilnius',
  LU: 'Europe/Luxembourg', MG: 'Indian/Antananarivo', MW: 'Africa/Blantyre', MY: 'Asia/Kuala_Lumpur', MV: 'Indian/Maldives',
  ML: 'Africa/Bamako', MT: 'Europe/Malta', MR: 'Africa/Nouakchott', MU: 'Indian/Mauritius', MX: 'America/Mexico_City',
  MD: 'Europe/Chisinau', MC: 'Europe/Monaco', MN: 'Asia/Ulaanbaatar', ME: 'Europe/Podgorica', MA: 'Africa/Casablanca',
  MZ: 'Africa/Maputo', MM: 'Asia/Yangon', NA: 'Africa/Windhoek', NR: 'Pacific/Nauru', NP: 'Asia/Kathmandu',
  NL: 'Europe/Amsterdam', NZ: 'Pacific/Auckland', NI: 'America/Managua', NE: 'Africa/Niamey', NG: 'Africa/Lagos',
  KP: 'Asia/Pyongyang', MK: 'Europe/Skopje', NO: 'Europe/Oslo', OM: 'Asia/Muscat', PK: 'Asia/Karachi',
  PW: 'Pacific/Palau', PS: 'Asia/Gaza', PA: 'America/Panama', PG: 'Pacific/Port_Moresby', PY: 'America/Asuncion',
  PE: 'America/Lima', PH: 'Asia/Manila', PL: 'Europe/Warsaw', PT: 'Europe/Lisbon', QA: 'Asia/Qatar',
  RO: 'Europe/Bucharest', RU: 'Europe/Moscow', RW: 'Africa/Kigali', KN: 'America/St_Kitts', LC: 'America/St_Lucia',
  VC: 'America/St_Vincent', WS: 'Pacific/Apia', SM: 'Europe/Rome', SA: 'Asia/Riyadh', SN: 'Africa/Dakar',
  RS: 'Europe/Belgrade', SC: 'Indian/Mahe', SL: 'Africa/Freetown', SG: 'Asia/Singapore', SK: 'Europe/Bratislava',
  SI: 'Europe/Ljubljana', SB: 'Pacific/Guadalcanal', SO: 'Africa/Mogadishu', ZA: 'Africa/Johannesburg', KR: 'Asia/Seoul',
  SS: 'Africa/Juba', ES: 'Europe/Madrid', LK: 'Asia/Colombo', SD: 'Africa/Khartoum', SR: 'America/Paramaribo',
  SE: 'Europe/Stockholm', CH: 'Europe/Zurich', SY: 'Asia/Damascus', TW: 'Asia/Taipei', TJ: 'Asia/Dushanbe',
  TZ: 'Africa/Dar_es_Salaam', TH: 'Asia/Bangkok', TL: 'Asia/Dili', TG: 'Africa/Lome', TO: 'Pacific/Tongatapu',
  TT: 'America/Port_of_Spain', TN: 'Africa/Tunis', TR: 'Europe/Istanbul', TM: 'Asia/Ashgabat', TV: 'Pacific/Funafuti',
  UG: 'Africa/Kampala', UA: 'Europe/Kyiv', AE: 'Asia/Dubai', GB: 'Europe/London', US: 'America/New_York',
  UY: 'America/Montevideo', UZ: 'Asia/Tashkent', VU: 'Pacific/Efate', VA: 'Europe/Rome', VE: 'America/Caracas',
  VN: 'Asia/Ho_Chi_Minh', YE: 'Asia/Aden', ZM: 'Africa/Lusaka', ZW: 'Africa/Harare',
};

function isValidZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function getAllZones() {
  try {
    // Node 18+. Full, always-current IANA zone list — no bundled data to go stale.
    return Intl.supportedValuesOf('timeZone');
  } catch {
    // Older Node: fall back to whatever's in our own country table.
    return Object.values(COUNTRY_TIMEZONES);
  }
}

function resolveTimezone(input) {
  const raw = input.trim();

  // 1. Already a full IANA zone, e.g. "Africa/Nairobi"
  if (raw.includes('/') && isValidZone(raw)) {
    return raw;
  }

  const normalized = raw.toLowerCase().replace(/\s+/g, '');
  const zones = getAllZones();

  // 2. Exact match against the city segment of any known zone
  const cityMatch = zones.find((z) => {
    const segments = z.toLowerCase().split('/');
    const city = segments[segments.length - 1].replace(/_/g, '');
    return city === normalized;
  });
  if (cityMatch) return cityMatch;

  // 3. Country name -> ISO code -> that country's representative timezone
  const countryCode = COUNTRY_CODES[raw.toLowerCase()];
  if (countryCode && COUNTRY_TIMEZONES[countryCode]) {
    return COUNTRY_TIMEZONES[countryCode];
  }

  // 4. Loose fallback: partial match against any zone segment
  const fuzzy = zones.find((z) => z.toLowerCase().replace(/[_/]/g, '').includes(normalized));
  if (fuzzy) return fuzzy;

  return null;
}

module.exports = {
  name: 'time',
  description: 'Get the current time for a place. Usage: .time <city, country, or IANA timezone>',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const input = args.join(' ').trim();

    if (!input) {
      return sock.sendMessage(jid, {
        text: '❌ Usage: .time <place>\nExamples: .time Nairobi | .time Kenya | .time South Africa | .time Africa/Nairobi'
      }, { quoted: msg });
    }

    const tz = resolveTimezone(input);

    if (!tz) {
      return sock.sendMessage(jid, {
        text: `❌ Couldn't find a timezone for "${input}". Try a city, a country name, or a full IANA name like Africa/Nairobi.`
      }, { quoted: msg });
    }

    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        dateStyle: 'full',
        timeStyle: 'medium'
      });
      const formatted = formatter.format(new Date());

      await sock.sendMessage(jid, { text: `🕒 *Time in ${input}* (${tz}):\n${formatted}` }, { quoted: msg });
    } catch (e) {
      console.error('[TIME ERROR]', e);
      await sock.sendMessage(jid, { text: `❌ Resolved "${input}" to an invalid timezone (${tz}).` }, { quoted: msg });
    }
  }
};

