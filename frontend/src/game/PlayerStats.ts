export interface StatSnapshot {
  level: number; xp: number; xpToNext: number;
  hp: number; maxHp: number;
  damage: number; defense: number; speed: number; critChance: number;
}

export class PlayerStats extends EventTarget {
  level = 1;
  xp = 0;
  xpToNext = 100;
  hp = 100;
  maxHp = 100;
  damage = 15;
  defense = 0;
  speed = 1.0;
  critChance = 0.05;

  private hpRegenTimer = 0;
  private hpRegenInterval = 5;
  private hpRegenAmount = 2;

  gainXP(amount: number) {
    this.xp += Math.floor(amount);
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.levelUp();
    }
    this.dispatchEvent(new CustomEvent('statsChange'));
  }

  private levelUp() {
    this.level++;
    this.xpToNext = Math.floor(100 * Math.pow(1.35, this.level - 1));
    this.maxHp += 20;
    this.hp = this.maxHp;
    this.damage += 5;
    this.defense += 2;
    this.dispatchEvent(new CustomEvent('levelUp', { detail: { level: this.level } }));
    this.dispatchEvent(new CustomEvent('statsChange'));
  }

  takeDamage(raw: number): number {
    const reduced = Math.max(1, raw - this.defense);
    this.hp = Math.max(0, this.hp - reduced);
    this.dispatchEvent(new CustomEvent('statsChange'));
    if (this.hp <= 0) this.dispatchEvent(new CustomEvent('playerDied'));
    return reduced;
  }

  heal(amount: number) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.dispatchEvent(new CustomEvent('statsChange'));
  }

  calcDamage(multiplier = 1): { value: number; isCrit: boolean } {
    const isCrit = Math.random() < this.critChance;
    const base = this.damage * multiplier * (0.85 + Math.random() * 0.3);
    return { value: Math.floor(base * (isCrit ? 2 : 1)), isCrit };
  }

  update(delta: number) {
    if (this.hp < this.maxHp) {
      this.hpRegenTimer += delta;
      if (this.hpRegenTimer >= this.hpRegenInterval) {
        this.hpRegenTimer = 0;
        this.heal(this.hpRegenAmount);
      }
    }
  }

  get snapshot(): StatSnapshot {
    return {
      level: this.level, xp: this.xp, xpToNext: this.xpToNext,
      hp: this.hp, maxHp: this.maxHp,
      damage: this.damage, defense: this.defense,
      speed: this.speed, critChance: this.critChance,
    };
  }
}
