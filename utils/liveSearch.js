/**
 * utils/liveSearch.js — live web search via SearXNG metasearch.
 *
 * Tries the operator's own instance first (SEARXNG_URL — self-host this for
 * commercial use, with JSON enabled), then rotates public instances until
 * one returns real results. First success wins; everything else is skipped.
 * Resolves to { results: [{ title, url, snippet }], instance } or throws.
 */
const axios = require('axios');

const DEFAULT_INSTANCES = [
  'https://search.sethforprivacy.com',
  'https://searx.be',
  'https://baresearch.org',
  'https://search.inetol.net',
  'https://search.rhscz.eu',
  'https://priv.au',
  'https://sx.catgirl.cloud',
  'https://searx.tiekoetter.com',
  'https://search.leptons.xyz',
  'https://searxng.viking-sec.xyz',
  'https://jmsearxng.org',
];

function instances() {
  const own = String(process.env.SEARXNG_URL || '').trim().replace(/\/+$/, '');
  const list = own ? [own] : [];
  for (const base of DEFAULT_INSTANCES) {
    if (!list.includes(base)) list.push(base);
  }
  return list;
}

function clean(str, max = 220) {
  return String(str || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function queryInstance(base, query, limit) {
  const r = await axios.get(base + '/search', {
    params: { q: query, format: 'json', language: 'en' },
    timeout: 15000,
    headers: { 'User-Agent': 'CELESTIA-Bot/2.0 (WhatsApp live search)' },
    maxContentLength: 2 * 1024 * 1024,
  });
  const raw = Array.isArray(r.data?.results) ? r.data.results : [];
  const results = [];
  for (const item of raw) {
    if (!item?.url || !/^https?:\/\//.test(item.url)) continue;
    results.push({
      title: clean(item.title, 120) || item.url,
      url: item.url,
      snippet: clean(item.content, 220),
    });
    if (results.length >= limit) break;
  }
  return results;
}

async function searchWeb(query, limit = 5) {
  const q = String(query || '').trim().slice(0, 200);
  if (!q) throw new Error('Empty search query.');
  const errs = [];
  for (const base of instances()) {
    try {
      const results = await queryInstance(base, q, limit);
      if (results.length) return { results, instance: base };
      errs.push(base + ': no results');
    } catch (e) {
      errs.push(base + ': ' + (e.response?.status || e.code || e.message));
    }
  }
  throw new Error('Live search is offline right now (' + errs.slice(0, 3).join(' · ') + '). Try again later.');
}

module.exports = { searchWeb, instances, queryInstance };
