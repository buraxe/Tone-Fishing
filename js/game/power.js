// Live charging of the fishing rod from the partial pitch contour.
// Power is 0..1. Live charging stops at liveCap; only a confirmed correct tone
// at the end of the utterance fills the last part and triggers the cast.

export function livePowerStep(power, live, target, dt, cfg) {
  if (!live || live.result.quality < 0.25) return { power, mood: 'listening' };

  const p = live.result.probs[target];
  const score = live.score;
  let mood;
  let next = power;

  if (p >= 0.55 && score >= 60) {
    // Close to the target: fill fast, faster when the match is better
    next += cfg.chargeRate * dt * Math.min(1, (score - 45) / 45);
    mood = score >= 80 ? 'close' : 'good';
  } else if (p >= 0.3) {
    next += cfg.chargeRate * 0.25 * dt;
    mood = 'partial';
  } else {
    const otherTop = live.result.top !== target && live.result.probs[live.result.top] >= 0.6;
    if (otherTop) next -= cfg.drainRate * dt;
    mood = otherTop ? 'conflict' : 'partial';
  }
  next = Math.max(0, Math.min(cfg.liveCap, Math.max(next, mood === 'conflict' ? 0 : power)));
  return { power: next, mood };
}
