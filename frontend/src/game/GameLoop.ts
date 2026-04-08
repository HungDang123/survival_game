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

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'ws://localhost:8080';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

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
    this.deformer = new TerrainDeformer(this.world.getChunks());

    this.deformer.setCallback((mod: TerrainModification) => {
      this.peers.broadcast({ t: MsgType.TERRAIN_MODIFY, d: mod });
      this.sendTerrainMod(roomId, mod);
    });

    this.signaling = new SignalingClient(SERVER_URL, roomId, playerId);
    this.peers = new PeerManager(this.signaling, playerId);

    this.peers.onPeerConnected = (peerId) => {
      const rp = new RemotePlayer(peerId, this.world.scene);
      this.remotePlayers.set(peerId, rp);
      this.voiceChat.addSpeakerIndicator(peerId, peerId.slice(0, 8));
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

    this.voiceChat.onStreamReady = (stream) => {
      this.peers.setAudioStream(stream);
    };

    this.hud.onChatSubmit((text) => {
      this.peers.broadcast({ t: MsgType.CHAT_TEXT, sender: playerId, text });
      this.hud.addChatMessage('Bạn', text);
    });

    this.deformCallback = (mod: TerrainModification) => {
      this.peers.broadcast({ t: MsgType.TERRAIN_MODIFY, d: mod });
      this.sendTerrainMod(roomId, mod);
    };
    this.deformer.setCallback(this.deformCallback);

    this.setupMouseInput();

    await this.signaling.connect();

    this.world.update(0, 0, 0.016);
    await this.loadWorldMods(roomId);
    this.localPlayer.spawnAboveTerrain((x, z) => this.world.getTerrainHeight(x, z));

    this.isRunning = true;
    requestAnimationFrame((t) => this.loop(t));
  }

  private async fetchWorldSeed(roomId: string): Promise<number> {
    try {
      const res = await fetch(`${API_URL}/api/rooms/${roomId}`);
      if (res.ok) {
        const data = await res.json();
        return data.seed || 42;
      }
    } catch {}
    return 42;
  }

  private async loadWorldMods(roomId: string) {
    try {
      const res = await fetch(`${API_URL}/api/rooms/${roomId}/mods`);
      if (!res.ok) return;
      const mods: TerrainModification[] = await res.json();
      for (const mod of mods) {
        const chunk = this.world.getChunks().get(mod.chunkId);
        chunk?.applyModification(mod.vertexIndex, mod.deltaY);
      }
    } catch {}
  }

  private async sendTerrainMod(roomId: string, mod: TerrainModification) {
    try {
      await fetch(`${API_URL}/api/rooms/${roomId}/mods`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mod),
      });
    } catch {}
  }

  private setupMouseInput() {
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0 || e.button === 2) this.mouseDown = true;
    });
    document.addEventListener('mouseup', () => { this.mouseDown = false; });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private loop(time: number) {
    if (!this.isRunning) return;
    const delta = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    this.world.update(
      this.localPlayer.camera.position.x,
      this.localPlayer.camera.position.z,
      delta
    );
    this.deformer = new TerrainDeformer(this.world.getChunks());
    this.deformer.setCallback(this.deformCallback);

    this.localPlayer.update(delta, (x, z) => this.world.getTerrainHeight(x, z));

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
      const state = this.localPlayer.getState();
      this.peers.broadcast({ t: MsgType.PLAYER_UPDATE, d: state });
    }

    this.renderer.render(this.world.scene, this.localPlayer.camera);
    requestAnimationFrame((t) => this.loop(t));
  }
}
