// Vocabulary. Each item has one or more syllables; each syllable carries its own tone.
// Levels 1-2 are single syllables (playable). Levels 3-4 are stored for the
// per-syllable mode and are shown as locked until segmentation is added.

const one = (hanzi, pinyin, tone, level) => ({ hanzi, level, syllables: [{ pinyin, tone }] });

export const VOCABULARY = [
  // Level 1: the classic ma minimal set
  one('妈', 'mā', 1, 1),
  one('麻', 'má', 2, 1),
  one('马', 'mǎ', 3, 1),
  one('骂', 'mà', 4, 1),

  // Level 2: everyday single syllables, balanced across tones
  one('一', 'yī', 1, 2),
  one('高', 'gāo', 1, 2),
  one('书', 'shū', 1, 2),
  one('天', 'tiān', 1, 2),
  one('十', 'shí', 2, 2),
  one('人', 'rén', 2, 2),
  one('鱼', 'yú', 2, 2),
  one('茶', 'chá', 2, 2),
  one('五', 'wǔ', 3, 2),
  one('好', 'hǎo', 3, 2),
  one('水', 'shuǐ', 3, 2),
  one('我', 'wǒ', 3, 2),
  one('大', 'dà', 4, 2),
  one('去', 'qù', 4, 2),
  one('是', 'shì', 4, 2),
  one('爱', 'ài', 4, 2),

  // Level 3: two syllables (locked)
  { hanzi: '你好', level: 3, syllables: [{ pinyin: 'nǐ', tone: 3 }, { pinyin: 'hǎo', tone: 3 }] },
  { hanzi: '学生', level: 3, syllables: [{ pinyin: 'xué', tone: 2 }, { pinyin: 'shēng', tone: 1 }] },
  { hanzi: '老师', level: 3, syllables: [{ pinyin: 'lǎo', tone: 3 }, { pinyin: 'shī', tone: 1 }] },

  // Level 4: short sentences (locked)
  { hanzi: '我很好。', level: 4, syllables: [{ pinyin: 'wǒ', tone: 3 }, { pinyin: 'hěn', tone: 3 }, { pinyin: 'hǎo', tone: 3 }] },
];

export const LEVELS = [
  { id: 1, name: '第一关', desc: '妈 · 麻 · 马 · 骂', playable: true },
  { id: 2, name: '第二关', desc: '常用单字', playable: true },
  { id: 3, name: '第三关', desc: '双音节词', playable: false },
  { id: 4, name: '第四关', desc: '短句', playable: false },
];

/** Items available when playing a level (level 2 also includes level 1 words). */
export function itemsForLevel(level) {
  return VOCABULARY.filter((v) => v.syllables.length === 1 && v.level <= level);
}
