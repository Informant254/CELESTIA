const di = require('../utils/dayIntel');
const settingsStore = require('../utils/settingsStore');
const config = require('../config/config');
const { isOwner } = require('../utils/isOwner');

function fmtPrice(n) {
  if (n >= 1000) return '$' + Math.round(n).toLocaleString();
  if (n >= 1) return '$' + n.toFixed(2);
  return '$' + n.toPrecision(3);
}

module.exports = {
  name: 'crypto',
  aliases: ['coins', 'prices'],
  description: '💱 Crypto intelligence — live prices, 24h moves, top market, portfolio P&L',
  execute: async (sock, msg, args, commands, reply) => {
    const sub = (args[0] || '').toLowerCase();

    // ─── .crypto (no args) → top 8 by market cap ───
    if (!sub) {
      try {
        const top = await di.topCrypto(8);
        const L = ['💱 *CRYPTO — top of the market*', ''];
        top.forEach(c => {
          const move = c.change >= 0 ? `🟢 +${c.change.toFixed(1)}%` : `🔴 ${c.change.toFixed(1)}%`;
          L.push(`• *${c.name}* (${c.sym}) — ${fmtPrice(c.price)}  ${move}`);
        });
        L.push('', '💎 Specific: `.crypto btc` • `.crypto btc eth sol`');
        L.push('📊 Portfolio: `.crypto portfolio`');
        return reply(L.join('\n'));
      } catch (e) { return reply(`💱 ${e.message}`); }
    }

    // ─── portfolio ───
    if (sub === 'portfolio' || sub === 'p') {
      if (!isOwner(msg)) return reply('💱 _The vault belongs to one._');
      const holdings = settingsStore.get('crypto_portfolio', {});
      const keys = Object.keys(holdings);
      if (!keys.length) {
        return reply('💱 *Portfolio empty.*\n\nAdd: `.crypto buy btc 0.5` — tracks your cost basis & live P&L');
      }
      try {
        const prices = await di.cryptoPrice(keys.map(k => di.CRYPTO_MAP[k] || k));
        let totalVal = 0, totalCost = 0;
        const L = ['💱 *YOUR PORTFOLIO*', ''];
        for (const [sym, h] of Object.entries(holdings)) {
          const coin = di.CRYPTO_MAP[sym] || sym;
          const price = prices[coin]?.usd;
          if (!price) continue;
          const val = price * h.amount;
          const pnl = val - h.cost;
          const pct = h.cost > 0 ? (pnl / h.cost) * 100 : 0;
          totalVal += val; totalCost += h.cost;
          L.push(`• *${sym.toUpperCase()}* ${h.amount} @ ${fmtPrice(price)} = *${fmtPrice(val)}*`);
          L.push(`   ${pnl >= 0 ? '🟢' : '🔴'} ${pnl >= 0 ? '+' : ''}${fmtPrice(Math.abs(pnl))} (${pct.toFixed(1)}%)`);
        }
        const totalPnl = totalVal - totalCost;
        L.push('', `━━━━━━━━━━━━━━━`);
        L.push(`💼 *Total: ${fmtPrice(totalVal)}*  ${totalPnl >= 0 ? '🟢' : '🔴'} ${fmtPrice(Math.abs(totalPnl))} (${totalCost > 0 ? ((totalPnl / totalCost) * 100).toFixed(1) : 0}%)`);
        L.push('', '_Commands: `.crypto buy eth 1.5` • `.crypto sell btc 0.1` • `.crypto reset`_');
        return reply(L.join('\n'));
      } catch (e) { return reply(`💱 ${e.message}`); }
    }

    // ─── buy/sell/reset (portfolio mgmt) ───
    if (['buy', 'sell', 'reset'].includes(sub)) {
      if (!isOwner(msg)) return reply('💱 _The vault belongs to one._');
      const holdings = settingsStore.get('crypto_portfolio', {});

      if (sub === 'reset') {
        settingsStore.set('crypto_portfolio', {});
        return reply('💱 Portfolio cleared.');
      }
      const sym = (args[1] || '').toLowerCase();
      const amount = parseFloat(args[2]);
      const coin = di.CRYPTO_MAP[sym];
      if (!coin || isNaN(amount) || amount <= 0) {
        return reply('💱 Usage: `.crypto buy btc 0.5` (coins: btc eth sol bnb xrp doge ada...)');
      }
      if (sub === 'sell') {
        const h = holdings[sym];
        if (!h || h.amount < amount) return reply(`💱 You hold ${h ? h.amount : 0} ${sym.toUpperCase()}.`);
        try {
          const prices = await di.cryptoPrice([coin]);
          const price = prices[coin]?.usd || 0;
          h.amount -= amount;
          h.cost *= (1 - amount / (h.amount + amount));
          if (h.amount < 1e-10) delete holdings[sym];
          settingsStore.set('crypto_portfolio', holdings);
          return reply(`💱 Sold ${amount} ${sym.toUpperCase()} @ ${fmtPrice(price)} → ${fmtPrice(price * amount)} back.`);
        } catch (e) { return reply(`💱 ${e.message}`); }
      }
      // buy
      try {
        const prices = await di.cryptoPrice([coin]);
        const price = prices[coin]?.usd;
        if (!price) return reply(`💱 No price for ${sym}.`);
        const h = holdings[sym] || { amount: 0, cost: 0 };
        h.amount += amount;
        h.cost += price * amount;
        holdings[sym] = h;
        settingsStore.set('crypto_portfolio', holdings);
        return reply(`💱 Bought ${amount} ${sym.toUpperCase()} @ ${fmtPrice(price)} — cost ${fmtPrice(price * amount)}.\n\n_Tracked. \`.crypto portfolio\` for P&L._`);
      } catch (e) { return reply(`💱 ${e.message}`); }
    }

    // ─── .crypto btc eth sol → prices ───
    const syms = args.map(a => a.toLowerCase());
    const ids = syms.map(s => di.CRYPTO_MAP[s] || s);
    try {
      const prices = await di.cryptoPrice(ids);
      const L = ['💱 *LIVE PRICES*', ''];
      syms.forEach(sym => {
        const id = di.CRYPTO_MAP[sym] || sym;
        const p = prices[id];
        if (!p) { L.push(`• ${sym.toUpperCase()} — not found`); return; }
        const usdChange = p.usd_24h_change ?? 0;
        const move = usdChange >= 0 ? `🟢 +${usdChange.toFixed(1)}%` : `🔴 ${usdChange.toFixed(1)}%`;
        L.push(`• *${sym.toUpperCase()}* ${fmtPrice(p.usd)}  ${move}`);
        if (p.kes) L.push(`   🇰🇪 KES ${Math.round(p.kes).toLocaleString()} • 🇪🇺 €${Math.round(p.eur)} • 🇳🇬 ₦${Math.round(p.ngn).toLocaleString()}`);
      });
      L.push('', '> 🐺 CoinGecko live. `.crypto` for market top.');
      return reply(L.join('\n'));
    } catch (e) {
      return reply(`💱 ${e.message}`);
    }
  },
};
