// Entry point: wires audio, analysis, lesson, scene, UI and the main loop.

import { CONFIG } from './config.js';
import { AudioEngine } from './audio/microphone.js';
import { PitchTracker } from './audio/pitchDetector.js';
import { speakTone, toneDuration } from './audio/toneSynth.js';
import { playWhoosh, playSplash, playSuccess, playTrash } from './audio/sfx.js';
import { FishingScene } from './game/fishing.js';
import { Game } from './game/gameState.js';
import { PitchGraph } from './ui/pitchGraph.js';
import { UI } from './ui/ui.js';
import { Lesson } from './lesson/lesson.js';
import { lastAttempt, diagnosticsJSON } from './diagnostics.js';
import { TONES } from './data/tones.js';
import { playClip, clipsForTone } from './audio/clips.js';

const ui = new UI();
const engine = new AudioEngine();
const scene = new FishingScene(document.getElementById('scene'));
const graph = new PitchGraph(document.getElementById('pitchGraph'), { stepSt: CONFIG.tone.chaoToSemitone });
const $ = (id) => document.getElementById(id);

const withCtx = (fn) => () => { if (engine.ctx) fn(engine.ctx); };
const game = new Game({
  ui, scene, graph,
  sounds: { whoosh: withCtx(playWhoosh), splash: withCtx(playSplash), success: withCtx(playSuccess), trash: withCtx(playTrash) },
});

let tracker = null;
let mode = 'title'; // 'title' | 'lesson' | 'game'
let demoMode = false;
let selectedLevel = 1;

// ---------- per-browser settings (convenience only; the game works without storage) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
};
const prefs = Object.assign({ strictness: 'standard', sensitivity: 'medium' }, store.get('tone-fishing-prefs', {}));
const savePrefs = () => store.set('tone-fishing-prefs', prefs);
let lessonDone = !!store.get('tone-fishing-lesson-done', false);
game.strictness = prefs.strictness;

ui.bindSeg(ui.el.segStrict, prefs.strictness, (v) => { prefs.strictness = v; game.strictness = v; savePrefs(); });
ui.bindSeg(ui.el.segSens, prefs.sensitivity, (v) => {
  prefs.sensitivity = v;
  if (tracker) tracker.setSensitivity(CONFIG.sensitivity[v]);
  savePrefs();
});

// ---------- demo voice (no microphone) ----------
// Plays a native recording into the analyser (and the speakers), so the demo
// exercises the same detector a student's voice does. Falls back to the
// synthetic voice if the clip cannot be decoded.
function demoSpeak(target, correct) {
  const ctx = engine.ensureContext();
  let tone = target;
  if (!correct) {
    const others = [1, 2, 3, 4].filter((k) => k !== target);
    tone = others[Math.floor(Math.random() * others.length)];
  }
  const clips = clipsForTone(tone, { okOnly: true });
  const clip = clips[Math.floor(Math.random() * clips.length)];
  return playClip(ctx, clip, { analysisNode: engine.input })
    .then(({ ended }) => ended)
    .catch(() => {
      const voices = [110, 145, 190, 235];
      speakTone(ctx, tone, { baseHz: voices[Math.floor(Math.random() * voices.length)], analysisNode: engine.input });
      return new Promise((r) => setTimeout(r, toneDuration(tone) * 1000 + 100));
    });
}

// ---------- lesson ----------
const lesson = new Lesson($('lessonView'), engine, {
  getStrictness: () => prefs.strictness,
  isDemo: () => demoMode,
  demoSpeak,
  onStartGame: () => startGame(),
  onComplete: () => { lessonDone = true; store.set('tone-fishing-lesson-done', true); updateFirstNote(); },
});

// ---------- screens ----------
function showView(next) {
  mode = next;
  $('stageView').hidden = next === 'lesson';
  $('lessonView').hidden = next !== 'lesson';
  document.querySelectorAll('.game-only').forEach((e) => { e.hidden = next === 'lesson'; });
  ui.el.levelChip.textContent = next === 'lesson' ? '声调课堂' : ui.el.levelChip.dataset.level || '第一关';
}

function updateFirstNote() { $('firstNote').hidden = lessonDone; }
updateFirstNote();

const renderLevels = () => ui.renderLevels(selectedLevel, (lvl) => { selectedLevel = lvl; renderLevels(); });
renderLevels();

// Example round behind the title so the scene is alive at rest
game.round = game.generator.next(1);
scene.setRound(game.round.slots);
graph.setTarget(game.round.tone);
ui.setItem(game.round.item, game.round.tone);
ui.setChances(0, CONFIG.game.attemptsPerRound);
ui.setMode('busy');

function ensureTracker() {
  engine.ensureContext();
  if (!tracker || tracker.sampleRate !== engine.sampleRate) {
    tracker = new PitchTracker(engine.sampleRate, CONFIG.pitch);
    tracker.sampleRate = engine.sampleRate;
    tracker.setSensitivity(CONFIG.sensitivity[prefs.sensitivity]);
  }
}

/** Get the microphone (or demo mode), then run `next`. */
let afterMic = null;
async function withMic(next) {
  engine.ensureContext();
  if (demoMode || engine.hasMic) { ensureTracker(); next(); return; }
  afterMic = next;
  ui.micState('asking');
  ui.showOverlay('micOverlay', true);
  const result = await engine.startMic();
  if (result === 'ok') {
    ui.showOverlay('micOverlay', false);
    setDemo(false);
    ensureTracker();
    afterMic = null;
    next();
  } else {
    ui.micState(result);
  }
}
ui.el.micRetryBtn.onclick = () => withMic(afterMic || startGame);
ui.el.micDemoBtn.onclick = () => {
  ui.showOverlay('micOverlay', false);
  setDemo(true);
  ensureTracker();
  const next = afterMic || startGame;
  afterMic = null;
  next();
};

function setDemo(on) {
  demoMode = on;
  ui.setDemo(on);
}

function startLesson() {
  ui.showOverlay('titleOverlay', false);
  withMic(() => {
    game.stop();
    showView('lesson');
    lesson.start();
  });
}

function startGame() {
  ui.showOverlay('titleOverlay', false);
  withMic(() => {
    lesson.stop();
    showView('game');
    ui.el.levelChip.dataset.level = '';
    game.startLevel(selectedLevel);
    ui.el.levelChip.dataset.level = ui.el.levelChip.textContent;
  });
}

ui.el.startBtn.onclick = () => (lessonDone ? startGame() : startLesson());
$('lessonBtn').onclick = () => startLesson();

function backToTitle() {
  game.stop();
  lesson.stop();
  showView('game');
  mode = 'title';
  ui.setMode('busy');
  renderLevels();
  ui.showOverlay('titleOverlay', true);
}

// Always-visible way back to the title screen (lesson and game)
$('homeBtn').onclick = () => backToTitle();
$('micBackBtn').onclick = () => { afterMic = null; ui.showOverlay('micOverlay', false); backToTitle(); };

// ---------- in-game buttons ----------
ui.el.listenBtn.onclick = () => {
  const ctx = engine.ensureContext();
  const dur = speakTone(ctx, game.targetTone, { baseHz: 165 });
  game.mute(engine.now + dur + 0.35); // do not analyse our own example through the mic
};
ui.el.demoRightBtn.onclick = () => demoSpeak(game.targetTone, true);
ui.el.demoWrongBtn.onclick = () => demoSpeak(game.targetTone, false);
ui.el.skipBtn.onclick = () => game.skip();
ui.el.nextBtn.onclick = () => game.newRound();
ui.el.retryBtn.onclick = () => game.newRound(true);

// ---------- settings + diagnostics ----------
function renderDiag() {
  const a = lastAttempt();
  const el = $('diagText');
  if (!a) return;
  const name = (k) => (k ? TONES[k].name : '无法判断');
  const verdict = { correct: '判定正确', wrong: '判定错误', unclear: '没有听清' }[a.status];
  el.textContent = `上一次：目标${TONES[a.target].name}，听到${a.status === 'unclear' ? '（不确定）' : name(a.heard)}，${verdict}。`
    + (a.hzMin ? ` 音高 ${a.hzMin}–${a.hzMax} 赫兹，有声帧 ${a.voicedFrames}/${a.totalFrames}，可信度 ${a.confidence ?? '—'}。` : ' 没有检测到清晰的音高。');
}
ui.el.settingsBtn.onclick = () => { renderDiag(); ui.showOverlay('settingsOverlay', true); };
ui.el.settingsDone.onclick = () => ui.showOverlay('settingsOverlay', false);
ui.el.settingsBack.onclick = () => { ui.showOverlay('settingsOverlay', false); backToTitle(); };
$('diagCopy').onclick = async () => {
  const text = diagnosticsJSON({ prefs, sampleRate: engine.sampleRate, userAgent: navigator.userAgent });
  const area = $('diagArea');
  try {
    await navigator.clipboard.writeText(text);
    $('diagCopy').textContent = '已复制';
    setTimeout(() => { $('diagCopy').textContent = '复制诊断数据'; }, 1800);
  } catch (e) {
    // Clipboard refused: show the data selected so it can be copied by hand
    area.value = text;
    area.hidden = false;
    area.focus();
    area.select();
  }
};

// ---------- analysis ----------
let lastFrame = null;
function analyse(buf, hop, t) {
  if (!(mode === 'game' || mode === 'lesson') || !tracker) return;
  const r = tracker.analyze(buf, hop);
  lastFrame = r;
  if (mode === 'game') game.onFrame(r, t);
  else lesson.onFrame(r, t);
}
// Preferred path: every 10 ms of audio from the worklet, independent of the screen
engine.onSamples = (ring, hop, t) => analyse(ring, hop, t);

// ---------- main loop (drawing; analysis only when the worklet is unavailable) ----------
let prev = performance.now();
let lastAudioT = null;
function loop(now) {
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  if (!engine.tapActive && engine.analyser && tracker) {
    const buf = engine.read();
    if (buf) {
      const t = engine.now;
      const adt = lastAudioT == null ? 1 / 60 : Math.min(0.1, Math.max(0.001, t - lastAudioT));
      lastAudioT = t;
      analyse(buf, adt, t);
    }
  }
  if (lastFrame && (mode === 'game' || mode === 'lesson')) {
    ui.meter(lastFrame.gate > 0 ? lastFrame.rms / (lastFrame.gate * 4) : 0, lastFrame.voiced);
  }
  if (mode !== 'lesson') scene.frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
