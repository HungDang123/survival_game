export type SignalingMsg =
  | { type: 'room_state'; players: string[]; seed: number }
  | { type: 'peer_joined'; peerId: string }
  | { type: 'peer_left'; peerId: string }
  | { type: 'offer'; from: string; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; from: string; sdp: RTCSessionDescriptionInit }
  | { type: 'ice'; from: string; candidate: RTCIceCandidateInit };

export class SignalingClient extends EventTarget {
  private ws!: WebSocket;
  private roomId: string;
  private playerId: string;
  private url: string;
  private reconnectAttempts = 0;
  private manualClose = false;

  constructor(url: string, roomId: string, playerId: string) {
    super();
    this.url = url;
    this.roomId = roomId;
    this.playerId = playerId;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.manualClose = false;
      const ws = new URL(`${this.url}/ws`);
      ws.searchParams.set('room', this.roomId);
      ws.searchParams.set('player', this.playerId);
      if (import.meta.env.VITE_AUTH_TOKEN) ws.searchParams.set('token', import.meta.env.VITE_AUTH_TOKEN);
      const wsUrl = ws.toString();
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        resolve();
      };
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
        if (!this.manualClose) this.scheduleReconnect();
      };
    });
  }

  private scheduleReconnect() {
    this.reconnectAttempts++;
    const delay = Math.min(10000, 500 * 2 ** Math.min(this.reconnectAttempts, 5));
    window.setTimeout(() => {
      this.connect().catch(() => this.scheduleReconnect());
    }, delay);
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
    this.manualClose = true;
    this.ws?.close();
  }
}
