/**
 * 🚀 SPACE — APOD, Mars weather, ISS overhead passes 🚀
 * All keyless: NASA APOD (demo key), NASA Insight Mars (inactive but archived),
 * Open Notify / wheretheiss.at for ISS.
 */

const axios = require('axios');
const geo = require('./geoLens');
const UA = 'CELESTIA-Space/2.0';

// ─── APOD — Astronomy Picture of the Day ───
async function apod() {
  const res = await axios.get('https://api.nasa.gov/planetary/apod', {
    params: { api_key: 'DEMO_KEY' },
    headers: { 'User-Agent': UA }, timeout: 15000,
  });
  const d = res.data;
  return {
    title: d.title,
    explanation: (d.explanation || '').slice(0, 700),
    url: d.url,
    hdurl: d.hdurl,
    date: d.date,
    copyright: d.copyright || 'NASA',
    type: d.media_type,
  };
}

// ─── MARS — latest archived Insight weather (mission ended 2022; data preserved) ───
async function mars() {
  const res = await axios.get('https://api.nasa.gov/insight_weather/', {
    params: { api_key: 'DEMO_KEY', feedtype: 'json', ver: '1.0' },
    headers: { 'User-Agent': UA }, timeout: 15000,
  });
  const d = res.data;
  const sols = d.sol_keys || [];
  const last = sols[sols.length - 1];
  if (!last) throw new Error('no Mars data available');
  const s = d[last];
  return {
    sol: last,
    season: s.Season,
    temp: s.AT?.av ? Math.round(s.AT.av) : null,
    tempMin: s.AT?.mn ? Math.round(s.AT.mn) : null,
    tempMax: s.AT?.mx ? Math.round(s.AT.mx) : null,
    pressure: s.PRE?.av ? Math.round(s.PRE.av) : null,
    wind: s.HWS?.av ? s.HWS.av.toFixed(1) : null,
    note: 'InSight retired Dec 2022 — final mission data',
  };
}

// ─── ISS — where it is NOW + your next overhead pass ───
async function issNow() {
  const res = await axios.get('https://api.wheretheiss.at/v1/satellites/25544', {
    headers: { 'User-Agent': UA }, timeout: 12000,
  });
  const d = res.data;
  let placeName = 'open ocean';
  try {
    const rev = await geo.reverseGeocode(d.latitude, d.longitude);
    placeName = rev.name.split(',').slice(0, 2).join(', ');
  } catch { /* over water — fine */ }
  return {
    lat: d.latitude, lon: d.longitude,
    velocity: Math.round(d.velocity),
    altitude: d.altitude,
    place: placeName,
    map: geo.mapLinks(d.latitude, d.longitude, 4),
  };
}

// Next overhead pass — computes when ISS (92.68 min period, 51.6° inclination)
// crosses near your sky. Approximation: sample positions over next 90 min.
async function issPass(lat, lon, minutes = 90) {
  const now = Date.now();
  const sampleEvery = 30; // seconds
  let best = null;
  for (let t = 0; t <= minutes * 60; t += sampleEvery) {
    // fetch predicted position
    const ts = new Date(now + t * 1000).toISOString();
    try {
      const res = await axios.get(`https://api.wheretheiss.at/v1/satellites/25544/positions`, {
        params: { timestamps: Math.floor((now + t * 1000) / 1000) },
        headers: { 'User-Agent': UA }, timeout: 8000,
      });
      const p = res.data?.[0];
      if (!p) continue;
      const dist = geo.haversineKm(lat, lon, p.latitude, p.longitude);
      if (!best || dist < best.dist) {
        best = { dist, at: new Date(p.timestamp * 1000), lat: p.latitude, lon: p.longitude };
      }
      if (best.dist < 300) break; // close enough — overhead-ish
    } catch { /* skip sample */ }
  }
  return best; // may be null if all samples failed
}

module.exports = { apod, mars, issNow, issPass };
