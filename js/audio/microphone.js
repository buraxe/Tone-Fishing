// Audio graph: [mic | demo voice] → input gain → 55 Hz high-pass ×2 → 1 kHz low-pass → tap.
// The tap is an AudioWorklet that hands over every 10 ms of audio, so pitch
// analysis runs at a fixed rate whatever the screen refresh rate is (30 fps
// laptops, projectors and phones lost frames before). Browsers without
// AudioWorklet fall back to reading an AnalyserNode once per animation frame.
// Nothing is recorded or sent anywhere; samples are analysed and discarded.

const TAP_HOP = 480; // samples per message (10 ms at 48 kHz)

const TAP_SOURCE = `
class ToneTap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(${TAP_HOP}); this.n = 0; this.silence = new Float32Array(128); }
  process(inputs) {
    // With nothing connected (demo voice finished, no microphone) the input has
    // no channels: treat it as silence so utterances still end on time.
    const ch = (inputs[0] && inputs[0][0]) || this.silence;
    for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i];
      if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice(0)); this.n = 0; }
    }
    return true;
  }
}
registerProcessor('tone-tap', ToneTap);
`;

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.stream = null;
    this.micSource = null;
    this.analyser = null;
    this.buffer = null;
    this.tap = null;          // AudioWorkletNode when available
    this.onSamples = null;    // callback(ring, hopSeconds, time) for each 10 ms of audio
    this.ring = null;
    this.samplesIn = 0;
  }

  /** Must be called from a user gesture (Safari / mobile autoplay rules). */
  ensureContext() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this.input = this.ctx.createGain();
      // Two high-pass stages at 55 Hz: remove mains hum, desk rumble and breath pops
      const hp1 = this.ctx.createBiquadFilter();
      hp1.type = 'highpass';
      hp1.frequency.value = 55;
      hp1.Q.value = 0.707;
      const hp2 = this.ctx.createBiquadFilter();
      hp2.type = 'highpass';
      hp2.frequency.value = 55;
      hp2.Q.value = 0.707;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1000;
      lp.Q.value = 0.707;
      this.analyser = this.ctx.createAnalyser();
      // ~85 ms of history; the tracker reads only the newest ~45 ms
      this.analyser.fftSize = this.ctx.sampleRate > 50000 ? 8192 : 4096;
      this.analyser.smoothingTimeConstant = 0;
      this.input.connect(hp1);
      hp1.connect(hp2);
      hp2.connect(lp);
      lp.connect(this.analyser);
      this.buffer = new Float32Array(this.analyser.fftSize);
      this.ring = new Float32Array(this.analyser.fftSize);
      this.startTap(lp);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  async startTap(source) {
    if (!this.ctx.audioWorklet || typeof AudioWorkletNode === 'undefined') return;
    try {
      const url = URL.createObjectURL(new Blob([TAP_SOURCE], { type: 'application/javascript' }));
      await this.ctx.audioWorklet.addModule(url);
      const tap = new AudioWorkletNode(this.ctx, 'tone-tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      const sink = this.ctx.createGain();
      sink.gain.value = 0; // keep the node pulled by the graph without making sound
      source.connect(tap);
      tap.connect(sink);
      sink.connect(this.ctx.destination);
      tap.port.onmessage = (e) => this.receive(e.data);
      this.tap = tap;
    } catch (e) {
      this.tap = null; // fall back to per-frame analyser reads
    }
  }

  receive(chunk) {
    const ring = this.ring, n = chunk.length;
    ring.copyWithin(0, n);
    ring.set(chunk, ring.length - n);
    this.samplesIn += n;
    if (this.onSamples) this.onSamples(ring, n / this.ctx.sampleRate, this.ctx.currentTime);
  }

  /** True once the worklet is delivering audio. */
  get tapActive() { return !!this.tap && this.samplesIn > 0; }

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
