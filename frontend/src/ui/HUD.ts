import type { Inventory } from '../game/Inventory';
import type { Skill } from '../game/SkillSystem';

export class HUD {
  private container: HTMLDivElement;
  private healthFill!: HTMLDivElement;
  private healthText!: HTMLDivElement;
  private xpFill!: HTMLDivElement;
  private levelEl!: HTMLDivElement;
  private chatMessages: HTMLDivElement;
  private chatInput: HTMLInputElement;
  private skillSlots: HTMLDivElement[] = [];
  private skillCdOverlays: HTMLDivElement[] = [];
  private skillCdTexts: HTMLDivElement[] = [];
  private notifContainer: HTMLDivElement;
  private buffContainer!: HTMLDivElement;

  constructor(inventory: Inventory) {
    this.container = document.getElementById('hud') as HTMLDivElement;
    this.container.innerHTML = '';

    this.injectStyles();
    this.container.appendChild(this.createCrosshair());
    this.container.appendChild(this.createTopBar());
    this.container.appendChild(this.createHotbar());
    this.container.appendChild(this.createSkillBar());
    this.notifContainer = this.createNotifContainer();
    this.container.appendChild(this.notifContainer);

    const chat = this.createChat();
    this.chatMessages = chat.messages;
    this.chatInput = chat.input;
    this.container.appendChild(chat.box);

    this.injectHitVignette();

    window.addEventListener('inventoryChange', () => this.renderHotbar(inventory));
    this.renderHotbar(inventory);
  }

  private injectStyles() {
    if (document.getElementById('hud-styles')) return;
    const s = document.createElement('style');
    s.id = 'hud-styles';
    s.textContent = `
      @keyframes dmgFloat { 0%{opacity:1;transform:translateY(0) scale(1)} 100%{opacity:0;transform:translateY(-60px) scale(0.8)} }
      @keyframes hitVignette { 0%,100%{opacity:0} 20%,80%{opacity:1} }
      @keyframes lootPop { 0%{opacity:0;transform:translateX(-50%) translateY(8px) scale(0.85)} 60%{opacity:1;transform:translateX(-50%) translateY(-2px) scale(1.05)} 100%{opacity:0;transform:translateX(-50%) translateY(-16px) scale(1)} }
      @keyframes levelUp { 0%{opacity:0;transform:translateX(-50%) scale(0.6)} 30%{opacity:1;transform:translateX(-50%) scale(1.15)} 70%{opacity:1;transform:translateX(-50%) scale(1)} 100%{opacity:0;transform:translateX(-50%) scale(1)} }
      @keyframes skillPulse { 0%,100%{box-shadow:0 0 0 0 rgba(255,200,50,0)} 50%{box-shadow:0 0 0 6px rgba(255,200,50,0.35)} }
      .hotbar-slot { position:relative; width:52px; height:52px; background:rgba(10,15,30,0.75); border:2px solid rgba(255,255,255,0.12); border-radius:8px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; backdrop-filter:blur(12px); transition:all 0.12s; box-shadow:0 2px 8px rgba(0,0,0,0.4); }
      .hotbar-slot:hover { border-color:rgba(68,170,255,0.4); background:rgba(68,170,255,0.1); }
      .hotbar-slot.active { border-color:rgba(68,170,255,0.9); background:rgba(68,170,255,0.15); box-shadow:0 0 16px rgba(68,170,255,0.35),0 2px 8px rgba(0,0,0,0.4); transform:scale(1.12) translateY(-3px); }
      .hotbar-slot.sword.active { border-color:rgba(255,140,0,0.9); box-shadow:0 0 16px rgba(255,140,0,0.35); background:rgba(255,140,0,0.1); }
      .slot-num { position:absolute; top:3px; left:5px; font-size:9px; font-family:'Orbitron',monospace; color:rgba(255,255,255,0.35); line-height:1; }
      .hotbar-slot.active .slot-num { color:rgba(68,170,255,0.8); }
      .slot-icon { font-size:22px; line-height:1; }
      .slot-name { position:absolute; bottom:-22px; left:50%; transform:translateX(-50%); font-size:10px; font-family:'Orbitron',monospace; color:rgba(255,255,255,0.7); white-space:nowrap; background:rgba(0,0,0,0.7); padding:2px 6px; border-radius:4px; opacity:0; transition:opacity 0.15s; pointer-events:none; }
      .hotbar-slot.active .slot-name { opacity:1; }
      .skill-slot { position:relative; width:54px; height:54px; background:rgba(10,15,30,0.8); border:2px solid rgba(255,200,50,0.3); border-radius:10px; display:flex; flex-direction:column; align-items:center; justify-content:center; backdrop-filter:blur(12px); overflow:hidden; }
      .skill-slot.ready { border-color:rgba(255,200,50,0.7); box-shadow:0 0 10px rgba(255,200,50,0.2); }
      .skill-slot.active-anim { animation: skillPulse 0.5s ease; }
      .skill-key { font-size:9px; font-family:'Orbitron',monospace; color:rgba(255,200,50,0.7); position:absolute; top:3px; left:6px; }
      .skill-icon { font-size:24px; }
      .skill-cd-overlay { position:absolute; inset:0; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; font-family:'Orbitron',monospace; font-size:14px; color:white; font-weight:bold; border-radius:8px; }
    `;
    document.head.appendChild(s);
  }

  private injectHitVignette() {
    const v = document.createElement('div');
    v.id = 'hit-vignette';
    v.style.cssText = `position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 40%,rgba(255,0,0,0.55) 100%);opacity:0;z-index:5;`;
    this.container.appendChild(v);

    window.addEventListener('playerHit', () => {
      const el = document.getElementById('hit-vignette')!;
      el.style.transition = 'none'; el.style.opacity = '1';
      setTimeout(() => { el.style.transition = 'opacity 0.6s'; el.style.opacity = '0'; }, 50);
    });
  }

  private createCrosshair(): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:24px;height:24px;pointer-events:none;z-index:20;`;
    el.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="1.5" fill="rgba(255,255,255,0.95)"/><line x1="12" y1="2" x2="12" y2="7" stroke="rgba(255,255,255,0.85)" stroke-width="1.5" stroke-linecap="round"/><line x1="12" y1="17" x2="12" y2="22" stroke="rgba(255,255,255,0.85)" stroke-width="1.5" stroke-linecap="round"/><line x1="2" y1="12" x2="7" y2="12" stroke="rgba(255,255,255,0.85)" stroke-width="1.5" stroke-linecap="round"/><line x1="17" y1="12" x2="22" y2="12" stroke="rgba(255,255,255,0.85)" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    return el;
  }

  private createTopBar(): HTMLDivElement {
    const bar = document.createElement('div');
    bar.style.cssText = `position:absolute;top:16px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:10px;pointer-events:none;`;

    const levelPanel = document.createElement('div');
    this.levelEl = document.createElement('div');
    this.levelEl.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:2px;background:rgba(10,15,30,0.82);border:1px solid rgba(255,200,50,0.35);border-radius:10px;padding:5px 12px;backdrop-filter:blur(12px);min-width:52px;`;
    this.levelEl.innerHTML = `<span id="lv-num" style="font-family:'Orbitron',monospace;font-size:15px;font-weight:900;color:#ffd700;">1</span><span style="font-size:8px;font-family:'Orbitron',monospace;color:rgba(255,200,50,0.5);letter-spacing:1px;">LEVEL</span>`;
    levelPanel.appendChild(this.levelEl);

    const hpPanel = document.createElement('div');
    hpPanel.style.cssText = `display:flex;align-items:center;gap:8px;background:rgba(10,15,30,0.82);border:1px solid rgba(255,255,255,0.1);border-radius:100px;padding:6px 14px 6px 10px;backdrop-filter:blur(12px);min-width:180px;`;
    hpPanel.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="#f64"><path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z"/></svg>`;
    const hpTrack = document.createElement('div');
    hpTrack.style.cssText = `flex:1;height:7px;background:rgba(255,255,255,0.08);border-radius:100px;overflow:hidden;`;
    this.healthFill = document.createElement('div');
    this.healthFill.style.cssText = `height:100%;width:100%;border-radius:100px;background:linear-gradient(90deg,#f64,#f96);transition:width 0.4s cubic-bezier(0.4,0,0.2,1),background 0.4s;box-shadow:0 0 8px rgba(255,100,68,0.6);`;
    hpTrack.appendChild(this.healthFill);
    this.healthText = document.createElement('div');
    this.healthText.style.cssText = `font-family:'Orbitron',monospace;font-size:11px;color:rgba(255,255,255,0.7);min-width:36px;text-align:right;`;
    this.healthText.textContent = '100/100';
    hpPanel.append(hpTrack, this.healthText);

    const xpPanel = document.createElement('div');
    xpPanel.style.cssText = `display:flex;align-items:center;gap:7px;background:rgba(10,15,30,0.82);border:1px solid rgba(80,200,120,0.25);border-radius:100px;padding:6px 14px 6px 10px;backdrop-filter:blur(12px);min-width:140px;`;
    xpPanel.innerHTML = `<span style="font-size:10px;font-family:'Orbitron',monospace;color:rgba(80,220,120,0.7);">XP</span>`;
    const xpTrack = document.createElement('div');
    xpTrack.style.cssText = `flex:1;height:5px;background:rgba(255,255,255,0.08);border-radius:100px;overflow:hidden;`;
    this.xpFill = document.createElement('div');
    this.xpFill.style.cssText = `height:100%;width:0%;border-radius:100px;background:linear-gradient(90deg,#4e8,#8fd);transition:width 0.5s;box-shadow:0 0 6px rgba(68,220,120,0.5);`;
    xpTrack.appendChild(this.xpFill);
    const xpText = document.createElement('div');
    xpText.id = 'xp-text';
    xpText.style.cssText = `font-family:'Orbitron',monospace;font-size:10px;color:rgba(80,220,120,0.6);min-width:32px;text-align:right;`;
    xpText.textContent = '0%';
    xpPanel.append(xpTrack, xpText);

    bar.append(levelPanel, hpPanel, xpPanel);
    return bar;
  }

  private createHotbar(): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = `position:absolute;bottom:84px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:4px;`;
    const hotbar = document.createElement('div');
    hotbar.id = 'hotbar';
    hotbar.style.cssText = `display:flex;gap:5px;padding:5px;background:rgba(0,0,0,0.3);border-radius:12px;border:1px solid rgba(255,255,255,0.06);`;
    wrap.appendChild(hotbar);
    return wrap;
  }

  private createSkillBar(): HTMLDivElement {
    const bar = document.createElement('div');
    bar.style.cssText = `position:absolute;bottom:20px;left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:flex-end;`;

    const skillDefs = [
      { key: 'Q', icon: '💨', name: 'Lao tới' },
      { key: 'E', icon: '🌀', name: 'Lốc xoáy' },
      { key: 'R', icon: '🔥', name: 'Bạo nộ' },
    ];

    for (const def of skillDefs) {
      const slot = document.createElement('div');
      slot.className = 'skill-slot ready';
      slot.title = def.name;
      slot.innerHTML = `
        <span class="skill-key">${def.key}</span>
        <span class="skill-icon">${def.icon}</span>
      `;
      const cdOverlay = document.createElement('div');
      cdOverlay.className = 'skill-cd-overlay';
      cdOverlay.style.display = 'none';
      const cdText = document.createElement('div');
      cdOverlay.appendChild(cdText);
      slot.appendChild(cdOverlay);
      this.skillSlots.push(slot);
      this.skillCdOverlays.push(cdOverlay);
      this.skillCdTexts.push(cdText);
      bar.appendChild(slot);
    }

    this.buffContainer = document.createElement('div');
    this.buffContainer.style.cssText = `display:flex;gap:5px;margin-left:12px;`;
    bar.appendChild(this.buffContainer);

    return bar;
  }

  private createNotifContainer(): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;top:70px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none;`;
    return el;
  }

  private createChat(): { box: HTMLDivElement; messages: HTMLDivElement; input: HTMLInputElement } {
    const box = document.createElement('div');
    box.style.cssText = `position:absolute;bottom:170px;left:20px;width:320px;`;
    const messages = document.createElement('div');
    messages.style.cssText = `max-height:150px;overflow-y:auto;display:flex;flex-direction:column;gap:3px;margin-bottom:6px;padding:4px;`;
    const inputWrap = document.createElement('div');
    inputWrap.style.cssText = `position:relative;display:flex;align-items:center;`;
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Nhấn T để chat...';
    input.style.cssText = `width:100%;padding:9px 42px 9px 14px;background:rgba(10,15,30,0.85);border:1px solid rgba(68,170,255,0.3);border-radius:8px;color:white;font-size:13px;outline:none;display:none;backdrop-filter:blur(12px);transition:border-color 0.2s;font-family:'Inter',sans-serif;`;
    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyT' && document.activeElement !== input) {
        e.preventDefault(); input.style.display = 'block'; input.focus();
      }
      if (e.code === 'Escape' && document.activeElement === input) {
        input.style.display = 'none'; input.blur();
      }
    });
    inputWrap.appendChild(input);
    box.append(messages, inputWrap);
    return { box, messages, input };
  }

  renderHotbar(inventory: Inventory) {
    const hotbar = document.getElementById('hotbar')!;
    hotbar.innerHTML = '';
    inventory.getSlots().forEach((item, i) => {
      const slot = document.createElement('div');
      const isActive = i === inventory.getActiveSlot();
      slot.className = `hotbar-slot${isActive ? ' active' : ''}${item?.tool === 'sword' ? ' sword' : ''}`;
      slot.innerHTML = `<span class="slot-num">${i + 1}</span><span class="slot-icon">${item?.icon ?? ''}</span><span class="slot-name">${item?.name ?? ''}</span>`;
      slot.addEventListener('click', () => inventory.setActiveSlot(i));
      hotbar.appendChild(slot);
    });
  }

  updateStats(stats: { hp: number; maxHp: number; xp: number; xpToNext: number; level: number }) {
    const pct = (stats.hp / stats.maxHp) * 100;
    this.healthFill.style.width = `${pct}%`;
    this.healthText.textContent = `${stats.hp}/${stats.maxHp}`;
    if (pct > 60) { this.healthFill.style.background = 'linear-gradient(90deg,#4d4,#6e6)'; this.healthFill.style.boxShadow = '0 0 8px rgba(68,204,68,0.6)'; }
    else if (pct > 30) { this.healthFill.style.background = 'linear-gradient(90deg,#fa4,#fc6)'; this.healthFill.style.boxShadow = '0 0 8px rgba(255,170,68,0.6)'; }
    else { this.healthFill.style.background = 'linear-gradient(90deg,#f44,#f66)'; this.healthFill.style.boxShadow = '0 0 12px rgba(255,50,50,0.8)'; }

    const xpPct = (stats.xp / stats.xpToNext) * 100;
    this.xpFill.style.width = `${xpPct}%`;
    const xpTextEl = document.getElementById('xp-text');
    if (xpTextEl) xpTextEl.textContent = `${stats.xp}/${stats.xpToNext}`;
    const lvEl = document.getElementById('lv-num');
    if (lvEl) lvEl.textContent = String(stats.level);
  }

  updateSkills(skills: Skill[]) {
    skills.forEach((skill, i) => {
      const overlay = this.skillCdOverlays[i];
      const text = this.skillCdTexts[i];
      if (!overlay || !text) return;
      if (skill.remainingCd > 0) {
        overlay.style.display = 'flex';
        text.textContent = skill.remainingCd.toFixed(1);
        this.skillSlots[i]?.classList.remove('ready');
      } else {
        overlay.style.display = 'none';
        this.skillSlots[i]?.classList.add('ready');
      }
      if (skill.active && skill.id === 'rage') {
        this.skillSlots[i].style.borderColor = 'rgba(255,80,0,0.9)';
        this.skillSlots[i].style.boxShadow = '0 0 16px rgba(255,80,0,0.5)';
      } else if (!skill.active) {
        this.skillSlots[i].style.borderColor = '';
        this.skillSlots[i].style.boxShadow = '';
      }
    });
  }

  showDamageNumber(screenX: number, screenY: number, value: number, isCrit: boolean) {
    const el = document.createElement('div');
    const color = isCrit ? '#ffd700' : '#ff6644';
    const size = isCrit ? '20px' : '15px';
    el.style.cssText = `
      position:absolute; left:${screenX}px; top:${screenY}px;
      font-family:'Orbitron',monospace; font-weight:900;
      font-size:${size}; color:${color};
      text-shadow: 0 0 8px ${color}, 1px 1px 0 rgba(0,0,0,0.8);
      pointer-events:none; z-index:50;
      animation: dmgFloat 0.9s ease-out forwards;
      transform: translateX(-50%);
    `;
    el.textContent = (isCrit ? '⚡' : '') + value;
    this.container.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  showLootPickup(item: { icon: string; name: string }, effectText: string) {
    const el = document.createElement('div');
    el.style.cssText = `
      position:absolute; bottom:200px; left:50%;
      background:rgba(10,15,30,0.9); border-radius:8px;
      padding:7px 16px; pointer-events:none;
      font-family:'Orbitron',monospace; font-size:11px;
      display:flex; align-items:center; gap:8px;
      animation: lootPop 2.5s ease-out forwards;
      backdrop-filter:blur(12px); z-index:30;
    `;
    const rarity = effectText.includes('💎') ? 'rgba(200,68,255,0.7)' : effectText.includes('+') ? 'rgba(68,220,68,0.7)' : 'rgba(68,170,255,0.5)';
    el.style.border = `1px solid ${rarity}`;
    el.innerHTML = `<span style="font-size:18px">${item.icon}</span><div><div style="color:white;font-size:10px">${item.name}</div><div style="color:${rarity};font-size:9px">${effectText}</div></div>`;
    this.container.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  showLevelUp(level: number) {
    const el = document.createElement('div');
    el.style.cssText = `
      position:absolute; top:38%; left:50%;
      background: linear-gradient(135deg, rgba(20,15,5,0.95), rgba(40,30,5,0.95));
      border:2px solid rgba(255,200,50,0.8); border-radius:16px;
      padding:24px 48px; pointer-events:none;
      font-family:'Orbitron',monospace; text-align:center;
      animation: levelUp 3.5s ease-out forwards;
      box-shadow: 0 0 40px rgba(255,200,50,0.5); z-index:60;
    `;
    el.innerHTML = `
      <div style="font-size:36px;margin-bottom:6px">⭐</div>
      <div style="font-size:20px;font-weight:900;color:#ffd700;letter-spacing:3px">LEVEL UP!</div>
      <div style="font-size:13px;color:rgba(255,200,50,0.8);margin-top:4px">Cấp ${level}</div>
      <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:8px">+20 HP  +5 Sát thương  +2 Phòng thủ</div>
    `;
    this.container.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  showNotif(text: string, type: 'info' | 'success' | 'warning' = 'info') {
    const colors: Record<string, string> = { info: 'rgba(68,170,255,0.9)', success: 'rgba(68,204,68,0.9)', warning: 'rgba(255,170,68,0.9)' };
    const notif = document.createElement('div');
    notif.className = 'notif';
    notif.style.cssText = `background:rgba(10,15,30,0.9);border:1px solid ${colors[type]};border-radius:8px;padding:7px 16px;font-family:'Orbitron',monospace;font-size:11px;color:${colors[type]};backdrop-filter:blur(12px);box-shadow:0 4px 16px rgba(0,0,0,0.4);pointer-events:none;`;
    notif.textContent = text;
    this.notifContainer.appendChild(notif);
    setTimeout(() => { notif.style.transition = 'opacity 0.4s'; notif.style.opacity = '0'; setTimeout(() => notif.remove(), 400); }, 2800);
  }

  addChatMessage(sender: string, text: string) {
    const msg = document.createElement('div');
    msg.className = 'chat-msg';
    msg.style.cssText = `background:rgba(10,15,30,0.8);border:1px solid rgba(255,255,255,0.06);border-left:2px solid #fa4;color:rgba(255,255,255,0.9);padding:5px 10px;border-radius:6px;font-size:12.5px;line-height:1.4;backdrop-filter:blur(8px);`;
    msg.innerHTML = `<span style="color:#fa4;font-weight:600;font-size:11px">${sender}</span> <span style="color:rgba(255,255,255,0.5)">›</span> ${text}`;
    this.chatMessages.appendChild(msg);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    setTimeout(() => { msg.style.transition = 'opacity 0.5s'; msg.style.opacity = '0'; setTimeout(() => msg.remove(), 500); }, 8000);
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
