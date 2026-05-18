import * as THREE from 'three';

export type MobType = 'zombie' | 'skeleton' | 'spider' | 'golem';
export type MobState = 'idle' | 'roam' | 'chase' | 'attack' | 'dead';

export interface MobDef {
  type: MobType;
  maxHp: number;
  damage: number;
  speed: number;
  xp: number;
  detectRange: number;
  attackRange: number;
  attackInterval: number;
  loot: string[];
  color: number;
  scale: number;
}

export const MOB_DEFS: Record<MobType, MobDef> = {
  zombie:   { type: 'zombie',   maxHp: 60,  damage: 8,  speed: 3.5, xp: 25,  detectRange: 22, attackRange: 2.2, attackInterval: 1.8, loot: ['health_potion','cloth','raw_meat'],       color: 0x3a7a35, scale: 1.4 },
  skeleton: { type: 'skeleton', maxHp: 40,  damage: 12, speed: 5.0, xp: 30,  detectRange: 28, attackRange: 2.0, attackInterval: 1.4, loot: ['arrow','bone','berries'],                 color: 0xd4cdb5, scale: 1.2 },
  spider:   { type: 'spider',   maxHp: 30,  damage: 15, speed: 7.0, xp: 35,  detectRange: 25, attackRange: 1.8, attackInterval: 1.2, loot: ['venom','string','mushroom'],              color: 0x6b1a1a, scale: 1.1 },
  golem:    { type: 'golem',    maxHp: 200, damage: 22, speed: 2.0, xp: 100, detectRange: 18, attackRange: 2.8, attackInterval: 2.5, loot: ['gem','stone_shard','ore','fish'],         color: 0x707070, scale: 2.0 },
};

export class Mob {
  readonly id: string;
  readonly def: MobDef;
  readonly mesh: THREE.Group;
  hp: number;
  state: MobState = 'idle';

  private roamTarget = new THREE.Vector3();
  private roamTimer = 0;
  private attackTimer = 0;
  private idleTimer = 0;
  private deathTimer = 0;

  private hpBar: HTMLDivElement;
  private hpFill!: HTMLDivElement;

  onDie: ((mob: Mob) => void) | null = null;
  onAttackPlayer: ((damage: number) => void) | null = null;

  constructor(type: MobType, position: THREE.Vector3) {
    this.id = Math.random().toString(36).slice(2, 10);
    this.def = MOB_DEFS[type];
    this.hp = this.def.maxHp;
    this.mesh = this.buildMesh(type);
    this.mesh.position.copy(position);
    this.hpBar = this.createHPBar();
    document.getElementById('hud')?.appendChild(this.hpBar);
  }

  private buildMesh(type: MobType): THREE.Group {
    const g = new THREE.Group();
    const s = this.def.scale;
    // PBR materials — organic = rough, stone = very rough, metal = less rough
    const mat = (c: number, rough = 0.85, metal = 0.0) =>
      new THREE.MeshStandardMaterial({
        color: c, roughness: rough, metalness: metal, envMapIntensity: 0.6,
      });
    const box = (w: number, h: number, d: number, color: number, py: number,
                 rough = 0.85, metal = 0.0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, rough, metal));
      m.position.y = py; m.castShadow = true;
      return m;
    };
    const c = this.def.color;

    if (type === 'spider') {
      // Chitin exoskeleton: dark, slightly shiny
      const body = box(1.2, 0.55, 0.8, c,        0.35, 0.78, 0.06);
      const head = box(0.55, 0.45, 0.45, c,       0.78, 0.78, 0.06);
      head.position.z = 0.42;
      for (let i = 0; i < 4; i++) {
        const leg = box(0.08, 0.5, 0.08, 0x3a0e0e, 0.25, 0.72, 0.04);
        leg.position.set(i < 2 ? 0.7 : -0.7, 0, ((i % 2) - 0.5) * 0.4);
        leg.rotation.z = i < 2 ? 0.6 : -0.6;
        g.add(leg);
      }
      // Glowing eyes — emissive so bloom picks them up
      const eyeMat = new THREE.MeshStandardMaterial({
        color: 0xff2020, emissive: 0xff1010, emissiveIntensity: 1.2,
        roughness: 0.2, metalness: 0.0,
      });
      const eyeGeo = new THREE.BoxGeometry(0.1, 0.1, 0.04);
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set( 0.14, 0.78, 0.63); eyeL.castShadow = true;
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(-0.14, 0.78, 0.63); eyeR.castShadow = true;
      g.add(body, head, eyeL, eyeR);

    } else if (type === 'golem') {
      // Stone: very rough, slightly cracked grey
      const body = box(1.2, 1.4, 0.7, c,        1.0, 0.92, 0.0);
      const head = box(0.9, 0.85, 0.8, c,        2.05, 0.92, 0.0);
      const armL = box(0.38, 1.1, 0.38, 0x5a5a5a, 1.0, 0.88, 0.0); armL.position.x =  0.9;
      const armR = armL.clone();                                       armR.position.x = -0.9;
      const legL = box(0.42, 0.9, 0.42, 0x5a5a5a, 0.35, 0.88, 0.0); legL.position.x =  0.32;
      const legR = legL.clone();                                       legR.position.x = -0.32;
      // Lava-like glowing eyes
      const eyeMat = new THREE.MeshStandardMaterial({
        color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 1.5,
        roughness: 0.3, metalness: 0.0,
      });
      const eyeGeo = new THREE.BoxGeometry(0.2, 0.16, 0.04);
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set( 0.22, 2.12, 0.42); eyeL.castShadow = true;
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(-0.22, 2.12, 0.42); eyeR.castShadow = true;
      g.add(body, head, armL, armR, legL, legR, eyeL, eyeR);

    } else if (type === 'skeleton') {
      // Bone: pale, matte
      const body = box(0.44, 0.65, 0.18, c,  0.9,  0.95, 0.0);
      const head = box(0.4,  0.4,  0.36, c,  1.5,  0.95, 0.0);
      const armL = box(0.14, 0.55, 0.14, c,  0.9,  0.95, 0.0); armL.position.x =  0.33;
      const armR = armL.clone();                                  armR.position.x = -0.33;
      const legL = box(0.16, 0.7,  0.16, c,  0.35, 0.95, 0.0); legL.position.x =  0.13;
      const legR = legL.clone();                                  legR.position.x = -0.13;
      const eyeL = box(0.09, 0.09, 0.04, 0x111111, 1.56, 1.0, 0.0);
      eyeL.position.x =  0.1; eyeL.position.z = 0.19;
      const eyeR = eyeL.clone(); eyeR.position.x = -0.1;
      g.add(body, head, armL, armR, legL, legR, eyeL, eyeR);

    } else {
      // Zombie: decayed skin roughness=0.85, cloth=0.88
      const skin  = 0xffcc88;
      const pants = 0x2a3a2a;
      const shirt = c;
      const body  = box(0.5,  0.65, 0.26, shirt, 0.9,  0.88, 0.0);
      const head  = box(0.44, 0.44, 0.42, skin,  1.48, 0.82, 0.0);
      const armL  = box(0.18, 0.58, 0.18, shirt, 0.9,  0.88, 0.0); armL.position.x =  0.38;
      const armR  = armL.clone();                                     armR.position.x = -0.38;
      const legL  = box(0.2,  0.68, 0.2,  pants, 0.34, 0.88, 0.0); legL.position.x =  0.13;
      const legR  = legL.clone();                                     legR.position.x = -0.13;
      const eyeL  = box(0.1,  0.08, 0.04, 0x111111, 1.54, 1.0, 0.0);
      eyeL.position.x =  0.1; eyeL.position.z = 0.22;
      const eyeR  = eyeL.clone(); eyeR.position.x = -0.1;
      const mouth = box(0.16, 0.05, 0.04, 0x111111, 1.44, 1.0, 0.0); mouth.position.z = 0.22;
      g.add(body, head, armL, armR, legL, legR, eyeL, eyeR, mouth);
    }

    g.scale.setScalar(s);
    return g;
  }

  private createHPBar(): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = `
      position:absolute; pointer-events:none; display:none;
      transform: translateX(-50%);
      width:52px;
    `;
    const track = document.createElement('div');
    track.style.cssText = `
      height:5px; background:rgba(0,0,0,0.6);
      border-radius:3px; overflow:hidden;
      border:1px solid rgba(255,255,255,0.15);
    `;
    this.hpFill = document.createElement('div');
    this.hpFill.style.cssText = `
      height:100%; width:100%;
      background: linear-gradient(90deg,#e03,#f55);
      border-radius:3px; transition:width 0.1s;
    `;
    track.appendChild(this.hpFill);
    wrap.appendChild(track);
    return wrap;
  }

  takeDamage(amount: number): boolean {
    this.hp = Math.max(0, this.hp - amount);
    this.hpFill.style.width = `${(this.hp / this.def.maxHp) * 100}%`;
    if (this.hp <= 0 && this.state !== 'dead') {
      this.die();
      return true;
    }
    return false;
  }

  private die() {
    this.state = 'dead';
    this.hpBar.style.display = 'none';
    this.mesh.rotation.z = Math.PI / 2;
    if (this.onDie) this.onDie(this);
  }

  update(
    delta: number,
    playerPos: THREE.Vector3,
    getTerrainHeight: (x: number, z: number) => number,
    camera: THREE.Camera
  ) {
    const WATER_LEVEL = -1.0;

    if (this.state === 'dead') {
      this.deathTimer += delta;
      return;
    }

    const hdist = Math.sqrt(
      (this.mesh.position.x - playerPos.x) ** 2 +
      (this.mesh.position.z - playerPos.z) ** 2
    );
    const bossEnraged = this.def.type === 'golem' && this.hp < this.def.maxHp * 0.5;
    const speedMult = bossEnraged ? 1.45 : 1;

    switch (this.state) {
      case 'idle':
        this.idleTimer += delta;
        if (this.idleTimer > 2 + Math.random() * 2) {
          this.idleTimer = 0;
          this.state = 'roam';
          const angle = Math.random() * Math.PI * 2;
          this.roamTarget.set(
            this.mesh.position.x + Math.cos(angle) * (8 + Math.random() * 10),
            0,
            this.mesh.position.z + Math.sin(angle) * (8 + Math.random() * 10)
          );
          this.roamTimer = 0;
        }
        if (hdist < this.def.detectRange) this.state = 'chase';
        break;

      case 'roam':
        this.roamTimer += delta;
        if (this.roamTimer > 4 || this.moveToward(this.roamTarget, this.def.speed * 0.5, delta) < 0.5) {
          this.state = 'idle';
        }
        if (hdist < this.def.detectRange) this.state = 'chase';
        break;

      case 'chase':
        if (hdist > this.def.detectRange * 1.5) { this.state = 'idle'; break; }
        if (hdist < this.def.attackRange)        { this.state = 'attack'; break; }
        this.moveToward(playerPos, this.def.speed * speedMult, delta);
        break;

      case 'attack':
        if (hdist > this.def.attackRange * 1.4) { this.state = 'chase'; break; }
        this.attackTimer += delta;
        if (this.attackTimer >= this.def.attackInterval) {
          this.attackTimer = 0;
          if (this.onAttackPlayer) this.onAttackPlayer(bossEnraged ? this.def.damage * 1.5 : this.def.damage);
          if (this.def.type === 'golem') window.dispatchEvent(new CustomEvent('playerHit'));
        }
        this.moveToward(playerPos, this.def.speed * 0.3 * speedMult, delta);
        break;
    }

    const groundY = getTerrainHeight(this.mesh.position.x, this.mesh.position.z);
    this.mesh.position.y = Math.max(groundY, WATER_LEVEL + 0.05);

    const screenPos = new THREE.Vector3(
      this.mesh.position.x, this.mesh.position.y + this.def.scale * 2.2, this.mesh.position.z
    ).project(camera);

    if (screenPos.z < 1 && hdist < 40) {
      const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
      const y = (1 - (screenPos.y * 0.5 + 0.5)) * window.innerHeight;
      this.hpBar.style.display = 'block';
      this.hpBar.style.left = `${x}px`;
      this.hpBar.style.top = `${y}px`;
    } else {
      this.hpBar.style.display = 'none';
    }
  }

  private moveToward(target: THREE.Vector3, speed: number, delta: number): number {
    const dx = target.x - this.mesh.position.x;
    const dz = target.z - this.mesh.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 0.1) {
      this.mesh.position.x += (dx / dist) * speed * delta;
      this.mesh.position.z += (dz / dist) * speed * delta;
      this.mesh.rotation.y = Math.atan2(dx, dz);
    }
    return dist;
  }

  isDead(): boolean { return this.state === 'dead'; }
  canRemove(): boolean { return this.state === 'dead' && this.deathTimer > 3; }

  dispose(scene: THREE.Scene) {
    scene.remove(this.mesh);
    this.hpBar.remove();
  }
}
