// Pronunciation hints: turn what the classifier measured (pitch-contour
// features in semitones) into one concrete sentence about what to change.

import { TONES } from '../data/tones.js';

const TONE_TIPS = {
  1: '第一声：用稍高的声音开始，保持不动，像唱一个长音。',
  2: '第二声：从中间开始往上扬，像惊讶地问“啊？”',
  3: '第三声：先沉到最低，停一下，再升上来。',
  4: '第四声：从最高处干脆地降下来，像说“不！”',
};

/**
 * @param verdict  result of analyzeUtterance (status, result, contour)
 * @param target   target tone 1-4
 * @returns { problem, fix } short Chinese sentences
 */
export function pronunciationHint(verdict, target) {
  if (!verdict.contour || !verdict.result) {
    return {
      problem: '没有听清楚。',
      fix: '声音大一点，靠近麦克风，把这个字拉长到半秒左右。',
    };
  }
  const f = verdict.result.features;
  const heard = verdict.result.top;

  if (verdict.status === 'unclear') {
    return {
      problem: '声调不够清楚，无法判断。',
      fix: f.range < 1.5 && target !== 1 ? '让声音的高低变化更明显一些。' : TONE_TIPS[target],
    };
  }

  switch (target) {
    case 1:
      if (f.net < -2) return { problem: '声音往下掉了。', fix: '第一声要一直停在高处，结尾不要降下来。' };
      if (f.net > 2) return { problem: '声音往上扬了。', fix: '第一声不升也不降，开头就用高音，然后保持。' };
      if (heard === 3) return { problem: '声音先降后升了。', fix: '保持在同一个高度，不要往下压。' };
      return { problem: '音高有起伏。', fix: '像唱歌拉长音一样：保持同一个高度，拉长半秒。' };

    case 2:
      if (f.net < -2) return { problem: '声音往下降了，方向正好相反。', fix: '第二声是往上升的：从中间开始，结尾提高。' };
      if (heard === 3 || f.fallDepth > 1.8) return { problem: '开头先往下压了。', fix: '不要先降，从中间直接往上走。' };
      if (heard === 1 || f.range < 3) return { problem: '上升得不够，听起来比较平。', fix: '开头放低一点，结尾明显提高，像问“啊？”' };
      return { problem: '上升的形状不够清楚。', fix: TONE_TIPS[2] };

    case 3:
      if (heard === 2 || (f.fallDepth < 1.2 && f.net > 1)) return { problem: '开头没有往下沉。', fix: '先把声音压到最低，在低处停一下，再升起来。' };
      if (heard === 4 || (f.lowFrac < 0.2 && f.riseAfter < 0.8)) return { problem: '一直往下降，没有升回来。', fix: '降到最低以后要停一下，再往上扬，整个字读长一点。' };
      if (heard === 1 || f.range < 2.5) return { problem: '高低变化太小。', fix: '第三声是最低的声调：用力往下沉，再抬起来。' };
      return { problem: '先降后升的形状不够明显。', fix: TONE_TIPS[3] };

    case 4:
      if (heard === 3 && f.riseAfter > 1.5) return { problem: '降下去以后又升上来了。', fix: '第四声只降不升：从高处一口气降到底就结束。' };
      if (f.net > 2) return { problem: '声音往上走了。', fix: '第四声是往下降的：从高处开始，快速落下。' };
      if (heard === 1 || f.range < 3 || f.net > -3) return { problem: '下降得不够，听起来比较平。', fix: '开头要高，然后一口气降到最低，像生气地说“不！”' };
      if (heard === 3 || f.lowFrac > 0.4) return { problem: '降得太慢，在低处停太久。', fix: '短促有力地降下来，降到底就结束。' };
      return { problem: '下降的形状不够清楚。', fix: TONE_TIPS[4] };
  }
  return { problem: '', fix: TONE_TIPS[target] };
}

export function heardToneName(verdict) {
  const r = verdict.result;
  return r && r.tone !== 'unknown' ? TONES[r.tone].name : null;
}
