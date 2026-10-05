/**
 * utils/liveSearch.js — live web search.
 *
 * Order:
 *   1. Brave Search API when BRAVE_SEARCH_KEY is set (free tier at
 *      https://brave.com/search/api — reliable from servers).
 *   2. The operator's own SearXNG instance (SEARXNG_URL — self-host this
 *      for commercial use, with JSON enabled).
 *   3. Rotation over public SearXNG instances until one returns real
 *      results. Public instances frequently rate-limit bots, so this
 *      is a best-effort fallback, not a guarantee.
 *
 * Resolves to { results: [{ title, url, snippet }], instance } or throws.
 */
const axios = require('axios');

const DEFAULT_INSTANCES = [
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
  'https://opnxng.com',
  'https://search.hbubli.cc',
  'https://searxng.shreven.org',
];

const INSTANCE_TIMEOUT_MS = 8000;

function instances() {
  const own = String(process.env.SEARXNG_URL || '').trim().replace(/\/+$/, '');
  const list = own ? [own] : [];
  for (const base of DEFAULT_INSTANCES) {
    if (!list.includes(base)) list.push(base);
  }
  return list;
}

function braveKey() {
  return String(process.env.BRAVE_SEARCH_KEY || process.env.BRAVE_SEARCH_API_KEY || '').trim();
}

function clean(str, max = 220) {
  return String(str || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function queryBrave(query, limit) {
  const key = braveKey();
  if (!key) return null;
  const r = await axios.get('https://api.search.brave.com/res/v1/web/search', {
    params: { q: query, count: Math.min(Math.max(limit, 1), 10) },
    timeout: 15000,
    headers: { 'X-Subscription-Token': key, Accept: 'application/json' },
    maxContentLength: 2 * 1024 * 1024,
  });
  const raw = Array.isArray(r.data?.web?.results) ? r.data.web.results : [];
  const results = [];
  for (const item of raw) {
    if (!item?.url || !/^https?:\/\//.test(item.url)) continue;
    results.push({
      title: clean(item.title, 120) || item.url,
      url: item.url,
      snippet: clean(item.description, 220),
    });
    if (results.length >= limit) break;
  }
  return { results, instance: 'brave' };
}

async function queryInstance(base, query, limit) {
  const r = await axios.get(base + '/search', {
    params: { q: query, format: 'json', language: 'en' },
    timeout: INSTANCE_TIMEOUT_MS,
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
  try {
    const brave = await queryBrave(q, limit);
    if (brave?.results?.length) return brave;
    if (brave) errs.push('brave: no results');
  } catch (e) {
    errs.push('brave: ' + (e.response?.status || e.code || e.message));
  }
  for (const base of instances()) {
    try {
      const results = await queryInstance(base, q, limit);
      if (results.length) return { results, instance: base };
      errs.push(base + ': no results');
    } catch (e) {
      errs.push(base + ': ' + (e.response?.status || e.code || e.message));
    }
  }
  throw new Error('Live search is offline right now (' + errs.slice(0, 3).join(' · ') + '). Set BRAVE_SEARCH_KEY or SEARXNG_URL for reliable results.');
}

module.exports = { searchWeb, instances, queryInstance, queryBrave, braveKey };
