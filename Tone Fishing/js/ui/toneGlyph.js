// Small SVG drawing of a tone contour on the five-level Chao staff.

import { TONES, sampleShape } from '../data/tones.js';

export function toneGlyphSVG(tone, { width = 96, height = 56, staff = true, stroke = 5 } = {}) {
  const t = TONES[tone];
  const pad = stroke + 2;
  const pts = Array.from(sampleShape(t.shape, 32));
  const X = (i) => pad + (i / (pts.length - 1)) * (width - 2 * pad);
  const Y = (lvl) => pad + ((5 - lvl) / 4) * (height - 2 * pad);
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  let lines = '';
  if (staff) {
    for (let k = 1; k <= 5; k++) {
      lines += `<line x1="${pad}" x2="${width - pad}" y1="${Y(k)}" y2="${Y(k)}" stroke="currentColor" stroke-opacity="0.13" stroke-width="1"/>`;
    }
  }
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">${lines}<path d="${d}" fill="none" stroke="${t.color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
