import type { Inventory } from '../game/Inventory';

export class HUD {
  private container: HTMLDivElement;
  private healthFill!: HTMLDivElement;
  private healthText!: HTMLDivElement;
  private chatMessages: HTMLDivElement;
  private chatInput: HTMLInputElement;
  private notifContainer: HTMLDivElement;
  private health = 100;
  private maxHealth = 100;

  constructor(inventory: Inventory) {
    this.container = document.getElementById('hud') as HTMLDivElement;
    this.container.innerHTML = '';

    this.container.appendChild(this.createCrosshair());
    this.container.appendChild(this.createTopBar());
    this.container.appendChild(this.createHotbarWrapper());
    this.notifContainer = this.createNotifContainer();
    this.container.appendChild(this.notifContainer);

    const chatResult = this.createChat();
    this.chatMessages = chatResult.messages;
    this.chatInput = chatResult.input;
    this.container.appendChild(chatResult.box);

    this.injectStyles();

    window.addEventListener('inventoryChange', () => this.renderHotbar(inventory));
    this.renderHotbar(inventory);
  }

  private injectStyles() {
    if (document.getElementById('hud-styles')) return;
    const style = document.createElement('style');
    style.id = 'hud-styles';
    style.textContent = `
      .hud-btn {
        background: rgba(10,15,30,0.75);
        border: 1px solid rgba(68,170,255,0.25);
        border-radius: 8px;
        color: rgba(255,255,255,0.9);
        cursor: pointer;
        font-family: 'Orbitron', monospace;
        backdrop-filter: blur(12px);
        transition: all 0.15s;
      }
      .hud-btn:hover {
        border-color: rgba(68,170,255,0.6);
        background: rgba(68,170,255,0.15);
      }
      .hotbar-slot {
        position: relative;
        width: 52px; height: 52px;
        background: rgba(10,15,30,0.75);
        border: 2px solid rgba(255,255,255,0.12);
        border-radius: 8px;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        cursor: pointer;
        backdrop-filter: blur(12px);
        transition: all 0.12s;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      }
      .hotbar-slot:hover {
        border-color: rgba(68,170,255,0.4);
        background: rgba(68,170,255,0.1);
      }
      .hotbar-slot.active {
        border-color: rgba(68,170,255,0.9);
        background: rgba(68,170,255,0.15);
        box-shadow: 0 0 16px rgba(68,170,255,0.35), 0 2px 8px rgba(0,0,0,0.4);
        transform: scale(1.12) translateY(-3px);
      }
      .slot-num {
        position: absolute; top: 3px; left: 5px;
        font-size: 9px; font-family: 'Orbitron', monospace;
        color: rgba(255,255,255,0.35); line-height: 1;
      }
      .hotbar-slot.active .slot-num { color: rgba(68,170,255,0.8); }
      .slot-icon { font-size: 22px; line-height: 1; }
      .slot-name {
        position: absolute; bottom: -22px; left: 50%;
        transform: translateX(-50%);
        font-size: 10px; font-family: 'Orbitron', monospace;
        color: rgba(255,255,255,0.7);
        white-space: nowrap;
        background: rgba(0,0,0,0.7);
        padding: 2px 6px; border-radius: 4px;
        opacity: 0; transition: opacity 0.15s;
        pointer-events: none;
      }
      .hotbar-slot.active .slot-name { opacity: 1; }
    `;
    document.head.appendChild(style);
  }

  private createCrosshair(): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText = `
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: 24px; height: 24px;
      pointer-events: none; z-index: 20;
    `;
    el.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="1.5" fill="rgba(255,255,255,0.95)"/>
        <line x1="12" y1="2" x2="12" y2="7" stroke="rgba(255,255,255,0.85)" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="12" y1="17" x2="12" y2="22" stroke="rgba(255,255,255,0.85)" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="2" y1="12" x2="7" y2="12" stroke="rgba(255,255,255,0.85)" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="17" y1="12" x2="22" y2="12" stroke="rgba(255,255,255,0.85)" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    `;
    return el;
  }

  private createTopBar(): HTMLDivElement {
    const bar = document.createElement('div');
    bar.style.cssText = `
      position: absolute; top: 16px; left: 50%;
      transform: translateX(-50%);
      display: flex; align-items: center; gap: 12px;
      pointer-events: none;
    `;

    const healthPanel = document.createElement('div');
    healthPanel.style.cssText = `
      display: flex; align-items: center; gap: 8px;
      background: rgba(10,15,30,0.8);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 100px;
      padding: 6px 14px 6px 10px;
      backdrop-filter: blur(12px);
      min-width: 160px;
    `;

    const heartIcon = document.createElement('div');
    heartIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="#f64" xmlns="http://www.w3.org/2000/svg"><path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z"/></svg>`;

    const healthTrack = document.createElement('div');
    healthTrack.style.cssText = `
      flex: 1; height: 6px;
      background: rgba(255,255,255,0.08);
      border-radius: 100px; overflow: hidden;
    `;

    this.healthFill = document.createElement('div');
    this.healthFill.style.cssText = `
      height: 100%; width: 100%; border-radius: 100px;
      background: linear-gradient(90deg, #f64, #f96);
      transition: width 0.4s cubic-bezier(0.4,0,0.2,1), background 0.4s;
      box-shadow: 0 0 8px rgba(255,100,68,0.6);
    `;
    healthTrack.appendChild(this.healthFill);

    this.healthText = document.createElement('div');
    this.healthText.style.cssText = `
      font-family: 'Orbitron', monospace; font-size: 11px;
      color: rgba(255,255,255,0.7); min-width: 28px; text-align: right;
    `;
    this.healthText.textContent = '100';

    healthPanel.append(heartIcon, healthTrack, this.healthText);

    const playerPanel = document.createElement('div');
    playerPanel.id = 'player-count';
    playerPanel.style.cssText = `
      display: flex; align-items: center; gap: 6px;
      background: rgba(10,15,30,0.8);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 100px;
      padding: 6px 14px;
      backdrop-filter: blur(12px);
      font-family: 'Orbitron', monospace; font-size: 11px;
      color: rgba(255,255,255,0.6);
    `;
    playerPanel.innerHTML = `
      <span style="width:7px;height:7px;background:#4d4;border-radius:50%;display:inline-block;box-shadow:0 0 6px #4d4"></span>
      <span id="peer-count">1</span> online
    `;

    bar.append(healthPanel, playerPanel);
    return bar;
  }

  private createHotbarWrapper(): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      position: absolute; bottom: 24px; left: 50%;
      transform: translateX(-50%);
      display: flex; flex-direction: column; align-items: center;
      gap: 4px;
    `;
    const hotbar = document.createElement('div');
    hotbar.id = 'hotbar';
    hotbar.style.cssText = `display: flex; gap: 5px; padding: 5px;
      background: rgba(0,0,0,0.3); border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.06);`;
    wrapper.appendChild(hotbar);
    return wrapper;
  }

  private createNotifContainer(): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText = `
      position: absolute; top: 70px; left: 50%;
      transform: translateX(-50%);
      display: flex; flex-direction: column; align-items: center;
      gap: 6px; pointer-events: none;
    `;
    return el;
  }

  private createChat(): { box: HTMLDivElement; messages: HTMLDivElement; input: HTMLInputElement } {
    const box = document.createElement('div');
    box.style.cssText = `
      position: absolute; bottom: 110px; left: 20px;
      width: 320px;
    `;

    const messages = document.createElement('div');
    messages.style.cssText = `
      max-height: 160px; overflow-y: auto;
      display: flex; flex-direction: column; gap: 3px;
      margin-bottom: 6px; padding: 4px;
    `;

    const inputWrap = document.createElement('div');
    inputWrap.style.cssText = `
      position: relative; display: flex; align-items: center;
    `;

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Nhấn T để chat...';
    input.style.cssText = `
      width: 100%; padding: 9px 42px 9px 14px;
      background: rgba(10,15,30,0.85);
      border: 1px solid rgba(68,170,255,0.3);
      border-radius: 8px; color: white;
      font-size: 13px; font-family: 'Inter', sans-serif;
      outline: none; display: none;
      backdrop-filter: blur(12px);
      transition: border-color 0.2s;
    `;

    const sendHint = document.createElement('div');
    sendHint.textContent = '↵';
    sendHint.style.cssText = `
      position: absolute; right: 12px;
      font-size: 12px; color: rgba(68,170,255,0.5);
      pointer-events: none; display: none;
    `;

    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyT' && document.activeElement !== input) {
        e.preventDefault();
        input.style.display = 'block';
        sendHint.style.display = 'block';
        input.focus();
      }
      if (e.code === 'Escape' && document.activeElement === input) {
        input.style.display = 'none';
        sendHint.style.display = 'none';
        input.blur();
      }
    });

    input.addEventListener('focus', () => {
      input.style.borderColor = 'rgba(68,170,255,0.7)';
    });
    input.addEventListener('blur', () => {
      input.style.borderColor = 'rgba(68,170,255,0.3)';
    });

    inputWrap.append(input, sendHint);
    box.append(messages, inputWrap);
    return { box, messages, input };
  }

  renderHotbar(inventory: Inventory) {
    const hotbar = document.getElementById('hotbar')!;
    hotbar.innerHTML = '';
    inventory.getSlots().forEach((item, i) => {
      const slot = document.createElement('div');
      slot.className = `hotbar-slot${i === inventory.getActiveSlot() ? ' active' : ''}`;

      const numEl = document.createElement('span');
      numEl.className = 'slot-num';
      numEl.textContent = String(i + 1);

      const iconEl = document.createElement('span');
      iconEl.className = 'slot-icon';
      iconEl.textContent = item?.icon ?? '';

      const nameEl = document.createElement('span');
      nameEl.className = 'slot-name';
      nameEl.textContent = item?.name ?? '';

      slot.append(numEl, iconEl, nameEl);
      slot.addEventListener('click', () => inventory.setActiveSlot(i));
      hotbar.appendChild(slot);
    });
  }

  setHealth(hp: number) {
    this.health = Math.max(0, Math.min(this.maxHealth, hp));
    const pct = (this.health / this.maxHealth) * 100;
    this.healthFill.style.width = `${pct}%`;
    this.healthText.textContent = String(Math.round(this.health));

    if (pct > 60) {
      this.healthFill.style.background = 'linear-gradient(90deg,#4d4,#6e6)';
      this.healthFill.style.boxShadow = '0 0 8px rgba(68,204,68,0.6)';
    } else if (pct > 30) {
      this.healthFill.style.background = 'linear-gradient(90deg,#fa4,#fc6)';
      this.healthFill.style.boxShadow = '0 0 8px rgba(255,170,68,0.6)';
    } else {
      this.healthFill.style.background = 'linear-gradient(90deg,#f44,#f66)';
      this.healthFill.style.boxShadow = '0 0 8px rgba(255,68,68,0.8)';
    }
  }

  setPlayerCount(n: number) {
    const el = document.getElementById('peer-count');
    if (el) el.textContent = String(n);
  }

  addChatMessage(sender: string, text: string, isSystem = false) {
    const msg = document.createElement('div');
    msg.className = 'chat-msg';
    msg.style.cssText = `
      background: rgba(10,15,30,0.8);
      border: 1px solid rgba(255,255,255,0.06);
      border-left: 2px solid ${isSystem ? '#4af' : '#fa4'};
      color: rgba(255,255,255,0.9);
      padding: 5px 10px; border-radius: 6px;
      font-size: 12.5px; line-height: 1.4;
      backdrop-filter: blur(8px);
    `;
    msg.innerHTML = isSystem
      ? `<span style="color:#4af;font-weight:600">★</span> ${text}`
      : `<span style="color:#fa4;font-weight:600;font-size:11px">${sender}</span> <span style="color:rgba(255,255,255,0.5)">›</span> ${text}`;

    this.chatMessages.appendChild(msg);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;

    setTimeout(() => {
      msg.style.transition = 'opacity 0.5s';
      msg.style.opacity = '0';
      setTimeout(() => msg.remove(), 500);
    }, 8000);
  }

  showNotif(text: string, type: 'info' | 'success' | 'warning' = 'info') {
    const colors: Record<string, string> = {
      info: 'rgba(68,170,255,0.9)',
      success: 'rgba(68,204,68,0.9)',
      warning: 'rgba(255,170,68,0.9)',
    };
    const notif = document.createElement('div');
    notif.className = 'notif';
    notif.style.cssText = `
      background: rgba(10,15,30,0.9);
      border: 1px solid ${colors[type]};
      border-radius: 8px;
      padding: 7px 16px;
      font-family: 'Orbitron', monospace; font-size: 11px;
      color: ${colors[type]};
      backdrop-filter: blur(12px);
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      pointer-events: none;
    `;
    notif.textContent = text;
    this.notifContainer.appendChild(notif);
    setTimeout(() => {
      notif.style.transition = 'opacity 0.4s';
      notif.style.opacity = '0';
      setTimeout(() => notif.remove(), 400);
    }, 3000);
  }

  onChatSubmit(cb: (text: string) => void) {
    this.chatInput.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' && this.chatInput.value.trim()) {
        cb(this.chatInput.value.trim());
        this.chatInput.value = '';
        this.chatInput.style.display = 'none';
        this.chatInput.blur();
      }
    });
  }
}
