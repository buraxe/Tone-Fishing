// DOM bindings. All text shown here comes from data/strings.js or vocabulary.

import { S } from '../data/strings.js';
import { TONES } from '../data/tones.js';
import { LEVELS } from '../data/vocabulary.js';
import { toneGlyphSVG } from './toneGlyph.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {};
    for (const id of [
      'hanzi', 'pinyin', 'toneName', 'toneAlias', 'toneGlyph', 'matchVal', 'fbMain', 'fbDetail',
      'chances', 'score', 'combo', 'pbFill', 'pbVal', 'powerbar', 'banner', 'levelChip', 'demoBadge',
      'micMeter', 'listenBtn', 'skipBtn', 'retryBtn', 'nextBtn', 'demoRightBtn', 'demoWrongBtn',
      'titleOverlay', 'micOverlay', 'settingsOverlay', 'micMsg', 'micRetryBtn', 'micDemoBtn',
      'toneLegend', 'levels', 'startBtn', 'settingsBtn', 'settingsDone', 'settingsBack', 'segStrict', 'segSens',
    ]) this.el[id] = $(id);
    this.meterBars = Array.from(this.el.micMeter.querySelectorAll('i'));
    this.demo = false;
    this.renderLegend();
  }

  renderLegend() {
    const examples = { 1: 'mā', 2: 'má', 3: 'mǎ', 4: 'mà' };
    this.el.toneLegend.innerHTML = [1, 2, 3, 4]
      .map((k) => `<div class="tone-chip">${toneGlyphSVG(k, { width: 72, height: 40, stroke: 4 })}<b>${TONES[k].name}</b><span style="color:${TONES[k].color}">${examples[k]}</span></div>`)
      .join('');
  }

  renderLevels(selected, onPick) {
    this.el.levels.innerHTML = LEVELS.map((l) => `
      <button type="button" class="level${l.id === selected ? ' active' : ''}" data-level="${l.id}" ${l.playable ? '' : 'disabled'}>
        <b>${l.name}</b><small>${l.playable ? l.desc : `${l.desc} · ${S.locked}`}</small>
      </button>`).join('');
    this.el.levels.querySelectorAll('.level:not([disabled])').forEach((b) => {
      b.onclick = () => onPick(Number(b.dataset.level));
    });
  }

  setLevel(level) { this.el.levelChip.textContent = LEVELS.find((l) => l.id === level).name; }

  setItem(item, tone) {
    const t = TONES[tone];
    document.documentElement.style.setProperty('--t-color', t.color);
    this.el.hanzi.textContent = item.hanzi;
    this.el.hanzi.classList.remove('swap');
    void this.el.hanzi.offsetWidth;
    this.el.hanzi.classList.add('swap');
    this.el.pinyin.textContent = item.syllables.map((s) => s.pinyin).join(' ');
    this.el.toneName.textContent = t.name;
    this.el.toneAlias.textContent = `${t.alias} · ${t.chao}`;
    this.el.toneGlyph.innerHTML = toneGlyphSVG(tone);
    this.setMatch(null);
  }

  setScore(score, combo, bump) {
    this.el.score.textContent = score;
    this.el.combo.textContent = combo;
    if (bump) for (const e of [this.el.score, this.el.combo]) {
      e.classList.remove('bump');
      void e.offsetWidth;
      e.classList.add('bump');
    }
  }

  setFeedback(main, detail = '', cls = '') {
    this.el.fbMain.textContent = main;
    this.el.fbMain.className = `fb-main ${cls}`;
    this.el.fbDetail.innerHTML = detail;
  }

  setMatch(v) { this.el.matchVal.textContent = v == null ? '—' : String(v); }

  setPower(p, full = false) {
    const pct = Math.round(Math.max(0, Math.min(1, p)) * 100);
    this.el.pbFill.style.width = `${pct}%`;
    this.el.pbVal.textContent = `${pct}%`;
    this.el.powerbar.classList.toggle('full', full);
  }

  shakePower() {
    const pb = this.el.powerbar;
    pb.classList.remove('shake');
    void pb.offsetWidth;
    pb.classList.add('shake');
  }

  setChances(used, total) {
    this.el.chances.innerHTML = Array.from({ length: total }, (_, i) => `<span class="${i < used ? 'used' : ''}"></span>`).join('');
  }

  banner(text, cls = '', ms = 1200) {
    const b = this.el.banner;
    clearTimeout(this.bannerTimer);
    b.textContent = text;
    b.className = `banner ${cls}`;
    b.hidden = false;
    if (ms) this.bannerTimer = setTimeout(() => { b.hidden = true; }, ms);
  }

  hideBanner() { clearTimeout(this.bannerTimer); this.el.banner.hidden = true; }

  /** mode: 'listening' | 'busy' | 'success' | 'fail' */
  setMode(mode) {
    const e = this.el;
    const listening = mode === 'listening';
    e.listenBtn.hidden = !listening;
    e.skipBtn.hidden = !listening;
    e.demoRightBtn.hidden = !(listening && this.demo);
    e.demoWrongBtn.hidden = !(listening && this.demo);
    e.retryBtn.hidden = mode !== 'fail';
    e.nextBtn.hidden = !(mode === 'fail' || mode === 'success');
  }

  setDemo(on) {
    this.demo = on;
    this.el.demoBadge.hidden = !on;
  }

  meter(level, voiced) {
    const n = Math.round(Math.min(1, level) * this.meterBars.length);
    this.meterBars.forEach((b, i) => {
      b.classList.toggle('on', i < n);
      b.classList.toggle('voiced', voiced && i < n);
    });
  }

  showOverlay(name, on) { this.el[name].hidden = !on; }

  micState(state) {
    const e = this.el;
    e.micMsg.textContent = state === 'asking' ? S.micAsk : state === 'insecure' ? S.micInsecure : S.micDenied;
    e.micRetryBtn.hidden = state === 'asking';
    e.micDemoBtn.hidden = state === 'asking';
  }

  bindSeg(el, value, onChange) {
    const btns = el.querySelectorAll('button');
    const paint = (v) => btns.forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    paint(value);
    btns.forEach((b) => { b.onclick = () => { paint(b.dataset.v); onChange(b.dataset.v); }; });
  }
}

export function toneLine(targetTone, heardTone) {
  const t = TONES[targetTone], h = heardTone ? TONES[heardTone] : null;
  let s = `${S.targetIs('')}<span class="t" style="color:${t.color}">${t.name}</span>`;
  if (h) s += `　${S.yoursIs('')}<span class="t" style="color:${h.color}">${h.name}</span>`;
  return s;
}
