// Real-time pitch graph: target tone contour (dashed) vs the player's contour.
// Vertical axis is semitones around the player's own mean, so voices of any
// range line up with the target shape the same way the classifier sees them.

import { TONES, sampleShape } from '../data/tones.js';

const G = {
  bg: '#f4f7f3', grid: 'rgba(31,42,46,0.08)', axis: 'rgba(31,42,46,0.35)',
  player: '#1f2a2e', playerSoft: 'rgba(31,42,46,0.35)',
};

export class PitchGraph {
  constructor(canvas, { stepSt = 1.8 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.stepSt = stepSt;
    this.tone = 1;
    this.live = null;
    this.final = false;
    this.center = null;
    this.resize();
    if (window.ResizeObserver) new ResizeObserver(() => { this.resize(); this.draw(); }).observe(canvas);
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.dpr = dpr;
    this.W = r.width;
    this.H = r.height;
  }

  setTarget(tone) { this.tone = tone; this.live = null; this.final = false; this.draw(); }

  /** contour: { t: number[], st: number[] } in seconds / semitones, or null. */
  setContour(contour, final) {
    this.live = contour;
    this.final = final;
    if (contour && contour.st.length) {
      const m = contour.st.reduce((a, b) => a + b, 0) / contour.st.length;
      this.center = this.center == null || final ? m : this.center + (m - this.center) * 0.3;
    }
    this.draw();
  }

  draw() {
    const { ctx, W, H, dpr } = this;
    if (!W || !H) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const padL = 22, padR = 10, padT = 10, padB = 10;
    const iw = W - padL - padR, ih = H - padT - padB;
    const span = 9; // ± semitones shown
    const center = this.center ?? 0;
    const X = (u) => padL + u * iw;
    const Y = (st) => padT + ih / 2 - ((st - center) / span) * (ih / 2);

    // Background + Chao level guides (5 lines)
    ctx.fillStyle = G.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = G.grid;
    ctx.lineWidth = 1;
    for (let k = 1; k <= 5; k++) {
      const y = Y(center + (k - 3) * this.stepSt);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
      ctx.stroke();
    }
    ctx.fillStyle = G.axis;
    ctx.font = '600 12px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('高', 4, Y(center + 2 * this.stepSt));
    ctx.fillText('低', 4, Y(center - 2 * this.stepSt));

    // Target contour, mean-centred like the classifier compares it
    const tone = TONES[this.tone];
    const tpl = Array.from(sampleShape(tone.shape, 48)).map((c) => c * this.stepSt);
    const tm = tpl.reduce((a, b) => a + b, 0) / tpl.length;
    ctx.strokeStyle = tone.color;
    ctx.lineWidth = 7;
    ctx.globalAlpha = 0.22;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.path(tpl.map((v, i) => [X(i / (tpl.length - 1)), Y(center + v - tm)]));
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([7, 6]);
    this.path(tpl.map((v, i) => [X(i / (tpl.length - 1)), Y(center + v - tm)]));
    ctx.setLineDash([]);

    // Player contour
    const c = this.live;
    if (c && c.t.length > 1) {
      const t0 = c.t[0];
      const dur = c.t[c.t.length - 1] - t0;
      const width = this.final ? dur : Math.max(0.5, dur);
      const pts = c.t.map((t, i) => [X(width > 0 ? (t - t0) / width : 0), Y(c.st[i])]);
      ctx.strokeStyle = this.final ? G.player : G.playerSoft;
      ctx.lineWidth = 3.2;
      this.path(pts);
      ctx.fillStyle = G.player;
      const last = pts[pts.length - 1];
      ctx.beginPath();
      ctx.arc(last[0], last[1], 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  path(pts) {
    const ctx = this.ctx;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
}
