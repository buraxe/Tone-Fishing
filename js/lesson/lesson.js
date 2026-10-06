// 声调课堂: the lesson before the game.
//
// Steps (easy → hard): 第一声 → 第四声 → 第二声 → 第三声 → 二声·三声 → 综合.
// Each tone step runs three phases:
//   看一看  animated contour + hand gesture, drawn in step with a native recording
//   听一听  hear recordings from several speakers, pick the tone (perception first)
//   说一说  say a word; correct → next step, wrong → concrete hint + model replay
// The contrast step drills 2nd vs 3rd with minimal pairs; the last step mixes all four.

import { CONFIG } from '../config.js';
import { TONES } from '../data/tones.js';
import { UtteranceSegmenter } from '../audio/segmenter.js';
import { analyzeUtterance, analyzeLive } from '../audio/toneClassifier.js';
import { playClip, pickVaried, clipsForWord, clipsForTone, listeningSet, contrastSet, clipLabel, SPEAKER_NAME } from '../audio/clips.js';
import { speakWord } from '../audio/speech.js';
import { PitchGraph } from '../ui/pitchGraph.js';
import { toneGlyphSVG } from '../ui/toneGlyph.js';
import { createToneStage } from '../ui/toneAnim.js';
import { recordAttempt } from '../diagnostics.js';
import { pronunciationHint, heardToneName } from './hints.js';
import { LESSON_INTRO as I, LESSON_STEPS, LESSON_TONES, LESSON_TEXT as T, PHASES, COMPARE_23, TONE_MOVES } from './lessonData.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const SKIP_AFTER = 3;
const LISTEN_PASS = 0.75;

export class Lesson {
  /**
   * @param root    container element
   * @param engine  AudioEngine
   * @param opt     { getStrictness, isDemo, demoSpeak(tone, correct), onStartGame, onComplete }
   */
  constructor(root, engine, opt) {
    this.root = root;
    this.engine = engine;
    this.opt = opt;
    this.segmenter = new UtteranceSegmenter(CONFIG.segment);
    this.state = 'idle';
    this.muteUntil = 0;
  }

  // ======================= flow =======================

  start() {
    this.results = {};
    this.listenTotals = { right: 0, total: 0 };
    this.state = 'intro';
    this.renderIntro();
  }

  stop() {
    this.state = 'idle';
    this.cleanup();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  cleanup() {
    clearTimeout(this.timer);
    this.token = (this.token || 0) + 1; // cancels pending async UI work
  }

  openStep(i) {
    this.stepIdx = i;
    this.step = LESSON_STEPS[i];
    const s = this.step;
    this.phases = s.kind === 'tone' ? ['watch', ...(s.listen ? ['listen'] : []), 'speak']
      : s.kind === 'contrast' ? ['listen', 'pairs'] : ['listen'];
    this.phaseIdx = 0;
    this.renderPhase();
  }

  nextPhase() {
    if (this.phaseIdx < this.phases.length - 1) {
      this.phaseIdx++;
      this.renderPhase();
      return;
    }
    if (!this.results[this.step.id]) this.results[this.step.id] = 'pass';
    if (this.stepIdx < LESSON_STEPS.length - 1) this.openStep(this.stepIdx + 1);
    else this.renderDone();
  }

  skipStep() {
    this.results[this.step.id] = 'skip';
    this.phaseIdx = this.phases.length - 1;
    this.nextPhase();
  }

  get phase() { return this.phases[this.phaseIdx]; }

  renderPhase() {
    this.cleanup();
    this.state = this.phase;
    this.segmenter.reset();
    ({ watch: () => this.renderWatch(), listen: () => this.renderListen(),
      speak: () => this.renderSpeak(), pairs: () => this.renderPairs() })[this.phase]();
  }

  // ======================= shared UI =======================

  stepper(current) {
    return `<ol class="lesson-steps">${LESSON_STEPS.map((s, i) => {
      const r = this.results[s.id];
      const cls = r === 'pass' ? 'done' : r === 'skip' ? 'skipped' : i === current ? 'current' : '';
      const color = s.tone ? TONES[s.tone].color : 'var(--jade)';
      return `<li class="${cls}" style="--tc:${color}"><span class="dot">${r === 'pass' ? '✓' : i + 1}</span><span class="lbl">${s.label}</span></li>`;
    }).join('')}</ol>`;
  }

  phaseStrip() {
    if (this.phases.length < 2) return '';
    return `<ol class="phase-strip">${this.phases.map((p, i) => `<li class="${i < this.phaseIdx ? 'done' : i === this.phaseIdx ? 'current' : ''}"><span>${i + 1}</span>${PHASES[p]}</li>`).join('')}</ol>`;
  }

  frame(inner, { color } = {}) {
    const c = color || (this.step && this.step.tone ? TONES[this.step.tone].color : 'var(--jade)');
    this.root.innerHTML = `
      <div class="lesson-shell" style="--tc:${c};--t-color:${c}">
        ${this.stepper(this.stepIdx)}
        <section class="lesson-card">
          <div class="card-top"><span class="lesson-no">${T.stepN(this.stepIdx + 1)} · ${this.step.label}</span>${this.phaseStrip()}</div>
          ${inner}
        </section>
      </div>`;
  }

  bind(map) {
    this.root.querySelectorAll('[data-act]').forEach((b) => {
      const fn = map[b.dataset.act];
      if (fn) b.onclick = fn;
    });
  }

  $(sel) { return this.root.querySelector(sel); }
  ctx() { return this.engine.ensureContext(); }

  /** Play a native clip (the mic is muted meanwhile); animate `stage` in step. */
  async playClipWith(clip, stage) {
    if (!clip) return;
    this.muteUntil = Infinity;
    this.segmenter.reset();
    const sp = this.$('[data-el=speaker]');
    if (sp) sp.textContent = SPEAKER_NAME[clip.sp];
    try {
      const { duration, ended } = await playClip(this.ctx(), clip);
      if (stage) stage.play(duration);
      await ended;
    } catch (e) {
      await speakWord(this.ctx(), clip.hanzi || '', clip.tone); // decoding failed: fall back
    } finally {
      this.muteUntil = this.engine.now + 0.3;
    }
  }

  playWord(word, tone, stage) {
    const clips = clipsForWord(word.hanzi, word.syl, tone);
    const clip = pickVaried(clips.length ? clips : clipsForTone(tone));
    return this.playClipWith(clip, stage);
  }

  // ======================= intro =======================

  renderIntro() {
    this.stepIdx = -1;
    this.root.innerHTML = `
      <div class="lesson-shell">
        ${this.stepper(-1)}
        <section class="lesson-intro">
          <h2>${I.title}</h2>
          <p class="lead">${I.lead}</p>
          <p class="sub">${I.example}</p>
          <div class="minimal">${I.minimal.map((m, i) => `
            <button type="button" class="minimal-item" data-i="${i}" style="--tc:${TONES[m.tone].color}">
              <span class="m-hanzi">${m.hanzi}</span>
              <span class="m-pinyin">${m.pinyin}</span>
              <span class="m-stage" data-stage="${i}"></span>
              <span class="m-name">${TONES[m.tone].name}</span>
            </button>`).join('')}
          </div>
          <ol class="plan">${I.plan.map((p, i) => `<li><b>${i + 1}</b><span>${p.name}</span><small>${p.desc}</small></li>`).join('')}</ol>
          <p class="how">${I.howTo}</p>
          <div class="buttons center">
            <button class="btn big" type="button" data-act="begin">${I.begin}</button>
          </div>
          <button class="btn text" type="button" data-act="skip-all">${I.skip}</button>
        </section>
      </div>`;
    const stages = I.minimal.map((m, i) => createToneStage(this.$(`[data-stage="${i}"]`), m.tone, { width: 120, height: 60, labels: false }));
    this.root.querySelectorAll('.minimal-item').forEach((b) => {
      const i = Number(b.dataset.i), m = I.minimal[i];
      b.onclick = () => this.playWord(m, m.tone, stages[i]);
    });
    this.bind({ begin: () => this.openStep(0), 'skip-all': () => this.opt.onStartGame() });
  }

  // ======================= 看一看 =======================

  renderWatch() {
    const k = this.step.tone, t = TONES[k], L = LESSON_TONES[k];
    this.watchIdx = 0;
    this.wordIdx = 0;
    const cmp = this.step.compare ? `
      <div class="compare">
        <p class="compare-title">${COMPARE_23.title}</p>
        <div class="compare-row">${COMPARE_23.points.map((p) => `
          <div class="compare-item" style="--tc:${TONES[p.tone].color}">${toneGlyphSVG(p.tone, { width: 96, height: 50, stroke: 5 })}<span>${p.text}</span></div>`).join('')}
        </div>
        <p class="compare-key">${COMPARE_23.key}</p>
      </div>` : '';
    this.frame(`
      <div class="watch">
        <div class="watch-head">
          <h2 class="teach-title">${t.name}<small>${t.alias} · ${t.chao}</small></h2>
          <p class="rule">${L.rule}</p>
        </div>
        <div class="watch-main">
          <div class="stage-box">
            <div class="stage-host" data-el="stage"></div>
            <div class="stage-foot"><span class="speaker-chip" data-el="speaker"></span><span class="watch-hint">${T.watchHint}</span></div>
          </div>
          <div class="watch-side">
            <ol class="path-chips">${L.path.map((p, i) => `<li><span>${['起点', '走向', '终点'][i]}</span>${p}</li>`).join('')}</ol>
            <p class="gesture">${L.gesture}</p>
            <p class="picture">${L.picture}</p>
            <p class="tip">${L.tip}</p>
          </div>
        </div>
        ${cmp}
        <p class="ex-label">${T.examples}</p>
        <div class="examples">${L.words.map((w, i) => `
          <button type="button" class="ex" data-i="${i}"><span class="ex-hanzi">${w.hanzi}</span><span class="ex-pinyin">${w.pinyin}</span></button>`).join('')}
        </div>
        <div class="buttons">
          <button class="btn ghost" type="button" data-act="again">${T.listenAgain}</button>
          <button class="btn" type="button" data-act="next" hidden>${T.next}</button>
        </div>
      </div>`);
    // Only the tone being heard is drawn while it plays (sound and picture must match);
    // the 2nd/3rd comparison sits in its own panel below.
    const stage = createToneStage(this.$('[data-el=stage]'), k);
    const play = async (i) => {
      this.root.querySelectorAll('.ex').forEach((b) => b.classList.toggle('on', Number(b.dataset.i) === i));
      await this.playWord(L.words[i], k, stage);
      const n = this.$('[data-act=next]');
      if (n) n.hidden = false;
    };
    this.root.querySelectorAll('.ex').forEach((b) => { b.onclick = () => { this.watchIdx = Number(b.dataset.i); play(this.watchIdx); }; });
    this.bind({
      again: () => { this.watchIdx = (this.watchIdx + 1) % L.words.length; play(this.watchIdx); },
      next: () => this.nextPhase(),
    });
    const tok = this.token;
    this.timer = setTimeout(() => { if (tok === this.token) play(0); }, 450);
  }

  // ======================= 听一听 =======================

  renderListen(again = false) {
    const cfg = this.step.listen;
    this.items = cfg.contrast ? contrastSet(cfg.n) : listeningSet(cfg.tones, cfg.n);
    this.optionTones = cfg.contrast ? [2, 3] : [...new Set(cfg.tones)].sort((a, b) => a - b);
    this.itemIdx = 0;
    this.listenRight = 0;
    void again;
    this.renderItem();
  }

  renderItem() {
    const i = this.itemIdx, n = this.items.length, clip = this.items[i];
    const prompt = this.step.listen.contrast ? T.listenPromptPair : T.listenPrompt;
    this.frame(`
      <div class="listen">
        <div class="listen-head">
          <p class="listen-prompt">${prompt}</p>
          <span class="item-count">${T.itemN(i + 1, n)}</span>
        </div>
        <div class="listen-play">
          <button class="play-big" type="button" data-act="replay" aria-label="${T.listenAgain}"><span></span></button>
          <span class="speaker-chip" data-el="speaker"></span>
          <span class="reveal" data-el="reveal"></span>
        </div>
        <div class="options n${this.optionTones.length}">${this.optionTones.map((k) => `
          <button type="button" class="option" data-tone="${k}" style="--tc:${TONES[k].color}">
            <span class="opt-stage" data-stage="${k}"></span>
            <b>${TONES[k].name}</b>
          </button>`).join('')}
        </div>
        <p class="listen-feedback" data-el="fb" aria-live="polite"></p>
        <div class="buttons"><button class="btn" type="button" data-act="nextItem" hidden>${i + 1 < n ? T.nextItem : T.next}</button></div>
      </div>`, { color: this.step.tone ? TONES[this.step.tone].color : 'var(--jade)' });
    const stages = {};
    for (const k of this.optionTones) stages[k] = createToneStage(this.$(`[data-stage="${k}"]`), k, { width: 160, height: 74, labels: false });
    this.answered = false;
    this.bind({
      replay: () => this.playClipWith(clip, this.answered ? stages[clip.tone] : null),
      nextItem: () => {
        if (this.itemIdx + 1 < this.items.length) { this.itemIdx++; this.renderItem(); } else this.renderListenResult();
      },
    });
    this.root.querySelectorAll('.option').forEach((b) => {
      b.onclick = () => this.answer(Number(b.dataset.tone), clip, stages);
    });
    const tok = this.token;
    this.timer = setTimeout(() => { if (tok === this.token) this.playClipWith(clip, null); }, 350);
  }

  async answer(choice, clip, stages) {
    if (this.answered) return;
    this.answered = true;
    const ok = choice === clip.tone;
    if (ok) this.listenRight++;
    this.listenTotals.right += ok ? 1 : 0;
    this.listenTotals.total += 1;
    this.root.querySelectorAll('.option').forEach((b) => {
      const k = Number(b.dataset.tone);
      b.disabled = true;
      if (k === clip.tone) b.classList.add('correct');
      if (k === choice && !ok) b.classList.add('wrong');
    });
    const lab = clipLabel(clip);
    this.$('[data-el=reveal]').innerHTML = `<b>${lab.hanzi ? `${lab.hanzi} ` : ''}${lab.pinyin}</b>`;
    const fb = this.$('[data-el=fb]');
    fb.className = `listen-feedback ${ok ? 'good' : 'warn'}`;
    fb.textContent = ok ? `${T.right} ${TONE_MOVES[clip.tone]}` : `${T.wrongWas(TONES[clip.tone].name)}${TONE_MOVES[clip.tone]}`;
    // Congruent feedback: replay the same sound while its contour is drawn
    const tok = this.token;
    await wait(250);
    if (tok !== this.token) return;
    await this.playClipWith(clip, stages[clip.tone]);
    if (tok !== this.token) return;
    const n = this.$('[data-act=nextItem]');
    if (n) n.hidden = false;
  }

  renderListenResult() {
    const a = this.listenRight, n = this.items.length;
    const good = a / n >= LISTEN_PASS;
    this.frame(`
      <div class="listen-result">
        <p class="score-line">${T.scoreLine(a, n)}</p>
        <p class="score-note ${good ? 'good' : ''}">${good ? T.scoreGood : T.scoreLow}</p>
        <div class="buttons center">
          ${good ? `<button class="btn big" type="button" data-act="next">${T.next}</button>
                    <button class="btn ghost" type="button" data-act="more">${T.moreSet}</button>`
                 : `<button class="btn big" type="button" data-act="more">${T.moreSet}</button>
                    <button class="btn ghost" type="button" data-act="next">${T.goOn}</button>`}
        </div>
      </div>`);
    this.bind({ next: () => this.nextPhase(), more: () => this.renderListen(true) });
  }

  // ======================= 说一说 =======================

  renderSpeak() {
    const k = this.step.tone, t = TONES[k], L = LESSON_TONES[k];
    const word = L.words[this.wordIdx % L.words.length];
    if (!this.keepAttempts) this.attempts = 0;
    this.keepAttempts = false;
    this.state = 'speak';
    this.speakTarget = { word, tone: k };
    this.frame(`
      <div class="speak">
        <p class="practice-head">${T.sayThis}</p>
        <div class="practice-word">
          <div class="tianzige"><span class="hanzi">${word.hanzi}</span></div>
          <div class="practice-info">
            <div class="pinyin">${word.pinyin}</div>
            <div class="tone-name">${t.name} · ${L.rule}</div>
            <div class="mini-stage" data-el="stage"></div>
          </div>
        </div>
        <p class="gesture small">${T.sayGesture}${L.gesture.replace('手势：', '')}</p>
        ${this.graphBlock()}
        ${this.feedbackBlock()}
        <div class="buttons" data-el="actions"></div>
      </div>`);
    this.stage = createToneStage(this.$('[data-el=stage]'), k, { width: 200, height: 80, labels: false });
    this.mountGraph(k);
    this.setFeedback(T.sayThis, '', '');
    this.setSpeakActions('listening');
  }

  graphBlock() {
    return `<div class="graph-wrap">
      <div class="graph-head">
        <span class="legend legend-target"><i></i>目标声调</span>
        <span class="legend legend-you"><i></i>你的发音</span>
      </div>
      <canvas class="lesson-graph"></canvas>
    </div>`;
  }

  feedbackBlock() {
    return `<div class="lesson-feedback" aria-live="polite">
      <p class="lf-main" data-el="main"></p>
      <p class="lf-problem" data-el="problem"></p>
      <p class="lf-fix" data-el="fix"></p>
    </div>`;
  }

  mountGraph(tone) {
    this.graph = new PitchGraph(this.$('.lesson-graph'), { stepSt: CONFIG.tone.chaoToSemitone });
    this.graph.setTarget(tone);
  }

  setFeedback(main, problem, fix, cls = '') {
    const m = this.$('[data-el=main]');
    if (!m) return;
    m.textContent = main;
    m.className = `lf-main ${cls}`;
    this.$('[data-el=problem]').textContent = problem;
    this.$('[data-el=fix]').textContent = fix;
  }

  setSpeakActions(mode) {
    const box = this.$('[data-el=actions]');
    if (!box) return;
    const b = [];
    if (mode === 'passed') {
      b.push(`<button class="btn" type="button" data-act="next">${T.next}</button>`);
      b.push(`<button class="btn ghost" type="button" data-act="more">${T.practiceMore}</button>`);
    } else {
      b.push(`<button class="btn ghost" type="button" data-act="model">${T.listenModel}</button>`);
      if (this.opt.isDemo()) {
        b.push('<button class="btn" type="button" data-act="demo-right">示范正确发音</button>');
        b.push('<button class="btn ghost" type="button" data-act="demo-wrong">示范错误发音</button>');
      }
      if (this.attempts >= 2 && this.phase === 'speak') b.push(`<button class="btn ghost" type="button" data-act="change">${T.changeWord}</button>`);
      if (this.attempts >= SKIP_AFTER) b.push(`<button class="btn text" type="button" data-act="skip">${T.skipStep}</button>`);
    }
    box.innerHTML = b.join('');
    const tgt = this.speakTarget;
    this.bind({
      next: () => this.nextPhase(),
      more: () => { this.wordIdx++; this.renderSpeak(); },
      change: () => { this.wordIdx++; this.keepAttempts = true; this.renderSpeak(); },
      skip: () => this.skipStep(),
      model: () => this.playWord(tgt.word, tgt.tone, this.stage),
      'demo-right': () => this.opt.demoSpeak(tgt.tone, true),
      'demo-wrong': () => this.opt.demoSpeak(tgt.tone, false),
    });
  }

  // ======================= 说一说（二声·三声） =======================

  renderPairs() {
    this.pairQueue = this.step.pairs.flat();
    this.pairPos = 0;
    this.attempts = 0;
    this.renderPairWord();
  }

  renderPairWord() {
    const pairIdx = Math.floor(this.pairPos / 2);
    const pair = this.step.pairs[pairIdx];
    const w = this.pairQueue[this.pairPos];
    this.speakTarget = { word: w, tone: w.tone };
    this.state = 'pairs';
    this.frame(`
      <div class="speak">
        <p class="practice-head">${T.pairsPrompt}</p>
        <div class="pair-row">${pair.map((p, i) => {
          const pos = pairIdx * 2 + i;
          const cls = pos < this.pairPos ? 'done' : pos === this.pairPos ? 'current' : '';
          return `<div class="pair-word ${cls}" style="--tc:${TONES[p.tone].color}">
            <span class="pw-hanzi">${p.hanzi}</span><span class="pw-pinyin">${p.pinyin}</span>
            ${toneGlyphSVG(p.tone, { width: 70, height: 36, stroke: 4 })}
            <span class="pw-name">${TONES[p.tone].name}</span>
          </div>`;
        }).join('')}</div>
        <div class="mini-stage center" data-el="stage"></div>
        ${this.graphBlock()}
        ${this.feedbackBlock()}
        <div class="buttons" data-el="actions"></div>
      </div>`, { color: TONES[w.tone].color });
    this.stage = createToneStage(this.$('[data-el=stage]'), w.tone, { width: 200, height: 80, labels: false });
    this.mountGraph(w.tone);
    this.setFeedback(`${w.hanzi} ${w.pinyin}`, '', '');
    this.setSpeakActions('listening');
  }

  // ======================= done =======================

  renderDone() {
    this.cleanup();
    this.state = 'done';
    this.stepIdx = LESSON_STEPS.length;
    const skipped = LESSON_STEPS.filter((s) => s.tone && this.results[s.id] !== 'pass').map((s) => s.label);
    const { right, total } = this.listenTotals;
    this.root.innerHTML = `
      <div class="lesson-shell">
        ${this.stepper(LESSON_STEPS.length)}
        <section class="lesson-done">
          <h2>${T.doneTitle}</h2>
          <p class="lead">${T.doneLead}</p>
          ${total ? `<p class="sub">${T.doneListen(right, total)}</p>` : ''}
          ${skipped.length ? `<p class="sub">${T.doneSkipped(skipped.join('、'))}</p>` : ''}
          <div class="done-row">${[1, 4, 2, 3].map((k) => `
            <div class="done-item ${this.results[`t${k}`] === 'pass' ? 'pass' : ''}" style="--tc:${TONES[k].color}">
              ${toneGlyphSVG(k, { width: 80, height: 42, stroke: 5 })}
              <b>${TONES[k].name}</b><span>${LESSON_TONES[k].rule}</span>
            </div>`).join('')}
          </div>
          <div class="buttons center">
            <button class="btn big" type="button" data-act="game">${T.startGame}</button>
            <button class="btn ghost" type="button" data-act="again">${T.again}</button>
          </div>
        </section>
      </div>`;
    this.bind({ game: () => this.opt.onStartGame(), again: () => this.start() });
    this.opt.onComplete && this.opt.onComplete();
  }

  // ======================= microphone =======================

  onFrame(r, t) {
    if (!(this.state === 'speak' || this.state === 'pairs') || t < this.muteUntil) return;
    const ev = this.segmenter.push(t, r);
    if (!ev) return;
    if (ev.type === 'start') this.setFeedback('正在听……', '', '');
    if (ev.type === 'start' || ev.type === 'update') {
      const live = analyzeLive(ev.frames, this.speakTarget.tone, CONFIG);
      if (live && this.graph) this.graph.setContour(live.contour, false);
    } else if (ev.type === 'end') {
      this.evaluate(ev.frames);
    }
  }

  evaluate(frames) {
    const { tone: k, word } = this.speakTarget;
    const verdict = analyzeUtterance(frames, k, CONFIG, CONFIG.strictness[this.opt.getStrictness()]);
    recordAttempt({ where: 'lesson', target: k, frames, verdict });
    if (verdict.contour) this.graph.setContour(verdict.contour, true);

    if (verdict.status === 'correct') {
      if (this.state === 'pairs') {
        this.pairPos++;
        this.attempts = 0;
        if (this.pairPos >= this.pairQueue.length) {
          this.state = 'passed';
          this.setFeedback(T.pairDone, '', '', 'good');
          this.setSpeakActions('passed');
          this.$('[data-act=more]') && this.$('[data-act=more]').remove();
        } else {
          this.state = 'wait';
          this.setFeedback(T.passed, '', '', 'good');
          const tok = this.token;
          this.timer = setTimeout(() => { if (tok === this.token) this.renderPairWord(); }, 900);
        }
        return;
      }
      this.state = 'passed';
      this.results[this.step.id] = 'pass';
      this.setFeedback(T.passed, T.passedDetail(TONES[k].name), '', 'good');
      this.setSpeakActions('passed');
      return;
    }

    this.attempts++;
    const hint = pronunciationHint(verdict, k);
    const heard = verdict.status === 'wrong' ? heardToneName(verdict) : null;
    const main = verdict.status === 'unclear' ? '请再说一次' : '再试一次';
    const problem = (heard && heard !== TONES[k].name ? T.soundsLike(heard) : '') + hint.problem;
    this.setFeedback(main, problem, hint.fix, 'warn');
    this.setSpeakActions('listening');
    // Immediate, congruent correction: replay the model while its contour is drawn
    if (verdict.status === 'wrong') {
      const tok = this.token;
      this.timer = setTimeout(() => { if (tok === this.token) this.playWord(word, k, this.stage); }, 700);
    }
  }
}
