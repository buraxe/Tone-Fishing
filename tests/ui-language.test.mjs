// Checks that no English (or Turkish) words reach the player.
// Scans visible text in index.html and every string in data/strings.js.
// Latin letters are allowed only inside pinyin syllables.
// Run: node tests/ui-language.test.mjs

import fs from 'node:fs';
import { S } from '../js/data/strings.js';
import { VOCABULARY } from '../js/data/vocabulary.js';

const pinyin = new Set(VOCABULARY.flatMap((v) => v.syllables.map((s) => s.pinyin)).concat(['mā', 'má', 'mǎ', 'mà']));
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

if (problems.length) {
  console.log('Non-Chinese player-facing text found:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('ok: all player-facing text is Chinese (pinyin allowed)');
