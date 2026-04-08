import { SignalingClient } from './SignalingClient';
import { encodeMsg, decodeMsg } from './GameProtocol';
import type { GameMsg } from './GameProtocol';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

interface PeerEntry {
  connection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  audioStream?: MediaStream;
}

export type GameMsgHandler = (peerId: string, msg: GameMsg) => void;
export type PeerEventHandler = (peerId: string) => void;

export class PeerManager {
  private peers = new Map<string, PeerEntry>();
  private signaling: SignalingClient;
  private localId: string;
  private localAudioStream: MediaStream | null = null;

  onMessage: GameMsgHandler = () => {};
  onPeerConnected: PeerEventHandler = () => {};
  onPeerDisconnected: PeerEventHandler = () => {};

  constructor(signaling: SignalingClient, localId: string) {
    this.signaling = signaling;
    this.localId = localId;
    this.setupSignalingEvents();
  }

  setAudioStream(stream: MediaStream) {
    this.localAudioStream = stream;
    for (const [, entry] of this.peers) {
      stream.getTracks().forEach(track => entry.connection.addTrack(track, stream));
    }
  }

  private setupSignalingEvents() {
    this.signaling.addEventListener('peer_joined', async (e: Event) => {
      const { peerId } = (e as CustomEvent).detail;
      if (peerId === this.localId) return;
      await this.createOffer(peerId);
    });

    this.signaling.addEventListener('offer', async (e: Event) => {
      const { from, sdp } = (e as CustomEvent).detail;
      await this.handleOffer(from, sdp);
    });

    this.signaling.addEventListener('answer', async (e: Event) => {
      const { from, sdp } = (e as CustomEvent).detail;
      const entry = this.peers.get(from);
      if (entry) {
        await entry.connection.setRemoteDescription(sdp);
      }
    });

    this.signaling.addEventListener('ice', async (e: Event) => {
      const { from, candidate } = (e as CustomEvent).detail;
      const entry = this.peers.get(from);
      if (entry) {
        await entry.connection.addIceCandidate(candidate).catch(console.error);
      }
    });

    this.signaling.addEventListener('peer_left', (e: Event) => {
      const { peerId } = (e as CustomEvent).detail;
      this.removePeer(peerId);
    });
  }

  private createPeerConnection(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    if (this.localAudioStream) {
      this.localAudioStream.getTracks().forEach(t => pc.addTrack(t, this.localAudioStream!));
    }

    pc.ontrack = (e) => {
      const entry = this.peers.get(peerId);
      if (entry) {
        entry.audioStream = e.streams[0];
        const audio = document.createElement('audio');
        audio.srcObject = e.streams[0];
        audio.autoplay = true;
        audio.id = `audio-${peerId}`;
        document.body.appendChild(audio);
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.signaling.sendIce(peerId, e.candidate.toJSON());
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.removePeer(peerId);
      }
    };

    return pc;
  }

  private setupDataChannel(peerId: string, dc: RTCDataChannel) {
    dc.binaryType = 'arraybuffer';

    dc.onopen = () => {
      const entry = this.peers.get(peerId);
      if (entry) entry.dataChannel = dc;
      this.onPeerConnected(peerId);
    };

    dc.onmessage = (e) => {
      try {
        const msg = decodeMsg(e.data as ArrayBuffer);
        this.onMessage(peerId, msg);
      } catch (err) {
        console.error('DataChannel decode error:', err);
      }
    };

    dc.onclose = () => {
      this.removePeer(peerId);
    };
  }

  async createOffer(peerId: string) {
    const pc = this.createPeerConnection(peerId);
    const dc = pc.createDataChannel('game', { ordered: false, maxRetransmits: 0 });
    this.setupDataChannel(peerId, dc);
    this.peers.set(peerId, { connection: pc, dataChannel: dc });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.signaling.sendOffer(peerId, pc.localDescription!);
  }

  async handleOffer(peerId: string, sdp: RTCSessionDescriptionInit) {
    const pc = this.createPeerConnection(peerId);
    this.peers.set(peerId, { connection: pc, dataChannel: null });

    pc.ondatachannel = (e) => {
      this.setupDataChannel(peerId, e.channel);
    };

    await pc.setRemoteDescription(sdp);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.signaling.sendAnswer(peerId, pc.localDescription!);
  }

  broadcast(msg: GameMsg) {
    const data = encodeMsg(msg);
    for (const [, entry] of this.peers) {
      if (entry.dataChannel?.readyState === 'open') {
        entry.dataChannel.send(data);
      }
    }
  }

  sendTo(peerId: string, msg: GameMsg) {
    const entry = this.peers.get(peerId);
    if (entry?.dataChannel?.readyState === 'open') {
      entry.dataChannel.send(encodeMsg(msg));
    }
  }

  private removePeer(peerId: string) {
    const entry = this.peers.get(peerId);
    if (entry) {
      entry.connection.close();
      const audioEl = document.getElementById(`audio-${peerId}`);
      audioEl?.remove();
      this.peers.delete(peerId);
      this.onPeerDisconnected(peerId);
    }
  }

  getPeerIds(): string[] {
    return Array.from(this.peers.keys());
  }

  dispose() {
    for (const [id] of this.peers) this.removePeer(id);
  }
}
