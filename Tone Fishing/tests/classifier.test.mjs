// Offline test: synthesise voices with known tone contours, run them through the
// same tracker → segmenter → classifier chain the browser uses, and report accuracy.
// Run: node tests/classifier.test.mjs

import { CONFIG } from '../js/config.js';
import { analyzeUtterance } from '../js/audio/toneClassifier.js';
import { PRODUCTIONS, synth, run, rand, gauss, SR } from './synth.mjs';

const rule = CONFIG.strictness.standard;
const confusion = { 1: {}, 2: {}, 3: {}, 4: {} };
let total = 0, correct = 0, unclear = 0, wrong = 0;
const scoresCorrect = [], scoresWrongTarget = [];

for (const tone of [1, 2, 3, 4]) {
  for (const shape of PRODUCTIONS[tone]) {
    for (const baseHz of [95, 130, 180, 240]) {
      for (const stepSt of [1.2, 1.8, 2.4]) {
        for (const dur of [0.32, 0.5, 0.7]) {
          const sig = synth({ shape, baseHz, stepSt, dur, noise: 0.002 + 0.006 * rand() });
          const utts = run(sig);
          total++;
          if (!utts.length) { unclear++; (confusion[tone].none = (confusion[tone].none || 0) + 1); continue; }
          const v = analyzeUtterance(utts[0], tone, CONFIG, rule);
          const got = v.result ? v.result.tone : 'unclear';
          confusion[tone][got] = (confusion[tone][got] || 0) + 1;
          if (v.status !== 'correct') console.log('MISS', tone, got, JSON.stringify(shape), baseHz, stepSt, dur, v.score);
          if (v.status === 'correct') { correct++; scoresCorrect.push(v.score); }
          else if (v.status === 'unclear') unclear++;
          else wrong++;
          // Same audio judged against a different target must not pass
          const other = (tone % 4) + 1;
          const v2 = analyzeUtterance(utts[0], other, CONFIG, rule);
          if (v2.status === 'correct') console.log('FALSE PASS', { tone, other, shape: JSON.stringify(shape), baseHz, stepSt, dur });
          if (v2.score != null) scoresWrongTarget.push(v2.score);
        }
      }
    }
  }
}

console.log('confusion (row = produced tone):');
for (const t of [1, 2, 3, 4]) console.log(' ', t, JSON.stringify(confusion[t]));
console.log({ total, correct, wrong, unclear, accuracy: (correct / total).toFixed(3) });
const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
console.log('mean score when correct:', avg(scoresCorrect), ' mean score vs wrong target:', avg(scoresWrongTarget));

// Noise / silence must not produce a tone
let noiseHits = 0;
for (let k = 0; k < 20; k++) {
  const n = new Float32Array(SR * 1.5);
  const lvl = 0.01 + 0.05 * rand();
  for (let i = 0; i < n.length; i++) n[i] = lvl * gauss();
  for (const u of run(n)) {
    const v = analyzeUtterance(u, 1, CONFIG, rule);
    if (v.status !== 'unclear') noiseHits++;
  }
}
console.log('noise bursts classified as a tone:', noiseHits, '/ 20');
