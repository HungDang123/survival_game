/**
 * SurvivalStats — Oxygen + Hunger survival mechanics.
 *
 * Oxygen:
 *   Full 100, drains 10/s underwater, recovers instantly on surface.
 *   At 0: damage 4 HP/s (drowning). Dispatches 'playerDrowning' event.
 *
 * Hunger:
 *   Full 100, drains 1.8/s normally, 3.6/s while swimming.
 *   < 20: HP regen stops, movement slows 10%.
 *   At 0: damage 1 HP/s (starvation). Dispatches 'playerStarving'.
 *
 * Food items: eaten via eatFood(calories: number) — raises hunger by calories.
 */

export const OXYGEN_MAX  = 100;
export const HUNGER_MAX  = 100;

const OXYGEN_DRAIN_RATE  = 10;   // per second underwater
const OXYGEN_REGEN_RATE  = 40;   // per second on surface (fast recovery)
const HUNGER_DRAIN_RATE  = 1.8;  // per second
const HUNGER_DRAIN_SWIM  = 3.6;  // extra drain while swimming
const DROWN_DAMAGE_RATE  = 4;    // HP/s when oxygen = 0
const STARVE_DAMAGE_RATE = 1;    // HP/s when hunger = 0

export class SurvivalStats {
  oxygen = OXYGEN_MAX;
  hunger = HUNGER_MAX;

  private drownTimer  = 0;
  private starveTimer = 0;

  /**
   * @param delta     frame delta seconds
   * @param inWater   true when camera is below water surface
   * @param swimming  true when actively moving through water
   * @returns         HP damage to apply this frame (from drowning/starvation)
   */
  update(delta: number, inWater: boolean, swimming: boolean, extraHungerDrain = 0): number {
    let hpDamage = 0;

    // ── Oxygen ──────────────────────────────────────────────────────────────
    if (inWater) {
      this.oxygen = Math.max(0, this.oxygen - OXYGEN_DRAIN_RATE * delta);
    } else {
      this.oxygen = Math.min(OXYGEN_MAX, this.oxygen + OXYGEN_REGEN_RATE * delta);
    }

    if (this.oxygen <= 0) {
      this.drownTimer += delta;
      if (this.drownTimer >= 0.5) {   // damage tick every 0.5s
        this.drownTimer = 0;
        hpDamage += DROWN_DAMAGE_RATE * 0.5;
        window.dispatchEvent(new CustomEvent('playerDrowning'));
        window.dispatchEvent(new CustomEvent('playerHit'));  // red vignette
      }
    } else {
      this.drownTimer = 0;
    }

    // ── Hunger ──────────────────────────────────────────────────────────────
    const hungerRate = HUNGER_DRAIN_RATE + (swimming ? HUNGER_DRAIN_SWIM : 0) + extraHungerDrain;
    this.hunger = Math.max(0, this.hunger - hungerRate * delta);

    if (this.hunger <= 0) {
      this.starveTimer += delta;
      if (this.starveTimer >= 1.0) {
        this.starveTimer = 0;
        hpDamage += STARVE_DAMAGE_RATE;
        window.dispatchEvent(new CustomEvent('playerStarving'));
      }
    } else {
      this.starveTimer = 0;
    }

    return hpDamage;
  }

  /** Eat food — raises hunger. Returns actual hunger gained. */
  eatFood(calories: number): number {
    const before = this.hunger;
    this.hunger  = Math.min(HUNGER_MAX, this.hunger + calories);
    return this.hunger - before;
  }

  reset() {
    this.oxygen = OXYGEN_MAX;
    this.hunger = HUNGER_MAX;
    this.drownTimer = 0;
    this.starveTimer = 0;
  }

  /** True when hunger is critically low (affects speed + regen) */
  isStarving(): boolean { return this.hunger < 20; }

  /** Speed multiplier from starvation (0.9 when starving) */
  hungerSpeedMult(): number { return this.isStarving() ? 0.9 : 1.0; }
}
