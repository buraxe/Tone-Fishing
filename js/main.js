// Entry point: wires audio, analysis, scene, UI and the game loop.

import { CONFIG } from './config.js';
import { AudioEngine } from './audio/microphone.js';
import { PitchTracker } from './audio/pitchDetector.js';
import { speakTone } from './audio/toneSynth.js';
import { playWhoosh, playSplash, playSuccess, playTrash } from './audio/sfx.js';
import { FishingScene } from './game/fishing.js';
import { Game } from './game/gameState.js';
import { PitchGraph } from './ui/pitchGraph.js';
import { UI } from './ui/ui.js';

const ui = new UI();
const engine = new AudioEngine();
const scene = new FishingScene(document.getElementById('scene'));
const graph = new PitchGraph(document.getElementById('pitchGraph'), { stepSt: CONFIG.tone.chaoToSemitone });

const withCtx = (fn) => () => { if (engine.ctx) fn(engine.ctx); };
const game = new Game({
  ui, scene, graph,
  sounds: { whoosh: withCtx(playWhoosh), splash: withCtx(playSplash), success: withCtx(playSuccess), trash: withCtx(playTrash) },
});

let tracker = null;
let running = false;
let demoMode = false;
let selectedLevel = 1;

// ---------- settings (per-browser convenience only) ----------
const prefs = { strictness: 'standard', sensitivity: 'medium' };
try { Object.assign(prefs, JSON.parse(localStorage.getItem('tone-fishing-prefs') || '{}')); } catch (e) { /* storage unavailable */ }
const savePrefs = () => { try { localStorage.setItem('tone-fishing-prefs', JSON.stringify(prefs)); } catch (e) { /* ignore */ } };
game.strictness = prefs.strictness;

ui.bindSeg(ui.el.segStrict, prefs.strictness, (v) => { prefs.strictness = v; game.strictness = v; savePrefs(); });
ui.bindSeg(ui.el.segSens, prefs.sensitivity, (v) => {
  prefs.sensitivity = v;
  if (tracker) tracker.setSensitivity(CONFIG.sensitivity[v]);
  savePrefs();
});

// ---------- title screen ----------
const renderLevels = () => ui.renderLevels(selectedLevel, (lvl) => { selectedLevel = lvl; renderLevels(); });
renderLevels();
// Show an example round behind the title so the scene is alive at rest
game.round = game.generator.next(1);
scene.setRound(game.round.slots);
graph.setTarget(game.round.tone);
ui.setItem(game.round.item, game.round.tone);
ui.setChances(0, CONFIG.game.attemptsPerRound);
ui.setMode('busy');

ui.el.startBtn.onclick = async () => {
  engine.ensureContext();
  ui.showOverlay('titleOverlay', false);
  if (demoMode || engine.hasMic) { begin(); return; }
  await requestMic();
};

async function requestMic() {
  ui.micState('asking');
  ui.showOverlay('micOverlay', true);
  const result = await engine.startMic();
  if (result === 'ok') {
    ui.showOverlay('micOverlay', false);
    setDemo(false);
    begin();
  } else {
    ui.micState(result);
  }
}

ui.el.micRetryBtn.onclick = () => requestMic();
ui.el.micDemoBtn.onclick = () => {
  ui.showOverlay('micOverlay', false);
  setDemo(true);
  begin();
};

function setDemo(on) {
  demoMode = on;
  ui.setDemo(on);
}

function begin() {
  engine.ensureContext();
  if (!tracker || tracker.sampleRate !== engine.sampleRate) {
    tracker = new PitchTracker(engine.sampleRate, CONFIG.pitch);
    tracker.sampleRate = engine.sampleRate;
    tracker.setSensitivity(CONFIG.sensitivity[prefs.sensitivity]);
  }
  running = true;
  game.startLevel(selectedLevel);
}

// ---------- in-game buttons ----------
ui.el.listenBtn.onclick = () => {
  const ctx = engine.ensureContext();
  const dur = speakTone(ctx, game.targetTone, { baseHz: 165 });
  game.mute(engine.now + dur + 0.35); // do not analyse our own demo through the mic
};

function demoSpeak(correct) {
  const ctx = engine.ensureContext();
  const target = game.targetTone;
  let tone = target;
  if (!correct) {
    const others = [1, 2, 3, 4].filter((k) => k !== target);
    tone = others[Math.floor(Math.random() * others.length)];
  }
  const voices = [110, 145, 190, 235]; // different speakers, same shapes
  speakTone(ctx, tone, { baseHz: voices[Math.floor(Math.random() * voices.length)], analysisNode: engine.input });
}
ui.el.demoRightBtn.onclick = () => demoSpeak(true);
ui.el.demoWrongBtn.onclick = () => demoSpeak(false);

ui.el.skipBtn.onclick = () => game.skip();
ui.el.nextBtn.onclick = () => game.newRound();
ui.el.retryBtn.onclick = () => game.newRound(true);

ui.el.settingsBtn.onclick = () => ui.showOverlay('settingsOverlay', true);
ui.el.settingsDone.onclick = () => ui.showOverlay('settingsOverlay', false);
ui.el.settingsBack.onclick = () => {
  ui.showOverlay('settingsOverlay', false);
  game.stop();
  running = false;
  ui.setMode('busy');
  renderLevels();
  ui.showOverlay('titleOverlay', true);
};

// ---------- main loop ----------
let prev = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  if (running && tracker && engine.analyser) {
    const buf = engine.read();
    if (buf) {
      const r = tracker.analyze(buf);
      game.onFrame(r, engine.now);
      ui.meter(r.gate > 0 ? r.rms / (r.gate * 4) : 0, r.voiced);
    }
  }
  scene.frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
