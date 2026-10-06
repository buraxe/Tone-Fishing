// Small SVG drawing of a tone contour on the five-level Chao staff.

import { TONES, sampleShape } from '../data/tones.js';

/** Large teaching staff: five Chao levels numbered 1-5, the tone path, start/end dots. */
export function toneStaffSVG(tone, { width = 440, height = 150 } = {}) {
  const t = TONES[tone];
  const left = 34, right = 14, top = 14, bottom = 14;
  const pts = Array.from(sampleShape(t.shape, 48));
  const X = (u) => left + u * (width - left - right);
  const Y = (lvl) => top + ((5 - lvl) / 4) * (height - top - bottom);
  let g = '';
  for (let k = 1; k <= 5; k++) {
    g += `<line x1="${left}" x2="${width - right}" y1="${Y(k)}" y2="${Y(k)}" stroke="currentColor" stroke-opacity="${k === 3 ? 0.18 : 0.1}" stroke-width="1"/>`;
    g += `<text x="${left - 12}" y="${Y(k)}" font-size="12" font-weight="700" fill="currentColor" fill-opacity="0.45" text-anchor="middle" dominant-baseline="central">${k}</text>`;
  }
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${X(i / (pts.length - 1)).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const s = pts[0], e = pts[pts.length - 1];
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" style="display:block;max-width:${width}px;margin:0 auto" aria-hidden="true">${g}
    <path class="staff-path" d="${d}" fill="none" stroke="${t.color}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" pathLength="1"/>
    <circle cx="${X(0)}" cy="${Y(s)}" r="7" fill="#fff" stroke="${t.color}" stroke-width="4"/>
    <circle cx="${X(1)}" cy="${Y(e)}" r="7" fill="${t.color}"/></svg>`;
}

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
