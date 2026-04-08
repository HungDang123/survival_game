export type SignalingMsg =
  | { type: 'room_state'; players: string[] }
  | { type: 'peer_joined'; peerId: string }
  | { type: 'peer_left'; peerId: string }
  | { type: 'offer'; from: string; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; from: string; sdp: RTCSessionDescriptionInit }
  | { type: 'ice'; from: string; candidate: RTCIceCandidateInit }
  | { type: 'world_seed'; seed: number };

export class SignalingClient extends EventTarget {
  private ws!: WebSocket;
  private roomId: string;
  private playerId: string;
  private url: string;

  constructor(url: string, roomId: string, playerId: string) {
    super();
    this.url = url;
    this.roomId = roomId;
    this.playerId = playerId;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = `${this.url}/ws?room=${this.roomId}&player=${this.playerId}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);

      this.ws.onmessage = (event) => {
        try {
          const msg: SignalingMsg = JSON.parse(event.data);
          this.dispatchEvent(new CustomEvent(msg.type, { detail: msg }));
        } catch (err) {
          console.error('Signaling parse error:', err);
        }
      };

      this.ws.onclose = () => {
        this.dispatchEvent(new CustomEvent('disconnected'));
      };
    });
  }

  send(msg: object) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  sendOffer(to: string, sdp: RTCSessionDescriptionInit) {
    this.send({ type: 'offer', to, sdp });
  }

  sendAnswer(to: string, sdp: RTCSessionDescriptionInit) {
    this.send({ type: 'answer', to, sdp });
  }

  sendIce(to: string, candidate: RTCIceCandidateInit) {
    this.send({ type: 'ice', to, candidate });
  }

  disconnect() {
    this.ws?.close();
  }
}
