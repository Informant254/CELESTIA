/**
 * 🌍 GEO LENS — CELESTIA's Atlas Engine 🌍
 *
 * Place intelligence:
 *   - Geocode any place name → lat/lon, country, region (Nominatim/OSM — free, no key)
 *   - Generate Google Maps / Apple Maps / OSM / Street View / satellite links
 *   - Local time, sunrise/sunset (NOAA solar math, offline)
 *   - Reverse geocode coordinates → "what place is this?"
 *
 * Public webcams:
 *   - Curated list of known reliable public cams (major cities, landmarks)
 *   - Windy webcams API (optional key via env WINDY_WEBCAMS_KEY)
 *   - Nearest-cam search from any coordinates
 *
 * Privacy doctrine: geocodes places, not people. No number-tracking here.
 */

const axios = require('axios');
const UA = 'CELESTIA-GeoLens/2.0 (place intelligence)';
const NANP = require('./nanp');

// ─────────────────────────────────────────
// GEOCODING (Nominatim — OpenStreetMap)
// ─────────────────────────────────────────

async function geocode(query, limit = 5) {
  const res = await axios.get('https://nominatim.openstreetmap.org/search', {
    params: { q: query, format: 'json', limit, addressdetails: 1 },
    headers: { 'User-Agent': UA },
    timeout: 15000,
  });
  return (res.data || []).map(r => ({
    name: r.display_name,
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    type: r.type,
    category: r.category,
    country: r.address?.country,
    countryCode: r.address?.country_code,
  }));
}

async function reverseGeocode(lat, lon) {
  const res = await axios.get('https://nominatim.openstreetmap.org/reverse', {
    params: { lat, lon, format: 'json', zoom: 12 },
    headers: { 'User-Agent': UA },
    timeout: 15000,
  });
  const d = res.data;
  if (!d || d.error) throw new Error('No place found at those coordinates');
  return {
    name: d.display_name,
    country: d.address?.country,
    countryCode: d.address?.country_code,
    type: d.type,
  };
}

// ─────────────────────────────────────────
// MAP LINKS — every flavor
// ─────────────────────────────────────────

function mapLinks(lat, lon, zoom = 13) {
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`,
    googlePin: `https://maps.google.com/?q=${lat},${lon}`,
    apple: `https://maps.apple.com/?ll=${lat},${lon}&q=Location`,
    osm: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`,
    satellite: `https://www.google.com/maps/@${lat},${lon},${zoom}z/data=!3m1!1e3`,
    streetView: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}`,
    earth: `https://earth.google.com/web/search/${lat},${lon}`,
    directions: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`,
    embed: `https://www.openstreetmap.org/export/embed.html?bbox=${lon - 0.02},${lat - 0.01},${lon + 0.02},${lat + 0.01}&layer=mapnik`,
  };
}

// Distance between two coords (Haversine) — km
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─────────────────────────────────────────
// LOCAL TIME + SUN (offline solar math)
// ─────────────────────────────────────────

async function placeTime(lat, lon) {
  // Use timezone from geocode if available; else fall back to rough solar offset
  try {
    const res = await axios.get('https://timeapi.io/api/Time/current/coordinate', {
      params: { latitude: lat, longitude: lon },
      headers: { 'User-Agent': UA },
      timeout: 10000,
    });
    const d = res.data;
    return { time: `${d.hour}:${String(d.minute).padStart(2, '0')}`, date: d.date, timezone: d.timeZone || null };
  } catch {
    return null;
  }
}

// NOAA sunrise/sunset approximation
function sunTimes(lat, lon, date = new Date()) {
  const rad = Math.PI / 180;
  const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
  const decl = 23.44 * rad * Math.sin(2 * Math.PI * (284 + dayOfYear) / 365);
  const latRad = lat * rad;
  const cosH = (Math.cos(90.833 * rad) - Math.sin(latRad) * Math.sin(decl)) / (Math.cos(latRad) * Math.cos(decl));
  if (cosH > 1) return { sunrise: null, sunset: null, note: 'polar day — sun never sets' };
  if (cosH < -1) return { sunrise: null, sunset: null, note: 'polar night — sun never rises' };
  const H = Math.acos(cosH) / rad / 15;
  const solarNoonUTC = 12 - lon / 15;
  const fmt = (h) => {
    const hh = Math.floor((h + 24) % 24);
    const mm = Math.round((h - Math.floor(h)) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  };
  return { sunrise: fmt(solarNoonUTC - H), sunset: fmt(solarNoonUTC + H), note: 'approx local solar time' };
}

// ─────────────────────────────────────────
// PUBLIC WEBCAMS — live keyless APIs
// ─────────────────────────────────────────

// TfL JamCams: 890 London traffic cams, keyless official feed.
let _tflCache = null; let _tflCacheTs = 0;
// Refresh the TfL cache — but verify a sample image actually loads first,
// so listCams never returns a catalog of dead feeds.
async function tflCams() {
  if (_tflCache && Date.now() - _tflCacheTs < 30 * 60 * 1000) return _tflCache;
  const res = await axios.get('https://api.tfl.gov.uk/Place/Type/JamCam', {
    headers: { 'User-Agent': UA }, timeout: 15000,
  });
  _tflCache = (res.data || []).map(c => {
    const img = (c.additionalProperties || []).find(p => p.key === 'imageUrl');
    return {
      id: c.id,
      name: `London — ${c.commonName}`,
      city: 'London', country: 'GB',
      lat: c.lat, lon: c.lon,
      url: img ? img.value : null,
      type: 'traffic',
    };
  }).filter(c => c.url);
  _tflCacheTs = Date.now();
  return _tflCache;
}

// Windy API (optional key) — global cams
async function windyWebcams(query) {
  const key = process.env.WINDY_WEBCAMS_KEY;
  if (!key) return null;
  try {
    const res = await axios.get('https://api.windy.com/webcams/api/v3/webcams', {
      params: { key, include: 'location,images', lang: 'en', limit: 12, ...(query ? { q: query } : {}) },
      headers: { 'User-Agent': UA }, timeout: 15000,
    });
    return (res.data?.webcams || []).map(w => ({
      id: `windy:${w.webcamId}`,
      name: w.title || 'Windy cam',
      city: w.location?.city || null,
      country: w.location?.country || null,
      lat: w.location?.lat || null,
      lon: w.location?.lon || null,
      url: w.images?.items?.[0]?.link?.replace('http://', 'https://') || null,
      type: 'windy',
    })).filter(c => c.url);
  } catch { return null; }
}

// Featured London cams (famous spots from the live TfL feed)
const FEATURED_TFL_IDS = ['JamCams_00001.07450']; // Piccadilly Circus — resolved by name at runtime

// Unified cam providers
async function listCams() {
  const out = [];
  // Windy first if configured (global coverage)
  const windy = await windyWebcams();
  if (windy && windy.length) out.push(...windy.slice(0, 20));

  // London TfL (always available, keyless)
  try {
    const tfl = await tflCams();
    if (tfl.length) {
      // Add a famous-first slice: Piccadilly, Oxford St area, etc by name match
      const famous = tfl.filter(c => /piccadilly|oxford|trafalgar|westminster|tower|london bridge|waterloo|embankment|hyde park/i.test(c.name)).slice(0, 12);
      const rest = tfl.filter(c => !famous.includes(c)).slice(0, 8);
      out.push(...famous, ...rest);
    }
  } catch { /* TfL down */ }

  // Static fallback if everything failed
  if (!out.length) {
    out.push({ id: 'tfl-piccadilly', name: 'London — Piccadilly Circus', city: 'London', country: 'GB', lat: 51.5095, lon: -0.1340, url: 'https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/00001.07450.jpg', type: 'traffic' });
  }
  return out;
}

async function getCam(id) {
  if (id.startsWith('windy:')) {
    const windy = await windyWebcams();
    return (windy || []).find(c => c.id === id) || null;
  }
  const all = await listCams();
  return all.find(c => c.id === id) || all.find(c => c.name.toLowerCase().includes(id.toLowerCase())) || null;
}

async function nearestCams(lat, lon, count = 3) {
  const all = await listCams();
  const withDist = all
    .filter(c => typeof c.lat === 'number')
    .map(c => ({ ...c, distKm: Math.round(haversineKm(lat, lon, c.lat, c.lon)) }));
  withDist.sort((a, b) => a.distKm - b.distKm);
  return withDist.slice(0, count);
}

// Fetch a cam snapshot as buffer — with retry (feeds are flaky, one shot isn't enough)
async function fetchCamImage(url, retries = 2) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 12000,
        headers: { 'User-Agent': UA },
      });
      const contentType = res.headers['content-type'] || '';
      if (!contentType.startsWith('image/')) {
        throw new Error('Feed did not return an image (may be offline)');
      }
      return { buffer: Buffer.from(res.data), contentType };
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise(r => setTimeout(r, 1500 * (i + 1))); // backoff
    }
  }
  throw lastErr || new Error('feed unreachable');
}

// ─────────────────────────────────────────
// PHONE → COUNTRY INTELLIGENCE
// (country-level only — from the public dialing code in the number itself)
// ─────────────────────────────────────────

const COUNTRY_CODES = {
  '1': ['United States / Canada', 'US', 'Washington DC', 38.9, -77.0],  '7': ['Russia / Kazakhstan', 'RU', 'Moscow', 55.75, 37.62],
  '20': ['Egypt', 'EG', 'Cairo', 30.04, 31.24],
  '27': ['South Africa', 'ZA', 'Pretoria', -25.75, 28.19],
  '30': ['Greece', 'GR', 'Athens', 37.98, 23.73],
  '31': ['Netherlands', 'NL', 'Amsterdam', 52.37, 4.9],
  '32': ['Belgium', 'BE', 'Brussels', 50.85, 4.35],
  '33': ['France', 'FR', 'Paris', 48.86, 2.35],
  '34': ['Spain', 'ES', 'Madrid', 40.42, -3.7],
  '36': ['Hungary', 'HU', 'Budapest', 47.5, 19.04],
  '39': ['Italy', 'IT', 'Rome', 41.9, 12.5],
  '40': ['Romania', 'RO', 'Bucharest', 44.43, 26.1],
  '41': ['Switzerland', 'CH', 'Bern', 46.95, 7.45],
  '43': ['Austria', 'AT', 'Vienna', 48.21, 16.37],
  '44': ['United Kingdom', 'GB', 'London', 51.51, -0.13],
  '45': ['Denmark', 'DK', 'Copenhagen', 55.68, 12.57],
  '46': ['Sweden', 'SE', 'Stockholm', 59.33, 18.07],
  '47': ['Norway', 'NO', 'Oslo', 59.91, 10.75],
  '48': ['Poland', 'PL', 'Warsaw', 52.23, 21.01],
  '49': ['Germany', 'DE', 'Berlin', 52.52, 13.4],
  '51': ['Peru', 'PE', 'Lima', -12.05, -77.04],
  '52': ['Mexico', 'MX', 'Mexico City', 19.43, -99.13],
  '53': ['Cuba', 'CU', 'Havana', 23.11, -82.37],
  '54': ['Argentina', 'AR', 'Buenos Aires', -34.6, -58.38],
  '55': ['Brazil', 'BR', 'Brasilia', -15.79, -47.88],
  '56': ['Chile', 'CL', 'Santiago', -33.45, -70.67],
  '57': ['Colombia', 'CO', 'Bogota', 4.71, -74.07],
  '60': ['Malaysia', 'MY', 'Kuala Lumpur', 3.14, 101.69],
  '61': ['Australia', 'AU', 'Canberra', -35.28, 149.13],
  '62': ['Indonesia', 'ID', 'Jakarta', -6.21, 106.85],
  '63': ['Philippines', 'PH', 'Manila', 14.6, 120.98],
  '64': ['New Zealand', 'NZ', 'Wellington', -41.29, 174.78],
  '65': ['Singapore', 'SG', 'Singapore', 1.35, 103.82],
  '66': ['Thailand', 'TH', 'Bangkok', 13.76, 100.5],
  '81': ['Japan', 'JP', 'Tokyo', 35.68, 139.65],
  '82': ['South Korea', 'KR', 'Seoul', 37.57, 126.98],
  '84': ['Vietnam', 'VN', 'Hanoi', 21.03, 105.85],
  '86': ['China', 'CN', 'Beijing', 39.9, 116.4],
  '90': ['Turkey', 'TR', 'Ankara', 39.93, 32.86],
  '91': ['India', 'IN', 'New Delhi', 28.61, 77.21],
  '92': ['Pakistan', 'PK', 'Islamabad', 33.68, 73.05],
  '93': ['Afghanistan', 'AF', 'Kabul', 34.53, 69.17],
  '94': ['Sri Lanka', 'LK', 'Colombo', 6.93, 79.86],
  '95': ['Myanmar', 'MM', 'Naypyidaw', 19.75, 96.13],
  '98': ['Iran', 'IR', 'Tehran', 35.69, 51.39],
  '211': ['South Sudan', 'SS', 'Juba', 4.85, 31.58],
  '212': ['Morocco / W. Sahara', 'MA', 'Rabat', 34.02, -6.83],
  '213': ['Algeria', 'DZ', 'Algiers', 36.75, 3.06],
  '216': ['Tunisia', 'TN', 'Tunis', 36.8, 10.18],
  '218': ['Libya', 'LY', 'Tripoli', 32.89, 13.19],
  '220': ['Gambia', 'GM', 'Banjul', 13.45, -16.58],
  '221': ['Senegal', 'SN', 'Dakar', 14.72, -17.47],
  '222': ['Mauritania', 'MR', 'Nouakchott', 18.08, -15.98],
  '223': ['Mali', 'ML', 'Bamako', 12.64, -8.0],
  '224': ['Guinea', 'GN', 'Conakry', 9.64, -13.58],
  '225': ['Ivory Coast', 'CI', 'Yamoussoukro', 6.82, -5.28],
  '226': ['Burkina Faso', 'BF', 'Ouagadougou', 12.37, -1.53],
  '227': ['Niger', 'NE', 'Niamey', 13.51, 2.11],
  '228': ['Togo', 'TG', 'Lome', 6.13, 1.22],
  '229': ['Benin', 'BJ', 'Porto-Novo', 6.5, 2.62],
  '230': ['Mauritius', 'MU', 'Port Louis', -20.17, 57.5],
  '231': ['Liberia', 'LR', 'Monrovia', 6.3, -10.8],
  '232': ['Sierra Leone', 'SL', 'Freetown', 8.48, -13.23],
  '233': ['Ghana', 'GH', 'Accra', 5.6, -0.19],
  '234': ['Nigeria', 'NG', 'Abuja', 9.06, 7.49],
  '235': ['Chad', 'TD', "N'Djamena", 12.11, 15.04],
  '236': ['Central African Rep.', 'CF', 'Bangui', 4.39, 18.56],
  '237': ['Cameroon', 'CM', 'Yaounde', 3.85, 11.5],
  '238': ['Cape Verde', 'CV', 'Praia', 14.93, -23.51],
  '239': ['Sao Tome & Principe', 'ST', 'Sao Tome', 0.34, 6.73],
  '240': ['Equatorial Guinea', 'GQ', 'Malabo', 3.75, 8.78],
  '241': ['Gabon', 'GA', 'Libreville', 0.42, 9.47],
  '242': ['Congo', 'CG', 'Brazzaville', -4.26, 15.28],
  '243': ['DR Congo', 'CD', 'Kinshasa', -4.44, 15.27],
  '244': ['Angola', 'AO', 'Luanda', -8.84, 13.23],
  '245': ['Guinea-Bissau', 'GW', 'Bissau', 11.86, -15.6],
  '248': ['Seychelles', 'SC', 'Victoria', -4.62, 55.45],
  '249': ['Sudan', 'SD', 'Khartoum', 15.5, 32.56],
  '250': ['Rwanda', 'RW', 'Kigali', -1.94, 30.06],
  '251': ['Ethiopia', 'ET', 'Addis Ababa', 9.03, 38.74],
  '252': ['Somalia', 'SO', 'Mogadishu', 2.04, 45.34],
  '253': ['Djibouti', 'DJ', 'Djibouti City', 11.59, 43.15],
  '254': ['Kenya', 'KE', 'Nairobi', -1.29, 36.82],
  '255': ['Tanzania', 'TZ', 'Dodoma', -6.16, 35.75],
  '256': ['Uganda', 'UG', 'Kampala', 0.35, 32.58],
  '257': ['Burundi', 'BI', 'Gitega', -3.43, 29.93],
  '258': ['Mozambique', 'MZ', 'Maputo', -25.97, 32.57],
  '260': ['Zambia', 'ZM', 'Lusaka', -15.39, 28.32],
  '261': ['Madagascar', 'MG', 'Antananarivo', -18.88, 47.51],
  '262': ['Reunion / Mayotte', 'RE', 'Saint-Denis', -20.88, 55.45],
  '263': ['Zimbabwe', 'ZW', 'Harare', -17.83, 31.05],
  '264': ['Namibia', 'NA', 'Windhoek', -22.56, 17.08],
  '265': ['Malawi', 'MW', 'Lilongwe', -13.96, 33.79],
  '266': ['Lesotho', 'LS', 'Maseru', -29.31, 27.48],
  '267': ['Botswana', 'BW', 'Gaborone', -24.65, 25.91],
  '268': ['Eswatini', 'SZ', 'Mbabane', -26.32, 31.14],
  '269': ['Comoros', 'KM', 'Moroni', -11.7, 43.24],
  '290': ['St Helena', 'SH', 'Jamestown', -15.93, -5.72],
  '291': ['Eritrea', 'ER', 'Asmara', 15.34, 38.93],
  '297': ['Aruba', 'AW', 'Oranjestad', 12.52, -70.03],
  '298': ['Faroe Islands', 'FO', 'Torshavn', 62.01, -6.77],
  '299': ['Greenland', 'GL', 'Nuuk', 64.18, -51.72],
  '350': ['Gibraltar', 'GI', 'Gibraltar', 36.14, -5.35],
  '351': ['Portugal', 'PT', 'Lisbon', 38.72, -9.14],
  '352': ['Luxembourg', 'LU', 'Luxembourg City', 49.61, 6.13],
  '353': ['Ireland', 'IE', 'Dublin', 53.35, -6.26],
  '354': ['Iceland', 'IS', 'Reykjavik', 64.15, -21.94],
  '355': ['Albania', 'AL', 'Tirana', 41.33, 19.82],
  '356': ['Malta', 'MT', 'Valletta', 35.9, 14.51],
  '357': ['Cyprus', 'CY', 'Nicosia', 35.19, 33.36],
  '358': ['Finland', 'FI', 'Helsinki', 60.17, 24.94],
  '359': ['Bulgaria', 'BG', 'Sofia', 42.7, 23.32],
  '370': ['Lithuania', 'LT', 'Vilnius', 54.69, 25.28],
  '371': ['Latvia', 'LV', 'Riga', 56.95, 24.11],
  '372': ['Estonia', 'EE', 'Tallinn', 59.44, 24.75],
  '373': ['Moldova', 'MD', 'Chisinau', 47.01, 28.86],
  '374': ['Armenia', 'AM', 'Yerevan', 40.18, 44.51],
  '375': ['Belarus', 'BY', 'Minsk', 53.9, 27.57],
  '376': ['Andorra', 'AD', 'Andorra la Vella', 42.51, 1.52],
  '377': ['Monaco', 'MC', 'Monaco', 43.74, 7.42],
  '378': ['San Marino', 'SM', 'San Marino', 43.94, 12.45],
  '380': ['Ukraine', 'UA', 'Kyiv', 50.45, 30.52],
  '381': ['Serbia', 'RS', 'Belgrade', 44.79, 20.45],
  '382': ['Montenegro', 'ME', 'Podgorica', 42.44, 19.26],
  '383': ['Kosovo', 'XK', 'Pristina', 42.66, 21.17],
  '385': ['Croatia', 'HR', 'Zagreb', 45.81, 15.98],
  '386': ['Slovenia', 'SI', 'Ljubljana', 46.06, 14.51],
  '387': ['Bosnia & Herzegovina', 'BA', 'Sarajevo', 43.86, 18.41],
  '389': ['North Macedonia', 'MK', 'Skopje', 41.99, 21.43],
  '420': ['Czechia', 'CZ', 'Prague', 50.08, 14.44],
  '421': ['Slovakia', 'SK', 'Bratislava', 48.15, 17.11],
  '423': ['Liechtenstein', 'LI', 'Vaduz', 47.14, 9.52],
  '500': ['Falkland Islands', 'FK', 'Stanley', -51.7, -57.85],
  '501': ['Belize', 'BZ', 'Belmopan', 17.25, -88.77],
  '502': ['Guatemala', 'GT', 'Guatemala City', 14.63, -90.51],
  '503': ['El Salvador', 'SV', 'San Salvador', 13.69, -89.22],
  '504': ['Honduras', 'HN', 'Tegucigalpa', 14.07, -87.19],
  '505': ['Nicaragua', 'NI', 'Managua', 12.11, -86.24],
  '506': ['Costa Rica', 'CR', 'San Jose', 9.93, -84.08],
  '507': ['Panama', 'PA', 'Panama City', 8.98, -79.52],
  '508': ['St Pierre & Miquelon', 'PM', 'Saint-Pierre', 46.78, -56.18],
  '509': ['Haiti', 'HT', 'Port-au-Prince', 18.54, -72.34],
  '590': ['Guadeloupe', 'GP', 'Basse-Terre', 16.0, -61.73],
  '591': ['Bolivia', 'BO', 'La Paz', -16.5, -68.15],
  '592': ['Guyana', 'GY', 'Georgetown', 6.8, -58.16],
  '593': ['Ecuador', 'EC', 'Quito', -0.18, -78.47],
  '594': ['French Guiana', 'GF', 'Cayenne', 4.93, -52.3],
  '595': ['Paraguay', 'PY', 'Asuncion', -25.26, -57.58],
  '596': ['Martinique', 'MQ', 'Fort-de-France', 14.61, -61.07],
  '597': ['Suriname', 'SR', 'Paramaribo', 5.85, -55.2],
  '598': ['Uruguay', 'UY', 'Montevideo', -34.9, -56.16],
  '599': ['Curacao / Bonaire', 'CW', 'Willemstad', 12.11, -68.93],
  '670': ['East Timor', 'TL', 'Dili', -8.56, 125.56],
  '672': ['Norfolk Island', 'NF', 'Kingston', -29.05, 167.96],
  '673': ['Brunei', 'BN', 'Bandar Seri Begawan', 4.89, 114.94],
  '674': ['Nauru', 'NR', 'Yaren', -0.55, 166.92],
  '675': ['Papua New Guinea', 'PG', 'Port Moresby', -9.44, 147.18],
  '676': ['Tonga', 'TO', "Nuku'alofa", -21.14, -175.2],
  '677': ['Solomon Islands', 'SB', 'Honiara', -9.43, 159.95],
  '678': ['Vanuatu', 'VU', 'Port Vila', -17.73, 168.32],
  '679': ['Fiji', 'FJ', 'Suva', -18.14, 178.44],
  '680': ['Palau', 'PW', 'Ngerulmud', 7.5, 134.62],
  '681': ['Wallis & Futuna', 'WF', 'Mata Utu', -13.28, -176.17],
  '682': ['Cook Islands', 'CK', 'Avarua', -21.21, -159.78],
  '683': ['Niue', 'NU', 'Alofi', -19.06, -169.92],
  '685': ['Samoa', 'WS', 'Apia', -13.83, -171.77],
  '686': ['Kiribati', 'KI', 'Tarawa', 1.33, 172.98],
  '687': ['New Caledonia', 'NC', 'Noumea', -22.27, 166.44],
  '688': ['Tuvalu', 'TV', 'Funafuti', -8.52, 179.2],
  '689': ['French Polynesia', 'PF', 'Papeete', -17.53, -149.57],
  '690': ['Tokelau', 'TK', 'Nukunonu', -9.2, -171.85],
  '691': ['Micronesia', 'FM', 'Palikir', 6.92, 158.16],
  '692': ['Marshall Islands', 'MH', 'Majuro', 7.09, 171.38],
  '850': ['North Korea', 'KP', 'Pyongyang', 39.04, 125.76],
  '852': ['Hong Kong', 'HK', 'Hong Kong', 22.32, 114.17],
  '853': ['Macau', 'MO', 'Macau', 22.2, 113.55],
  '880': ['Bangladesh', 'BD', 'Dhaka', 23.81, 90.41],
  '886': ['Taiwan', 'TW', 'Taipei', 25.03, 121.57],
  '960': ['Maldives', 'MV', 'Male', 4.17, 73.51],
  '961': ['Lebanon', 'LB', 'Beirut', 33.89, 35.5],
  '962': ['Jordan', 'JO', 'Amman', 31.95, 35.93],
  '963': ['Syria', 'SY', 'Damascus', 33.51, 36.29],
  '964': ['Iraq', 'IQ', 'Baghdad', 33.31, 44.36],
  '965': ['Kuwait', 'KW', 'Kuwait City', 29.37, 47.98],
  '966': ['Saudi Arabia', 'SA', 'Riyadh', 24.71, 46.68],
  '967': ['Yemen', 'YE', 'Sanaa', 15.35, 44.21],
  '968': ['Oman', 'OM', 'Muscat', 23.59, 58.41],
  '970': ['Palestine', 'PS', 'Ramallah', 31.9, 35.2],
  '971': ['UAE', 'AE', 'Abu Dhabi', 24.45, 54.38],
  '972': ['Israel', 'IL', 'Jerusalem', 31.77, 35.21],
  '973': ['Bahrain', 'BH', 'Manama', 26.23, 50.58],
  '974': ['Qatar', 'QA', 'Doha', 25.29, 51.53],
  '975': ['Bhutan', 'BT', 'Thimphu', 27.47, 89.64],
  '976': ['Mongolia', 'MN', 'Ulaanbaatar', 47.89, 106.91],
  '977': ['Nepal', 'NP', 'Kathmandu', 27.72, 85.32],
  '994': ['Azerbaijan', 'AZ', 'Baku', 40.41, 49.87],
  '995': ['Georgia', 'GE', 'Tbilisi', 41.72, 44.78],
  '996': ['Kyrgyzstan', 'KG', 'Bishkek', 42.87, 74.59],
  '998': ['Uzbekistan', 'UZ', 'Tashkent', 41.3, 69.24],
};

// Resolve a phone number → { country, flagEmoji, capital/city, lat, lon, countryCode }
// For +1 (NANP) numbers, resolves city/state via area code — no more "one number = DC".
function phoneCountry(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;

  // ─── NANP special handling: +1 → area code (NPA) lookup ───
  if (digits.startsWith('1') && digits.length >= 11) {
    const npa = digits.slice(1, 4);
    const area = NANP[npa];
    if (area) {
      const [city, region, cc, lat, lon] = area;
      return {
        number: digits,
        country: region,
        countryCode: cc,
        capital: city,
        city,
        lat, lon,
        flag: codeToFlag(cc),
        dialCode: '+1',
        areaCode: npa,
      };
    }
    // Unknown NPA — still NANP, generic fallback
    return {
      number: digits,
      country: 'United States / Canada (NANP)',
      countryCode: 'US',
      capital: '—',
      lat: 39.8, lon: -98.6,
      flag: '🇺🇸',
      dialCode: '+1',
      areaCode: npa,
    };
  }

  // Longest-prefix match for the rest of the world (3 → 1 digits)
  for (let len = 3; len >= 1; len--) {
    const cc = COUNTRY_CODES[digits.slice(0, len)];
    if (cc) {
      const [name, code, capital, lat, lon] = cc;
      return {
        number: digits,
        country: name,
        countryCode: code.split('/')[0].trim(),
        capital,
        lat, lon,
        flag: codeToFlag(code.split('/')[0].trim()),
        dialCode: `+${digits.slice(0, len)}`,
      };
    }
  }
  return null;
}

function codeToFlag(code) {
  if (!/^[A-Z]{2}$/.test(code)) return '🌐';
  return String.fromCodePoint(...[...code].map(c => 127397 + c.charCodeAt(0)));
}

module.exports = {
  geocode, reverseGeocode, mapLinks, haversineKm,
  placeTime, sunTimes,
  listCams, getCam, nearestCams, fetchCamImage, windyWebcams, tflCams,
  phoneCountry,
};
