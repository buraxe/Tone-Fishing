// Audio graph: [mic | demo voice] → input gain → 1 kHz low-pass → analyser.
// Nothing is recorded or sent anywhere; frames are read and discarded each tick.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.stream = null;
    this.micSource = null;
    this.analyser = null;
    this.buffer = null;
  }

  /** Must be called from a user gesture (Safari / mobile autoplay rules). */
  ensureContext() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this.input = this.ctx.createGain();
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1000;
      lp.Q.value = 0.707;
      this.analyser = this.ctx.createAnalyser();
      // ~85 ms of history; the tracker reads only the newest ~45 ms
      this.analyser.fftSize = this.ctx.sampleRate > 50000 ? 8192 : 4096;
      this.analyser.smoothingTimeConstant = 0;
      this.input.connect(lp);
      lp.connect(this.analyser);
      this.buffer = new Float32Array(this.analyser.fftSize);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  static micSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext !== false;
  }

  /** Resolves 'ok' | 'denied' | 'insecure'. */
  async startMic() {
    this.ensureContext();
    if (!AudioEngine.micSupported()) return 'insecure';
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      });
    } catch (e) {
      return 'denied';
    }
    this.micSource = this.ctx.createMediaStreamSource(this.stream);
    this.micSource.connect(this.input);
    return 'ok';
  }

  stopMic() {
    if (this.micSource) this.micSource.disconnect();
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.micSource = null;
    this.stream = null;
  }

  get hasMic() { return !!this.micSource; }

  read() {
    if (!this.analyser) return null;
    if (this.analyser.getFloatTimeDomainData) this.analyser.getFloatTimeDomainData(this.buffer);
    return this.buffer;
  }

  get sampleRate() { return this.ctx ? this.ctx.sampleRate : 48000; }
  get now() { return this.ctx ? this.ctx.currentTime : performance.now() / 1000; }
}
