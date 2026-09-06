/**
 * .wellness — she guards the vessel 🧘
 *
 *   .wellness                    → dashboard: water/sleep/workout today + week
 *   .wellness water              → +1 glass (goal 8)
 *   .wellness sleep 7.5          → log sleep hours
 *   .wellness workout pushups    → log a workout
 *   .wellness medicine add 8h paracetamol   → recurring med reminder
 *   .wellness medicine list / done 1
 *   .wellness bmi 70 175         → BMI + healthy range (cm)
 *   .wellness goal water 10      → set water goal
 *   .wellness posture on        → hourly posture-break nudges
 */
const tk = require('../utils/timekeeper');
const settingsStore = require('../utils/settingsStore');
const config = require('../config/config');
const { isOwner } = require('../utils/isOwner');

const KEY = 'wellness';

const DEFAULTS = { water: {}, sleep: {}, workout: {}, goals: { water: 8, sleep: 7.5 }, meds: [], posture: false };
function load() {
  const s = settingsStore.get(KEY, null);
  return (s && typeof s === 'object') ? { ...DEFAULTS, ...s, goals: { ...DEFAULTS.goals, ...(s.goals || {}) } } : { ...DEFAULTS };
}
function save(w) { settingsStore.set(KEY, w); }
function today() { return tk.todayKey(); }
function last7() {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return out;
}

module.exports = {
  name: 'wellness',
  aliases: ['health', 'fit'],
  description: '🧘 She guards the vessel — water, sleep, workouts, meds, BMI, posture',
  async execute(sock, msg, args, commands, reply) {
    if (!isOwner(msg)) return reply('🧘 _She guards one vessel._');
    const w = load();
    const sub = (args[0] || '').toLowerCase();
    const ownerJid = config.ownerNumber + '@s.whatsapp.net';

    // ─── water ───
    if (sub === 'water') {
      const t = today();
      w.water[t] = (w.water[t] || 0) + 1;
      save(w);
      const goal = w.goals.water;
      const n = w.water[t];
      const bar = '💧'.repeat(Math.min(n, goal)) + '⬜'.repeat(Math.max(0, goal - n));
      let extra = '';
      if (n === goal) extra = '\n\n🏆 *Goal reached. The vessel is honored.*';
      else if (n > goal) extra = `\n\n_Over goal by ${n - goal} — respect._`;
      return reply(`🧘 Water: ${bar}\n${n}/${goal} glasses today.${extra}`);
    }

    if (sub === 'goal') {
      const g = parseInt(args[1], 10) || parseInt(args[2], 10);
      if (!g || g < 1 || g > 20) return reply('🧘 `.wellness goal water 10` — set a daily target');
      w.goals.water = g;
      save(w);
      return reply(`🧘 Water goal set: *${g} glasses/day*`);
    }

    // ─── sleep ───
    if (sub === 'sleep') {
      const h = parseFloat(args[1]);
      if (isNaN(h) || h < 0 || h > 24) return reply('🧘 `.wellness sleep 7.5` — hours slept last night');
      w.sleep[today()] = h;
      save(w);
      const verdict = h >= 8 ? '🏆 Deep recovery.' : h >= 7 ? '✅ Solid.' : h >= 6 ? '⚠️ Thin — tonight, earlier.' : '💀 The vessel is running on fumes.';
      return reply(`🧘 Sleep logged: *${h}h*. ${verdict}\n_Goal: ${w.goals.sleep}h_`);
    }

    // ─── workout ───
    if (sub === 'workout' || sub === 'gym') {
      const what = args.slice(1).join(' ').trim() || 'training';
      const t = today();
      w.workout[t] = w.workout[t] || [];
      w.workout[t].push(what);
      save(w);
      return reply(`🧘 Workout logged: *${what}* 💪\n_${w.workout[t].length} today. The body keeps the score._`);
    }

    // ─── medicine ───
    if (sub === 'medicine' || sub === 'med') {
      const msub = (args[1] || '').toLowerCase();
      if (msub === 'add') {
        const when = tk.parseWhen(args[2] || '');
        const name = args.slice(3).join(' ').trim();
        if (!when || !name) return reply('🧘 `.wellness medicine add 8h paracetamol` — first dose in <when>, then she reminds on cycle');
        // recurring: re-add 24h after each delivery via meta
        tk.addReminder({ ownerJid, targetJid: ownerJid, text: `💊 Medicine: ${name}`, dueTs: when.ts, kind: 'reminder', meta: { med: name, cycle: 24 * 3600000 } });
        w.meds.push({ name, started: Date.now() });
        save(w);
        return reply(`🧘 💊 *${name}* — first reminder ${tk.fmtWhen(when.ts)}.\n_Say ".wellness medicine done <name>" when the course finishes._`);
      }
      if (msub === 'done') {
        const nm = args.slice(2).join(' ').toLowerCase();
        const before = w.meds.length;
        w.meds = w.meds.filter(m => !m.name.toLowerCase().includes(nm));
        save(w);
        return reply(`🧘 💊 Course ended (${before - w.meds.length} removed). _Well done — finishing the full course is the hard part._`);
      }
      const L = ['🧘 *ACTIVE MEDICINES:*', ''];
      if (!w.meds.length) L.push('none — add: `.wellness medicine add 8h vitamin D`');
      w.meds.forEach(m => L.push(`• 💊 ${m.name} (since ${new Date(m.started).toLocaleDateString()})`));
      return reply(L.join('\n'));
    }

    // ─── bmi ───
    if (sub === 'bmi') {
      const kg = parseFloat(args[1]);
      const cm = parseFloat(args[2]);
      if (!kg || !cm) return reply('🧘 `.wellness bmi <kg> <cm>` — e.g. .wellness bmi 70 175');
      const m = cm / 100;
      const bmi = kg / (m * m);
      const cat = bmi < 18.5 ? 'underweight' : bmi < 25 ? 'healthy range 🏆' : bmi < 30 ? 'overweight' : 'obese';
      const lo = (18.5 * m * m).toFixed(1);
      const hi = (24.9 * m * m).toFixed(1);
      return reply(`🧘 BMI: *${bmi.toFixed(1)}* — ${cat}\nHealthy for ${cm}cm: *${lo}–${hi} kg*_\n\n_A number, not a verdict. She cares about the trend._`);
    }

    // ─── posture ───
    if (sub === 'posture') {
      const v = (args[1] || '').toLowerCase();
      if (v === 'on') { w.posture = true; save(w); return reply('🧘 Posture watch ON — hourly nudge: _unclench the jaw, drop the shoulders, breathe._'); }
      if (v === 'off') { w.posture = false; save(w); return reply('🧘 Posture watch off.'); }
      return reply(`🧘 Posture watch: *${w.posture ? 'ON' : 'off'}* — \`.wellness posture on/off\``);
    }

    // ─── dashboard ───
    const days = last7();
    const t = today();
    const water = w.water[t] || 0;
    const sleep = w.sleep[t];
    const train = (w.workout[t] || []).length;
    const L = ['🧘 *YOUR VESSEL — today*', ''];
    const bar = '💧'.repeat(Math.min(water, w.goals.water)) + '⬜'.repeat(Math.max(0, w.goals.water - water));
    L.push(`💧 Water: ${bar}  ${water}/${w.goals.water}`);
    L.push(`😴 Sleep: ${sleep != null ? sleep + 'h ' + (sleep >= 7.5 ? '✅' : '⚠️') : 'not logged'}`);
    L.push(`💪 Workouts: ${train || '—'} ${train ? '🔥' : ''}`);
    if (w.meds.length) L.push(`💊 Meds active: ${w.meds.length}`);
    L.push('');
    L.push('*Last 7:*');
    days.forEach(d => {
      const wl = w.water[d] || 0;
      const sl = w.sleep[d];
      const wk = (w.workout[d] || []).length;
      L.push(`  ${d.slice(5)} — ${wl ? '💧' + wl : '·'} ${sl ? ' 😴' + sl + 'h' : ''} ${wk ? ' 💪' + wk : ''}`);
    });
    L.push('');
    L.push('_`.wellness water` • `.wellness sleep 7.5` • `.wellness workout <what>` • `.wellness bmi 70 175`_');
    return reply(L.join('\n'));
  },
};
