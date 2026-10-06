// Helpers for the real-recording tests: load decoded PCM, pitch-shift,
// and run the same tracker -> segmenter chain the browser runs.

import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../js/config.js';
import { PitchTracker } from '../js/audio/pitchDetector.js';
import { UtteranceSegmenter } from '../js/audio/segmenter.js';
import { browserFilter } from './dsp.mjs';

export const SR = 48000, FFT = 8192, HOP = +(process.env.HOP || 480);
export const dir = process.env.REALDATA || path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../realdata');
export const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));

let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
export const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());


/** Resample-based pitch shift (also shifts formants; fine for F0 testing). */
export function shift(x, ratio) {
  if (ratio === 1) return x;
  const n = Math.floor(x.length / ratio), y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * ratio, j = Math.floor(p), u = p - j;
    y[i] = (x[j] || 0) * (1 - u) + (x[j + 1] || 0) * u;
  }
  return y;
}

export function load(file) {
  const b = fs.readFileSync(path.join(dir, file));
  return new Float32Array(b.buffer, b.byteOffset, b.length / 4);
}

export function runChain(signal, cfg = CONFIG, onEvent = null) {
  const pad = new Float32Array(signal.length + SR * 1.2);
  pad.set(signal, Math.floor(SR * 0.3));
  const f = browserFilter(pad);
  const tracker = new PitchTracker(SR, cfg.pitch);
  const seg = new UtteranceSegmenter(cfg.segment);
  const utts = [];
  for (let end = FFT; end <= f.length; end += HOP) {
    const ev = seg.push(end / SR, tracker.analyze(f.subarray(end - FFT, end), HOP / SR));
    if (ev && ev.type === 'end') utts.push(ev.frames);
    if (ev && onEvent) onEvent(ev, end / SR);
  }
  return utts;
}

