// Keeps a short history of what the detector heard (pitch numbers only, never
// audio) so a teacher can see why an attempt failed and copy the data to report it.

const MAX = 12;
const items = [];

export function recordAttempt({ where, target, frames, verdict }) {
  const voiced = frames.filter((f) => f.voiced);
  const hz = voiced.map((f) => f.f0);
  const peak = frames.reduce((m, f) => Math.max(m, f.rms), 0);
  items.push({
    time: new Date().toISOString(),
    where,
    target,
    status: verdict.status,
    heard: verdict.result ? verdict.result.tone : null,
    top: verdict.result ? verdict.result.top : null,
    confidence: verdict.result ? +verdict.result.confidence.toFixed(2) : null,
    score: verdict.score ?? null,
    probs: verdict.result ? Object.fromEntries(Object.entries(verdict.result.probs).map(([k, v]) => [k, +v.toFixed(2)])) : null,
    features: verdict.result ? Object.fromEntries(Object.entries(verdict.result.features).map(([k, v]) => [k, +v.toFixed(2)])) : null,
    voicedFrames: voiced.length,
    totalFrames: frames.length,
    peakLevel: +peak.toFixed(4),
    hzMin: hz.length ? Math.round(Math.min(...hz)) : null,
    hzMax: hz.length ? Math.round(Math.max(...hz)) : null,
    track: frames.map((f) => [+f.t.toFixed(3), f.voiced ? Math.round(f.f0) : 0, +f.rms.toFixed(4), +f.clarity.toFixed(2)]),
  });
  while (items.length > MAX) items.shift();
}

export function lastAttempt() { return items[items.length - 1] || null; }

export function diagnosticsJSON(extra = {}) {
  return JSON.stringify({ app: 'tone-fishing', version: 2, ...extra, attempts: items }, null, 0);
}
