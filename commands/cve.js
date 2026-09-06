const fortress = require('../utils/cyberFortress');
const config = require('../config/config');

module.exports = {
  name: 'cve',
  aliases: ['vuln'],
  description: '⚔️ CVE lookup via NVD — score, severity, CWE, affected systems, KEV status',
  execute: async (sock, msg, args, commands, reply) => {
    if (!args.length) {
      return reply(
        '⚔️ *Threat Intel — CVE Lookup*\n\n' +
        'Usage: *.cve CVE-2021-44228*\n\n' +
        'Data: NVD 2.0 API + CISA KEV cross-check.\n' +
        'KEV = actively exploited in the wild (CISA catalog) — patch those first.'
      );
    }

    try {
      const data = await fortress.cveLookup(args[0]);

      // KEV cross-check (fetch full catalog once per day, cache in settings)
      let kevBadge = '';
      try {
        const settingsStore = require('../utils/settingsStore');
        let kevIds = settingsStore.get('kev_cache', null);
        const cacheAge = settingsStore.get('kev_cache_ts', 0);
        if (!Array.isArray(kevIds) || Date.now() - cacheAge > 24 * 3600 * 1000) {
          const kev = await fortress.kevList();
          // fetch full catalog for IDs — reuse the mirror with a larger slice
          kevIds = kev.recent.map(v => v.cveID);
          // the full list is too heavy; fetch via the catalog's recent + known-critical approach:
          // instead cache IDs from the raw feed once
          const { default: axios } = require('axios');
          const res = await axios.get('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', {
            headers: { 'User-Agent': 'CELESTIA-CyberFortress/2.0' }, timeout: 25000, maxRedirects: 5,
          });
          kevIds = (res.data?.vulnerabilities || []).map(v => v.cveID);
          settingsStore.set('kev_cache', kevIds);
          settingsStore.set('kev_cache_ts', Date.now());
        }
        if (kevIds.includes(data.id)) {
          kevBadge = '\n🚨 *IN CISA KEV — ACTIVELY EXPLOITED IN THE WILD*';
        }
      } catch { /* KEV optional */ }

      const sevIcon = { CRITICAL: '💀', HIGH: '🚨', MEDIUM: '⚠️', LOW: 'ℹ️' }[data.severity] || 'ℹ️';

      const lines = [
        `⚔️ *${data.id}*  ${sevIcon} *${data.severity}* — CVSS ${data.score}`,
        '',
        `📅 Published: ${data.published?.slice(0, 10) || 'n/a'}`,
        data.cwe ? `🧬 Weakness: ${data.cwe}` : '',
        '',
        `*Description:*`,
        `${data.description || 'n/a'}`,
        '',
      ].filter(Boolean);

      if (data.affects.length) {
        lines.push('*Affected (CPE examples):*');
        data.affects.forEach(a => lines.push(`• \`${a}\``));
        lines.push('');
      }

      if (data.refs.length) {
        lines.push('*References:*');
        data.refs.slice(0, 4).forEach(r => lines.push(`• ${r}`));
        lines.push('');
      }

      if (kevBadge) lines.push(kevBadge);
      lines.push('> 🐺 Data: NVD + CISA KEV — defensive intel only');

      return reply(lines.join('\n'));
    } catch (e) {
      return reply(`⚔️ ${e.message}`);
    }
  },
};
