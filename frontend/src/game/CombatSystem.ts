import * as THREE from 'three';
import type { PlayerStats } from './PlayerStats';
import type { MobManager } from './MobManager';
import type { SkillSystem } from './SkillSystem';

export class CombatSystem {
  private camera!: THREE.Camera;
  private stats!: PlayerStats;
  private mobs!: MobManager;
  private skills!: SkillSystem;
  private attackCd = 0;
  private attackRange = 3.5;
  private swingTimer = 0;
  private isSwinging = false;

  onDamage: ((worldPos: THREE.Vector3, amount: number, isCrit: boolean) => void) | null = null;
  onMobKilled: ((xp: number) => void) | null = null;

  init(camera: THREE.Camera, stats: PlayerStats, mobs: MobManager, skills: SkillSystem) {
    this.camera = camera;
    this.stats = stats;
    this.mobs = mobs;
    this.skills = skills;
  }

  attack(): boolean {
    if (this.attackCd > 0) return false;
    const baseAtkSpeed = 0.6;
    this.attackCd = baseAtkSpeed / this.stats.speed;
    this.isSwinging = true;
    this.swingTimer = 0;

    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    const attackPos = this.camera.position.clone().addScaledVector(forward, this.attackRange * 0.5);

    const targets = this.mobs.getMobsNear(attackPos, this.attackRange);
    let hit = false;

    for (const mob of targets) {
      const { value, isCrit } = this.stats.calcDamage(this.skills.getDamageMultiplier());
      const died = mob.takeDamage(value);
      if (this.onDamage) this.onDamage(mob.mesh.position.clone(), value, isCrit);
      hit = true;
      if (died) {
        this.stats.gainXP(mob.def.xp);
        if (this.onMobKilled) this.onMobKilled(mob.def.xp);
      }
    }

    return hit;
  }

  update(delta: number) {
    if (this.attackCd > 0) this.attackCd -= delta;
    if (this.isSwinging) {
      this.swingTimer += delta;
      if (this.swingTimer > 0.25) this.isSwinging = false;
    }
  }

  canAttack(): boolean { return this.attackCd <= 0; }
  isAttacking(): boolean { return this.isSwinging; }
}
