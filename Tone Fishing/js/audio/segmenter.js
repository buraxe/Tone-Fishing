// Splits the frame stream into utterances: onset after N voiced frames,
// release after a stretch of silence or a hard length limit.

export class UtteranceSegmenter {
  constructor(cfg) {
    this.cfg = cfg;
    this.reset();
  }

  reset() {
    this.active = false;
    this.pending = [];
    this.frames = [];
    this.startT = 0;
    this.lastVoicedT = 0;
  }

  /**
   * Push one analysed frame. Returns null, or an event:
   *  { type: 'start' } | { type: 'update', frames } | { type: 'end', frames }
   */
  push(t, r) {
    const frame = { t, f0: r.f0, clarity: r.clarity, rms: r.rms, voiced: r.voiced };

    if (!this.active) {
      if (r.voiced) {
        this.pending.push(frame);
        if (this.pending.length >= this.cfg.onsetFrames) {
          this.active = true;
          this.frames = this.pending;
          this.pending = [];
          this.startT = this.frames[0].t;
          this.lastVoicedT = t;
          return { type: 'start', frames: this.frames };
        }
      } else {
        this.pending = [];
      }
      return null;
    }

    this.frames.push(frame);
    if (r.voiced) this.lastVoicedT = t;

    const silentFor = (t - this.lastVoicedT) * 1000;
    const length = (t - this.startT) * 1000;
    if (silentFor > this.cfg.releaseMs || length > this.cfg.maxMs) {
      const frames = this.frames;
      this.reset();
      return { type: 'end', frames };
    }
    return { type: 'update', frames: this.frames };
  }
}
