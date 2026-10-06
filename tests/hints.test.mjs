// Which hint does a learner get when they say tone X while the target is tone Y?
// Uses the real recordings; prints the most common hint for each pair.
// Run: node tests/hints.test.mjs
import { CONFIG } from '../js/config.js';
import { analyzeUtterance } from '../js/audio/toneClassifier.js';
import { pronunciationHint } from '../js/lesson/hints.js';
import { manifest, load, runChain } from './realdata.mjs';

const table = {};
for (const m of manifest) {
  const x = load(m.file);
  let p = 0;
  for (const v of x) p = Math.max(p, Math.abs(v));
  const u = runChain(x.map((v) => (v * 0.5) / p)).sort((a, b) => b.length - a.length)[0];
  if (!u) continue;
  for (const target of [1, 2, 3, 4]) {
    if (target === m.tone) continue;
    const v = analyzeUtterance(u, target, CONFIG, CONFIG.strictness.standard);
    if (v.status === 'correct') continue;
    const h = pronunciationHint(v, target).problem;
    const key = `说第${m.tone}声 → 目标第${target}声`;
    table[key] = table[key] || {};
    table[key][h] = (table[key][h] || 0) + 1;
  }
}
for (const [k, hs] of Object.entries(table).sort()) {
  const total = Object.values(hs).reduce((a, b) => a + b, 0);
  const top = Object.entries(hs).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([h, n]) => `${h} ${Math.round((100 * n) / total)}%`);
  console.log(k, '|', top.join(' | '));
}
