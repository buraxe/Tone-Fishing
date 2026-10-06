// Evaluate the detector on real native recordings (three speakers).
// Data is not shipped with the project (licence + size); see tests/fetch-real-data.sh.
// Run: REALDATA=path/to/realdata node tests/real.test.mjs [-v]
//
// Each recording is also pitch-shifted to simulate lower and higher voices,
// quieted, and mixed with noise, then fed through the same chain the browser runs.

import { CONFIG } from '../js/config.js';
import { analyzeUtterance } from '../js/audio/toneClassifier.js';
import { manifest, load, shift, runChain, gauss } from './realdata.mjs';

const verbose = process.argv.includes('-v');
const conditions = [
  { name: 'clean', ratio: 1, gain: 1, noise: 0 },
  { name: 'lower voice', ratio: 0.8, gain: 1, noise: 0 },
  { name: 'higher voice', ratio: 1.25, gain: 1, noise: 0 },
  { name: 'quiet mic', ratio: 1, gain: 0.08, noise: 0.0008 },
  { name: 'noisy room', ratio: 1, gain: 1, noise: 0.02 },
];

const rule = CONFIG.strictness[process.env.STRICT || 'standard'];
const summary = [];
for (const cond of conditions) {
  const conf = { 1: {}, 2: {}, 3: {}, 4: {} };
  let ok = 0, n = 0, unclear = 0, falsePass = 0;
  const bySrc = {};
  for (const m of manifest) {
    let x = shift(load(m.file), cond.ratio);
    let peak = 0;
    for (const v of x) peak = Math.max(peak, Math.abs(v));
    const g = (0.5 / (peak || 1)) * cond.gain;
    const y = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) y[i] = x[i] * g + cond.noise * gauss();
    const utts = runChain(y);
    n++;
    // The longest utterance is the syllable
    const u = utts.sort((a, b) => b.length - a.length)[0];
    let got = 'none';
    if (u) {
      const v = analyzeUtterance(u, m.tone, CONFIG, rule);
      got = v.status === 'unclear' ? 'unclear' : v.result.tone;
      if (v.status === 'correct') ok++;
      if (v.status === 'unclear') unclear++;
      for (const other of [1, 2, 3, 4]) if (other !== m.tone && analyzeUtterance(u, other, CONFIG, rule).status === 'correct') falsePass++;
      if (verbose && cond.name === 'clean' && v.status !== 'correct') console.log('  miss', m.src, m.label, 'tone', m.tone, '→', got, v.score);
    } else unclear++;
    conf[m.tone][got] = (conf[m.tone][got] || 0) + 1;
    bySrc[m.src] = bySrc[m.src] || [0, 0];
    bySrc[m.src][0] += got === m.tone ? 1 : 0;
    bySrc[m.src][1]++;
  }
  console.log(`\n${cond.name}: ${ok}/${n} correct (${((100 * ok) / n).toFixed(1)}%), unclear ${unclear}, false passes ${falsePass}`);
  console.log('  per speaker:', Object.entries(bySrc).map(([k, [a, b]]) => `${k} ${a}/${b}`).join('  '));
  for (const t of [1, 2, 3, 4]) console.log('  tone', t, JSON.stringify(conf[t]));
  summary.push({ cond: cond.name, acc: ok / n, falsePass });
}
console.log('\nsummary', summary.map((s) => `${s.cond} ${(100 * s.acc).toFixed(1)}%`).join(' | '));
