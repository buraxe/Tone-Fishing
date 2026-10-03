// Shared helpers for the offline tests: a voice-like synthesiser and the
// same tracker → segmenter chain the browser runs every animation frame.

import { CONFIG } from '../js/config.js';
import { PitchTracker } from '../js/audio/pitchDetector.js';
import { UtteranceSegmenter } from '../js/audio/segmenter.js';
import { TONES, sampleShape } from '../js/data/tones.js';

export const SR = 48000;
const FFT = 4096;
const HOP = 800; // ~60 analyses per second, like requestAnimationFrame

let seed = 12345;
export const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
export const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());

// Learner-style productions: imperfect versions of each tone
export const PRODUCTIONS = {
  1: [[[0, 5], [1, 5]], [[0, 5], [1, 4.4]], [[0, 4.6], [0.5, 5], [1, 4.7]]],
  2: [[[0, 3], [1, 5]], [[0, 2.5], [0.3, 2.4], [1, 4.6]], [[0, 3], [0.5, 3.6], [1, 5]]],
  3: [[[0, 2.2], [0.45, 1], [0.6, 1], [1, 4]], [[0, 3], [0.5, 1], [1, 3.5]], [[0, 2.5], [0.35, 1], [1, 4.5]]],
  4: [[[0, 5], [1, 1]], [[0, 5], [0.2, 5], [1, 2]], [[0, 4.5], [1, 1.3]]],
};

export function biquadLowpass(x, fc, q = 0.707) {
  const w = (2 * Math.PI * fc) / SR, alpha = Math.sin(w) / (2 * q), cw = Math.cos(w);
  const a0 = 1 + alpha;
  const b0 = (1 - cw) / 2 / a0, b1 = (1 - cw) / a0, b2 = b0, a1 = (-2 * cw) / a0, a2 = (1 - alpha) / a0;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/** Voice-like source: harmonics with a vowel-ish spectral envelope, jitter, noise. */
export function synth({ shape, baseHz, stepSt, dur, noise = 0.003, amp = 0.2 }) {
  const lead = 0.3, tail = 0.5;
  const n = Math.floor((lead + dur + tail) * SR);
  const x = new Float32Array(n);
  const ctrl = sampleShape(shape, 200);
  let phase = 0, jitter = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR - lead;
    x[i] = noise * gauss();
    if (t < 0 || t > dur) continue;
    const u = t / dur;
    const chao = ctrl[Math.min(199, Math.floor(u * 199))];
    jitter = 0.999 * jitter + 0.02 * gauss() * 0.05;
    const f0 = baseHz * 2 ** (((chao - 3) * stepSt + jitter) / 12);
    phase += f0 / SR;
    const env = Math.min(1, t / 0.03) * Math.min(1, (dur - t) / 0.05);
    let s = 0;
    for (let h = 1; h * f0 < 4000; h++) {
      const fh = h * f0;
      const g = 1 / (1 + ((fh - 700) / 300) ** 2) + 0.5 / (1 + ((fh - 1200) / 400) ** 2) + 0.15 / h;
      s += g * Math.sin(2 * Math.PI * h * phase);
    }
    x[i] += amp * env * s * 0.3;
  }
  return x;
}

export function run(signal, onEvent) {
  const filtered = biquadLowpass(signal, 1000);
  const tracker = new PitchTracker(SR, CONFIG.pitch);
  const seg = new UtteranceSegmenter(CONFIG.segment);
  const utterances = [];
  for (let end = FFT; end <= filtered.length; end += HOP) {
    const r = tracker.analyze(filtered.subarray(end - FFT, end));
    const ev = seg.push(end / SR, r);
    if (ev && ev.type === 'end') utterances.push(ev.frames);
    if (ev && onEvent) onEvent(ev, end / SR);
  }
  return utterances;
}

