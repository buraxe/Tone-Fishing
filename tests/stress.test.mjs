// Harder conditions + live power-bar behaviour.
// Run: node tests/stress.test.mjs

import { CONFIG } from '../js/config.js';
import { analyzeUtterance, analyzeLive } from '../js/audio/toneClassifier.js';
import { livePowerStep } from '../js/game/power.js';
import { PRODUCTIONS, synth, run, rand } from './synth.mjs';

const rule = CONFIG.strictness.standard;
const conditions = {
  quiet:      { amp: 0.03, noise: 0.002 },
  noisy:      { amp: 0.2, noise: 0.03 },   // ~ 15-20 dB SNR
  veryNoisy:  { amp: 0.2, noise: 0.07 },
  longSlow:   { amp: 0.2, noise: 0.004, dur: 1.0 },
};

for (const [name, cond] of Object.entries(conditions)) {
  let ok = 0, wrong = 0, unclear = 0, falsePass = 0, n = 0;
  for (const tone of [1, 2, 3, 4]) {
    for (const shape of PRODUCTIONS[tone]) {
      for (const baseHz of [110, 200]) {
        for (const stepSt of [1.4, 2.2]) {
          const dur = cond.dur || 0.45;
          const utts = run(synth({ shape, baseHz, stepSt, dur, amp: cond.amp, noise: cond.noise }));
          n++;
          if (!utts.length) { unclear++; continue; }
          const v = analyzeUtterance(utts[0], tone, CONFIG, rule);
          if (v.status === 'correct') ok++; else if (v.status === 'wrong') wrong++; else unclear++;
          for (const other of [1, 2, 3, 4]) {
            if (other !== tone && analyzeUtterance(utts[0], other, CONFIG, rule).status === 'correct') falsePass++;
          }
        }
      }
    }
  }
  console.log(name.padEnd(10), { n, ok, wrong, unclear, falsePass });
}

// Live power: average power reached at the end of speech, per (produced, target)
console.log('\nlive power at end of utterance (row produced, col target):');
for (const tone of [1, 2, 3, 4]) {
  const row = [];
  for (const target of [1, 2, 3, 4]) {
    let sum = 0, count = 0;
    for (const shape of PRODUCTIONS[tone]) {
      for (const baseHz of [110, 200]) {
        let power = 0, lastT = null;
        run(synth({ shape, baseHz, stepSt: 1.8, dur: 0.5 }), (ev, t) => {
          if (ev.type === 'start') { lastT = t; return; }
          if (ev.type !== 'update') return;
          const dt = t - lastT; lastT = t;
          const live = analyzeLive(ev.frames, target, CONFIG);
          power = livePowerStep(power, live, target, dt, CONFIG.power).power;
        });
        sum += power; count++;
      }
    }
    row.push((sum / count).toFixed(2));
  }
  console.log(' ', tone, row.join('  '));
}
