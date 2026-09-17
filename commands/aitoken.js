/**
 * .aitoken — owner issues/invites friend deploys to the AI relay.
 *
 *   .aitoken                 → list tokens + usage + deployer instructions
 *   .aitoken new <label>     → issue a token (shown ONCE — send it to them)
 *   .aitoken revoke <label>  → kill a token instantly
 *
 * Friend deployers set in their env (no code changes on their side):
 *   APIX_BASE=https://<your-public-base>
 *   APIX_KEY=<their token>
 * Their bot then uses your Apix key without ever seeing it.
 */
const { isOwner } = require('../utils/isOwner');
const relay = require('../utils/aiRelay');

module.exports = {
  name: 'aitoken',
  aliases: ['airelay', 'aikey'],
  description: '🔑 Issue/revoke AI relay tokens for friend deploys (owner only)',
  async execute(sock, msg, args, commands, reply) {
    if (!isOwner(msg)) return reply('🔑 _Only the keymaster hands out keys._');
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'new') {
      const label = args.slice(1).join(' ').trim() || 'friend';
      const token = relay.issueToken(label);
      return reply(
        `🔑 *Token issued for ${label}:*\n\`\`\`${token}\`\`\`\n\n` +
        `Send them this (copy-paste ready):\n` +
        `1. In their env set:\n\`APIX_BASE=${relayPublicBase()}\nAPIX_KEY=${token}\`\n` +
        `2. That's it — their \`.autochat on\` just works.\n\n` +
        `⚠️ Shown once. Revoke anytime: \`.aitoken revoke ${label}\``
      );
    }

    if (sub === 'revoke') {
      const label = args.slice(1).join(' ').trim();
      if (!label) return reply('🔑 Usage: `.aitoken revoke <label>`');
      const n = relay.revokeToken(label);
      return reply(n ? `🔑 Revoked ${n} token(s) for *${label}* — dead instantly.` : `🔑 No token found for *${label}*.`);
    }

    // status / list
    const tokens = relay.listTokens();
    const usage = relay.usageSnapshot();
    const cap = relay.hourlyCap();
    const L = ['🔑 *AI RELAY* — friend deploys ride your Apix key, blind.', ''];
    const keys = Object.keys(tokens);
    if (!keys.length) {
      L.push('_No tokens issued yet._', '', '`.aitoken new <name>` — mint one for a friend.');
    } else {
      for (const tok of keys) {
        const meta = tokens[tok];
        const u = usage[tok];
        const used = u && Date.now() - u.windowStart < 3600000 ? u.count : 0;
        const date = new Date(meta.createdTs).toLocaleDateString();
        L.push(`• *${meta.label}* — ${used}/${cap} this hour · since ${date}`);
      }
      L.push('', '`.aitoken revoke <name>` — kill one instantly.');
    }
    L.push('', `_Relay: ${relay.relayEnabled() ? 'ON' : 'OFF (no Apix key on this server)'}_`);
    return reply(L.join('\n'));
  },
};

function relayPublicBase() {
  // Owner overrides with their public base; falls back to a placeholder.
  return process.env.RELAY_PUBLIC_BASE || 'https://YOUR-SERVER:PORT';
}
