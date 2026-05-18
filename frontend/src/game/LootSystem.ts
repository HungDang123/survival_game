import * as THREE from 'three';
import type { PlayerStats } from './PlayerStats';
import type { SurvivalStats } from './SurvivalStats';

export interface LootItem {
  id: string;
  name: string;
  icon: string;
  rarity: 'common' | 'uncommon' | 'rare';
  effect: (stats: PlayerStats, survival?: SurvivalStats) => string;
}

export const LOOT_TABLE: Record<string, LootItem> = {
  health_potion: { id: 'health_potion', name: 'Thuốc hồi máu', icon: '🧪', rarity: 'common',   effect: (s) => { s.heal(40); return '+40 HP'; } },
  cloth:         { id: 'cloth',         name: 'Vải thô',       icon: '🧶', rarity: 'common',   effect: (s) => { s.defense += 1; return '+1 Phòng thủ'; } },
  arrow:         { id: 'arrow',         name: 'Mũi tên',       icon: '🏹', rarity: 'common',   effect: (s) => { s.damage += 2; return '+2 Sát thương'; } },
  bone:          { id: 'bone',          name: 'Xương',         icon: '🦴', rarity: 'common',   effect: (s) => { s.maxHp += 10; s.hp = Math.min(s.hp + 10, s.maxHp); return '+10 Max HP'; } },
  venom:         { id: 'venom',         name: 'Nọc độc',       icon: '☠️', rarity: 'uncommon', effect: (s) => { s.critChance = Math.min(0.5, s.critChance + 0.03); return '+3% Chí mạng'; } },
  string:        { id: 'string',        name: 'Dây nhện',      icon: '🕸️', rarity: 'uncommon', effect: (s) => { s.speed = Math.min(2.0, s.speed + 0.08); return '+8% Tốc độ'; } },
  gem:           { id: 'gem',           name: 'Ngọc quý',      icon: '💎', rarity: 'rare',     effect: (s) => { s.damage += 8; s.maxHp += 15; return '+8 Dame +15 HP'; } },
  stone_shard:   { id: 'stone_shard',   name: 'Mảnh đá',       icon: '🪨', rarity: 'uncommon', effect: (s) => { s.defense += 3; return '+3 Phòng thủ'; } },
  ore:           { id: 'ore',           name: 'Quặng',         icon: '⚙️', rarity: 'uncommon', effect: (s) => { s.damage += 4; s.defense += 1; return '+4 Dame +1 Def'; } },
  // ── Food items ─────────────────────────────────────────────────────────────
  raw_meat:      { id: 'raw_meat',     name: 'Thịt tươi',     icon: '🥩', rarity: 'common',   effect: (_s, sv) => { sv?.eatFood(45); _s.heal(5); return '+45 No; +5 HP'; } },
  berries:       { id: 'berries',      name: 'Quả mọng',      icon: '🍇', rarity: 'common',   effect: (_s, sv) => { sv?.eatFood(25); return '+25 No'; } },
  mushroom:      { id: 'mushroom',     name: 'Nấm rừng',      icon: '🍄', rarity: 'common',   effect: (_s, sv) => { sv?.eatFood(30); return '+30 No'; } },
  fish:          { id: 'fish',         name: 'Cá',             icon: '🐟', rarity: 'uncommon', effect: (_s, sv) => { sv?.eatFood(55); _s.heal(8); return '+55 No; +8 HP'; } },
};

interface DroppedItem {
  item: LootItem;
  mesh: THREE.Mesh;
  bobOffset: number;
  time: number;
}

export class LootSystem {
  private drops: DroppedItem[] = [];
  private scene: THREE.Scene;

  onPickup: ((item: LootItem) => void) | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  spawnLoot(position: THREE.Vector3, lootIds: string[]) {
    for (const id of lootIds) {
      if (Math.random() > 0.6) continue;
      const item = LOOT_TABLE[id];
      if (!item) continue;

      const rarityColor: Record<string, number> = {
        common: 0xaaaaaa, uncommon: 0x44cc44, rare: 0xcc44ff,
      };
      const color = rarityColor[item.rarity];

      // Different shape per rarity
      const geo: THREE.BufferGeometry =
        item.rarity === 'rare'     ? new THREE.DodecahedronGeometry(0.24) :
        item.rarity === 'uncommon' ? new THREE.OctahedronGeometry(0.24)   :
                                     new THREE.BoxGeometry(0.26, 0.26, 0.26);

      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive:          color,
        emissiveIntensity: item.rarity === 'rare' ? 1.0 : item.rarity === 'uncommon' ? 0.7 : 0.4,
        metalness:         item.rarity === 'rare' ? 0.6 : 0.2,
        roughness:         item.rarity === 'rare' ? 0.15 : 0.35,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      mesh.position.y += 0.5;
      mesh.castShadow = true;

      // Vertical glow beam — tall thin cylinder with additive blending
      const beamGeo = new THREE.CylinderGeometry(0.04, 0.12, 3.5, 6, 1, true);
      const beamMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity:     item.rarity === 'rare' ? 0.55 : item.rarity === 'uncommon' ? 0.38 : 0.22,
        blending:    THREE.AdditiveBlending,
        depthWrite:  false,
        side:        THREE.DoubleSide,
      });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.y = 2.0;  // rises above the item
      mesh.add(beam);

      // Only rare items get a point light (performance)
      if (item.rarity === 'rare') {
        const light = new THREE.PointLight(color, 1.2, 5.5);
        light.position.set(0, 0.5, 0);
        mesh.add(light);
      }

      this.scene.add(mesh);
      this.drops.push({ item, mesh, bobOffset: Math.random() * Math.PI * 2, time: 0 });
    }
  }

  update(delta: number, playerPos: THREE.Vector3, getTerrainHeight: (x: number, z: number) => number) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i];
      drop.time += delta;
      const groundY = getTerrainHeight(drop.mesh.position.x, drop.mesh.position.z);
      drop.mesh.position.y = groundY + 0.5 + Math.sin(drop.time * 2 + drop.bobOffset) * 0.15;
      drop.mesh.rotation.y += delta * 1.8;
      // Counter-rotate beam so it appears static while item spins
      const beam = drop.mesh.children[0];
      if (beam) beam.rotation.y -= delta * 1.8;

      const dist = new THREE.Vector2(
        playerPos.x - drop.mesh.position.x,
        playerPos.z - drop.mesh.position.z
      ).length();

      if (dist < 1.8) {
        if (this.onPickup) this.onPickup(drop.item);
        this.disposeDrop(drop.mesh);
        this.drops.splice(i, 1);
      }
    }
  }

  private disposeDrop(mesh: THREE.Mesh) {
    this.scene.remove(mesh);
    mesh.traverse((obj) => {
      const child = obj as THREE.Mesh | THREE.Light;
      if ('geometry' in child) child.geometry.dispose();
      if ('material' in child) {
        const material = child.material;
        if (Array.isArray(material)) material.forEach(m => m.dispose());
        else material.dispose();
      }
    });
  }

  dispose() {
    for (const drop of this.drops) {
      this.disposeDrop(drop.mesh);
    }
    this.drops = [];
  }
}
