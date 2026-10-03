// Round flow: listen → live charging → verdict → cast → catch → next round.

import { CONFIG } from '../config.js';
import { S } from '../data/strings.js';
import { TONES } from '../data/tones.js';
import { UtteranceSegmenter } from '../audio/segmenter.js';
import { analyzeUtterance, analyzeLive } from '../audio/toneClassifier.js';
import { livePowerStep } from './power.js';
import { TargetGenerator } from './targetGenerator.js';
import { Scoring } from './scoring.js';
import { toneLine } from '../ui/ui.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class Game {
  constructor({ ui, scene, graph, sounds }) {
    this.ui = ui;
    this.scene = scene;
    this.graph = graph;
    this.sounds = sounds; // { whoosh, splash, success, trash }
    this.segmenter = new UtteranceSegmenter(CONFIG.segment);
    this.generator = new TargetGenerator();
    this.scoring = new Scoring(CONFIG.game);
    this.level = 1;
    this.strictness = 'standard';
    this.phase = 'idle';
    this.power = 0;
    this.energy = 0;
    this.muteUntil = 0;
    this.lastT = null;
    this.round = null;
    this.roundId = 0;
  }

  startLevel(level) {
    this.level = level;
    this.ui.setLevel(level);
    this.scoring = new Scoring(CONFIG.game);
    this.ui.setScore(0, 0, false);
    this.newRound();
  }

  stop() {
    this.phase = 'idle';
    clearTimeout(this.autoNext);
    this.roundId++;
  }

  newRound(repeat = false) {
    clearTimeout(this.autoNext);
    this.roundId++;
    this.round = this.generator.next(this.level, repeat && this.round ? this.round.item : null);
    this.attempts = 0;
    this.power = 0;
    this.segmenter.reset();
    this.scene.setRound(this.round.slots);
    this.graph.setTarget(this.round.tone);
    this.ui.setItem(this.round.item, this.round.tone);
    this.ui.setPower(0);
    this.ui.setChances(0, CONFIG.game.attemptsPerRound);
    this.ui.setFeedback(S.sayIt, '');
    this.ui.hideBanner();
    this.ui.setMode('listening');
    this.phase = 'listening';
  }

  /** Ignore analysis until `until` (seconds, audio clock), e.g. while a demo tone plays aloud. */
  mute(until) { this.muteUntil = Math.max(this.muteUntil, until); this.segmenter.reset(); }

  /** One analysed frame from the audio loop. */
  onFrame(r, t) {
    // Voice energy for the rod / ripples
    const level = r.gate > 0 ? Math.max(0, r.rms / r.gate - 1) / 4 : 0;
    this.energy += ((r.voiced ? Math.min(1, level) : 0) - this.energy) * 0.25;

    if (this.phase !== 'listening' || t < this.muteUntil) {
      this.lastT = t;
      this.scene.setCharge(this.power, 0, 'idle');
      return;
    }
    const ev = this.segmenter.push(t, r);
    const dt = this.lastT == null ? 0 : Math.min(0.1, t - this.lastT);
    this.lastT = t;

    if (ev && (ev.type === 'start' || ev.type === 'update')) {
      if (ev.type === 'start') this.ui.setFeedback(S.listening, '');
      const live = analyzeLive(ev.frames, this.round.tone, CONFIG);
      const step = livePowerStep(this.power, live, this.round.tone, dt, CONFIG.power);
      this.power = step.power;
      this.liveFeedback(step.mood, live);
      if (live) {
        this.graph.setContour(live.contour, false);
        this.ui.setMatch(live.score);
      }
    } else if (ev && ev.type === 'end') {
      this.finishUtterance(ev.frames);
    }
    this.ui.setPower(this.power);
    this.scene.setCharge(this.power, this.energy, this.mood || 'idle');
  }

  liveFeedback(mood, live) {
    this.mood = mood;
    if (!live) return;
    const text = { close: S.veryClose, good: S.good, partial: S.partial, conflict: S.watchContour }[mood];
    if (text) this.ui.setFeedback(text, '', mood === 'close' || mood === 'good' ? 'good' : mood === 'conflict' ? 'warn' : '');
    if (mood === 'conflict' && !this.shookAt) { this.ui.shakePower(); this.shookAt = performance.now(); }
    if (this.shookAt && performance.now() - this.shookAt > 700) this.shookAt = 0;
  }

  async finishUtterance(frames) {
    const v = analyzeUtterance(frames, this.round.tone, CONFIG, CONFIG.strictness[this.strictness]);
    this.mood = 'idle';
    if (v.contour) this.graph.setContour(v.contour, true);
    if (v.score != null) this.ui.setMatch(v.score);

    if (v.status === 'unclear') {
      this.ui.setFeedback(S.sayAgain, '', 'warn');
      return;
    }
    if (v.status === 'correct') {
      await this.castSuccess();
      return;
    }

    // Wrong tone: gentle feedback, keep part of the charge
    this.attempts++;
    this.power *= CONFIG.power.wrongKeep;
    this.ui.setPower(this.power);
    this.ui.shakePower();
    this.ui.setChances(this.attempts, CONFIG.game.attemptsPerRound);
    const left = CONFIG.game.attemptsPerRound - this.attempts;
    const detail = toneLine(this.round.tone, v.result.tone) + (left > 0 ? `<br>${S.chancesLeft(left)}` : '');
    this.ui.setFeedback(S.watchContour, detail, 'warn');
    if (left <= 0) await this.castFail(v.result.tone);
  }

  async animatePower(to, ms) {
    const from = this.power, start = performance.now();
    while (true) {
      const u = Math.min(1, (performance.now() - start) / ms);
      this.power = from + (to - from) * (1 - (1 - u) ** 3);
      this.ui.setPower(this.power, u >= 1 && to >= 1);
      this.scene.setCharge(this.power, 0.4, 'good');
      if (u >= 1) break;
      await wait(16);
    }
  }

  async castSuccess() {
    const id = this.roundId;
    this.phase = 'casting';
    this.ui.setMode('busy');
    this.ui.setFeedback(S.readyCast, '', 'good');
    await this.animatePower(1, 380);
    this.ui.banner(S.readyCast, '', 700);
    await wait(500);
    if (id !== this.roundId) return;
    this.sounds.whoosh();
    await this.scene.castTo(this.round.fishIndex, () => this.sounds.splash());
    if (id !== this.roundId) return;
    this.sounds.success();
    const points = this.scoring.success();
    this.ui.setScore(this.scoring.score, this.scoring.combo, true);
    this.ui.setPower(0);
    this.power = 0;
    this.ui.banner(S.caught, 'good', 1800);
    this.ui.setFeedback(S.caught, `${S.toneCorrect}${this.scoring.combo >= 3 ? S.great : ''}　+${points}`, 'good');
    this.phase = 'result';
    this.ui.setMode('success');
    this.autoNext = setTimeout(() => { if (id === this.roundId) this.newRound(); }, CONFIG.game.autoNextMs);
  }

  async castFail(heardTone) {
    const id = this.roundId;
    this.phase = 'casting';
    this.ui.setMode('busy');
    await this.animatePower(1, 300);
    await wait(250);
    if (id !== this.roundId) return;
    const trashSlots = this.round.slots.map((k, i) => (k === 'fish' ? -1 : i)).filter((i) => i >= 0);
    const pick = trashSlots[Math.floor(Math.random() * trashSlots.length)];
    this.sounds.whoosh();
    await this.scene.castTo(pick, () => this.sounds.splash());
    if (id !== this.roundId) return;
    this.sounds.trash();
    this.scoring.miss();
    this.ui.setScore(this.scoring.score, this.scoring.combo, false);
    this.power = 0;
    this.ui.setPower(0);
    this.ui.banner(S.caughtTrash, 'trash', 1800);
    this.ui.setFeedback(S.caughtTrash, toneLine(this.round.tone, heardTone === 'unknown' ? null : heardTone), 'warn');
    this.phase = 'result';
    this.ui.setMode('fail');
  }

  skip() {
    this.scoring.miss();
    this.ui.setScore(this.scoring.score, this.scoring.combo, false);
    this.newRound();
  }

  get targetTone() { return this.round ? this.round.tone : 1; }
  toneName(k) { return TONES[k].name; }
}
