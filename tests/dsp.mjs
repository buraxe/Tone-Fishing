// Offline copy of the browser's analysis filters (BiquadFilterNode uses the same RBJ formulas).

const SR = 48000;

/** RBJ biquad, same as the browser's BiquadFilterNode. */
export function biquad(x, type, fc, q = 0.707) {
  const w = (2 * Math.PI * fc) / SR, alpha = Math.sin(w) / (2 * q), cw = Math.cos(w), a0 = 1 + alpha;
  const lp = type === 'lowpass';
  const b0 = (lp ? (1 - cw) / 2 : (1 + cw) / 2) / a0, b1 = (lp ? 1 - cw : -(1 + cw)) / a0;
  const a1 = (-2 * cw) / a0, a2 = (1 - alpha) / a0;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/** The browser's analysis graph: high-pass 55 Hz twice, low-pass 1 kHz. */
export function browserFilter(x) {
  return biquad(biquad(biquad(x, 'highpass', 55), 'highpass', 55), 'lowpass', 1000);
}
