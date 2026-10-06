// Live power bar on real recordings: how full the bar gets while speaking,
// for the right target vs a wrong target. Run: node tests/real-live.test.mjs
import { CONFIG } from '../js/config.js';
import { analyzeLive } from '../js/audio/toneClassifier.js';
import { livePowerStep } from '../js/game/power.js';
import { manifest, load, runChain } from './realdata.mjs';

const table = { 1: {}, 2: {}, 3: {}, 4: {} };
for (const m of manifest) {
  const x = load(m.file);
  let p = 0;
  for (const v of x) p = Math.max(p, Math.abs(v));
  const y = x.map((v) => (v * 0.5) / p);
  for (const target of [1, 2, 3, 4]) {
    let power = 0, lastT = null, best = 0;
    runChain(y, CONFIG, (ev, t) => {
      if (ev.type === 'start') { lastT = t; power = 0; return; }
      if (ev.type !== 'update') return;
      const dt = t - lastT; lastT = t;
      power = livePowerStep(power, analyzeLive(ev.frames, target, CONFIG), target, dt, CONFIG.power).power;
      best = Math.max(best, power);
    });
    (table[m.tone][target] = table[m.tone][target] || []).push(best);
  }
}
console.log('mean live power reached (row = spoken tone, col = target tone):');
for (const t of [1, 2, 3, 4]) {
  console.log(' ', t, [1, 2, 3, 4].map((g) => (table[t][g].reduce((a, b) => a + b, 0) / table[t][g].length).toFixed(2)).join('  '));
}
