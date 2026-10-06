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
export function extractContour(frames, minVoicedMs = 110) {
  const voiced = frames.filter((f) => f.voiced);
  if (voiced.length < 4) return null;

  // Drop weak tail/onset frames (breath, creak)
  let peak = 0;
  for (const f of voiced) peak = Math.max(peak, f.rms);
  const strong = voiced.filter((f) => f.rms >= 0.15 * peak);
  if (strong.length < 4) return null;

  const t0 = strong[0].t, t1 = strong[strong.length - 1].t;
  const spanFrames = frames.filter((f) => f.t >= t0 && f.t <= t1).length;
  const voicedFrac = strong.length / Math.max(1, spanFrames);

  // Semitones + octave repair against a short running median
  const st = [];
  for (const f of strong) {
    let v = toSemitones(f.f0);
    if (st.length >= 3) {
      const ref = median(st.slice(-3));
      if (Math.abs(v - ref) > 8) {
        if (Math.abs(v + 12 - ref) < 4) v += 12;
        else if (Math.abs(v - 12 - ref) < 4) v -= 12;
      }
    }
    st.push(v);
  }
  let smooth = medianFilter(st, 5);
  let times = strong.map((f) => f.t);
  if (smooth.length > 10) { smooth = smooth.slice(1, -1); times = times.slice(1, -1); }

  const dur = times[times.length - 1] - times[0];
  if (dur * 1000 < minVoicedMs) return null;

  let clarity = 0;
  for (const f of strong) clarity += f.clarity;

  return {
    t: times,
    st: smooth,
    dur,
    meanSt: smooth.reduce((a, b) => a + b, 0) / smooth.length,
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
export function classifyContour(contour, cfg, opts = {}) {
  const N = cfg.points;
  const raw = resample(contour.t, contour.st, N);
  const c = removeMean(raw);
  const upTo = opts.prefix ? Math.min(1, Math.max(0.3, contour.dur / 0.48)) : 1;

  // Turning-point features separate 2nd (rise from the start) from 3rd (dip, then rise)
  let minIdx = 0;
  for (let i = 1; i < N; i++) if (raw[i] < raw[minIdx]) minIdx = i;
  let startMax = raw[0];
  for (let i = 1; i <= minIdx; i++) startMax = Math.max(startMax, raw[i]);
  const fallDepth = startMax - raw[minIdx];
  const minPos = minIdx / (N - 1);
  const shapePenalty = { 1: 0, 2: 0, 3: 0, 4: 0 };
  if (minPos > 0.25 && fallDepth > 0.7) shapePenalty[2] = 0.5 * (fallDepth - 0.7) + 0.2;
  if (!opts.prefix || upTo > 0.6) {
    if (fallDepth < 0.6) shapePenalty[3] = 0.6 * (0.6 - fallDepth) + 0.15;
  }

  const distances = {};
  for (const k of [1, 2, 3, 4]) {
    const tpl = removeMean(sampleShape(TONES[k].shape, N, upTo).map((x) => x * cfg.chaoToSemitone));
    let tt = 0, ct = 0;
    for (let i = 0; i < N; i++) { tt += tpl[i] * tpl[i]; ct += c[i] * tpl[i]; }
    let scale = 1;
    if (tt > 1e-6) scale = Math.min(cfg.scaleMax, Math.max(cfg.scaleMin, ct / tt));
    const scaled = tpl.map((x) => x * scale);
    const d = dtw(c, scaled, cfg.dtwBand);
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

  return { tone, top, confidence, probs, distances, quality, contour: c };
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
