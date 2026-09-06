/**
 * 🌦️ DAY INTEL — weather, prayer, markets, news 🌦️
 *
 * All keyless public APIs:
 *   - Open-Meteo (weather + geocoding — the gold standard free tier)
 *   - Aladhan (prayer times)
 *   - CoinGecko (crypto prices)
 *   - exchangerate-api open endpoint (FX)
 *   - HN Firebase (already in portal) + thePortal supply for briefing
 */

const axios = require('axios');
const geo = require('./geoLens');
const UA = 'CELESTIA-DayIntel/2.0';

// ─────────────────────────────────────────
// WEATHER (Open-Meteo, keyless)
// ─────────────────────────────────────────

const WMO = {
  0: ['Clear sky', '☀️'], 1: ['Mainly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'], 48: ['Rime fog', '🌫️'],
  51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Heavy drizzle', '🌧️'],
  61: ['Light rain', '🌦️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'],
  66: ['Freezing rain', '🌧️❄️'], 67: ['Freezing rain', '🌧️❄️'],
  71: ['Light snow', '🌨️'], 73: ['Snow', '🌨️'], 75: ['Heavy snow', '❄️'], 77: ['Snow grains', '🌨️'],
  80: ['Rain showers', '🌦️'], 81: ['Rain showers', '🌧️'], 82: 'Violent showers',
  85: ['Snow showers', '🌨️'], 86: ['Heavy snow showers', '❄️'],
  95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm + hail', '⛈️'], 99: ['Severe thunderstorm', '⛈️'],
};
function wmoInfo(code) {
  const w = WMO[code];
  if (!w) return ['Unknown', '🌡️'];
  return Array.isArray(w) ? w : [w, '⛈️'];
}

async function weather(place) {
  // geocode via geoLens (Nominatim)
  const results = await geo.geocode(place, 1);
  if (!results.length) throw new Error(`No place found for "${place}"`);
  const { lat, lon, name } = results[0];

  const res = await axios.get('https://api.open-meteo.com/v1/forecast', {
    params: {
      latitude: lat, longitude: lon,
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
      timezone: 'auto',
      forecast_days: 4,
    },
    headers: { 'User-Agent': UA }, timeout: 15000,
  });

  const d = res.data;
  const cur = d.current;
  const [desc, icon] = wmoInfo(cur.weather_code);
  const daily = (d.daily || {}).time?.map((t, i) => ({
    date: t,
    max: d.daily.temperature_2m_max[i],
    min: d.daily.temperature_2m_min[i],
    rain: d.daily.precipitation_probability_max?.[i],
    code: d.daily.weather_code[i],
    sunrise: d.daily.sunrise?.[i],
    sunset: d.daily.sunset?.[i],
  })) || [];

  return {
    place: name.split(',')[0] + (name.split(',')[1] ? ', ' + name.split(',')[1].trim() : ''),
    lat, lon,
    now: {
      temp: Math.round(cur.temperature_2m), feels: Math.round(cur.apparent_temperature),
      humidity: cur.relative_humidity_2m, wind: Math.round(cur.wind_speed_10m),
      precip: cur.precipitation, desc, icon,
    },
    daily,
    timezone: d.timezone,
  };
}

// ─────────────────────────────────────────
// PRAYER TIMES (Aladhan, keyless)
// ─────────────────────────────────────────

const PRAYER_NAMES = {
  Fajr: 'فجر — dawn', Sunrise: 'شروق — sunrise', Dhuhr: 'ظهر — noon',
  Asr: 'عصر — afternoon', Maghrib: 'مغرب — sunset', Isha: 'عشاء — night',
};

async function prayerTimes(place) {
  const results = await geo.geocode(place, 1);
  if (!results.length) throw new Error(`No place found for "${place}"`);
  const { lat, lon, name } = results[0];
  const date = new Date().toLocaleDateString('en-GB').replace(/\//g, '-'); // DD-MM-YYYY

  const res = await axios.get(`https://api.aladhan.com/v1/timings/${date}`, {
    params: { latitude: lat, longitude: lon, method: 'auto' },
    headers: { 'User-Agent': UA }, timeout: 15000,
  });
  const t = res.data.data;
  return {
    place: name.split(',')[0],
    times: t.timings,
    hijri: `${t.date.hijri.day} ${t.date.hijri.month.en} ${t.date.hijri.year} AH`,
    method: t.meta?.method?.name || 'auto',
    timezone: t.meta?.timezone,
    qibla: null,
  };
}

async function qiblaDirection(place) {
  const results = await geo.geocode(place, 1);
  if (!results.length) throw new Error(`No place found for "${place}"`);
  const { lat, lon } = results[0];
  // Qibla = direction to Kaaba (21.4225, 39.8262) — standard formula
  const kLat = 21.4225 * Math.PI / 180, kLon = 39.8262 * Math.PI / 180;
  const φ = lat * Math.PI / 180, λ = lon * Math.PI / 180;
  const bearing = Math.atan2(
    Math.sin(kLon - λ),
    Math.cos(φ) * Math.tan(kLat) - Math.sin(φ) * Math.cos(kLon - λ)
  ) * 180 / Math.PI;
  return (bearing + 360) % 360;
}

// ─────────────────────────────────────────
// CRYPTO & FX (CoinGecko + open FX, keyless)
// ─────────────────────────────────────────

async function cryptoPrice(ids) {
  const res = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
    params: {
      ids: ids.join(','),
      vs_currencies: 'usd,eur,kes,ngn,tzs,ugx',
      include_24hr_change: 'true',
      include_24hr_vol: 'false',
      include_market_cap: 'true',
    },
    headers: { 'User-Agent': UA }, timeout: 15000,
  });
  return res.data;
}

const CRYPTO_MAP = {
  btc: 'bitcoin', eth: 'ethereum', sol: 'solana', bnb: 'binancecoin',
  xrp: 'ripple', ada: 'cardano', doge: 'dogecoin', usdt: 'tether',
  usdc: 'usd-coin', dot: 'polkadot', matic: 'matic-network', link: 'chainlink',
  ton: 'the-open-network', tron: 'tron', ltc: 'litecoin', shib: 'shiba-inu',
  pepe: 'pepe', avax: 'avalanche-2', arb: 'arbitrum', op: 'optimism',
};

async function fxRate(from, to) {
  // open endpoint, keyless
  const res = await axios.get(`https://open.er-api.com/v6/latest/${from.toUpperCase()}`, {
    headers: { 'User-Agent': UA }, timeout: 15000,
  });
  const rate = res.data?.rates?.[to.toUpperCase()];
  if (!rate) throw new Error(`Pair ${from}/${to} not available`);
  return {
    from: from.toUpperCase(), to: to.toUpperCase(), rate,
    updated: res.data?.time_last_update_utc,
  };
}

async function topCrypto(n = 8) {
  const res = await axios.get('https://api.coingecko.com/api/v3/coins/markets', {
    params: { vs_currency: 'usd', order: 'market_cap_desc', per_page: n, page: 1, price_change_percentage: '24h' },
    headers: { 'User-Agent': UA }, timeout: 15000,
  });
  return (res.data || []).map(c => ({
    name: c.name, sym: c.symbol.toUpperCase(), price: c.current_price,
    change: c.price_change_percentage_24h, cap: c.market_cap,
  }));
}

module.exports = {
  weather, wmoInfo,
  prayerTimes, qiblaDirection,
  cryptoPrice, CRYPTO_MAP, topCrypto, fxRate,
};
