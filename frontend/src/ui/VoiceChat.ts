export class VoiceChat {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private isMuted = false;
  private container: HTMLDivElement;
  private muteBtn!: HTMLButtonElement;
  private speakerIndicators = new Map<string, HTMLDivElement>();
  private volumeBar!: HTMLDivElement;

  onStreamReady: ((stream: MediaStream) => void) | null = null;

  constructor() {
    this.container = this.createUI();
    document.getElementById('hud')?.appendChild(this.container);
  }

  private createUI(): HTMLDivElement {
    const container = document.createElement('div');
    container.style.cssText = `
      position: absolute; top: 16px; right: 20px;
      display: flex; flex-direction: column;
      align-items: flex-end; gap: 8px;
    `;

    const initBtn = document.createElement('button');
    initBtn.style.cssText = `
      display: flex; align-items: center; gap: 8px;
      padding: 8px 16px;
      background: rgba(10,15,30,0.82);
      border: 1px solid rgba(68,170,255,0.3);
      border-radius: 100px;
      color: rgba(68,170,255,0.9);
      font-family: 'Orbitron', monospace; font-size: 11px;
      cursor: pointer; backdrop-filter: blur(12px);
      transition: all 0.15s; letter-spacing: 1px;
    `;
    initBtn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
      VOICE CHAT
    `;
    initBtn.addEventListener('mouseover', () => {
      initBtn.style.borderColor = 'rgba(68,170,255,0.7)';
      initBtn.style.background = 'rgba(68,170,255,0.12)';
    });
    initBtn.addEventListener('mouseout', () => {
      initBtn.style.borderColor = 'rgba(68,170,255,0.3)';
      initBtn.style.background = 'rgba(10,15,30,0.82)';
    });

    initBtn.addEventListener('click', async () => {
      await this.initMicrophone();
      initBtn.remove();
      container.insertBefore(this.createMuteBtn(), container.firstChild);
    });

    container.appendChild(initBtn);
    return container;
  }

  private createMuteBtn(): HTMLButtonElement {
    this.muteBtn = document.createElement('button');
    this.updateMuteBtn();

    const volumeWrap = document.createElement('div');
    volumeWrap.style.cssText = `
      display: flex; align-items: center; gap: 4px;
      padding: 2px 8px; height: 6px; gap: 2px;
    `;
    for (let i = 0; i < 6; i++) {
      const bar = document.createElement('div');
      bar.style.cssText = `
        width: 3px; height: ${4 + i * 2}px;
        background: rgba(68,204,68,0.3);
        border-radius: 2px; transition: background 0.08s;
      `;
      volumeWrap.appendChild(bar);
    }
    this.volumeBar = volumeWrap as unknown as HTMLDivElement;
    this.muteBtn.appendChild(volumeWrap);

    this.muteBtn.addEventListener('click', () => this.toggleMute());
    return this.muteBtn;
  }

  private updateMuteBtn() {
    const isMuted = this.isMuted;
    this.muteBtn.style.cssText = `
      display: flex; align-items: center; gap: 8px;
      padding: 8px 14px;
      background: ${isMuted ? 'rgba(30,8,8,0.85)' : 'rgba(8,25,12,0.85)'};
      border: 1px solid ${isMuted ? 'rgba(255,80,80,0.4)' : 'rgba(68,204,68,0.35)'};
      border-radius: 100px;
      color: ${isMuted ? 'rgba(255,100,100,0.9)' : 'rgba(68,220,68,0.9)'};
      font-family: 'Orbitron', monospace; font-size: 11px;
      cursor: pointer; backdrop-filter: blur(12px);
      transition: all 0.2s; letter-spacing: 1px;
      box-shadow: 0 0 12px ${isMuted ? 'rgba(255,80,80,0.15)' : 'rgba(68,204,68,0.15)'};
    `;

    const existing = this.muteBtn.querySelector('svg, span');
    existing?.remove();

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '13'); svg.setAttribute('height', '13');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');

    if (isMuted) {
      svg.innerHTML = `<line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>`;
    } else {
      svg.innerHTML = `<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>`;
    }

    const label = document.createElement('span');
    label.textContent = isMuted ? 'MIC OFF' : 'MIC ON';
    this.muteBtn.prepend(svg, label);
  }

  async initMicrophone() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);
      if (this.onStreamReady) this.onStreamReady(this.stream);
      this.startVAD();
    } catch (err) {
      console.error('Microphone access denied:', err);
      alert('Không thể truy cập microphone. Vui lòng cho phép truy cập.');
    }
  }

  private startVAD() {
    if (!this.analyser) return;
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    const bars = this.volumeBar?.querySelectorAll('div') ?? [];

    const check = () => {
      if (!this.analyser) return;
      this.analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.slice(0, 64).reduce((a, b) => a + b, 0) / 64;
      const level = Math.min(1, avg / 80);

      if (!this.isMuted && bars.length > 0) {
        bars.forEach((bar, i) => {
          const threshold = (i + 1) / bars.length;
          (bar as HTMLDivElement).style.background = level > threshold
            ? 'rgba(68,220,68,0.9)'
            : 'rgba(68,204,68,0.2)';
        });
      }

      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }

  toggleMute() {
    if (!this.stream) return;
    this.isMuted = !this.isMuted;
    this.stream.getAudioTracks().forEach(t => { t.enabled = !this.isMuted; });
    this.updateMuteBtn();

    const bars = this.volumeBar?.querySelectorAll('div') ?? [];
    bars.forEach((bar) => {
      (bar as HTMLDivElement).style.background = 'rgba(68,204,68,0.2)';
    });
  }

  addSpeakerIndicator(peerId: string, name: string) {
    const div = document.createElement('div');
    div.style.cssText = `
      display: flex; align-items: center; gap: 7px;
      background: rgba(10,15,30,0.8);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 100px;
      padding: 5px 12px 5px 8px;
      font-family: 'Orbitron', monospace; font-size: 10px;
      color: rgba(255,255,255,0.6);
      backdrop-filter: blur(8px);
      transition: border-color 0.2s;
    `;

    const avatar = document.createElement('div');
    avatar.style.cssText = `
      width: 20px; height: 20px; border-radius: 50%;
      background: linear-gradient(135deg, #1a6aff, #0044cc);
      display: flex; align-items: center; justify-content: center;
      font-size: 9px; color: white; flex-shrink: 0;
    `;
    avatar.textContent = name.slice(0, 2).toUpperCase();

    const nameEl = document.createElement('span');
    nameEl.textContent = name.slice(0, 8);

    const waveEl = document.createElement('div');
    waveEl.style.cssText = `display:flex;align-items:center;gap:1px;margin-left:2px;`;
    for (let i = 0; i < 3; i++) {
      const bar = document.createElement('div');
      bar.style.cssText = `width:2px;height:${6+i*2}px;background:rgba(68,204,68,0.25);border-radius:1px;transition:all 0.1s;`;
      waveEl.appendChild(bar);
    }

    div.append(avatar, nameEl, waveEl);
    this.container.appendChild(div);
    this.speakerIndicators.set(peerId, div);
  }

  removeSpeakerIndicator(peerId: string) {
    this.speakerIndicators.get(peerId)?.remove();
    this.speakerIndicators.delete(peerId);
  }

  setSpeaking(peerId: string, speaking: boolean) {
    const div = this.speakerIndicators.get(peerId);
    if (!div) return;
    div.style.borderColor = speaking ? 'rgba(68,220,68,0.5)' : 'rgba(255,255,255,0.08)';
    div.style.boxShadow = speaking ? '0 0 10px rgba(68,204,68,0.2)' : '';
    const bars = div.querySelectorAll('div > div');
    bars.forEach((bar, i) => {
      (bar as HTMLDivElement).style.background = speaking
        ? `rgba(68,220,68,${0.4 + i * 0.25})`
        : 'rgba(68,204,68,0.25)';
      (bar as HTMLDivElement).style.height = speaking ? `${10 + i * 3}px` : `${6 + i * 2}px`;
    });
  }

  getStream(): MediaStream | null {
    return this.stream;
  }
}
