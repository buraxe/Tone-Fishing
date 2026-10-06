// Animated tone staff: the contour is drawn in step with the audio while a hand
// marker travels along it, so sound, picture and gesture always show the same
// movement at the same moment.

import { TONES, sampleShape } from '../data/tones.js';

const HAND = `
  <g class="hand-icon">
    <circle r="17" class="hand-halo"/>
    <g transform="translate(0,3)">
      <rect x="-8" y="-4" width="16" height="13" rx="5"/>
      <rect x="-8" y="-15" width="3.6" height="13" rx="1.8"/>
      <rect x="-3.8" y="-17.5" width="3.6" height="15" rx="1.8"/>
      <rect x="0.4" y="-16.5" width="3.6" height="14" rx="1.8"/>
      <rect x="4.6" y="-13.5" width="3.4" height="11" rx="1.7"/>
      <rect x="-14" y="-3" width="9" height="3.6" rx="1.8" transform="rotate(-35 -9 -1)"/>
    </g>
  </g>`;

/** Build an animated staff inside `host`. Returns { play(seconds), reset() }. */
export function createToneStage(host, tone, { width = 440, height = 170, labels = true, ghost = null } = {}) {
  const t = TONES[tone];
  const left = labels ? 34 : 14, right = 22, top = 24, bottom = 18;
  const X = (u) => left + u * (width - left - right);
  const Y = (lvl) => top + ((5 - lvl) / 4) * (height - top - bottom);
  const pathOf = (shape) => Array.from(sampleShape(shape, 60)).map((v, i) => `${i ? 'L' : 'M'}${X(i / 59).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');

  let grid = '';
  for (let k = 1; k <= 5; k++) {
    grid += `<line x1="${left}" x2="${width - right}" y1="${Y(k)}" y2="${Y(k)}" class="staff-line${k === 3 ? ' mid' : ''}"/>`;
    if (labels) grid += `<text x="${left - 14}" y="${Y(k)}" class="staff-num">${k}</text>`;
  }
  const ghostPath = ghost ? `<path d="${pathOf(TONES[ghost].shape)}" class="ghost-path" stroke="${TONES[ghost].color}"/>` : '';
  host.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" class="tone-stage" style="--tc:${t.color}" aria-hidden="true">
      ${grid}
      ${ghostPath}
      <path d="${pathOf(t.shape)}" class="track-path" stroke="${t.color}"/>
      <path d="${pathOf(t.shape)}" class="live-path" stroke="${t.color}" pathLength="1000"/>
      <circle class="start-dot" cx="${X(0)}" cy="${Y(t.shape[0][1])}" r="6" stroke="${t.color}"/>
      <g class="hand" style="--tc:${t.color}">${HAND}</g>
    </svg>`;

  const svg = host.querySelector('svg');
  const live = svg.querySelector('.live-path');
  const hand = svg.querySelector('.hand');
  const total = live.getTotalLength ? live.getTotalLength() : 0;
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0;

  const place = (u) => {
    live.style.strokeDashoffset = String(1000 * (1 - u));
    if (total) {
      const p = live.getPointAtLength(total * u);
      hand.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
    }
  };
  const reset = () => { cancelAnimationFrame(raf); place(0); svg.classList.remove('playing'); };
  reset();
  place(1);

  return {
    el: svg,
    reset,
    /** Draw the contour over `seconds` (the length of the audio being played). */
    play(seconds) {
      cancelAnimationFrame(raf);
      if (reduced) { place(1); return Promise.resolve(); }
      svg.classList.add('playing');
      const start = performance.now();
      const dur = Math.max(0.25, seconds) * 1000;
      return new Promise((resolve) => {
        const step = (now) => {
          const u = Math.min(1, (now - start) / dur);
          place(u);
          if (u < 1) raf = requestAnimationFrame(step);
          else { svg.classList.remove('playing'); resolve(); }
        };
        place(0);
        raf = requestAnimationFrame(step);
      });
    },
  };
}
