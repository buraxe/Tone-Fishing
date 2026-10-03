// Short synthesised sound effects (no audio files to load).

function noiseBuffer(ctx, seconds) {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

export function playWhoosh(ctx) {
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 0.4);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(400, t);
  bp.frequency.exponentialRampToValueAtTime(2400, t + 0.3);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.18, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
  src.connect(bp).connect(g).connect(ctx.destination);
  src.start(t);
}

export function playSplash(ctx) {
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 0.6);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(3000, t);
  lp.frequency.exponentialRampToValueAtTime(300, t + 0.5);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.25, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
  src.connect(lp).connect(g).connect(ctx.destination);
  src.start(t);
}

/** Rising pentatonic chime for a caught fish. */
export function playSuccess(ctx) {
  const t = ctx.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = ctx.createGain();
    const s = t + i * 0.09;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.16, s + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.5);
    o.connect(g).connect(ctx.destination);
    o.start(s);
    o.stop(s + 0.55);
  });
}

/** Soft falling two-note for trash. Gentle on purpose. */
export function playTrash(ctx) {
  const t = ctx.currentTime;
  [392, 330].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const g = ctx.createGain();
    const s = t + i * 0.16;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.12, s + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.35);
    o.connect(g).connect(ctx.destination);
    o.start(s);
    o.stop(s + 0.4);
  });
}
