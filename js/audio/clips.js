// Native-speaker clips from the audio bank: decode once, play with optional
// routing into the analyser (used as the demo voice), pick varied speakers.

import { AUDIO_BANK } from '../data/audioBank.js';
import { markPinyin } from '../data/pinyin.js';

const buffers = new Map();

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function decode(ctx, clip) {
  if (buffers.has(clip.id)) return buffers.get(clip.id);
  const bytes = b64ToBytes(clip.data);
  const buf = await new Promise((resolve, reject) => {
    // Safari still wants the callback form
    const p = ctx.decodeAudioData(bytes.buffer, resolve, reject);
    if (p && p.then) p.then(resolve, reject);
  });
  buffers.set(clip.id, buf);
  return buf;
}

export const SPEAKER_NAME = { A: '发音人一', B: '发音人二', C: '发音人三' };

export function clipLabel(clip) {
  return { hanzi: clip.hanzi, pinyin: markPinyin(clip.syl, clip.tone) };
}

/**
 * Play a clip. Resolves with { duration } as soon as playback starts and
 * exposes `ended` (a promise) for when it finishes.
 */
export async function playClip(ctx, clip, { analysisNode = null, gain = 1 } = {}) {
  const buf = await decode(ctx, clip);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g);
  g.connect(ctx.destination);
  if (analysisNode) g.connect(analysisNode);
  const ended = new Promise((r) => { src.onended = () => { g.disconnect(); r(); }; });
  src.start();
  return { duration: buf.duration, ended };
}

/** Preload a set of clips so the first play starts without delay. */
export function preload(ctx, clips) {
  return Promise.all(clips.map((c) => decode(ctx, c).catch(() => null)));
}

let lastSpeaker = null;

/** Clips for a lesson word: the character recording plus syllable recordings of the same tone. */
export function clipsForWord(hanzi, syl, tone) {
  return AUDIO_BANK.filter((c) => c.tone === tone && (c.hanzi === hanzi || (!c.hanzi && c.syl === syl)));
}

/** Pick one clip, rotating speakers so the learner hears different voices. */
export function pickVaried(clips) {
  if (!clips.length) return null;
  const other = clips.filter((c) => c.sp !== lastSpeaker);
  const pool = other.length ? other : clips;
  const c = pool[Math.floor(Math.random() * pool.length)];
  lastSpeaker = c.sp;
  return c;
}

/** Any clip of a tone; okOnly = only clips the detector recognises (for the demo voice). */
export function clipsForTone(tone, { okOnly = false } = {}) {
  return AUDIO_BANK.filter((c) => c.tone === tone && (!okOnly || c.ok));
}

/**
 * A listening set: n items over the given tones, balanced, shuffled,
 * different speakers and syllables, no tone three times in a row.
 */
export function listeningSet(tones, n) {
  const want = [];
  for (let i = 0; i < n; i++) want.push(tones[i % tones.length]);
  for (let i = want.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [want[i], want[j]] = [want[j], want[i]];
  }
  const items = [];
  let lastSyl = null;
  for (const t of want) {
    const pool = AUDIO_BANK.filter((c) => c.tone === t && c.syl !== lastSyl);
    const c = pickVaried(pool.length ? pool : clipsForTone(t));
    lastSyl = c.syl;
    items.push(c);
  }
  return items;
}

/** Minimal-pair listening: same syllable and speaker, 2nd vs 3rd tone. */
export function contrastSet(n) {
  const pairs = [];
  for (const a of AUDIO_BANK.filter((c) => c.tone === 2 && !c.hanzi)) {
    const b = AUDIO_BANK.find((c) => c.tone === 3 && c.sp === a.sp && c.syl === a.syl && !c.hanzi);
    if (b) pairs.push([a, b]);
  }
  const items = [];
  for (let i = 0; i < n; i++) {
    const [a, b] = pairs[Math.floor(Math.random() * pairs.length)];
    items.push(i % 2 === 0 ? a : b);
  }
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
