// A small vowel synthesiser that sings a tone contour. Used for 听声调示范
// (play the target contour to the player) and for 示范模式 (feed a synthetic
// voice into the analyser when no microphone is available).

import { TONES, sampleShape } from '../data/tones.js';

export function toneDuration(tone) { return tone === 3 ? 0.62 : 0.46; }

/**
 * Play `tone` on `ctx`. Connects to the speakers and, if given, to `analysisNode`.
 * Returns the duration in seconds.
 */
export function speakTone(ctx, tone, { baseHz = 165, stepSt = 1.8, analysisNode = null, volume = 0.22 } = {}) {
  const dur = toneDuration(tone);
  const t0 = ctx.currentTime + 0.05;
  const curve = sampleShape(TONES[tone].shape, 64);
  const hz = new Float32Array(curve.length);
  for (let i = 0; i < curve.length; i++) hz[i] = baseHz * 2 ** (((curve[i] - 3) * stepSt) / 12);

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(hz[0], t0);
  osc.frequency.setValueCurveAtTime(hz, t0, dur);

  // Two formants of an open "a" vowel plus a soft direct path
  const out = ctx.createGain();
  out.gain.value = 0;
  for (const [f, q, g] of [[750, 5, 1.0], [1150, 7, 0.55], [2600, 9, 0.18]]) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = g;
    osc.connect(bp).connect(gain).connect(out);
  }
  const direct = ctx.createBiquadFilter();
  direct.type = 'lowpass';
  direct.frequency.value = 600;
  const dg = ctx.createGain();
  dg.gain.value = 0.25;
  osc.connect(direct).connect(dg).connect(out);

  out.gain.setValueAtTime(0, t0);
  out.gain.linearRampToValueAtTime(volume, t0 + 0.035);
  out.gain.setValueAtTime(volume, t0 + dur - 0.06);
  out.gain.linearRampToValueAtTime(0, t0 + dur);

  out.connect(ctx.destination);
  if (analysisNode) out.connect(analysisNode);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
  osc.onended = () => out.disconnect();
  return dur + 0.05;
}
