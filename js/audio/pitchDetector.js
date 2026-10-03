// F0 estimation with YIN (de Cheveigné & Kawahara, 2002).
// Frames arrive at the device rate, are decimated to ~12 kHz (the audio graph
// low-passes at 1 kHz first), and YIN picks the first CMND dip under threshold.

export function decimate(input, factor, out) {
  const n = Math.floor(input.length / factor);
  const o = out && out.length === n ? out : new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += factor) {
    let s = 0;
    for (let k = 0; k < factor; k++) s += input[j + k];
    o[i] = s / factor;
  }
  return o;
}

/**
 * YIN on one frame. Returns { f0, clarity } where clarity = 1 - CMND(tau*).
 */
export function yin(x, sampleRate, opts, scratch) {
  const tauMin = Math.max(2, Math.floor(sampleRate / opts.fMax));
  let tauMax = Math.ceil(sampleRate / opts.fMin);
  const W = Math.max(8, x.length - tauMax - 2);
  tauMax = Math.min(tauMax, x.length - W - 2);
  const d = scratch && scratch.length >= tauMax + 2 ? scratch : new Float32Array(tauMax + 2);

  // Difference function + cumulative mean normalisation in one pass
  d[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    let sum = 0;
    for (let j = 0; j < W; j++) {
      const diff = x[j] - x[j + tau];
      sum += diff * diff;
    }
    running += sum;
    d[tau] = running > 0 ? (sum * tau) / running : 1;
  }

  // Absolute threshold: first dip under threshold, then walk to its local minimum
  let best = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (d[tau] < opts.yinThreshold) {
      while (tau + 1 <= tauMax && d[tau + 1] < d[tau]) tau++;
      best = tau;
      break;
    }
  }
  if (best < 0) {
    // No dip under threshold: take the global minimum, clarity will be low
    let min = Infinity;
    for (let tau = tauMin; tau <= tauMax; tau++) {
      if (d[tau] < min) { min = d[tau]; best = tau; }
    }
  }

  // Parabolic interpolation around the chosen lag
  const a = d[best - 1], b = d[best], c = d[best + 1];
  const denom = a - 2 * b + c;
  let shift = denom > 1e-9 ? (0.5 * (a - c)) / denom : 0;
  if (shift > 1) shift = 1; else if (shift < -1) shift = -1;

  return { f0: sampleRate / (best + shift), clarity: 1 - Math.min(1, b) };
}

/**
 * Stateful per-frame analyser: level gate with an adaptive noise floor + YIN.
 */
export class PitchTracker {
  constructor(sampleRate, pitchCfg) {
    this.cfg = { ...pitchCfg };
    this.factor = Math.max(1, Math.round(sampleRate / pitchCfg.targetRate));
    this.rate = sampleRate / this.factor;
    this.noiseFloor = 0.002;
    this.sensitivity = 1;
    this.dec = null;
    this.scratch = new Float32Array(Math.ceil(this.rate / pitchCfg.fMin) + 4);
  }

  setSensitivity(mult) { this.sensitivity = mult; }

  /** Raw samples needed per analysis: a 25 ms YIN window plus the longest lag. */
  get frameLength() {
    const w = Math.ceil(0.025 * this.rate);
    const tauMax = Math.ceil(this.rate / this.cfg.fMin);
    return (w + tauMax + 2) * this.factor;
  }

  analyze(buffer) {
    // Use only the newest ~45 ms: short enough to follow fast tone glides,
    // long enough for two periods of a low voice.
    const need = this.frameLength;
    const frame = buffer.length > need ? buffer.subarray(buffer.length - need) : buffer;
    const n = frame.length;
    let s = 0;
    for (let i = 0; i < n; i++) s += frame[i] * frame[i];
    const rms = Math.sqrt(s / n);

    this.dec = decimate(frame, this.factor, this.dec);
    const { f0, clarity } = yin(this.dec, this.rate, this.cfg, this.scratch);

    const gate = Math.max(this.cfg.minRms * this.sensitivity, this.noiseFloor * this.cfg.noiseRatio);
    const inRange = f0 >= this.cfg.fMin && f0 <= this.cfg.fMax;
    const voiced = rms > gate && clarity >= this.cfg.minClarity && inRange;

    if (!voiced) {
      // Track background level slowly; loud non-periodic sounds raise it a little
      this.noiseFloor += 0.03 * (Math.min(rms, this.noiseFloor * 4 + 1e-4) - this.noiseFloor);
      this.noiseFloor = Math.min(0.05, Math.max(0.0004, this.noiseFloor));
    }
    return { voiced, f0, clarity, rms, gate };
  }
}
