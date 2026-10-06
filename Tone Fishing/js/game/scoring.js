// Modest scoring: pronunciation matters more than points.

export class Scoring {
  constructor(cfg) {
    this.cfg = cfg;
    this.score = 0;
    this.combo = 0;
    this.caught = 0;
    this.rounds = 0;
  }

  success() {
    this.combo += 1;
    this.caught += 1;
    this.rounds += 1;
    const bonus = this.cfg.comboBonus * Math.min(this.combo - 1, this.cfg.comboBonusCap);
    const points = this.cfg.basePoints + bonus;
    this.score += points;
    return points;
  }

  miss() {
    this.combo = 0;
    this.rounds += 1;
  }
}
