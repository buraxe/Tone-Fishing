// Picks the next word and lays out one fish and three trash items at random.

import { itemsForLevel } from '../data/vocabulary.js';

const TRASH = ['bottle', 'can', 'bag', 'boot'];

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class TargetGenerator {
  constructor() {
    this.history = [];
    this.lastFish = -1;
  }

  next(level, repeatItem = null) {
    let item = repeatItem;
    if (!item) {
      const pool = itemsForLevel(level);
      // Avoid the last two words, and avoid repeating the previous tone when possible
      const recent = this.history.slice(-2);
      let candidates = pool.filter((p) => !recent.includes(p.hanzi));
      const lastTone = this.lastTone;
      const varied = candidates.filter((p) => p.syllables[0].tone !== lastTone);
      if (varied.length) candidates = varied;
      item = candidates[Math.floor(Math.random() * candidates.length)];
    }
    this.history.push(item.hanzi);
    this.lastTone = item.syllables[0].tone;

    // Fish slot: random, but not the same slot twice in a row
    let fish;
    do { fish = Math.floor(Math.random() * 4); } while (fish === this.lastFish);
    this.lastFish = fish;

    const trash = shuffle(TRASH.slice()).slice(0, 3);
    const slots = [];
    for (let i = 0, k = 0; i < 4; i++) slots.push(i === fish ? 'fish' : trash[k++]);

    return { item, tone: item.syllables[0].tone, slots, fishIndex: fish };
  }
}
