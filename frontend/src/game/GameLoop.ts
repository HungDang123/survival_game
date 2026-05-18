import * as THREE from 'three';
import { PostProcessingPipeline } from '../graphics/PostProcessingPipeline';
import { SurvivalStats } from './SurvivalStats';
import { World } from './World';
import { LocalPlayer } from '../player/LocalPlayer';
import { RemotePlayer } from '../player/RemotePlayer';
import { Inventory } from './Inventory';
import { TerrainDeformer } from '../terrain/TerrainDeformer';
import { SignalingClient } from '../network/SignalingClient';
import { PeerManager } from '../network/PeerManager';
import { HUD } from '../ui/HUD';
import { VoiceChat } from '../ui/VoiceChat';
import { MsgType } from '../network/GameProtocol';
import type { GameMsg } from '../network/GameProtocol';
import type { TerrainModification } from '../terrain/TerrainChunk';
import { PlayerStats } from './PlayerStats';
import { MobManager } from './MobManager';
import { LOOT_TABLE, LootSystem } from './LootSystem';
import { CombatSystem } from './CombatSystem';
import { SkillSystem } from './SkillSystem';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'ws://localhost:8080';
const API_URL    = import.meta.env.VITE_API_URL    || 'http://localhost:8080';
const AUTH_TOKEN = import.meta.env.VITE_AUTH_TOKEN || '';

function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return AUTH_TOKEN ? { ...extra, Authorization: `Bearer ${AUTH_TOKEN}` } : extra;
}

export class GameLoop {
  private renderer: THREE.WebGLRenderer;
  private pipeline!: PostProcessingPipeline;
  private world!: World;
  private localPlayer!: LocalPlayer;
  private remotePlayers = new Map<string, RemotePlayer>();
  private inventory: Inventory;
  private deformer!: TerrainDeformer;
  private signaling!: SignalingClient;
  private peers!: PeerManager;
  private hud!: HUD;
  private voiceChat!: VoiceChat;

  private stats!: PlayerStats;
  private survival!: SurvivalStats;
  private mobs!: MobManager;
  private loot!: LootSystem;
  private combat!: CombatSystem;
  private skills!: SkillSystem;
  private shelters: THREE.Group[] = [];

  private lastTime = 0;
  private isRunning = false;
  private isDead = false;
  private syncTimer = 0;
  private persistTimer = 0;
  private mouseDown = false;
  private deformCallback: ((mod: TerrainModification) => void) = () => {};

  constructor() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,        // not needed — saves VRAM
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type    = THREE.PCFShadowMap;
    // Tone mapping is handled by ACESFilmic on the renderer;
    // the postprocessing pipeline reads HDR and outputs sRGB correctly.
    this.renderer.toneMapping          = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure  = 1.0;
    this.renderer.outputColorSpace     = THREE.SRGBColorSpace;
    document.getElementById('canvas-container')!.appendChild(this.renderer.domElement);

    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.renderer.setSize(w, h);
      this.pipeline?.setSize(w, h);
    });

    this.inventory = new Inventory();
    this.hud       = new HUD(this.inventory);
    this.voiceChat = new VoiceChat();
  }

  async start(roomId: string, playerId: string) {
    const loading = this.showLoading();
    const seed = await this.fetchWorldSeed(roomId);
    this.world       = new World(seed);
    this.localPlayer = new LocalPlayer(playerId, this.renderer);

    this.stats    = new PlayerStats();
    this.survival = new SurvivalStats();
    this.stats.addEventListener('levelUp', (e) => {
      const level = (e as CustomEvent).detail.level;
      this.hud.showLevelUp(level);
      this.hud.showNotif(`Lên cấp ${level}! +20HP +5Dame`, 'success');
    });
    this.stats.addEventListener('playerDied', () => this.handlePlayerDied());

    this.mobs = new MobManager(this.world.scene, this.stats);
    this.loot = new LootSystem(this.world.scene);
    this.combat = new CombatSystem();
    this.skills = new SkillSystem();

    this.mobs.onMobDie = (mob) => {
      this.loot.spawnLoot(mob.mesh.position.clone(), mob.def.loot);
    };

    this.loot.onPickup = (item) => {
      const stored = this.inventory.addItem({
        id: item.id,
        name: item.name,
        icon: item.icon,
      });
      if (stored) this.hud.showLootPickup(item, 'Đã nhặt');
      else this.hud.showNotif('Túi đồ đầy', 'warning');
    };

    this.skills.onDamage = (pos, dmg, isCrit) => {
      this.showDamageAt(pos, dmg, isCrit);
    };
    this.skills.onSkillEffect = (skillId) => {
      const skill = this.skills.skills.find(s => s.id === skillId);
      if (skill) this.hud.showNotif(skill.name, 'info');
    };
    this.skills.onSpendStamina = (amount) => this.localPlayer.spendStamina(amount);

    this.deformer = new TerrainDeformer(this.world.getChunks());
    this.deformCallback = (mod: TerrainModification) => {
      this.peers.broadcast({ t: MsgType.TERRAIN_MODIFY, d: mod });
      this.sendTerrainMod(roomId, mod);
    };
    this.deformer.setCallback(this.deformCallback);

    this.signaling = new SignalingClient(SERVER_URL, roomId, playerId);
    this.peers     = new PeerManager(this.signaling, playerId);

    this.peers.onPeerConnected = (peerId) => {
      const rp = new RemotePlayer(peerId, this.world.scene);
      this.remotePlayers.set(peerId, rp);
      this.voiceChat.addSpeakerIndicator(peerId, peerId.slice(0, 8));
      this.hud.addChatMessage('★ System', `${peerId.slice(0, 8)} đã tham gia`);
    };
    this.peers.onPeerDisconnected = (peerId) => {
      this.remotePlayers.get(peerId)?.dispose(this.world.scene);
      this.remotePlayers.delete(peerId);
      this.voiceChat.removeSpeakerIndicator(peerId);
    };
    this.peers.onMessage = (peerId, msg: GameMsg) => {
      if (msg.t === MsgType.PLAYER_UPDATE) {
        this.remotePlayers.get(peerId)?.updateState(msg.d);
      } else if (msg.t === MsgType.TERRAIN_MODIFY) {
        const { chunkId, vertexIndex, deltaY } = msg.d;
        this.world.getChunks().get(chunkId)?.applyModification(vertexIndex, deltaY);
      } else if (msg.t === MsgType.CHAT_TEXT) {
        this.hud.addChatMessage(msg.sender, msg.text);
      } else if (msg.t === MsgType.PLAYER_DAMAGE && msg.target === playerId) {
        const taken = this.stats.takeDamage(msg.amount);
        window.dispatchEvent(new CustomEvent('playerHit', { detail: { damage: taken } }));
      }
    };

    this.voiceChat.onStreamReady = (stream) => this.peers.setAudioStream(stream);
    this.peers.onSpeaking = (peerId, speaking) => {
      this.voiceChat.setSpeaking(peerId, speaking);
      // Also update the name label on the RemotePlayer mesh
      this.remotePlayers.get(peerId)?.setSpeaking(speaking);
    };
    this.hud.onChatSubmit((text) => {
      this.peers.broadcast({ t: MsgType.CHAT_TEXT, sender: playerId, text });
      this.hud.addChatMessage('Bạn', text);
    });

    this.setupMouseInput(roomId);

    this.world.update(0, 0, 0.016);
    await this.signaling.connect();
    await this.loadWorldMods(roomId);
    if (!(await this.restorePlayerPosition(playerId))) {
      this.localPlayer.spawnAboveTerrain((x, z) => this.world.getTerrainHeight(x, z));
    }

    this.skills.init(
      this.localPlayer.camera, this.stats, this.mobs,
      (x, z) => this.world.getTerrainHeight(x, z),
    );
    this.combat.init(this.localPlayer.camera, this.stats, this.mobs, this.skills);
    this.combat.onDamage    = (pos, dmg, isCrit) => this.showDamageAt(pos, dmg, isCrit);
    this.combat.onMobKilled = (xp) => this.hud.showNotif(`+${xp} XP`, 'success');
    this.skills.onMobKilled = (xp) => this.hud.showNotif(`+${xp} XP`, 'success');

    window.addEventListener('skillActivated', (e) => {
      const { id } = (e as CustomEvent).detail;
      const idx  = this.skills.skills.findIndex(s => s.id === id);
      const slot = document.querySelectorAll('.skill-slot')[idx] as HTMLElement;
      if (slot) {
        slot.classList.add('active-anim');
        setTimeout(() => slot.classList.remove('active-anim'), 500);
      }
    });

    // Build post-processing pipeline AFTER scene & camera are ready
    this.pipeline = new PostProcessingPipeline(
      this.renderer,
      this.world.scene,
      this.localPlayer.camera,
    );

    this.isRunning = true;
    loading.remove();
    requestAnimationFrame((t) => this.loop(t));
  }

  private showLoading(): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText = `
      position:absolute; inset:0; z-index:120;
      display:flex; align-items:center; justify-content:center;
      background:rgba(4,8,14,0.92);
      color:white;
      font-family:'Orbitron',monospace; font-size:14px; letter-spacing:2px;
      pointer-events:none;
    `;
    el.textContent = 'LOADING WORLD';
    document.getElementById('hud')?.appendChild(el);
    return el;
  }

  private showDamageAt(worldPos: THREE.Vector3, dmg: number, isCrit: boolean) {
    const projected = worldPos.clone().project(this.localPlayer.camera);
    if (projected.z > 1) return;
    const sx = (projected.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (1 - (projected.y * 0.5 + 0.5)) * window.innerHeight - 30;
    this.hud.showDamageNumber(sx, sy, dmg, isCrit);
  }

  private handlePlayerDied() {
    if (this.isDead) return;
    this.isDead = true;
    document.exitPointerLock?.();
    this.hud.showDeathScreen(() => this.respawnPlayer());
  }

  private respawnPlayer() {
    this.survival.reset();
    this.stats.heal(this.stats.maxHp);
    this.localPlayer.spawnAboveTerrain((x, z) => this.world.getTerrainHeight(x, z));
    this.localPlayer.speedMultiplier = this.stats.speed;
    this.hud.updateStats(this.stats.snapshot);
    this.hud.updateSurvival(this.survival.oxygen, this.survival.hunger, false);
    this.isDead = false;
  }

  private async fetchWorldSeed(roomId: string): Promise<number> {
    try {
      const res = await fetch(`${API_URL}/api/rooms/${roomId}`, { headers: apiHeaders() });
      if (res.ok) { const d = await res.json(); return d.seed || 42; }
    } catch {}
    return 42;
  }

  private async loadWorldMods(roomId: string) {
    try {
      const res = await fetch(`${API_URL}/api/rooms/${roomId}/mods`, { headers: apiHeaders() });
      if (!res.ok) return;
      const mods: TerrainModification[] = await res.json();
      for (const mod of mods) {
        this.world.getChunks().get(mod.chunkId)?.applyModification(mod.vertexIndex, mod.deltaY);
      }
    } catch {}
  }

  private async sendTerrainMod(roomId: string, mod: TerrainModification) {
    try {
      await fetch(`${API_URL}/api/rooms/${roomId}/mods`, {
        method: 'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(mod),
      });
    } catch {}
  }

  private async restorePlayerPosition(playerId: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_URL}/api/players/${playerId}`, { headers: apiHeaders() });
      if (!res.ok) return false;
      const pos: { x: number; y: number; z: number } = await res.json();
      this.localPlayer.camera.position.set(pos.x, pos.y, pos.z);
      return true;
    } catch {
      return false;
    }
  }

  private async savePlayerPosition(roomId: string, playerId: string) {
    const p = this.localPlayer.camera.position;
    try {
      await fetch(`${API_URL}/api/rooms/${roomId}/players/${playerId}`, {
        method: 'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ x: p.x, y: p.y, z: p.z }),
      });
    } catch {}
  }

  private setupMouseInput(roomId: string) {
    document.addEventListener('mousedown', (e) => {
      if (!this.localPlayer.isLocked()) return;
      if (e.button === 0) {
        this.mouseDown = true;
        if (this.inventory.getActiveTool() === 'sword') {
          this.combat.attack();
          this.attackRemotePlayers();
        }
      }
    });
    document.addEventListener('mouseup', () => { this.mouseDown = false; });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.code === 'KeyF') {
        this.combat.attack();
        this.attackRemotePlayers();
      }
      if (e.code === 'KeyX') this.useActiveItem();
      if (e.code === 'KeyC') this.craftAvailableItem();
      if (e.code === 'KeyH') this.harvestNearbyResource();
      if (e.code === 'KeyB') this.buildShelter();
    });
    void roomId;
  }

  private useActiveItem() {
    const active = this.inventory.getActiveItem();
    if (!active || active.tool) return;

    const loot = LOOT_TABLE[active.id];
    if (active.equip) {
      const consumed = this.inventory.consumeActive();
      if (!consumed) return;
      if (active.equip === 'weapon') {
        this.stats.damage += 10;
        this.hud.showNotif('Trang bị vũ khí: +10 Dame', 'success');
      } else {
        this.stats.defense += 5;
        this.stats.maxHp += 20;
        this.stats.heal(20);
        this.hud.showNotif('Trang bị giáp: +5 Def +20 HP', 'success');
      }
      this.stats.dispatchEvent(new CustomEvent('statsChange'));
      return;
    }

    if (!loot) return;

    const consumed = this.inventory.consumeActive();
    if (!consumed) return;

    const effect = loot.effect(this.stats, this.survival);
    this.hud.showLootPickup(loot, effect);
    this.stats.dispatchEvent(new CustomEvent('statsChange'));
  }

  private craftAvailableItem() {
    if (this.inventory.hasItem('ore', 2) && this.inventory.hasItem('gem', 1)) {
      this.inventory.removeItem('ore', 2);
      this.inventory.removeItem('gem', 1);
      this.inventory.addItem({
        id: 'steel_sword',
        name: 'Kiếm thép',
        icon: '⚔️',
        equip: 'weapon',
      });
      this.hud.showNotif('Craft: Kiếm thép', 'success');
      return;
    }

    if (this.inventory.hasItem('cloth', 3) && this.inventory.hasItem('stone_shard', 2)) {
      this.inventory.removeItem('cloth', 3);
      this.inventory.removeItem('stone_shard', 2);
      this.inventory.addItem({
        id: 'hide_armor',
        name: 'Giáp sinh tồn',
        icon: '🛡️',
        equip: 'armor',
      });
      this.hud.showNotif('Craft: Giáp sinh tồn', 'success');
      return;
    }

    this.hud.showNotif('Thiếu nguyên liệu craft', 'warning');
  }

  private harvestNearbyResource() {
    const pos = this.localPlayer.camera.position;
    const height = this.world.getTerrainHeight(pos.x, pos.z);
    const biome = this.world.noise.getBiome(pos.x, pos.z);

    if (pos.y < -0.4 || biome === 'reef' || biome === 'ocean') {
      this.inventory.addItem({ id: 'fish', name: 'Cá', icon: '🐟' });
      this.hud.showNotif('Thu hoạch cá', 'success');
      return;
    }

    if (biome === 'forest' || biome === 'taiga' || (height > 2 && height < 12)) {
      this.inventory.addItem({ id: 'wood', name: 'Gỗ', icon: '🪵' });
      this.hud.showNotif('Thu hoạch gỗ', 'success');
      return;
    }

    this.inventory.addItem({ id: 'stone_shard', name: 'Mảnh đá', icon: '🪨' });
    this.hud.showNotif('Thu hoạch đá', 'success');
  }

  private buildShelter() {
    if (!this.inventory.hasItem('wood', 5) || !this.inventory.hasItem('stone_shard', 2)) {
      this.hud.showNotif('Cần 5 gỗ + 2 đá', 'warning');
      return;
    }

    this.inventory.removeItem('wood', 5);
    this.inventory.removeItem('stone_shard', 2);

    const group = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b3f1f, roughness: 0.9 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x35462a, roughness: 0.85 });
    const postGeo = new THREE.BoxGeometry(0.22, 2.1, 0.22);
    const roofGeo = new THREE.ConeGeometry(2.2, 1.1, 4);

    for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
      const post = new THREE.Mesh(postGeo, woodMat);
      post.position.set(x, 1.05, z);
      post.castShadow = true;
      group.add(post);
    }

    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 2.45;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);

    const pos = this.localPlayer.camera.position;
    group.position.set(pos.x, this.world.getTerrainHeight(pos.x, pos.z), pos.z - 3);
    this.world.scene.add(group);
    this.shelters.push(group);
    this.hud.showNotif('Đã dựng shelter', 'success');
  }

  private isSheltered(): boolean {
    const pos = this.localPlayer.camera.position;
    return this.shelters.some(s => s.position.distanceTo(pos) < 4.5);
  }

  private attackRemotePlayers() {
    const forward = new THREE.Vector3();
    this.localPlayer.camera.getWorldDirection(forward);
    const origin = this.localPlayer.camera.position;

    let best: { id: string; pos: THREE.Vector3; dot: number } | null = null;
    for (const [id, player] of this.remotePlayers) {
      const pos = player.getPosition();
      const toTarget = pos.clone().sub(origin);
      const dist = toTarget.length();
      if (dist > 3.5 || dist < 0.001) continue;

      const dir = toTarget.normalize();
      const dot = forward.dot(dir);
      if (dot < 0.65) continue;
      if (!best || dot > best.dot) best = { id, pos, dot };
    }

    if (!best) return;

    const { value, isCrit } = this.stats.calcDamage(this.skills.getDamageMultiplier());
    this.peers.sendTo(best.id, { t: MsgType.PLAYER_DAMAGE, target: best.id, amount: value });
    this.remotePlayers.get(best.id)?.showHit();
    this.showDamageAt(best.pos, value, isCrit);
  }

  private loop(time: number) {
    if (!this.isRunning) return;
    const delta = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;

    const terrain   = (x: number, z: number) => this.world.getTerrainHeight(x, z);
    const playerPos = this.localPlayer.camera.position;

    if (this.isDead) {
      this.pipeline.render(delta);
      requestAnimationFrame((t) => this.loop(t));
      return;
    }

    this.world.update(playerPos.x, playerPos.z, delta);

    this.localPlayer.speedMultiplier = this.stats.speed * this.survival.hungerSpeedMult();
    this.localPlayer.update(delta, terrain);
    this.stats.update(delta, !this.survival.isStarving());

    this.mobs.update(delta, playerPos, terrain, this.localPlayer.camera);
    this.loot.update(delta, playerPos, terrain);
    this.combat.update(delta);
    this.skills.update(delta);

    for (const [, rp] of this.remotePlayers) {
      rp.update(delta, this.localPlayer.camera, this.renderer);
    }

    if (this.mouseDown && this.localPlayer.isLocked()) {
      const tool = this.inventory.getActiveTool();
      if (tool === 'dig' || tool === 'build') {
        this.deformer.deform(this.localPlayer.camera, tool, this.world.scene);
      }
    }

    this.syncTimer += delta;
    if (this.syncTimer >= 1 / 20) {
      this.syncTimer = 0;
      this.peers.broadcast({ t: MsgType.PLAYER_UPDATE, d: this.localPlayer.getState() });
    }

    this.persistTimer += delta;
    if (this.persistTimer >= 1) {
      this.persistTimer = 0;
      void this.savePlayerPosition(new URLSearchParams(window.location.search).get('room') || 'default', this.localPlayer.id);
    }

    // ── Survival stats ──────────────────────────────────────────────────────
    const inWater  = this.localPlayer.camera.position.y < -0.5;
    const swimming = inWater && (this.localPlayer.getState().animState === 'swim');
    const weatherDrain = this.isSheltered() ? 0 : this.world.getWeatherIntensity() * 1.2;
    const hpDamage = this.survival.update(delta, inWater, swimming, weatherDrain);
    if (hpDamage > 0) this.stats.takeDamage(hpDamage);

    // ── HUD updates ─────────────────────────────────────────────────────────
    this.hud.updateStats(this.stats.snapshot);
    this.hud.updateSkills(this.skills.skills);
    this.hud.updateStamina(this.localPlayer.stamina);
    this.hud.updateUnderwater(inWater);
    this.hud.updateSurvival(this.survival.oxygen, this.survival.hunger, inWater);
    this.hud.updateCompass(this.localPlayer.camera.rotation.y);
    this.hud.updateMinimap(playerPos.x, playerPos.z, this.world.getWeatherState());

    // Single render call through the postprocessing pipeline
    this.pipeline.render(delta);
    requestAnimationFrame((t) => this.loop(t));
  }
}
