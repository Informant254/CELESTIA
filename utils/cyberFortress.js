/**
 * ⚔️ CYBER FORTRESS — CELESTIA's Security Intelligence Engine ⚔️
 *
 * Defensive-only toolkit. The wolf guards; it does not hunt the innocent.
 *
 * Modules:
 *   - Crypto lab      : hash anything, identify hashes, analyze password strength
 *   - Threat intel    : CVE lookup (NVD), CISA KEV (actively exploited vulns)
 *   - Network intel   : IP geolocation/ASN, DNS recon, RDAP whois
 *   - Exposure        : breach check (HIBP), phishing URL heuristics
 *
 * All network lookups use public APIs (NVD, RDAP, DNS over HTTPS, ipwho.is).
 * Rate limits respected. No key required for basic use.
 */

const crypto = require('crypto');
const axios = require('axios');

const UA = 'CELESTIA-CyberFortress/2.0 (defensive research)';

// ─────────────────────────────────────────────
// CRYPTO LAB
// ─────────────────────────────────────────────

function hashAll(text) {
  const data = Buffer.from(String(text), 'utf8');
  const murmurFaked = null; // murmur needs custom impl; we skip
  return {
    md4: null,
    md5: crypto.createHash('md5').update(data).digest('hex'),
    sha1: crypto.createHash('sha1').update(data).digest('hex'),
    sha224: crypto.createHash('sha224').update(data).digest('hex'),
    sha256: crypto.createHash('sha256').update(data).digest('hex'),
    sha384: crypto.createHash('sha384').update(data).digest('hex'),
    sha512: crypto.createHash('sha512').update(data).digest('hex'),
    sha3_256: crypto.createHash('sha3-256').update(data).digest('hex'),
    sha3_512: crypto.createHash('sha3-512').update(data).digest('hex'),
    ripemd160: crypto.createHash('ripemd160').update(data).digest('hex'),
    crc32: crc32(data).toString(16).padStart(8, '0'),
    base64: data.toString('base64'),
    base32: base32Encode(data),
    hex: data.toString('hex'),
  };
}

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function base32Encode(buf) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0, out = '';
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}

// Identify hash types by length + charset
const HASH_PATTERNS = [
  { len: 32, hex: true, type: 'MD5 (also: MD4, LM, NTLM candidates, MD5crypt variants)' },
  { len: 40, hex: true, type: 'SHA-1 (also: RIPEMD-160, MySQL5)' },
  { len: 64, hex: true, type: 'SHA-256 (also: SHA3-256, BLAKE2s-256, Keccak-256)' },
  { len: 96, hex: true, type: 'SHA-384 (also: Keccak-384)' },
  { len: 128, hex: true, type: 'SHA-512 (also: Keccak-512, WHIRLPOOL, BLAKE2b)' },
  { len: 56, hex: true, type: 'SHA-224 (also: Keccak-224)' },
  { len: 8, hex: true, type: 'CRC32 / CRC32C' },
  { len: 16, hex: true, type: 'MD5 half / MySQL old / DES crypt fragment' },
  { len: 34, hex: true, type: 'MD5 raw (16 bytes as hex without length match?)' },
  { len: 41, hex: false, type: 'MySQL5 PASSWORD() — *SHA1(SHA1(pass))' },
];

function identifyHash(str) {
  const s = String(str).trim();
  const isHex = /^[0-9a-fA-F]+$/.test(s);
  const p = HASH_PATTERNS.find(h => h.len === s.length && (!h.hex || isHex));
  const candidates = [];
  if (p) candidates.push(p.type);

  // bcrypt
  if (/^\$2[aby]\$/.test(s)) candidates.push('bcrypt (password hashing)');
  if (/^\$6\$/.test(s)) candidates.push('sha512crypt (Linux shadow)');
  if (/^\$5\$/.test(s)) candidates.push('sha256crypt (Linux shadow)');
  if (/^\$argon2(id|i|d)\$/.test(s)) candidates.push('Argon2 (modern KDF)');
  if (/^\$pbkdf2(-sha\d+)?\$/.test(s)) candidates.push('PBKDF2');
  if (s.startsWith('*') && s.length === 41) candidates.push('MySQL5 PASSWORD()');
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(s) && s.length % 4 === 0 && s.length > 8) candidates.push('Possibly Base64');
  if (/^[A-Z2-7]+=*$/.test(s) && s.length % 8 === 0 && s.length > 8) candidates.push('Possibly Base32');
  if (s.length === 64 && /^[0-9a-f]{64}$/i.test(s)) candidates.push('Also possible: SHA-256 API key, git commit SHA');

  return {
    input: s,
    length: s.length,
    charset: isHex ? 'hex' : (/^[A-Za-z0-9+/=]+$/.test(s) ? 'base64ish' : 'mixed'),
    candidates: [...new Set(candidates)],
    verdict: candidates.length ? `Likely: ${candidates[0]}` : 'Unknown format — not a common hash length/charset',
  };
}

// Password strength analysis (local heuristics only — nothing leaves this server)
function analyzePassword(pw) {
  const p = String(pw);
  const findings = [];
  let score = 0;

  if (p.length >= 8) score += 1; else findings.push('⚠️ Under 8 chars');
  if (p.length >= 12) score += 1;
  if (p.length >= 16) score += 1; else if (p.length < 16) findings.push('💡 16+ chars is the modern standard');
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score += 1; else findings.push('⚠️ Mixed case missing');
  if (/\d/.test(p)) score += 1; else findings.push('⚠️ No digits');
  if (/[^A-Za-z0-9]/.test(p)) score += 1; else findings.push('⚠️ No symbols');

  const weakPatterns = [
    { re: /^[a-z]+$/, note: 'all lowercase letters only' },
    { re: /^\d+$/, note: 'all digits only' },
    { re: /(.)\1{2,}/, note: 'repeated character runs (aaa, 111)' },
    { re: /password|qwerty|azerty|admin|letmein|welcome|monkey|dragon|iloveyou|sunshine|princess/i, note: 'contains a top-common password word' },
    { re: /20[0-2]\d/, note: 'contains a year (guessable)' },
    { re: /^([a-z]+)([0-9]{1,4})$/i, note: 'word+digits classic pattern (cracked first)' },
  ];
  for (const w of weakPatterns) {
    if (w.re.test(p)) findings.push(`🚨 Pattern: ${w.note}`);
  }

  // charset entropy estimate
  let pool = 0;
  if (/[a-z]/.test(p)) pool += 26;
  if (/[A-Z]/.test(p)) pool += 26;
  if (/\d/.test(p)) pool += 10;
  if (/[^A-Za-z0-9]/.test(p)) pool += 33;
  const entropy = p.length * Math.log2(pool || 1);
  const guesses = Math.pow(2, entropy);
  const guessesStr = entropy > 80 ? '10^24+' : entropy > 60 ? '10^18' : entropy > 40 ? '10^12' : entropy > 25 ? '10^7' : '10^4';

  // offline crack estimates (RTX offline bcrypt? we use sha256 @ 100GH/s typical GPU rig)
  const seconds = guesses / 1e11; // very rough upper-bound GPU vs fast hash
  const crackTime = fmtTime(seconds);

  const label = entropy >= 80 ? 'FORTRESS 🏰' : entropy >= 60 ? 'STRONG 💪' : entropy >= 40 ? 'MODERATE ⚖️' : entropy >= 25 ? 'WEAK 🌧️' : 'CRITICAL 💀';

  return {
    score: `${score}/6`,
    entropyBits: Math.round(entropy),
    label,
    crackTime: crackTime.human,
    findings,
  };
}

function fmtTime(seconds) {
  if (isNaN(seconds) || !isFinite(seconds)) return { human: 'eternity (heat death of universe)', seconds };
  if (seconds < 1) return { human: 'instantly 💀', seconds };
  if (seconds < 60) return { human: `${Math.round(seconds)} seconds`, seconds };
  if (seconds < 3600) return { human: `${Math.round(seconds / 60)} minutes`, seconds };
  if (seconds < 86400) return { human: `${Math.round(seconds / 3600)} hours`, seconds };
  if (seconds < 31557600) return { human: `${(seconds / 86400).toFixed(1)} days`, seconds };
  const years = seconds / 31557600;
  if (years > 1e12) return { human: 'billions of years 🌌', seconds };
  if (years > 1e6) return { human: `${(years / 1e6).toFixed(1)} million years`, seconds };
  return { human: `${Math.round(years)} years`, seconds };
}

// ─────────────────────────────────────────────
// PHISHING URL HEURISTICS (local, no lookup)
// ─────────────────────────────────────────────

const KNOWN_BRANDS = ['paypal', 'apple', 'microsoft', 'google', 'amazon', 'netflix', 'whatsapp', 'facebook', 'instagram', 'binance', 'coinbase', 'telegram', 'linkedin', 'github', 'steam', 'roblox', 'citibank', 'chase', 'wellsfargo', 'safaricom', 'm-pesa', 'mpesa'];

function analyzeUrl(raw) {
  const findings = [];
  let risk = 0;

  let u;
  try {
    u = new URL(raw.startsWith('http') ? raw : `http://${raw}`);
  } catch {
    return { error: 'Not a parsable URL' };
  }

  const host = u.hostname.toLowerCase();
  const parts = host.split('.');

  // 1. IP as host
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    findings.push('🚨 Raw IP address instead of domain — classic phishing host');
    risk += 30;
  }
  // 2. Punycode / homoglyph
  if (host.includes('xn--')) {
    findings.push('🚨 Punycode (xn--) — possible homoglyph IDN spoof');
    risk += 25;
  }
  // 3. Brand in subdomain but not apex — secure-login.paypal.com.ru
  for (const b of KNOWN_BRANDS) {
    if (host.includes(b)) {
      const apex = parts.slice(-2).join('.');
      if (!apex.startsWith(b)) {
        findings.push(`🚨 Brand "${b}" appears in subdomain but real domain is *${apex}* — brand spoof pattern`);
        risk += 35;
      }
    }
  }
  // 4. Suspicious TLDs
  const riskyTlds = ['zip', 'mov', 'tk', 'ml', 'ga', 'cf', 'gq', 'top', 'xyz', 'click', 'link', 'work', 'rest'];
  const tld = parts[parts.length - 1];
  if (riskyTlds.includes(tld)) {
    findings.push(`⚠️ High-abuse TLD ".${tld}" frequently used in phishing campaigns`);
    risk += 15;
  }
  // 5. Hyphen stuffing
  if ((host.match(/-/g) || []).length >= 2) {
    findings.push('⚠️ Multiple hyphens in hostname — common in spoof domains');
    risk += 10;
  }
  // 6. Long/entropy hostnames
  if (parts[0].length > 20) {
    findings.push('⚠️ Very long leftmost label — algorithm-generated domain');
    risk += 10;
  }
  // 7. Login/auth words in path
  const path = (u.pathname + u.search).toLowerCase();
  if (/login|verify|secure|update|confirm|account|wallet|seed|phrase|recover|unlock/.test(path)) {
    findings.push('⚠️ Credential-harvest keywords in path (login/verify/secure/seed...)');
    risk += 15;
  }
  // 8. URL shortener
  if (/(bit\.ly|tinyurl|t\.co|is\.gd|cutt\.ly|rb\.gy|shorturl|rebrand\.ly)/.test(host)) {
    findings.push('⚠️ URL shortener — destination hidden, expand before trusting');
    risk += 10;
  }
  // 9. Non-https
  if (u.protocol === 'http:') findings.push('ℹ️ Plain HTTP — traffic unencrypted (not necessarily phish, but bad)');
  // 10. @ in URL trick
  if (raw.includes('@') && !raw.includes('@s.whatsapp')) {
    findings.push('🚨 "@" in URL — user-info trick can hide real host');
    risk += 25;
  }
  // 11. Excessive subdomains
  if (parts.length >= 5) {
    findings.push(`⚠️ ${parts.length} labels deep — deep nesting used to bury real domain`);
    risk += 10;
  }

  const verdict = risk >= 50 ? 'HIGH RISK — treat as hostile 🚨'
    : risk >= 25 ? 'SUSPICIOUS — do not enter credentials ⚠️'
    : risk > 0 ? 'Minor flags — stay alert ℹ️'
    : 'No heuristics tripped — still verify by other means ✅';

  return {
    url: u.href,
    host,
    apex: parts.slice(-2).join('.'),
    riskScore: Math.min(risk, 100),
    verdict,
    findings: findings.length ? findings : ['✅ None of the classic phishing heuristics matched'],
  };
}

// ─────────────────────────────────────────────
// NETWORK INTEL (public APIs)
// ─────────────────────────────────────────────

async function ipInfo(ip) {
  const res = await axios.get(`https://ipwho.is/${encodeURIComponent(ip)}`, { headers: { 'User-Agent': UA }, timeout: 15000 });
  const d = res.data;
  if (d.success === false) throw new Error(d.message || 'lookup failed');
  return {
    ip: d.ip, type: d.type,
    country: d.country, region: d.region, city: d.city,
    flag: d.flag?.emoji,
    isp: d.connection?.isp,
    org: d.connection?.org,
    asn: d.connection?.asn ? `AS${d.connection.asn} (${d.connection.domain || 'n/a'})` : null,
    timezone: d.timezone?.id,
  };
}

async function dnsRecon(domain) {
  // DNS over HTTPS via Google — no key needed
  const types = ['A', 'AAAA', 'MX', 'NS', 'TXT'];
  const results = {};
  for (const t of types) {
    try {
      const res = await axios.get('https://dns.google/resolve', {
        params: { name: domain, type: t },
        headers: { 'User-Agent': UA },
        timeout: 12000,
      });
      const answers = (res.data.Answer || []).map(a => `${a.data}`).filter(Boolean);
      if (answers.length) results[t] = [...new Set(answers)];
    } catch { /* type missing */ }
  }
  return results;
}

async function whois(domain) {
  // RDAP is the modern whois. Choose server by TLD guess; fall back to rdap.org.
  let url;
  try {
    // Try IANA bootstrap via rdap.org redirector
    url = `https://rdap.org/domain/${encodeURIComponent(domain)}`;
    const res = await axios.get(url, { headers: { Accept: 'application/rdap+json', 'User-Agent': UA }, timeout: 15000 });
    const d = res.data;
    const pick = (type) => {
      const e = (d.events || []).find(ev => ev.eventAction === type);
      return e ? e.eventDate : null;
    };
    const getEntity = (role) => {
      const ent = (d.entities || []).find(en => (en.roles || []).includes(role));
      if (!ent) return null;
      // Prefer vcard fn; fall back to handle
      try {
        const fn = ent.vcardArray?.[1]?.find(f => f[0] === 'fn')?.[3];
        return fn || ent.handle || role;
      } catch {
        return ent.handle || role;
      }
    };
    const nameservers = (d.nameservers || []).map(ns => ns.ldhName).filter(Boolean);
    const status = d.status || [];
    return {
      domain: d.ldhName,
      registrar: getEntity('registrar'),
      creation: pick('registration'),
      updated: pick('last changed'),
      expiry: pick('expiration'),
      status,
      nameservers,
      dnssec: d.secureDNS ? (d.secureDNS.delegationSigned ? 'signed ✅' : 'unsigned ⚠️') : 'unknown',
    };
  } catch (e) {
    throw new Error(e.response?.status === 404 ? 'Domain not found in RDAP' : `RDAP failed: ${e.message}`);
  }
}

// ─────────────────────────────────────────────
// THREAT INTEL
// ─────────────────────────────────────────────

async function cveLookup(cveId) {
  const id = String(cveId).toUpperCase().match(/CVE-\d{4}-\d{4,7}/)?.[0];
  if (!id) throw new Error('Bad CVE format. Example: CVE-2021-44228');
  const res = await axios.get(`https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${id}`, {
    headers: { 'User-Agent': UA }, timeout: 20000,
  });
  const item = res.data?.vulnerabilities?.[0]?.cve;
  if (!item) throw new Error(`${id} not found in NVD`);

  const metrics = item.metrics || {};
  const cvss = metrics.cvssMetricV31?.[0] || metrics.cvssMetricV30?.[0] || metrics.cvssMetricV2?.[0];
  const score = cvss?.cvssData?.baseScore ?? 'n/a';
  const severity = cvss?.cvssData?.baseSeverity || (score >= 9 ? 'CRITICAL' : score >= 7 ? 'HIGH' : score >= 4 ? 'MEDIUM' : 'LOW');

  const cwe = item.weaknesses?.[0]?.description?.[0]?.value || null;
  const refs = (item.references || []).slice(0, 5).map(r => r.url);
  const configs = (item.configurations || []).length;
  const affects = item.configurations?.[0]?.nodes?.[0]?.cpeMatch?.slice(0, 5).map(c => c.criteria.replace('cpe:2.3', '')) || [];

  return {
    id,
    published: item.published,
    lastMod: item.lastModified,
    score,
    severity,
    cwe,
    description: (item.descriptions?.find(d => d.lang === 'en')?.value || '').slice(0, 700),
    refs,
    affects,
    hasKEV: false, // filled by caller if in KEV list
  };
}

async function kevList() {
  // CISA redirects this URL; follow redirects explicitly and use the canonical mirror on failure
  let res;
  try {
    res = await axios.get('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', {
      headers: { 'User-Agent': UA }, timeout: 25000, maxRedirects: 5,
      validateStatus: s => s < 400,
    });
  } catch {
    // Mirror fallback
    res = await axios.get('https://raw.githubusercontent.com/cisagov/kev-ariba/main/known_exploited_vulnerabilities.json', {
      headers: { 'User-Agent': UA }, timeout: 25000, maxRedirects: 5,
    });
  }
  const vulns = res.data?.vulnerabilities || [];
  return {
    count: vulns.length,
    dateReleased: res.data?.dateReleased,
    catalogVersion: res.data?.catalogVersion,
    // catalog is ordered oldest-first; newest = last entries
    recent: vulns.slice(-10).reverse(),
  };
}

function kevCheck(cveId, kevVulns) {
  return (kevVulns || []).some(v => v.cveID === cveId);
}

// ─────────────────────────────────────────────
// BREACH INTEL (HIBP — free tier, no key needed for breach listing by email? 
// HIBP now requires key for email queries — so we do breach-catalog search instead)
// ─────────────────────────────────────────────

async function breachCatalog(query) {
  const res = await axios.get('https://haveibeenpwned.com/api/v3/breaches', {
    headers: { 'User-Agent': UA }, timeout: 20000,
  });
  const q = String(query).toLowerCase();
  const hits = res.data.filter(b =>
    b.Name.toLowerCase().includes(q) ||
    b.Title.toLowerCase().includes(q) ||
    (b.Domain || '').toLowerCase().includes(q)
  ).slice(0, 6);
  return hits.map(b => ({
    name: b.Title,
    domain: b.Domain,
    pwnCount: b.PwnCount,
    breachDate: b.BreachDate,
    dataClasses: (b.DataClasses || []).slice(0, 8),
    verified: b.Verified,
    sensitive: b.IsSensitive,
  }));
}

module.exports = {
  hashAll, identifyHash, analyzePassword,
  analyzeUrl,
  ipInfo, dnsRecon, whois,
  cveLookup, kevList, kevCheck,
  breachCatalog,
};
