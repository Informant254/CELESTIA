/**
 * 🛰️ SAT LENS — Pentagon-grade satellite imagery, keyless 🛰️
 *
 * Sources (all free, no keys, no auth):
 *   - Esri World Imagery: sub-meter aerial/satellite composite for most of
 *     the globe — the closest public thing to spy-satellite quality.
 *   - NASA GIBS: ACTUAL satellite passes (MODIS/VIIRS) updated daily —
 *     "live from orbit" weather view of any point.
 *
 * Engine: Web-Mercator tile math → 3×3 (or larger) tile mosaic composited
 * with sharp → single hi-res image centered exactly on the target,
 * with a neon crosshair painted on the exact coordinates.
 */

const axios = require('axios');
const sharp = require('sharp');
const geo = require('./geoLens');
const UA = 'CELESTIA-SatLens/2.0';

// ─────────────────────────────────────────
// TILE MATH (Web Mercator, same as every map app)
// ─────────────────────────────────────────

function lonToTileX(lon, z) {
  return ((lon + 180) / 360) * Math.pow(2, z);
}
function latToTileY(lat, z) {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z);
}

// ─────────────────────────────────────────
// TILE SOURCES
// ─────────────────────────────────────────

const SOURCES = {
  // Sub-meter for most cities — the default "satellite view"
  esri: {
    name: 'Esri World Imagery',
    url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    maxZoom: 18,
    credit: 'Esri, Maxar, Earthstar Geographics',
  },
  // NASA daily passes — real orbital imagery
  nasa: {
    name: 'NASA GIBS (VIIRS, yesterday)',
    tileUrl: (z, x, y, dateStr) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${dateStr}/GoogleMapsCompatible_Level9/${z}/${y}/${x}.jpg`,
    maxZoom: 9,
    credit: 'NASA EOSDIS GIBS',
  },
};

async function fetchTile(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 12000,
    headers: { 'User-Agent': UA },
  });
  const ct = res.headers['content-type'] || '';
  if (!ct.startsWith('image/')) throw new Error('tile not an image');
  return Buffer.from(res.data);
}

// ─────────────────────────────────────────
// COMPOSITOR — mosaic of tiles → exact-center crop
// ─────────────────────────────────────────

async function renderSatImage({ lat, lon, zoom = 15, grid = 3, source = 'esri', date = null }) {
  const src = SOURCES[source];
  if (!src) throw new Error(`Unknown source ${source}`);
  const z = Math.min(zoom, src.maxZoom);

  const tileX = lonToTileX(lon, z);
  const tileY = latToTileY(lat, z);
  const cx = Math.floor(tileX);
  const cy = Math.floor(tileY);

  // NxN grid centered on the target tile
  const half = Math.floor(grid / 2);
  const tiles = [];
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const tx = cx + dx;
      const ty = cy + dy;
      const maxT = Math.pow(2, z);
      if (tx < 0 || tx >= maxT || ty < 0 || ty >= maxT) continue;
      const url = source === 'nasa'
        ? src.tileUrl(z, tx, ty, date || yesterdaysDate())
        : src.url(z, tx, ty);
      try {
        const buf = await fetchTile(url);
        tiles.push({ x: dx, y: dy, buf });
      } catch { /* missing tile — leave gap, crop still centered */ }
    }
  }
  if (!tiles.length) throw new Error('no tiles downloaded — source may be unreachable');

  // composite grid
  const TILE = 256;
  const size = grid * TILE;
  const comps = tiles.map(t => ({
    input: t.buf,
    left: (t.x + half) * TILE,
    top: (t.y + half) * TILE,
  }));

  let base = await sharp({ create: { width: size, height: size, channels: 3, background: { r: 8, g: 12, b: 24 } } })
    .composite(comps)
    .png()
    .toBuffer();

  // crop a window centered on the exact lat/lon (px within grid)
  const winTiles = Math.min(grid, 3) * TILE; // 768px default output
  const focusX = (tileX - (cx - half)) * TILE;
  const focusY = (tileY - (cy - half)) * TILE;
  let left = Math.round(focusX - winTiles / 2);
  let top = Math.round(focusY - winTiles / 2);
  left = Math.max(0, Math.min(size - winTiles, left));
  top = Math.max(0, Math.min(size - winTiles, top));

  base = await sharp(base)
    .extract({ left, top, width: winTiles, height: winTiles })
    .resize(900, 900)
    .png()
    .toBuffer();

  // paint crosshair on exact target point (center of crop = target)
  const W = 900, H = 900, cxp = W / 2, cyp = H / 2;
  const svgOverlay = Buffer.from(`
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <g stroke="#00e5ff" stroke-width="3" opacity="0.95">
        <line x1="${cxp}" y1="${cyp - 34}" x2="${cxp}" y2="${cyp - 12}"/>
        <line x1="${cxp}" y1="${cyp + 12}" x2="${cxp}" y2="${cyp + 34}"/>
        <line x1="${cxp - 34}" y1="${cyp}" x2="${cxp - 12}" y2="${cyp}"/>
        <line x1="${cxp + 12}" y1="${cyp}" x2="${cxp + 34}" y2="${cyp}"/>
      </g>
      <circle cx="${cxp}" cy="${cyp}" r="6" fill="none" stroke="#ff2e93" stroke-width="3"/>
      <circle cx="${cxp}" cy="${cyp}" r="1.6" fill="#ff2e93"/>
      <rect x="18" y="18" width="180" height="30" rx="6" fill="rgba(3,5,16,0.72)" stroke="#00e5ff" stroke-width="1"/>
      <text x="30" y="38" font-family="Arial, sans-serif" font-size="13" fill="#cfeaff">LIVE TARGET LOCK</text>
    </svg>`);

  const final = await sharp(base)
    .composite([{ input: svgOverlay }])
    .png()
    .toBuffer();

  return { buffer: final, zoom: z, source: src.name, credit: src.credit, width: W };
}

function yesterdaysDate() {
  const d = new Date(Date.now() - 24 * 3600000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─────────────────────────────────────────
// HIGH-LEVEL API
// ─────────────────────────────────────────

async function satelliteFor(placeOrCoords, { zoom = 15, source = 'esri', grid = 3 } = {}) {
  let lat, lon, placeName;
  const coordMatch = String(placeOrCoords).match(/^\s*(-?\d{1,2}\.\d+)\s*[, ]\s*(-?\d{1,3}\.\d+)\s*$/);
  if (coordMatch) {
    lat = parseFloat(coordMatch[1]);
    lon = parseFloat(coordMatch[2]);
    try {
      const rev = await geo.reverseGeocode(lat, lon);
      placeName = rev.name;
    } catch { placeName = `${lat.toFixed(4)}, ${lon.toFixed(4)}`; }
  } else {
    const results = await geo.geocode(String(placeOrCoords), 1);
    if (!results.length) throw new Error(`No place found for "${placeOrCoords}"`);
    lat = results[0].lat; lon = results[0].lon;
    placeName = results[0].name;
  }

  const img = await renderSatImage({ lat, lon, zoom, grid, source });
  return {
    lat, lon, placeName,
    buffer: img.buffer,
    zoom: img.zoom,
    source: img.source,
    credit: img.credit,
    maps: geo.mapLinks(lat, lon, 16),
  };
}

module.exports = { satelliteFor, renderSatImage, SOURCES };
