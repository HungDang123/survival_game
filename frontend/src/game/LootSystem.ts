import * as THREE from 'three';
import type { PlayerStats } from './PlayerStats';

export interface LootItem {
  id: string;
  name: string;
  icon: string;
  rarity: 'common' | 'uncommon' | 'rare';
  effect: (stats: PlayerStats) => string;
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
  private stats: PlayerStats;

  onPickup: ((item: LootItem, effectText: string) => void) | null = null;

  constructor(scene: THREE.Scene, stats: PlayerStats) {
    this.scene = scene;
    this.stats = stats;
  }

  spawnLoot(position: THREE.Vector3, lootIds: string[]) {
    for (const id of lootIds) {
      if (Math.random() > 0.6) continue;
      const item = LOOT_TABLE[id];
      if (!item) continue;

      const rarityColor: Record<string, number> = {
        common: 0xaaaaaa, uncommon: 0x44cc44, rare: 0xcc44ff
      };

      const geo = new THREE.OctahedronGeometry(0.3);
      const mat = new THREE.MeshStandardMaterial({
        color: rarityColor[item.rarity],
        emissive: rarityColor[item.rarity],
        emissiveIntensity: 0.5,
        metalness: 0.3, roughness: 0.3,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      mesh.position.y += 0.5;
      mesh.castShadow = true;

      const light = new THREE.PointLight(rarityColor[item.rarity], 0.8, 4);
      light.position.set(0, 0.3, 0);
      mesh.add(light);

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
      drop.mesh.rotation.y += delta * 2;

      const dist = new THREE.Vector2(
        playerPos.x - drop.mesh.position.x,
        playerPos.z - drop.mesh.position.z
      ).length();

      if (dist < 1.8) {
        const effect = drop.item.effect(this.stats);
        if (this.onPickup) this.onPickup(drop.item, effect);
        this.scene.remove(drop.mesh);
        (drop.mesh.material as THREE.Material).dispose();
        this.drops.splice(i, 1);
      }
    }
  }

  dispose() {
    for (const drop of this.drops) {
      this.scene.remove(drop.mesh);
      (drop.mesh.material as THREE.Material).dispose();
    }
    this.drops = [];
  }
}
