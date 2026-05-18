import * as THREE from 'three';
import type { PlayerStats } from './PlayerStats';
import type { MobManager } from './MobManager';

export interface Skill {
  id: string;
  name: string;
  icon: string;
  key: string;
  cooldown: number;
  description: string;
  remainingCd: number;
  active: boolean;
  activeDuration: number;
  activeTimer: number;
}

export class SkillSystem {
  skills: Skill[] = [
    { id: 'dash',       name: 'Lao tới',    icon: '💨', key: 'Q', cooldown: 3,  description: 'Lao về phía trước, né đòn',    remainingCd: 0, active: false, activeDuration: 0.3, activeTimer: 0 },
    { id: 'whirlwind',  name: 'Lốc xoáy',   icon: '🌀', key: 'E', cooldown: 8,  description: 'Sát thương tất cả quái xung quanh', remainingCd: 0, active: false, activeDuration: 0.2, activeTimer: 0 },
    { id: 'rage',       name: 'Bạo nộ',     icon: '🔥', key: 'R', cooldown: 20, description: 'Tăng 100% sát thương trong 5s',  remainingCd: 0, active: false, activeDuration: 5.0, activeTimer: 0 },
  ];

  private rageMultiplier = 1;
  private camera!: THREE.Camera;
  private stats!: PlayerStats;
  private mobs!: MobManager;
  private getTerrainHeight!: (x: number, z: number) => number;

  onSkillEffect: ((skillId: string, pos: THREE.Vector3) => void) | null = null;
  onDamage: ((pos: THREE.Vector3, dmg: number, isCrit: boolean) => void) | null = null;
  onMobKilled: ((xp: number) => void) | null = null;
  onSpendStamina: ((amount: number) => boolean) | null = null;

  init(camera: THREE.Camera, stats: PlayerStats, mobs: MobManager, terrain: (x: number, z: number) => number) {
    this.camera = camera;
    this.stats = stats;
    this.mobs = mobs;
    this.getTerrainHeight = terrain;

    document.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.code === 'KeyQ') this.activate('dash');
      if (e.code === 'KeyE') this.activate('whirlwind');
      if (e.code === 'KeyR') this.activate('rage');
    });
  }

  private activate(id: string) {
    const skill = this.skills.find(s => s.id === id);
    if (!skill || skill.remainingCd > 0) return;

    skill.remainingCd = skill.cooldown;

    const pos = this.camera.position.clone();

    if (id === 'dash') {
      if (this.onSpendStamina && !this.onSpendStamina(18)) {
        skill.remainingCd = 0;
        return;
      }
      const forward = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      forward.y = 0; forward.normalize();
      const start = this.camera.position.clone();
      let dashDistance = 8;
      for (let step = 1; step <= 8; step++) {
        const probe = start.clone().addScaledVector(forward, step);
        const ground = this.getTerrainHeight(probe.x, probe.z);
        if (ground + 1.8 > start.y + 1.2) {
          dashDistance = Math.max(0, step - 1);
          break;
        }
      }
      this.camera.position.addScaledVector(forward, dashDistance);
      const groundY = this.getTerrainHeight(this.camera.position.x, this.camera.position.z);
      this.camera.position.y = groundY + 1.8;
      skill.active = true; skill.activeTimer = 0;
    }

    if (id === 'whirlwind') {
      const nearby = this.mobs.getMobsNear(pos, 5);
      for (const mob of nearby) {
        // Apply rage multiplier so whirlwind is buffed by rage (same as melee)
        const { value, isCrit } = this.stats.calcDamage(1.5 * this.getDamageMultiplier());
        const died = mob.takeDamage(value);
        if (this.onDamage) this.onDamage(mob.mesh.position.clone(), value, isCrit);
        if (died) {
          this.stats.gainXP(mob.def.xp);
          if (this.onMobKilled) this.onMobKilled(mob.def.xp);
        }
      }
      skill.active = true; skill.activeTimer = 0;
    }

    if (id === 'rage') {
      this.rageMultiplier = 2;
      skill.active = true; skill.activeTimer = 0;
    }

    if (this.onSkillEffect) this.onSkillEffect(id, pos);
    window.dispatchEvent(new CustomEvent('skillActivated', { detail: { id } }));
  }

  update(delta: number) {
    for (const skill of this.skills) {
      if (skill.remainingCd > 0) skill.remainingCd = Math.max(0, skill.remainingCd - delta);
      if (skill.active) {
        skill.activeTimer += delta;
        if (skill.activeTimer >= skill.activeDuration) {
          skill.active = false;
          if (skill.id === 'rage') this.rageMultiplier = 1;
        }
      }
    }
  }

  getDamageMultiplier(): number { return this.rageMultiplier; }

  isRageActive(): boolean {
    return this.skills.find(s => s.id === 'rage')?.active ?? false;
  }
}
