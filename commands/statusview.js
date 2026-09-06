/**
 * .statusview — beyond normal status analytics
 *
 * She watches readReceipts events for HER status posts and learns
 * who viewed them, when, and how many times. Plus status-view
 * reactions land in the log.
 *
 *   .statusview          → who viewed (names + times + counts)
 *   .statusview clear    → reset analytics
 *
 * Requires: events/connection.js wiring (readReceipts listener)
 */
const settingsStore = require('../utils/settingsStore');
const { isOwner } = require('../utils/isOwner');

const KEY = 'status_views'; // { [viewerNumber]: { count, first, last } }

module.exports = {
  name: 'statusview',
  aliases: ['whoviewed', 'statusviews'],
  description: '👀 Who viewed her status — counts, times, reactions',
  async execute(sock, msg, args, commands, reply) {
    if (!isOwner(msg)) return reply('👀 _The analytics belong to one._');
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'clear') {
      settingsStore.set(KEY, {});
      return reply('👀 Status analytics reset.');
    }

    const views = settingsStore.get(KEY, {});
    const entries = Object.entries(views).sort((a, b) => b[1].last - a[1].last);

    if (!entries.length) {
      return reply(
        '👀 *No views logged yet.*\n\n' +
        '_She records every read receipt on her statuses: who, when, how many times._\n' +
        '_Post one: `.setstatus hello` or `.statussuite fire CELESTIA`_'
      );
    }

    const L = [`👀 *STATUS VIEWS — ${entries.length} viewer${entries.length > 1 ? 's' : ''}*`, ''];
    for (const [num, v] of entries) {
      const when = new Date(v.last).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      const times = v.count > 1 ? ` • *${v.count}×*` : '';
      L.push(`• @${num} — ${when}${times}`);
    }
    L.push('', '_Times = last view. Multiple views marked._');
    return reply(L.join('\n'));
  },
};
