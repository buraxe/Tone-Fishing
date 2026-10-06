// Checks that no English (or Turkish) words reach the player.
// Scans visible text in index.html and every string in data/strings.js.
// Latin letters are allowed only inside pinyin syllables.
// Run: node tests/ui-language.test.mjs

import fs from 'node:fs';
import { S } from '../js/data/strings.js';
import { VOCABULARY } from '../js/data/vocabulary.js';
import { LESSON_INTRO, LESSON_TONES, LESSON_TEXT, LESSON_STEPS, PHASES, COMPARE_23, TONE_MOVES } from '../js/lesson/lessonData.js';
import { pronunciationHint } from '../js/lesson/hints.js';
import { SPEAKER_NAME } from '../js/audio/clips.js';

const lessonPinyin = Object.values(LESSON_TONES).flatMap((t) => t.words.map((w) => w.pinyin));
const pinyin = new Set(VOCABULARY.flatMap((v) => v.syllables.map((s) => s.pinyin)).concat(['mā', 'má', 'mǎ', 'mà', 'ma'], lessonPinyin));
const problems = [];

function check(where, text) {
  for (const word of text.match(/[A-Za-z\u00C0-\u024F]+/g) || []) {
    if (!pinyin.has(word)) problems.push(`${where}: "${word}"`);
  }
}

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const body = html.slice(html.indexOf('<!--BODY-START-->'), html.indexOf('<!--BODY-END-->'));
const visible = body.replace(/<[^>]*>/g, ' ');
check('index.html', visible);
// aria-labels are read aloud by screen readers, so they count as player-facing
for (const m of body.matchAll(/aria-label="([^"]*)"/g)) check('aria-label', m[1]);

for (const [k, v] of Object.entries(S)) check(`strings.${k}`, typeof v === 'function' ? v('') : v);

// Lesson content and every hint the classifier can produce
function walk(where, v) {
  if (typeof v === 'string') check(where, v);
  else if (typeof v === 'function') check(where, String(v(1, 2)));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!['pinyin', 'syl', 'id', 'kind'].includes(k)) walk(`${where}.${k}`, x);
}
walk('LESSON_INTRO', LESSON_INTRO);
walk('LESSON_TONES', LESSON_TONES);
walk('LESSON_TEXT', LESSON_TEXT);
for (const [n, o] of Object.entries({ LESSON_STEPS, PHASES, COMPARE_23, TONE_MOVES, SPEAKER_NAME })) walk(n, o);
const fake = (top, f) => ({ status: 'wrong', contour: {}, result: { top, tone: top, features: f } });
const shapes = [
  { net: -4, range: 5, fallDepth: 4, riseAfter: 0, lowFrac: 0.1 },
  { net: 4, range: 5, fallDepth: 0, riseAfter: 5, lowFrac: 0.3 },
  { net: 0, range: 1, fallDepth: 0.5, riseAfter: 0.5, lowFrac: 0.8 },
  { net: 1, range: 6, fallDepth: 4, riseAfter: 5, lowFrac: 0.3 },
];
for (const target of [1, 2, 3, 4]) for (const top of [1, 2, 3, 4]) for (const f of shapes) walk('hint', pronunciationHint(fake(top, f), target));
walk('hint', pronunciationHint({ status: 'unclear', contour: null }, 1));

if (problems.length) {
  console.log('Non-Chinese player-facing text found:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('ok: all player-facing text is Chinese (pinyin allowed)');
