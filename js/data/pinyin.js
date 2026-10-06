// Numbered pinyin → tone-marked pinyin ("ma3" → "mǎ", "shui3" → "shuǐ").

const MARKS = {
  a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', ü: 'ǖǘǚǜ',
};

export function markPinyin(syl, tone) {
  const s = syl.replace('v', 'ü');
  if (!tone || tone > 4) return s;
  // Standard rule: a or e takes the mark; in "ou" the o does; otherwise the last vowel
  let idx = s.search(/[ae]/);
  if (idx < 0) idx = s.indexOf('ou');
  if (idx < 0) {
    for (let i = s.length - 1; i >= 0; i--) if ('iouü'.includes(s[i])) { idx = i; break; }
  }
  if (idx < 0) return s;
  const v = s[idx];
  return s.slice(0, idx) + MARKS[v][tone - 1] + s.slice(idx + 1);
}
