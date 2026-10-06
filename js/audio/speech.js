// Spoken examples. Uses the browser's built-in Mandarin voice (Web Speech API)
// when one is installed; otherwise sings the tone contour with toneSynth.
// Returns a promise that resolves when playback has finished.

import { speakTone } from './toneSynth.js';

let zhVoice = null;
let voicesReady = false;

function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;
  voicesReady = true;
  const zh = voices.filter((v) => /^zh(-|_)?(CN|Hans)?/i.test(v.lang) && !/HK|TW|yue/i.test(v.lang + v.name));
  zhVoice = zh.find((v) => v.localService) || zh[0] || null;
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  pickVoice();
  window.speechSynthesis.onvoiceschanged = pickVoice;
}

export function hasMandarinVoice() {
  if (!voicesReady) pickVoice();
  return !!zhVoice;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Say a word with a real Mandarin voice; falls back to the tone contour. */
export async function speakWord(ctx, hanzi, tone) {
  if (hasMandarinVoice()) {
    const ok = await new Promise((resolve) => {
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(hanzi);
        u.voice = zhVoice;
        u.lang = zhVoice.lang;
        u.rate = 0.75;
        let started = false;
        u.onstart = () => { started = true; };
        u.onend = () => resolve(true);
        u.onerror = () => resolve(false);
        window.speechSynthesis.speak(u);
        // Some browsers never fire events when speech is blocked
        setTimeout(() => { if (!started) { window.speechSynthesis.cancel(); resolve(false); } }, 2500);
        setTimeout(() => resolve(true), 4000);
      } catch (e) {
        resolve(false);
      }
    });
    if (ok) return;
  }
  const dur = speakTone(ctx, tone, { baseHz: 175 });
  await wait(dur * 1000);
}

/** Sing just the contour on "a" (makes the pitch shape easy to hear). */
export async function singTone(ctx, tone) {
  const dur = speakTone(ctx, tone, { baseHz: 175 });
  await wait(dur * 1000);
}

