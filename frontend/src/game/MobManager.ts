import * as THREE from 'three';
import { Mob } from './Mob';
import type { MobType } from './Mob';
import type { PlayerStats } from './PlayerStats';

const SPAWN_INTERVAL = 8;
const MAX_MOBS = 20;
const SPAWN_RADIUS_MIN = 25;
const SPAWN_RADIUS_MAX = 50;
const MOB_TYPES: MobType[] = ['zombie', 'zombie', 'skeleton', 'spider'];

export class MobManager {
  private mobs: Mob[] = [];
  private scene: THREE.Scene;
  private spawnTimer = 0;
  private stats: PlayerStats;

  onMobDie: ((mob: Mob) => void) | null = null;

  constructor(scene: THREE.Scene, stats: PlayerStats) {
    this.scene = scene;
    this.stats = stats;
  }

  update(
    delta: number,
    playerPos: THREE.Vector3,
    getTerrainHeight: (x: number, z: number) => number,
    camera: THREE.Camera
  ) {
    this.spawnTimer += delta;
    if (this.spawnTimer >= SPAWN_INTERVAL && this.mobs.length < MAX_MOBS) {
      this.spawnTimer = 0;
      const count = 1 + Math.floor(this.stats.level / 3);
      for (let i = 0; i < count; i++) this.spawnNear(playerPos, getTerrainHeight);
    }

    for (const mob of this.mobs) {
      mob.update(delta, playerPos, getTerrainHeight, camera);
    }

    for (let i = this.mobs.length - 1; i >= 0; i--) {
      if (this.mobs[i].canRemove()) {
        this.mobs[i].dispose(this.scene);
        this.mobs.splice(i, 1);
      }
    }
  }

  private spawnNear(playerPos: THREE.Vector3, getTerrainHeight: (x: number, z: number) => number) {
    const WATER_LEVEL = -1.0;
    let x = 0, z = 0, y = 0;
    let tries = 0;
    do {
      const angle = Math.random() * Math.PI * 2;
      const r = SPAWN_RADIUS_MIN + Math.random() * (SPAWN_RADIUS_MAX - SPAWN_RADIUS_MIN);
      x = playerPos.x + Math.cos(angle) * r;
      z = playerPos.z + Math.sin(angle) * r;
      y = getTerrainHeight(x, z);
      tries++;
    } while (y < WATER_LEVEL + 0.5 && tries < 8);
    if (y < WATER_LEVEL + 0.5) return;

    let type: MobType;
    if (this.stats.level >= 5 && Math.random() < 0.08) type = 'golem';
    else type = MOB_TYPES[Math.floor(Math.random() * MOB_TYPES.length)];

    const mob = new Mob(type, new THREE.Vector3(x, y, z));
    mob.onDie = (m) => { if (this.onMobDie) this.onMobDie(m); };
    mob.onAttackPlayer = (dmg) => {
      const taken = this.stats.takeDamage(dmg);
      window.dispatchEvent(new CustomEvent('playerHit', { detail: { damage: taken } }));
    };
    this.scene.add(mob.mesh);
    this.mobs.push(mob);
  }

  getMobsNear(pos: THREE.Vector3, radius: number): Mob[] {
    return this.mobs.filter(m =>
      !m.isDead() && m.mesh.position.distanceTo(pos) <= radius
    );
  }

  getAll(): Mob[] { return this.mobs; }

  dispose() {
    for (const mob of this.mobs) mob.dispose(this.scene);
    this.mobs = [];
  }
}
