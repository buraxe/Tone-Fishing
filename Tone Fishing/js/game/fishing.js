// The lake scene: fisherman, rod, line, four floating targets, cast animation.
// Pure canvas drawing; game logic tells it the power level and when to cast.

const C = {
  skyTop: '#cfe3df', skyBottom: '#eef2ea', sun: '#f6e7b8',
  mountainFar: '#b7cbc6', mountainNear: '#8fb0aa',
  waterTop: '#5d9e98', waterBottom: '#1f5a5f', shimmer: 'rgba(255,255,255,0.22)',
  dock: '#8a6a4a', dockDark: '#6a4f37', dockLight: '#a8835d',
  hat: '#d9b56a', hatShade: '#b48f48', jacket: '#2f4f7a', jacketDark: '#233d61', skin: '#e2b48f', pants: '#3b3b44',
  rod: '#5a3b22', line: 'rgba(40,40,40,0.75)', bobberRed: '#d2412f', bobberWhite: '#f7f7f2',
  koi: '#e2582f', koiLight: '#f39a55', koiBelly: '#fbe1c4', eye: '#1b1b1b',
  bottle: 'rgba(150,205,225,0.85)', bottleCap: '#2f6fb0', can: '#c9473b', canMetal: '#c9cdd2',
  bag: 'rgba(245,245,240,0.85)', bagLine: 'rgba(160,165,170,0.9)', boot: '#5b4636', bootSole: '#2e241c',
  reed: '#5f7d4a', reedTip: '#8a6a3a', ripple: 'rgba(255,255,255,0.55)', splash: 'rgba(235,248,250,0.9)',
  sparkle: '#ffd866',
};

const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
const lerp = (a, b, u) => a + (b - a) * u;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export class FishingScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.t = 0;
    this.power = 0;
    this.shownPower = 0;
    this.energy = 0;
    this.mood = 'idle';
    this.slots = [];
    this.targets = [];
    this.ripples = [];
    this.drops = [];
    this.cast = null;
    this.catch = null;
    this.reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.clouds = [0.12, 0.45, 0.78].map((x, i) => ({ x, y: 0.08 + i * 0.05, w: 0.16 + i * 0.03, v: 0.004 + i * 0.002 }));
    this.resize();
    window.addEventListener('resize', () => this.resize());
    if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(canvas);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.dpr = dpr;
    this.W = rect.width;
    this.H = rect.height;
    this.layout();
  }

  layout() {
    const { W, H } = this;
    this.s = Math.max(0.5, Math.min(W / 860, H / 480));
    const s = this.s;
    this.horizon = H * (W / H > 1.3 ? 0.36 : 0.3);
    this.dockW = Math.max(120 * s, W * 0.2);
    this.dockY = H - 70 * s;
    this.seat = { x: this.dockW * 0.5, y: this.dockY };
    this.hand = { x: this.seat.x + 30 * s, y: this.dockY - 48 * s };
    this.rodLen = Math.min(240 * s, (this.hand.y - 10) * 1.05, W * 0.42);
    const waterH = H - this.horizon;
    this.bobber = { x: this.dockW + Math.min(70 * s, W * 0.08), y: this.horizon + waterH * 0.5 };
    // Target slots across the open water
    const x0 = this.dockW + Math.max(90 * s, W * 0.1), x1 = W - 40 * s;
    const depths = this.depths || [0.32, 0.62, 0.42, 0.7];
    this.slotPos = [0, 1, 2, 3].map((i) => ({
      x: lerp(x0, x1, i / 3) + (this.jitter ? this.jitter[i] : 0) * s,
      y: this.horizon + waterH * depths[i],
    }));
  }

  /** New round: 4 kinds, e.g. ['bag','fish','can','bottle']. */
  setRound(slots) {
    this.slots = slots;
    this.depths = [0, 1, 2, 3].map(() => 0.26 + Math.random() * 0.5);
    this.jitter = [0, 1, 2, 3].map(() => (Math.random() - 0.5) * 30);
    this.layout();
    this.targets = slots.map((kind, i) => ({ kind, i, born: this.t + i * 0.08, phase: Math.random() * 6.28, gone: false }));
    this.catch = null;
    this.cast = null;
    this.power = 0;
  }

  setCharge(power, energy, mood) {
    this.power = power;
    this.energy = energy;
    this.mood = mood;
  }

  /** Cast to slot index. Resolves after the catch has been reeled in. */
  castTo(index, onSplash) {
    return new Promise((resolve) => {
      this.cast = { index, start: this.t, onSplash, resolve, splashed: false };
    });
  }

  // ---------- frame ----------
  frame(dt) {
    this.t += dt;
    this.shownPower += (this.power - this.shownPower) * Math.min(1, dt * 10);
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawBackdrop(ctx);
    this.drawWater(ctx);
    this.updateRipples(dt);
    this.drawTargets(ctx);
    this.drawReeds(ctx);
    const rod = this.rodState();
    this.drawLine(ctx, rod);
    this.drawDock(ctx);
    this.drawFisherman(ctx, rod);
    this.drawRod(ctx, rod);
    this.drawCatch(ctx, rod);
    this.drawDrops(ctx, dt);
  }

  // ---------- rod + cast state ----------
  rodState() {
    const s = this.s;
    const idle = -0.95;
    let angle = idle - this.shownPower * 0.55;
    let bend = 0.05 + this.shownPower * 0.2;
    let hook = null;
    const wob = this.reduced ? 0 : this.energy * 0.03 * Math.sin(this.t * 28) + (this.mood === 'conflict' ? 0.025 * Math.sin(this.t * 55) : 0);
    angle += wob;

    const c = this.cast;
    if (c) {
      const e = this.t - c.start;
      const target = this.slotPos[c.index];
      const T = { wind: 0.35, throw: 0.2, fly: 0.65, sink: 0.45, pause: 0.3, reel: 0.85 };
      const t1 = T.wind, t2 = t1 + T.throw, t3 = t2 + T.fly, t4 = t3 + T.sink, t5 = t4 + T.pause, t6 = t5 + T.reel;
      if (e < t1) {
        const u = ease(e / t1);
        angle = lerp(idle - 0.55, idle - 0.95, u);
        bend = lerp(0.25, 0.32, u);
      } else if (e < t2) {
        const u = ease((e - t1) / T.throw);
        angle = lerp(idle - 0.95, idle + 0.4, u);
        bend = lerp(0.32, -0.12, u);
      } else {
        angle = idle + 0.25;
        bend = 0.04;
      }
      const tip = this.tipFor(angle, bend);
      if (e >= t2 && e < t3) {
        const u = (e - t2) / T.fly;
        const arc = Math.min(this.H * 0.35, 200 * s);
        hook = { x: lerp(tip.x, target.x, u), y: lerp(tip.y, target.y, u) - arc * 4 * u * (1 - u), flying: true };
      } else if (e >= t3 && e < t5) {
        if (!c.splashed) {
          c.splashed = true;
          this.splash(target.x, target.y);
          c.onSplash && c.onSplash();
        }
        const u = (e - t3) / (T.sink + T.pause);
        hook = { x: target.x, y: target.y + 6 * s * Math.sin(Math.min(1, u * 2) * Math.PI) };
        const tg = this.targets[c.index];
        if (tg) tg.tug = Math.sin(u * Math.PI * 3) * 4 * s;
        bend = 0.1 + 0.08 * Math.sin(u * Math.PI * 4);
      } else if (e >= t5 && e < t6) {
        const u = ease((e - t5) / T.reel);
        const hang = this.hangPoint(this.tipFor(angle, 0.22));
        if (this.targets[c.index]) this.targets[c.index].gone = true;
        this.catch = { kind: this.slots[c.index], x: lerp(target.x, hang.x, u), y: lerp(target.y, hang.y, u) - Math.sin(u * Math.PI) * 60 * s, since: this.t };
        angle = lerp(idle + 0.25, idle - 0.25, u);
        bend = lerp(0.1, 0.24, u);
        if (Math.random() < 0.3 && u < 0.3) this.drops.push(this.drop(this.catch.x, this.catch.y));
      } else if (e >= t6) {
        angle = idle - 0.25;
        bend = 0.22;
        const hang = this.hangPoint(this.tipFor(angle, bend));
        this.catch = { ...(this.catch || { kind: this.slots[c.index], since: this.t }), x: hang.x, y: hang.y };
        if (!c.done) { c.done = true; c.resolve(); }
      }
      return { angle, bend, tip: this.tipFor(angle, bend), hook, casting: true, phaseT: e };
    }
    if (this.catch) {
      angle = idle - 0.25;
      bend = 0.22;
      const tip = this.tipFor(angle, bend);
      const hang = this.hangPoint(tip);
      this.catch.x = hang.x;
      this.catch.y = hang.y;
      return { angle, bend, tip, hook: null, casting: false };
    }
    return { angle, bend, tip: this.tipFor(angle, bend), hook: null, casting: false };
  }

  hangPoint(tip) { return { x: tip.x + 4 * this.s, y: tip.y + 86 * this.s }; }

  rodBase(angle) {
    const L = this.rodLen;
    return { x: this.hand.x - Math.cos(angle) * L * 0.12, y: this.hand.y - Math.sin(angle) * L * 0.12 };
  }

  tipFor(angle, bend) {
    const L = this.rodLen, B = this.rodBase(angle);
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const px = -dy, py = dx; // perpendicular, toward forward-down for an up-right rod
    return { x: B.x + dx * L * 0.97 + px * bend * L * 0.55, y: B.y + dy * L * 0.97 + py * bend * L * 0.55 };
  }

  // ---------- scenery ----------
  drawBackdrop(ctx) {
    const { W, H, horizon, s } = this;
    const g = ctx.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, C.skyTop);
    g.addColorStop(1, C.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, horizon + 2);

    ctx.fillStyle = C.sun;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(W * 0.78, horizon * 0.42, 34 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Drifting clouds
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const c of this.clouds) {
      const x = (((c.x + this.t * c.v) % 1.3) - 0.15) * W;
      const y = c.y * H, w = c.w * W * 0.6;
      ctx.beginPath();
      ctx.ellipse(x, y, w * 0.5, 10 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(x + w * 0.18, y - 7 * s, w * 0.28, 11 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ink-wash mountain ridges
    this.ridge(ctx, horizon, 0.62, C.mountainFar, 1.7, 0.3);
    this.ridge(ctx, horizon, 0.38, C.mountainNear, 2.9, 1.7);
  }

  ridge(ctx, base, height, color, freq, seed) {
    const { W, H } = this;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, base + 1);
    const peak = base * height;
    for (let x = 0; x <= W; x += 8) {
      const u = x / W;
      const y = base - peak * (0.35 + 0.35 * Math.sin(u * freq * 3.1 + seed) * Math.sin(u * 7.3 + seed * 2) + 0.3 * Math.sin(u * freq * 1.3 + seed) ** 2);
      ctx.lineTo(x, Math.min(base, y));
    }
    ctx.lineTo(W, base + 1);
    ctx.closePath();
    ctx.fill();
  }

  drawWater(ctx) {
    const { W, H, horizon, s } = this;
    const g = ctx.createLinearGradient(0, horizon, 0, H);
    g.addColorStop(0, C.waterTop);
    g.addColorStop(1, C.waterBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, horizon, W, H - horizon);
    // Shimmer strokes
    ctx.strokeStyle = C.shimmer;
    ctx.lineWidth = 1.5 * s;
    ctx.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      const y = horizon + ((i + 0.5) / 14) * (H - horizon);
      const off = this.reduced ? 0 : Math.sin(this.t * 0.6 + i * 1.7) * 30 * s;
      const len = (20 + (i % 4) * 14) * s * (0.6 + y / H);
      for (let k = 0; k < 3; k++) {
        const x = ((i * 137 + k * 311) % 1000) / 1000 * W + off;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + len, y);
        ctx.stroke();
      }
    }
  }

  drawReeds(ctx) {
    const { s, dockW, dockY, H } = this;
    ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const x = dockW + 6 * s + (i % 5) * 9 * s - (i > 4 ? 30 * s : 0);
      const h = (60 + ((i * 37) % 40)) * s;
      const sway = this.reduced ? 0 : Math.sin(this.t * 1.3 + i) * 5 * s;
      ctx.strokeStyle = C.reed;
      ctx.lineWidth = 2.2 * s;
      ctx.beginPath();
      ctx.moveTo(x, H);
      ctx.quadraticCurveTo(x + sway * 0.3, H - h * 0.6, x + sway, H - h);
      ctx.stroke();
      if (i % 3 === 0) {
        ctx.fillStyle = C.reedTip;
        ctx.beginPath();
        ctx.ellipse(x + sway, H - h - 6 * s, 2.6 * s, 8 * s, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    void dockY;
  }

  drawDock(ctx) {
    const { s, dockW, dockY, H } = this;
    // Posts
    ctx.fillStyle = C.dockDark;
    for (const fx of [0.25, 0.85]) ctx.fillRect(dockW * fx - 5 * s, dockY, 10 * s, H - dockY);
    // Planks
    ctx.fillStyle = C.dock;
    ctx.fillRect(0, dockY - 4 * s, dockW + 10 * s, 14 * s);
    ctx.fillStyle = C.dockLight;
    ctx.fillRect(0, dockY - 4 * s, dockW + 10 * s, 3 * s);
    ctx.strokeStyle = C.dockDark;
    ctx.lineWidth = 1;
    for (let x = 24 * s; x < dockW; x += 26 * s) {
      ctx.beginPath();
      ctx.moveTo(x, dockY - 4 * s);
      ctx.lineTo(x, dockY + 10 * s);
      ctx.stroke();
    }
  }

  drawFisherman(ctx, rod) {
    const { s, seat, hand } = this;
    const x = seat.x, y = seat.y - 4 * s;
    // Legs over the dock edge
    ctx.strokeStyle = C.pants;
    ctx.lineWidth = 9 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + 2 * s, y - 6 * s);
    ctx.lineTo(x + 26 * s, y - 4 * s);
    ctx.lineTo(x + 30 * s, y + 24 * s);
    ctx.stroke();
    // Body
    ctx.fillStyle = C.jacket;
    ctx.beginPath();
    ctx.moveTo(x - 18 * s, y - 2 * s);
    ctx.quadraticCurveTo(x - 20 * s, y - 44 * s, x - 2 * s, y - 52 * s);
    ctx.quadraticCurveTo(x + 16 * s, y - 50 * s, x + 16 * s, y - 2 * s);
    ctx.closePath();
    ctx.fill();
    // Arm to the hand on the rod
    const sh = { x: x + 4 * s, y: y - 40 * s };
    ctx.strokeStyle = C.jacketDark;
    ctx.lineWidth = 8 * s;
    ctx.beginPath();
    ctx.moveTo(sh.x, sh.y);
    ctx.quadraticCurveTo(sh.x + 14 * s, sh.y + 10 * s, hand.x, hand.y);
    ctx.stroke();
    ctx.fillStyle = C.skin;
    ctx.beginPath();
    ctx.arc(hand.x, hand.y, 4.5 * s, 0, Math.PI * 2);
    ctx.fill();
    // Head
    const lean = rod.casting ? Math.sin(Math.min(1, rod.phaseT / 0.55) * Math.PI) * 4 * s : this.shownPower * -3 * s;
    const hx = x - 2 * s + lean, hy = y - 62 * s;
    ctx.fillStyle = C.skin;
    ctx.beginPath();
    ctx.arc(hx, hy, 10 * s, 0, Math.PI * 2);
    ctx.fill();
    // Conical bamboo hat
    ctx.fillStyle = C.hat;
    ctx.beginPath();
    ctx.moveTo(hx - 26 * s, hy - 3 * s);
    ctx.lineTo(hx, hy - 24 * s);
    ctx.lineTo(hx + 26 * s, hy - 3 * s);
    ctx.quadraticCurveTo(hx, hy + 2 * s, hx - 26 * s, hy - 3 * s);
    ctx.fill();
    ctx.strokeStyle = C.hatShade;
    ctx.lineWidth = 1.2 * s;
    for (const k of [-0.5, 0, 0.5]) {
      ctx.beginPath();
      ctx.moveTo(hx, hy - 24 * s);
      ctx.lineTo(hx + k * 40 * s, hy - 2 * s);
      ctx.stroke();
    }
  }

  drawRod(ctx, rod) {
    const B = this.rodBase(rod.angle), tip = rod.tip;
    const L = this.rodLen;
    const dx = Math.cos(rod.angle), dy = Math.sin(rod.angle);
    const cx = B.x + dx * L * 0.55 + -dy * rod.bend * L * 0.22;
    const cy = B.y + dy * L * 0.55 + dx * rod.bend * L * 0.22;
    ctx.strokeStyle = C.rod;
    ctx.lineCap = 'round';
    const N = 12;
    let px = B.x, py = B.y;
    for (let i = 1; i <= N; i++) {
      const u = i / N;
      const x = (1 - u) * (1 - u) * B.x + 2 * (1 - u) * u * cx + u * u * tip.x;
      const y = (1 - u) * (1 - u) * B.y + 2 * (1 - u) * u * cy + u * u * tip.y;
      ctx.lineWidth = lerp(6, 1.6, u) * this.s;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(x, y);
      ctx.stroke();
      px = x; py = y;
    }
  }

  drawLine(ctx, rod) {
    const { s } = this;
    const tip = rod.tip;
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1.2;
    if (rod.hook) {
      const h = rod.hook;
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.quadraticCurveTo((tip.x + h.x) / 2, Math.max(tip.y, h.y) + (h.flying ? 10 : 25) * s, h.x, h.y);
      ctx.stroke();
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.arc(h.x, h.y + 4 * s, 4 * s, 0, Math.PI);
      ctx.stroke();
      return;
    }
    if (this.catch) {
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(this.catch.x, this.catch.y - 16 * s);
      ctx.stroke();
      return;
    }
    if (rod.casting) return;
    // Idle: line to the bobber, tighter as power builds
    const b = this.bobber;
    const by = b.y + Math.sin(this.t * 2.2) * 2 * s;
    const sag = (1 - this.shownPower) * 40 * s + 8 * s;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.quadraticCurveTo((tip.x + b.x) / 2, Math.max(tip.y, by) + sag - 30 * s, b.x, by - 8 * s);
    ctx.stroke();
    // Bobber
    ctx.fillStyle = C.bobberWhite;
    ctx.beginPath();
    ctx.ellipse(b.x, by - 3 * s, 5 * s, 6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.bobberRed;
    ctx.beginPath();
    ctx.ellipse(b.x, by - 8 * s, 5 * s, 4 * s, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    // Voice ripples at the bobber: stronger with energy and match
    const rate = this.energy * (0.5 + this.shownPower * 3);
    if (!this.reduced && Math.random() < rate * 0.12) this.ripples.push({ x: b.x, y: by, r: 4 * s, life: 1, max: (16 + 40 * this.shownPower) * s });
  }

  // ---------- targets ----------
  drawTargets(ctx) {
    const { s } = this;
    for (const tg of this.targets) {
      if (tg.gone) continue;
      const p = this.slotPos[tg.i];
      const age = this.t - tg.born;
      if (age < 0) continue;
      const appear = clamp(age / 0.45, 0, 1);
      const bob = (this.reduced ? 0 : Math.sin(this.t * 1.6 + tg.phase) * 3 * s) + (tg.tug || 0);
      const y = p.y + bob + (1 - ease(appear)) * 18 * s;
      ctx.globalAlpha = appear;
      // ring at the waterline
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.2 * s;
      ctx.beginPath();
      ctx.ellipse(p.x, y + 2 * s, 44 * s, 8 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
      // above-water part only
      ctx.save();
      ctx.beginPath();
      ctx.rect(p.x - 80 * s, y - 120 * s, 160 * s, 120 * s + 2 * s);
      ctx.clip();
      this.drawObject(ctx, tg.kind, p.x, y, s * 1.4, false);
      ctx.restore();
      // faint reflection
      ctx.save();
      ctx.globalAlpha = appear * 0.18;
      ctx.translate(p.x, y + 3 * s);
      ctx.scale(1, -0.5);
      ctx.beginPath();
      ctx.rect(-80 * s, -120 * s, 160 * s, 120 * s);
      ctx.clip();
      this.drawObject(ctx, tg.kind, 0, 0, s * 1.4, false);
      ctx.restore();
      ctx.globalAlpha = 1;
      if (tg.kind === 'fish' && !this.reduced && Math.random() < 0.004) {
        this.ripples.push({ x: p.x + 20 * s, y: y, r: 4 * s, life: 1, max: 30 * s });
      }
    }
  }

  /** Draw an object centred horizontally at x with its waterline at y. full = whole body (caught). */
  drawObject(ctx, kind, x, y, s, full, swing = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(swing);
    const flap = full ? Math.sin(this.t * 14) * 0.25 : Math.sin(this.t * 3) * 0.15;
    switch (kind) {
      case 'fish': {
        if (full) ctx.rotate(-Math.PI / 2 + 0.15);
        ctx.fillStyle = C.koi;
        // tail
        ctx.save();
        ctx.translate(-30 * s, -2 * s);
        ctx.rotate(flap);
        ctx.beginPath();
        ctx.moveTo(4 * s, 0);
        ctx.lineTo(-16 * s, -14 * s);
        ctx.quadraticCurveTo(-10 * s, 0, -16 * s, 14 * s);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        // body
        ctx.beginPath();
        ctx.ellipse(0, 0, 34 * s, 14 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.koiBelly;
        ctx.beginPath();
        ctx.ellipse(2 * s, 6 * s, 26 * s, 6 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.koiLight;
        ctx.beginPath();
        ctx.ellipse(-4 * s, -5 * s, 12 * s, 5 * s, 0.2, 0, Math.PI * 2);
        ctx.fill();
        // dorsal fin
        ctx.fillStyle = C.koi;
        ctx.beginPath();
        ctx.moveTo(-12 * s, -12 * s);
        ctx.quadraticCurveTo(-2 * s, -26 * s, 10 * s, -13 * s);
        ctx.closePath();
        ctx.fill();
        // eye
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(22 * s, -3 * s, 3.6 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.eye;
        ctx.beginPath();
        ctx.arc(23 * s, -3 * s, 2 * s, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'bottle': {
        ctx.rotate(full ? -1.2 : -0.12);
        ctx.fillStyle = C.bottle;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(-26 * s, -10 * s, 40 * s, 20 * s, 7 * s) : ctx.rect(-26 * s, -10 * s, 40 * s, 20 * s);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(14 * s, -8 * s);
        ctx.quadraticCurveTo(22 * s, -5 * s, 24 * s, -4 * s);
        ctx.lineTo(24 * s, 4 * s);
        ctx.quadraticCurveTo(22 * s, 5 * s, 14 * s, 8 * s);
        ctx.fill();
        ctx.fillStyle = C.bottleCap;
        ctx.fillRect(24 * s, -4.5 * s, 6 * s, 9 * s);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(-20 * s, -7 * s, 26 * s, 3 * s);
        break;
      }
      case 'can': {
        ctx.rotate(full ? -1.4 : 0.1);
        ctx.fillStyle = C.can;
        ctx.fillRect(-18 * s, -11 * s, 36 * s, 22 * s);
        ctx.fillStyle = C.canMetal;
        ctx.beginPath();
        ctx.ellipse(18 * s, 0, 4 * s, 11 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(-14 * s, -8 * s, 26 * s, 3 * s);
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(-18 * s, 4 * s, 36 * s, 7 * s);
        break;
      }
      case 'bag': {
        const w = full ? Math.sin(this.t * 6) * 3 * s : Math.sin(this.t * 2) * 2 * s;
        ctx.strokeStyle = C.bagLine;
        ctx.lineWidth = 3 * s;
        // two loop handles
        for (const hx of [-9, 9]) {
          ctx.beginPath();
          ctx.ellipse(hx * s + w * 0.3, -20 * s, 5 * s, 8 * s, hx < 0 ? -0.3 : 0.3, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = C.bag;
        ctx.beginPath();
        ctx.moveTo(-22 * s, 6 * s);
        ctx.quadraticCurveTo(-26 * s + w, -10 * s, -15 * s, -14 * s);
        ctx.lineTo(15 * s, -14 * s);
        ctx.quadraticCurveTo(26 * s - w, -10 * s, 22 * s, 6 * s);
        ctx.quadraticCurveTo(0, 12 * s, -22 * s, 6 * s);
        ctx.fill();
        ctx.lineWidth = 1.2 * s;
        ctx.stroke();
        // creases and a faded printed stripe
        ctx.beginPath();
        ctx.moveTo(-12 * s, -8 * s);
        ctx.quadraticCurveTo(-4 * s, -2 * s, -10 * s, 4 * s);
        ctx.moveTo(8 * s, -9 * s);
        ctx.quadraticCurveTo(14 * s, -2 * s, 9 * s, 5 * s);
        ctx.stroke();
        ctx.fillStyle = 'rgba(210,65,47,0.35)';
        ctx.fillRect(-6 * s, -6 * s, 10 * s, 6 * s);
        break;
      }
      case 'boot': {
        ctx.rotate(full ? 0.3 : -0.05);
        ctx.fillStyle = C.boot;
        ctx.beginPath();
        ctx.moveTo(-14 * s, -30 * s);
        ctx.lineTo(4 * s, -30 * s);
        ctx.lineTo(6 * s, -6 * s);
        ctx.quadraticCurveTo(26 * s, -6 * s, 28 * s, 4 * s);
        ctx.lineTo(28 * s, 8 * s);
        ctx.lineTo(-16 * s, 8 * s);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = C.bootSole;
        ctx.fillRect(-16 * s, 6 * s, 44 * s, 5 * s);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1.5 * s;
        ctx.beginPath();
        ctx.moveTo(-12 * s, -24 * s);
        ctx.lineTo(2 * s, -24 * s);
        ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }

  drawCatch(ctx) {
    const c = this.catch;
    if (!c) return;
    const { s } = this;
    const swing = this.reduced ? 0 : Math.sin(this.t * 3.2) * 0.12;
    this.drawObject(ctx, c.kind, c.x, c.y, s * 1.35, true, swing);
    if (c.kind === 'fish' && this.cast && this.cast.done) {
      // sparkles
      ctx.fillStyle = C.sparkle;
      for (let i = 0; i < 6; i++) {
        const a = this.t * 1.5 + (i * Math.PI) / 3;
        const r = (46 + Math.sin(this.t * 4 + i) * 6) * s;
        const x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r * 0.8;
        this.star(ctx, x, y, (3 + (i % 2) * 2) * s);
      }
    }
  }

  star(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const rr = i % 2 ? r * 0.4 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }

  // ---------- water effects ----------
  splash(x, y) {
    const s = this.s;
    for (let k = 0; k < 3; k++) this.ripples.push({ x, y, r: (6 + k * 8) * s, life: 1, max: (50 + k * 20) * s });
    for (let i = 0; i < 16; i++) this.drops.push(this.drop(x, y));
  }

  drop(x, y) {
    const s = this.s;
    return { x, y, vx: (Math.random() - 0.5) * 160 * s, vy: (-120 - Math.random() * 160) * s, life: 1, y0: y };
  }

  updateRipples(dt) {
    const ctx = this.ctx;
    ctx.lineWidth = 1.5 * this.s;
    this.ripples = this.ripples.filter((r) => r.life > 0);
    for (const r of this.ripples) {
      r.life -= dt * 0.9;
      r.r += (r.max - r.r) * Math.min(1, dt * 2.5);
      ctx.strokeStyle = `rgba(255,255,255,${0.55 * Math.max(0, r.life)})`;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r, r.r * 0.25, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawDrops(ctx, dt) {
    ctx.fillStyle = C.splash;
    this.drops = this.drops.filter((d) => d.life > 0 && d.y <= d.y0 + 2);
    for (const d of this.drops) {
      d.vy += 520 * this.s * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.life -= dt;
      ctx.beginPath();
      ctx.arc(d.x, d.y, 2.2 * this.s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
