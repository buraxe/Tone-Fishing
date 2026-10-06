// Tone classification from an F0 contour.
//
// Pipeline: voiced frames → semitones (log scale, speaker independent) →
// octave-jump repair → median smoothing → time resampling → mean removal →
// DTW distance to each scaled tone template → soft posterior + confidence.
//
// Mean removal plus a bounded per-template scale factor makes the comparison
// depend on contour shape, not on the speaker's absolute pitch or range.

import { TONES, sampleShape } from '../data/tones.js';

const ST_REF_HZ = 100;
const toSemitones = (hz) => 12 * Math.log2(hz / ST_REF_HZ);

function median(arr) {
  const s = Array.from(arr).sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : 0.5 * (s[m - 1] + s[m]);
}

function medianFilter(v, k) {
  const h = k >> 1;
  const out = new Array(v.length);
  for (let i = 0; i < v.length; i++) {
    const lo = Math.max(0, i - h), hi = Math.min(v.length, i + h + 1);
    out[i] = median(v.slice(lo, hi));
  }
  return out;
}

/**
 * Turn segmenter frames into a clean contour.
 * Returns null when there is too little reliable voicing.
 */
// Octave-type errors a pitch tracker makes on voice: 1/2, 1/3 and 2x, 3x the true F0.
// (Bigger corrections were tried: they glued hum and rumble onto the syllable.)
const OCTAVE_SHIFTS = [0, 12, -12, 19.02, -19.02];

/**
 * Keep the pitch track that is physically continuous.
 * A voice cannot move more than ~3 semitones between 16 ms frames, so the track is
 * split into continuous runs. The longest run is the anchor; neighbouring runs are
 * joined to it if they line up (directly or after an octave correction) and dropped
 * if they don't. This removes stray sub-harmonic frames at onsets/offsets and
 * repairs creaky stretches of the 3rd tone that the tracker halves.
 */
export function continuousTrack(frames, maxStep = 3) {
  const pts = frames.map((f) => ({ f, st: toSemitones(f.f0) }));
  const runs = [];
  for (const p of pts) {
    const run = runs[runs.length - 1];
    const prev = run && run[run.length - 1];
    if (prev && Math.abs(p.st - prev.st) <= maxStep && p.f.t - prev.f.t < 0.06) run.push(p);
    else runs.push([p]);
  }
  if (!runs.length) return [];
  // Anchor on the run with the most energy: that is the vowel, not a hum or breath
  const energy = (r) => r.reduce((a, p) => a + p.f.rms, 0);
  let anchor = 0;
  runs.forEach((r, i) => { if (energy(r) > energy(runs[anchor])) anchor = i; });

  const kept = new Map([[anchor, 0]]);
  for (const dir of [-1, 1]) {
    let edge = dir < 0 ? runs[anchor][0] : runs[anchor][runs[anchor].length - 1];
    for (let i = anchor + dir; i >= 0 && i < runs.length; i += dir) {
      const r = runs[i];
      const near = dir < 0 ? r[r.length - 1] : r[0];
      const gap = Math.abs(edge.f.t - near.f.t);
      const allow = Math.min(8, maxStep + 60 * gap); // a gap allows proportionally more movement (fast falls reach ~60 st/s)
      let best = null;
      for (const s of OCTAVE_SHIFTS) {
        const d = Math.abs(near.st + s - edge.st);
        if (d <= allow && (!best || d < best.d)) best = { s, d };
      }
      // Short runs must line up without correction; corrections need evidence
      if (best && (best.s === 0 || r.length >= 3)) {
        kept.set(i, best.s);
        const far = dir < 0 ? r[0] : r[r.length - 1];
        edge = { f: far.f, st: far.st + best.s };
      }
    }
  }
  const out = [];
  [...kept.keys()].sort((a, b) => a - b).forEach((i) => {
    for (const p of runs[i]) out.push({ ...p.f, st: p.st + kept.get(i) });
  });
  return out;
}

export function extractContour(frames, minVoicedMs = 110) {
  const voiced = frames.filter((f) => f.voiced);
  if (voiced.length < 4) return null;

  const track = continuousTrack(voiced);
  if (track.length < 4) return null;

  // Trim weak frames at the two ends only (breath, voice offset). Quiet frames
  // in the middle are kept: the creaky low point of the 3rd tone is often quiet.
  let peak = 0;
  for (const f of track) peak = Math.max(peak, f.rms);
  let a = 0, b = track.length - 1;
  while (a < b && track[a].rms < 0.06 * peak) a++;
  while (b > a && track[b].rms < 0.04 * peak) b--;
  const strong = track.slice(a, b + 1);
  if (strong.length < 4) return null;

  const t0 = strong[0].t, t1 = strong[strong.length - 1].t;
  const spanFrames = frames.filter((f) => f.t >= t0 && f.t <= t1).length;
  const voicedFrac = strong.length / Math.max(1, spanFrames);

  // Median-of-5 smoothing; the filter shrinks its window at the ends, so the
  // end of a fast 4th-tone fall or a 3rd-tone rise is kept.
  const smooth = medianFilter(strong.map((f) => f.st), 5);
  const times = strong.map((f) => f.t);

  const dur = times[times.length - 1] - times[0];
  if (dur * 1000 < minVoicedMs) return null;

  let clarity = 0;
  for (const f of strong) clarity += f.clarity;

  return {
    t: times,
    st: smooth,
    dur,
    meanSt: smooth.reduce((x, y) => x + y, 0) / smooth.length,
    meanClarity: clarity / strong.length,
    voicedFrac,
  };
}

/** Linear interpolation of (t, v) onto n evenly spaced times. */
export function resample(t, v, n) {
  const out = new Float64Array(n);
  const t0 = t[0], t1 = t[t.length - 1];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const x = t0 + ((t1 - t0) * i) / (n - 1);
    while (j < t.length - 2 && t[j + 1] < x) j++;
    const span = t[j + 1] - t[j];
    const u = span > 0 ? Math.min(1, Math.max(0, (x - t[j]) / span)) : 0;
    out[i] = v[j] + (v[j + 1] - v[j]) * u;
  }
  return out;
}

function removeMean(v) {
  let m = 0;
  for (const x of v) m += x;
  m /= v.length;
  return v.map((x) => x - m);
}

/** Banded DTW; returns RMS cost along the optimal path (semitones). */
export function dtw(a, b, band) {
  const n = a.length, m = b.length, W = m + 1;
  const D = new Float64Array((n + 1) * W).fill(Infinity);
  const L = new Float64Array((n + 1) * W);
  D[0] = 0;
  for (let i = 1; i <= n; i++) {
    const center = Math.round((i * m) / n);
    const jlo = Math.max(1, center - band), jhi = Math.min(m, center + band);
    for (let j = jlo; j <= jhi; j++) {
      const c = (a[i - 1] - b[j - 1]) ** 2;
      const k = i * W + j;
      let best = D[k - W - 1], len = L[k - W - 1];
      if (D[k - W] < best) { best = D[k - W]; len = L[k - W]; }
      if (D[k - 1] < best) { best = D[k - 1]; len = L[k - 1]; }
      D[k] = c + best;
      L[k] = len + 1;
    }
  }
  const k = n * W + m;
  return Math.sqrt(D[k] / Math.max(1, L[k]));
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));

/**
 * Classify a contour.
 * opts.prefix: compare only the opening part of each template (live charging),
 * using expected syllable duration to decide how much of the shape to use.
 */
/**
 * Interpretable shape features of a resampled contour (semitones).
 * Used both for classification and for the lesson's pronunciation hints.
 */
export function contourFeatures(raw) {
  const N = raw.length;
  const avg = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += raw[i]; return s / (b - a); };
  let minIdx = 0, maxIdx = 0;
  for (let i = 1; i < N; i++) {
    if (raw[i] < raw[minIdx]) minIdx = i;
    if (raw[i] > raw[maxIdx]) maxIdx = i;
  }
  let startMax = raw[0];
  for (let i = 1; i <= minIdx; i++) startMax = Math.max(startMax, raw[i]);
  let endMax = raw[minIdx];
  for (let i = minIdx; i < N; i++) endMax = Math.max(endMax, raw[i]);
  const k = Math.max(2, Math.round(N * 0.12));
  const mid = Math.round(N * 0.4);
  let low = 0;
  for (let i = 0; i < N; i++) if (raw[i] - raw[minIdx] < 1) low++;
  return {
    start: avg(0, k),
    end: avg(N - k, N),
    range: raw[maxIdx] - raw[minIdx],
    net: avg(N - k, N) - avg(0, k),
    minPos: minIdx / (N - 1),
    maxPos: maxIdx / (N - 1),
    fallDepth: startMax - raw[minIdx],   // how far it falls before the lowest point
    riseAfter: endMax - raw[minIdx],     // how far it rises after the lowest point
    lateChange: avg(N - k, N) - raw[mid], // movement over the last 60%
    lowFrac: low / N,                     // share of the syllable spent near the bottom
  };
}

function fitDistance(c, shape, N, upTo, cfg) {
  const tpl = removeMean(sampleShape(shape, N, upTo).map((x) => x * cfg.chaoToSemitone));
  let tt = 0, ct = 0;
  for (let i = 0; i < N; i++) { tt += tpl[i] * tpl[i]; ct += c[i] * tpl[i]; }
  let scale = 1;
  if (tt > 1e-6) scale = Math.min(cfg.scaleMax, Math.max(cfg.scaleMin, ct / tt));
  return dtw(c, tpl.map((x) => x * scale), cfg.dtwBand);
}

export function classifyContour(contour, cfg, opts = {}) {
  const N = cfg.points;
  const raw = resample(contour.t, contour.st, N);
  const c = removeMean(raw);
  const upTo = opts.prefix ? Math.min(1, Math.max(0.3, contour.dur / 0.48)) : 1;
  const f = contourFeatures(raw);
  const complete = !opts.prefix || upTo > 0.7;

  // Feature penalties (semitones) for shapes a template alone cannot rule out
  const shapePenalty = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const dipShare = f.fallDepth / Math.max(0.5, f.fallDepth + f.riseAfter);
  // 2nd tone may dip a little before rising, but not deeply and not late
  if (f.fallDepth > 1.8 && dipShare > 0.22) shapePenalty[2] = 0.45 * (f.fallDepth - 1.8) + 0.25;
  if (f.fallDepth > 1.3 && f.minPos > 0.4) shapePenalty[2] = Math.hypot(shapePenalty[2], 3 * (f.minPos - 0.4) + 0.2);
  // 3rd tone dips in the middle; a dip right at the start followed by a long rise is a 2nd
  if (f.minPos < 0.28 && f.riseAfter > 2.5 * Math.max(0.3, f.fallDepth)) shapePenalty[3] = 0.4;
  // 3rd tone covers a wide pitch range; a gentle drift is not a 3rd
  if (f.range < 2.5) shapePenalty[3] = Math.hypot(shapePenalty[3], 0.5 * (2.5 - f.range) + 0.2);
  if (complete) {
    // 2nd tone must still be rising in its second half
    if (f.lateChange < 1.2) shapePenalty[2] = Math.hypot(shapePenalty[2], 0.4 * (1.2 - f.lateChange) + 0.2);
    // 3rd tone needs a real dip
    if (f.fallDepth < 1.2) shapePenalty[3] = 0.6 * (1.2 - f.fallDepth) + 0.2;
    // A fall that keeps going to the very end is a 4th tone, not a low 3rd
    if (f.lowFrac < 0.2 && f.riseAfter < 0.8) shapePenalty[3] = Math.hypot(shapePenalty[3], 0.6);
  }

  const distances = {};
  for (const k of [1, 2, 3, 4]) {
    let d = Infinity;
    for (const shape of TONES[k].variants || [TONES[k].shape]) d = Math.min(d, fitDistance(c, shape, N, upTo, cfg));
    distances[k] = Math.hypot(d, shapePenalty[k]);
  }

  // Soft posterior over the four tones
  const probs = {};
  let z = 0;
  for (const k of [1, 2, 3, 4]) { probs[k] = Math.exp(-(distances[k] ** 2) / (2 * cfg.sigma ** 2)); z += probs[k]; }
  for (const k of [1, 2, 3, 4]) probs[k] = z > 0 ? probs[k] / z : 0.25;

  let top = 1;
  for (const k of [2, 3, 4]) if (probs[k] > probs[top]) top = k;

  // Signal quality: enough duration, clean periodicity, few dropouts
  const quality =
    clamp01((contour.dur - 0.08) / 0.14) *
    clamp01((contour.meanClarity - 0.5) / 0.3) *
    clamp01(contour.voicedFrac / 0.6);

  const fits = distances[top] <= cfg.maxFitDistance;
  const confidence = fits ? probs[top] * Math.sqrt(quality) : 0;
  const tone = confidence >= cfg.minConfidence ? top : 'unknown';

  return { tone, top, confidence, probs, distances, quality, features: f, contour: c };
}

/** 0-100 match score of a classification against the target tone. */
export function matchScore(result, target, cfg) {
  const d = result.distances[target];
  const sim = Math.exp(-((d / cfg.scoreWidth) ** 2));
  return Math.round(100 * (0.65 * sim + 0.35 * result.probs[target]));
}

/** Full verdict for a finished utterance. */
export function analyzeUtterance(frames, target, cfg, strictRule) {
  const contour = extractContour(frames, cfg.segment.minVoicedMs);
  if (!contour) return { status: 'unclear', contour: null };
  const result = classifyContour(contour, cfg.tone);
  const score = matchScore(result, target, cfg.tone);
  if (result.tone === 'unknown') return { status: 'unclear', contour, result, score };

  const pTarget = result.probs[target];
  const pass =
    pTarget >= strictRule.minTargetProb &&
    score >= strictRule.minScore &&
    (!strictRule.requireTop || result.top === target);
  return { status: pass ? 'correct' : 'wrong', contour, result, score };
}

/** Live (partial) evaluation while the player is still speaking. */
export function analyzeLive(frames, target, cfg) {
  const contour = extractContour(frames, cfg.segment.minVoicedMs);
  if (!contour) return null;
  const result = classifyContour(contour, cfg.tone, { prefix: true });
  return { contour, result, score: matchScore(result, target, cfg.tone) };
}
