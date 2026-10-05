/**
 * Live web search with freshness-aware news ranking.
 *
 * Provider order is Brave (when configured), the operator's SearXNG instance,
 * then public SearXNG instances as a best-effort fallback.
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
const NEWS_CANDIDATE_LIMIT = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_INTENT = /\b(?:this|past|last|previous)\s+week\b|\bpast\s+(?:7|seven)\s+days?\b/i;
const STRONG_NEWS_INTENT = /\b(?:breaking|trending|news|headlines?|current\s+events?)\b/i;
const FRESHNESS_INTENT = /\b(?:today|latest|current|currently|recent|yesterday|tonight|now)\b|\bjust\s+now\b|\blast\s+(?:24|twenty[- ]four)\s+hours?\b/i;
const NEWS_CONTEXT = /\b(?:gossip|stories?|reports?|updates?|events?|politics|elections?|entertainment|celebrit(?:y|ies)|sports?|business|technology|tech|world|local|kenya(?:n)?|nairobi)\b/i;
const SOCIAL_QUERY = /\b(?:facebook|instagram|twitter|tiktok|social\s+media|tweet|tweets|profile|profiles)\b|\bx\.com\b/i;
const SOCIAL_HOSTS = [
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
  'threads.net',
  'youtube.com',
  'youtu.be',
  'linkedin.com',
  'pinterest.com',
  'snapchat.com',
];
const NEWS_HOST_HINTS = [
  'reuters.com',
  'apnews.com',
  'bbc.',
  'cnn.com',
  'aljazeera.com',
  'nation.africa',
  'standardmedia.co.ke',
  'citizen.digital',
  'the-star.co.ke',
  'capitalfm.co.ke',
  'businessdailyafrica.com',
  'nairobian.com',
  'nairobileo.co.ke',
  'nairobigossipclub.co.ke',
  'tuko.co.ke',
  'pulse.co.ke',
  'k24tv.co.ke',
  'peopledaily.digital',
  'mpasho.co.ke',
];

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

function detectSearchIntent(query) {
  const q = clean(query, 200);
  const hasNewsContext = STRONG_NEWS_INTENT.test(q) || NEWS_CONTEXT.test(q);
  if (WEEK_INTENT.test(q) && hasNewsContext) {
    return { mode: 'NEWS', timeRange: 'week', freshnessMs: 7 * DAY_MS };
  }
  if (STRONG_NEWS_INTENT.test(q) || FRESHNESS_INTENT.test(q) && hasNewsContext) {
    const freshnessMs = /\byesterday\b/i.test(q) ? 2 * DAY_MS : DAY_MS;
    return { mode: 'NEWS', timeRange: 'day', freshnessMs };
  }
  return { mode: 'WEB', timeRange: null, freshnessMs: null };
}

function rewriteNewsQuery(query) {
  let rewritten = clean(query, 200);
  if (/\bnairobi\b/i.test(rewritten) && /\bgossip\b/i.test(rewritten)) {
    const period = WEEK_INTENT.test(rewritten) ? 'this week' : 'today';
    return `Nairobi trending entertainment news Kenya ${period}`;
  }
  if (/\bgossip\b/i.test(rewritten)) {
    rewritten = rewritten.replace(/\bgossip\b/gi, 'entertainment');
  }
  if (/\bnairobi\b/i.test(rewritten) && !/\bkenya(?:n)?\b/i.test(rewritten)) {
    rewritten += ' Kenya';
  }
  return clean(rewritten, 200);
}

function parsePublishedDate(value, now = Date.now()) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    const millis = value < 10_000_000_000 ? value * 1000 : value;
    return Number.isFinite(millis) ? millis : null;
  }
  const text = clean(value, 100);
  const relative = text.match(/^(\d+)\s*(minute|hour|day|week)s?\s+ago$/i);
  if (relative) {
    const units = { minute: 60_000, hour: 3_600_000, day: DAY_MS, week: 7 * DAY_MS };
    return now - Number(relative[1]) * units[relative[2].toLowerCase()];
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function sourceName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function normalizeResult(item, sourceType) {
  if (!item?.url || !/^https?:\/\//i.test(item.url)) return null;
  const publishedValue = sourceType === 'brave'
    ? item.page_age || item.age || item.published_date
    : item.publishedDate || item.pubdate || item.published_date || item.date;
  const publishedMillis = parsePublishedDate(publishedValue);
  return {
    title: clean(item.title, 160) || item.url,
    url: item.url,
    snippet: clean(sourceType === 'brave' ? item.description : item.content, 320),
    source: sourceName(item.url),
    publishedAt: publishedMillis ? new Date(publishedMillis).toISOString() : null,
  };
}

async function queryBrave(query, limit, options = {}) {
  const key = braveKey();
  if (!key) return null;
  const params = { q: query, count: Math.min(Math.max(limit, 1), 20), search_lang: 'en', safesearch: 'moderate' };
  if (options.mode === 'NEWS') params.freshness = options.timeRange === 'week' ? 'pw' : 'pd';
  const r = await axios.get('https://api.search.brave.com/res/v1/web/search', {
    params,
    timeout: 15000,
    headers: { 'X-Subscription-Token': key, Accept: 'application/json' },
    maxContentLength: 2 * 1024 * 1024,
  });
  const raw = Array.isArray(r.data?.web?.results) ? r.data.web.results : [];
  const results = raw.map((item) => normalizeResult(item, 'brave')).filter(Boolean).slice(0, limit);
  return { results, instance: 'brave' };
}

async function queryInstance(base, query, limit, options = {}) {
  const params = { q: query, format: 'json', language: 'en' };
  if (options.mode === 'NEWS') {
    params.categories = 'news';
    params.time_range = options.timeRange;
    params.safesearch = '1';
  }
  const r = await axios.get(base + '/search', {
    params,
    timeout: INSTANCE_TIMEOUT_MS,
    headers: { 'User-Agent': 'CELESTIA-Bot/2.0 (WhatsApp live search)' },
    maxContentLength: 2 * 1024 * 1024,
  });
  const raw = Array.isArray(r.data?.results) ? r.data.results : [];
  return raw.map((item) => normalizeResult(item, 'searxng')).filter(Boolean).slice(0, limit);
}

function hostMatches(host, domains) {
  return domains.some((domain) => host === domain || host.endsWith('.' + domain) || domain.endsWith('.') && host.includes(domain));
}

function resultShape(result) {
  try {
    const url = new URL(result.url);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const segments = path.split('/').filter(Boolean);
    const listingPrefixes = /^(?:author|authors|category|categories|tag|tags|topic|topics|profile|profiles|people|search|users?|channel|channels)$/i;
    const listing = segments.some((segment) => listingPrefixes.test(segment)) || (
      /^(?:news|latest|entertainment)$/i.test(segments[0] || '') &&
      segments.length <= 2 &&
      !/[-_]|\d/.test(segments[1] || '')
    );
    const homepage = path === '/' || /^\/(?:home|index(?:\.html?)?|news|latest|category|entertainment)$/i.test(path) || listing;
    const article = !homepage && (
      segments.length >= 2 ||
      /\/20\d{2}\/(?:0?[1-9]|1[0-2])\//.test(path) ||
      /[-_][a-z0-9]{3,}[-_][a-z0-9]{3,}/i.test(path) ||
      /\.(?:html?|shtml)$/i.test(path)
    );
    return {
      host,
      homepage,
      article,
      social: hostMatches(host, SOCIAL_HOSTS),
      reputable: hostMatches(host, NEWS_HOST_HINTS) || /(?:news|daily|times|post|standard|nation|media)/i.test(host),
    };
  } catch {
    return { host: '', homepage: true, article: false, social: false, reputable: false };
  }
}

function canonicalUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|fbclid|gclid|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    }
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString().toLowerCase();
  } catch {
    return String(value).toLowerCase();
  }
}

function titleTokens(title) {
  return new Set(clean(title, 200).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((word) => word.length > 2));
}

function similarTitles(a, b) {
  const left = titleTokens(a);
  const right = titleTokens(b);
  if (!left.size || !right.size) return false;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  const union = new Set([...left, ...right]).size;
  return intersection / union >= 0.8;
}

function mentionsPastYear(result, now) {
  const currentYear = new Date(now).getUTCFullYear();
  const years = `${result.title} ${result.snippet}`.match(/\b20\d{2}\b/g) || [];
  return years.some((year) => Number(year) < currentYear);
}

function rankNewsResults(input, intent, query, limit = 5, now = Date.now()) {
  const allowSocial = SOCIAL_QUERY.test(query);
  const earliest = now - intent.freshnessMs;
  const ranked = [];

  for (const result of input) {
    const shape = resultShape(result);
    const published = parsePublishedDate(result.publishedAt, now);
    if (published && (published < earliest || published > now + 6 * 60 * 60 * 1000)) continue;
    if (!published && mentionsPastYear(result, now)) continue;

    let score = 0;
    if (published) score += 45 - Math.min(35, ((now - published) / intent.freshnessMs) * 35);
    if (shape.article) score += 35;
    if (shape.reputable) score += 15;
    if (result.snippet.length >= 60) score += 8;
    if (shape.homepage) score -= 45;
    if (shape.social && !allowSocial) score -= 80;
    ranked.push({ ...result, _shape: shape, _score: score });
  }

  ranked.sort((a, b) => b._score - a._score);
  const direct = ranked.filter((result) => result._shape.article && (!result._shape.social || allowSocial));
  const nonSocial = ranked.filter((result) => !result._shape.social || allowSocial);
  const pool = direct.length ? direct : nonSocial.length ? nonSocial : ranked;
  const deduped = [];
  for (const result of pool) {
    const duplicate = deduped.some((existing) => (
      canonicalUrl(existing.url) === canonicalUrl(result.url) || similarTitles(existing.title, result.title)
    ));
    if (!duplicate) deduped.push(result);
    if (deduped.length >= limit) break;
  }
  return deduped.map(({ _shape, _score, ...result }) => result);
}

function qualityArticleCount(results, query) {
  const allowSocial = SOCIAL_QUERY.test(query);
  return results.filter((result) => {
    const shape = resultShape(result);
    return shape.article && (!shape.social || allowSocial);
  }).length;
}

async function fetchCandidates(query, limit, options, errors, acceptResults) {
  let weakResponse = null;
  try {
    const brave = await queryBrave(query, limit, options);
    if (brave?.results?.length) {
      if (!acceptResults || acceptResults(brave.results)) return brave;
      weakResponse = brave;
    } else if (brave) errors.push('brave: no results');
  } catch (error) {
    errors.push('brave: ' + (error.response?.status || error.code || error.message));
  }

  const own = String(process.env.SEARXNG_URL || '').trim().replace(/\/+$/, '');
  for (const base of instances()) {
    try {
      const results = await queryInstance(base, query, limit, options);
      if (results.length) {
        const response = { results, instance: base };
        if (!acceptResults || acceptResults(results) || base === own) return response;
        weakResponse ||= response;
      } else errors.push(base + ': no results');
    } catch (error) {
      errors.push(base + ': ' + (error.response?.status || error.code || error.message));
    }
  }
  return weakResponse;
}

function offlineError(errors) {
  return new Error('Live search is offline right now (' + errors.slice(0, 3).join(' · ') + '). Set BRAVE_SEARCH_KEY or SEARXNG_URL for reliable results.');
}

async function searchWeb(query, limit = 5) {
  const q = clean(query, 200);
  if (!q) throw new Error('Empty search query.');
  const intent = detectSearchIntent(q);
  const errors = [];
  console.log(`[CELESTIA SEARCH] mode=${intent.mode}`);

  if (intent.mode === 'WEB') {
    const response = await fetchCandidates(q, limit, intent, errors);
    if (!response) throw offlineError(errors);
    console.log(`[CELESTIA SEARCH] raw_results=${response.results.length}`);
    console.log(`[CELESTIA SEARCH] filtered_results=${response.results.length}`);
    return { ...response, mode: 'WEB', timeRange: null, usedFallback: false };
  }

  console.log(`[CELESTIA SEARCH] time_range=${intent.timeRange}`);
  const searchQuery = rewriteNewsQuery(q);
  if (searchQuery !== q) console.log(`[CELESTIA SEARCH] query_rewritten=${searchQuery}`);
  const hasFreshArticle = (results) => {
    const ranked = rankNewsResults(results, intent, q, limit);
    return qualityArticleCount(ranked, q) > 0;
  };
  const news = await fetchCandidates(searchQuery, NEWS_CANDIDATE_LIMIT, intent, errors, hasFreshArticle);
  let raw = news?.results || [];
  let instance = news?.instance || null;
  let filtered = rankNewsResults(raw, intent, q, limit);
  let usedFallback = false;

  if (qualityArticleCount(filtered, q) < Math.min(3, limit)) {
    usedFallback = true;
    console.log('[CELESTIA SEARCH] fallback=WEB');
    const general = await fetchCandidates(searchQuery, NEWS_CANDIDATE_LIMIT, { mode: 'WEB' }, errors, hasFreshArticle);
    if (general) {
      raw = raw.concat(general.results);
      instance = instance || general.instance;
      filtered = rankNewsResults(raw, intent, q, limit);
    }
  }

  console.log(`[CELESTIA SEARCH] raw_results=${raw.length}`);
  console.log(`[CELESTIA SEARCH] filtered_results=${filtered.length}`);
  if (!filtered.length) {
    if (!news && !instance) throw offlineError(errors);
    throw new Error(`No verifiably recent news results were found for "${q}". Try a more specific news query.`);
  }
  return { results: filtered, instance, mode: 'NEWS', timeRange: intent.timeRange, usedFallback };
}

function formatPublishedDate(value, now = Date.now()) {
  const published = parsePublishedDate(value, now);
  if (!published) return 'Not provided by source';
  const age = Math.max(0, now - published);
  if (age < 60 * 60 * 1000) {
    const minutes = Math.max(1, Math.floor(age / 60_000));
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  if (age < DAY_MS) {
    const hours = Math.floor(age / 3_600_000);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  if (age < 2 * DAY_MS) return 'Yesterday';
  return `${Math.floor(age / DAY_MS)} days ago`;
}

module.exports = {
  searchWeb,
  instances,
  queryInstance,
  queryBrave,
  braveKey,
  detectSearchIntent,
  rewriteNewsQuery,
  parsePublishedDate,
  rankNewsResults,
  formatPublishedDate,
  resultShape,
};
