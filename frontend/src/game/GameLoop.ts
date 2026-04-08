import * as THREE from 'three';
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
import { LootSystem } from './LootSystem';
import { CombatSystem } from './CombatSystem';
import { SkillSystem } from './SkillSystem';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'ws://localhost:8080';
const API_URL    = import.meta.env.VITE_API_URL    || 'http://localhost:8080';

export class GameLoop {
  private renderer: THREE.WebGLRenderer;
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
  private mobs!: MobManager;
  private loot!: LootSystem;
  private combat!: CombatSystem;
  private skills!: SkillSystem;

  private lastTime = 0;
  private isRunning = false;
  private syncTimer = 0;
  private mouseDown = false;
  private deformCallback: ((mod: TerrainModification) => void) = () => {};

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.getElementById('canvas-container')!.appendChild(this.renderer.domElement);

    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    this.inventory = new Inventory();
    this.hud = new HUD(this.inventory);
    this.voiceChat = new VoiceChat();
  }

  async start(roomId: string, playerId: string) {
    const seed = await this.fetchWorldSeed(roomId);
    this.world = new World(seed);
    this.localPlayer = new LocalPlayer(playerId, this.renderer);

    this.stats = new PlayerStats();
    this.stats.addEventListener('levelUp', (e) => {
      const level = (e as CustomEvent).detail.level;
      this.hud.showLevelUp(level);
      this.hud.showNotif(`Lên cấp ${level}! +20HP +5Dame`, 'success');
    });

    this.mobs = new MobManager(this.world.scene, this.stats);
    this.loot = new LootSystem(this.world.scene, this.stats);
    this.combat = new CombatSystem();
    this.skills = new SkillSystem();

    this.mobs.onMobDie = (mob) => {
      this.loot.spawnLoot(mob.mesh.position.clone(), mob.def.loot);
      this.hud.showNotif(`+${mob.def.xp} XP - ${mob.def.type}`, 'info');
    };

    this.loot.onPickup = (item, effectText) => {
      this.hud.showLootPickup(item, effectText);
      this.stats.dispatchEvent(new CustomEvent('statsChange'));
    };

    this.skills.onDamage = (pos, dmg, isCrit) => {
      this.showDamageAt(pos, dmg, isCrit);
    };

    this.deformer = new TerrainDeformer(this.world.getChunks());
    this.deformCallback = (mod: TerrainModification) => {
      this.peers.broadcast({ t: MsgType.TERRAIN_MODIFY, d: mod });
      this.sendTerrainMod(roomId, mod);
    };
    this.deformer.setCallback(this.deformCallback);

    this.signaling = new SignalingClient(SERVER_URL, roomId, playerId);
    this.peers = new PeerManager(this.signaling, playerId);

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
      }
    };

    this.voiceChat.onStreamReady = (stream) => this.peers.setAudioStream(stream);

    this.hud.onChatSubmit((text) => {
      this.peers.broadcast({ t: MsgType.CHAT_TEXT, sender: playerId, text });
      this.hud.addChatMessage('Bạn', text);
    });

    this.setupMouseInput(roomId);

    this.world.update(0, 0, 0.016);
    await this.signaling.connect();
    await this.loadWorldMods(roomId);
    this.localPlayer.spawnAboveTerrain((x, z) => this.world.getTerrainHeight(x, z));

    this.skills.init(
      this.localPlayer.camera, this.stats, this.mobs,
      (x, z) => this.world.getTerrainHeight(x, z)
    );
    this.combat.init(this.localPlayer.camera, this.stats, this.mobs, this.skills);
    this.combat.onDamage = (pos, dmg, isCrit) => this.showDamageAt(pos, dmg, isCrit);
    this.combat.onMobKilled = (xp) => this.hud.showNotif(`+${xp} XP`, 'success');

    window.addEventListener('skillActivated', (e) => {
      const { id } = (e as CustomEvent).detail;
      const idx = this.skills.skills.findIndex(s => s.id === id);
      const slot = document.querySelectorAll('.skill-slot')[idx] as HTMLElement;
      if (slot) { slot.classList.add('active-anim'); setTimeout(() => slot.classList.remove('active-anim'), 500); }
    });

    this.isRunning = true;
    requestAnimationFrame((t) => this.loop(t));
  }

  private showDamageAt(worldPos: THREE.Vector3, dmg: number, isCrit: boolean) {
    const projected = worldPos.clone().project(this.localPlayer.camera);
    if (projected.z > 1) return;
    const sx = (projected.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (1 - (projected.y * 0.5 + 0.5)) * window.innerHeight - 30;
    this.hud.showDamageNumber(sx, sy, dmg, isCrit);
  }

  private async fetchWorldSeed(roomId: string): Promise<number> {
    try {
      const res = await fetch(`${API_URL}/api/rooms/${roomId}`);
      if (res.ok) { const d = await res.json(); return d.seed || 42; }
    } catch {}
    return 42;
  }

  private async loadWorldMods(roomId: string) {
    try {
      const res = await fetch(`${API_URL}/api/rooms/${roomId}/mods`);
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mod),
      });
    } catch {}
  }

  private setupMouseInput(roomId: string) {
    document.addEventListener('mousedown', (e) => {
      if (!this.localPlayer.isLocked()) return;
      if (e.button === 0) {
        this.mouseDown = true;
        const tool = this.inventory.getActiveTool();
        if (tool === 'sword') {
          this.combat.attack();
        }
      }
    });
    document.addEventListener('mouseup', () => { this.mouseDown = false; });
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.code === 'KeyF') this.combat.attack();
    });

    void roomId;
  }

  private loop(time: number) {
    if (!this.isRunning) return;
    const delta = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;

    const terrain = (x: number, z: number) => this.world.getTerrainHeight(x, z);
    const playerPos = this.localPlayer.camera.position;

    this.world.update(playerPos.x, playerPos.z, delta);
    this.deformer = new TerrainDeformer(this.world.getChunks());
    this.deformer.setCallback(this.deformCallback);

    this.localPlayer.update(delta * this.stats.speed, terrain);
    this.stats.update(delta);

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

    this.hud.updateStats(this.stats.snapshot);
    this.hud.updateSkills(this.skills.skills);

    this.renderer.render(this.world.scene, this.localPlayer.camera);
    requestAnimationFrame((t) => this.loop(t));
  }
}
