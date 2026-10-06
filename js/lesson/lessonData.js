// Content of the tone lesson (声调课堂). All text is player-facing Chinese.
//
// Design follows research on teaching Mandarin tones to speakers of non-tonal
// languages (summarised in README → 声调课堂):
//  · order easy → hard: 1st and 4th first, then 2nd and 3rd, then a 2nd/3rd
//    contrast step, then all four mixed;
//  · listen and recognise before speaking (perception before production);
//  · describe tones as movement (where it starts, where it goes, where it ends),
//    not as "how high";
//  · sound, drawn contour, colour and hand gesture always show the same thing;
//  · several native voices (high-variability listening).

export const LESSON_INTRO = {
  title: '声调课堂',
  lead: '普通话有四个声调。听声调时，不要只想“高还是低”，要听声音怎么走：从哪儿开始，往哪儿走，在哪儿结束。',
  example: '同一个音节 ma，走法不同，意思就完全不同：',
  minimal: [
    { hanzi: '妈', pinyin: 'mā', syl: 'ma', tone: 1 },
    { hanzi: '麻', pinyin: 'má', syl: 'ma', tone: 2 },
    { hanzi: '马', pinyin: 'mǎ', syl: 'ma', tone: 3 },
    { hanzi: '骂', pinyin: 'mà', syl: 'ma', tone: 4 },
  ],
  plan: [
    { name: '先学容易的', desc: '第一声、第四声' },
    { name: '再学难的', desc: '第二声、第三声' },
    { name: '重点对比', desc: '第二声和第三声' },
    { name: '综合练习', desc: '四个声调一起听' },
  ],
  howTo: '每个声调都按这个顺序练：看一看 → 听一听 → 说一说。边说边用手在空中画，记得更牢。',
  begin: '开始学习',
  skip: '跳过课堂，直接游戏',
};

// The six steps, in teaching order.
export const LESSON_STEPS = [
  { id: 't1', kind: 'tone', tone: 1, label: '第一声' },
  { id: 't4', kind: 'tone', tone: 4, label: '第四声', listen: { tones: [1, 4], n: 4 } },
  { id: 't2', kind: 'tone', tone: 2, label: '第二声', listen: { tones: [2, 1, 4, 2], n: 4 } },
  { id: 't3', kind: 'tone', tone: 3, label: '第三声', listen: { tones: [2, 3], n: 6 }, compare: 2 },
  { id: 'c23', kind: 'contrast', label: '二声·三声', listen: { contrast: true, n: 6 },
    pairs: [
      [{ hanzi: '麻', pinyin: 'má', syl: 'ma', tone: 2 }, { hanzi: '马', pinyin: 'mǎ', syl: 'ma', tone: 3 }],
      [{ hanzi: '鱼', pinyin: 'yú', syl: 'yu', tone: 2 }, { hanzi: '雨', pinyin: 'yǔ', syl: 'yu', tone: 3 }],
    ] },
  { id: 'mix', kind: 'mix', label: '综合', listen: { tones: [1, 2, 3, 4], n: 8 } },
];

export const PHASES = {
  watch: '看一看',
  listen: '听一听',
  speak: '说一说',
  pairs: '说一说',
};

// One entry per tone. `path` describes the movement in three parts.
export const LESSON_TONES = {
  1: {
    rule: '平：一条直线',
    path: ['从高处开始', '保持不动', '在高处结束'],
    gesture: '手势：手掌放在额头的高度，平平地向右移动。',
    picture: '像医生让你张开嘴说“啊——”，声音拉成一条直线。',
    tip: '用比平时说话稍高的声音开始，然后不升也不降，拉长半秒。',
    words: [
      { hanzi: '妈', pinyin: 'mā', syl: 'ma' },
      { hanzi: '天', pinyin: 'tiān', syl: 'tian' },
      { hanzi: '书', pinyin: 'shū', syl: 'shu' },
      { hanzi: '高', pinyin: 'gāo', syl: 'gao' },
    ],
  },
  4: {
    rule: '降：从上往下',
    path: ['从最高处开始', '一口气往下', '落到最低'],
    gesture: '手势：手从头顶的高度，快速向下劈。',
    picture: '像生气地说“不！”，或者下命令说“去！”',
    tip: '开头要高，然后干脆地落下来，短而有力。',
    words: [
      { hanzi: '骂', pinyin: 'mà', syl: 'ma' },
      { hanzi: '大', pinyin: 'dà', syl: 'da' },
      { hanzi: '去', pinyin: 'qù', syl: 'qu' },
      { hanzi: '是', pinyin: 'shì', syl: 'shi' },
    ],
  },
  2: {
    rule: '升：一路往上',
    path: ['从中间开始', '一路往上', '在高处结束'],
    gesture: '手势：手从胸口的高度，斜着向上抬。',
    picture: '像惊讶地问“啊？”或者“什么？”',
    tip: '开头不要太高，也不要先往下压；直接往上走，结尾明显比开头高。',
    words: [
      { hanzi: '麻', pinyin: 'má', syl: 'ma' },
      { hanzi: '茶', pinyin: 'chá', syl: 'cha' },
      { hanzi: '鱼', pinyin: 'yú', syl: 'yu' },
      { hanzi: '人', pinyin: 'rén', syl: 'ren' },
    ],
  },
  3: {
    rule: '折：先下后上',
    path: ['从偏低处开始', '沉到最低，停一下', '再抬起来'],
    gesture: '手势：手先往下压到腰部，停一下，再慢慢抬起来。',
    picture: '像拖长声音、有点怀疑地说“哦——？”',
    tip: '关键是“低”：就算后面升得不多，也一定要先沉到最低。读得比其他声调长一点。',
    words: [
      { hanzi: '马', pinyin: 'mǎ', syl: 'ma' },
      { hanzi: '好', pinyin: 'hǎo', syl: 'hao' },
      { hanzi: '五', pinyin: 'wǔ', syl: 'wu' },
      { hanzi: '水', pinyin: 'shuǐ', syl: 'shui' },
    ],
  },
};

export const COMPARE_23 = {
  title: '第二声和第三声最容易混淆',
  points: [
    { tone: 2, text: '第二声：一开始就往上走。' },
    { tone: 3, text: '第三声：先往下沉到最低，再上来。' },
  ],
  key: '区别在开头：往上，还是往下？',
};

export const LESSON_TEXT = {
  stepN: (n) => `第${['一', '二', '三', '四', '五', '六'][n - 1]}步`,
  listenAgain: '再听一次',
  hearWord: '听发音',
  examples: '例字（点一下，听不同的人读）',
  next: '下一步',
  // watch
  watchHint: '一边听，一边看手怎么走，也用你的手跟着画。',
  // listen
  listenPrompt: '听一听，是哪个声调？',
  listenPromptPair: '听一听，是第二声还是第三声？',
  itemN: (i, n) => `第 ${i} / ${n} 题`,
  right: '对了！',
  wrongWas: (name) => `这是${name}。`,
  nextItem: '下一题',
  scoreLine: (a, n) => `答对 ${a} / ${n} 题`,
  scoreGood: '很好！你已经能听出来了。',
  scoreLow: '还不太稳。再听一组，会更清楚。',
  moreSet: '再练一组',
  goOn: '继续',
  clear: '重画',
  // speak
  sayThis: '说一说：读出这个字',
  sayGesture: '边说边用手画声调。',
  passed: '读对了！',
  passedDetail: (name) => `你已经掌握了${name}。`,
  practiceMore: '再练一个字',
  changeWord: '换一个字',
  skipStep: '跳过这一步',
  soundsLike: (name) => `听起来像${name}。`,
  listenModel: '听正确发音',
  // pairs
  pairsPrompt: '说一说：先读第二声，再读第三声',
  pairDone: '两个都读对了！',
  // done
  doneTitle: '课堂完成！',
  doneLead: '四个声调都学过了。现在去钓鱼吧！',
  doneListen: (a, n) => `听力练习：答对 ${a} / ${n} 题`,
  doneSkipped: (names) => `${names}还可以多练习，游戏里会经常出现。`,
  startGame: '开始游戏',
  again: '再学一遍',
  speaker: (name) => name,
};

// Short movement descriptions used in listening feedback.
export const TONE_MOVES = {
  1: '平：一条直线',
  2: '升：一开始就往上走',
  3: '折：先往下沉，再上来',
  4: '降：从高处一口气落下',
};
