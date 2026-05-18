import type { Inventory } from '../game/Inventory';
import type { Skill } from '../game/SkillSystem';

const CIRC = 2 * Math.PI * 22; // circumference for r=22 SVG arc

export class HUD {
  private container: HTMLDivElement;
  private healthFill!: HTMLDivElement;
  private healthText!: HTMLDivElement;
  private xpFill!: HTMLDivElement;
  private levelEl!: HTMLDivElement;
  private hpPanel!: HTMLDivElement;
  private staminaFill!: HTMLDivElement;
  private staminaPanel!: HTMLDivElement;
  private oxygenBubbles: HTMLDivElement[] = [];
  private oxygenPanel!: HTMLDivElement;
  private hungerFill!: HTMLDivElement;
  private hungerPanel!: HTMLDivElement;
  private compassEl!: HTMLDivElement;
  private chatMessages: HTMLDivElement;
  private chatInput: HTMLInputElement;
  private skillSlots: HTMLDivElement[] = [];
  private skillCdRings: SVGCircleElement[] = [];
  private skillCdTexts: HTMLDivElement[] = [];
  private notifContainer: HTMLDivElement;
  private crosshairLines: SVGLineElement[] = [];
  private minimapDot!: HTMLDivElement;
  private minimapText!: HTMLDivElement;
  private escapeMenu!: HTMLDivElement;
  private mouseVelX = 0;
  private mouseVelY = 0;
  private lastMX = 0;
  private lastMY = 0;

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
    this.trackMouseVelocity();

    // Survival panels
    this.container.appendChild(this.createOxygenPanel());
    this.container.appendChild(this.createHungerPanel());
    this.container.appendChild(this.createCompass());
    this.container.appendChild(this.createMinimap());
    this.container.appendChild(this.createEscapeMenu());

    window.addEventListener('inventoryChange', () => this.renderHotbar(inventory));
    this.renderHotbar(inventory);
  }

  private createMinimap(): HTMLDivElement {
    const map = document.createElement('div');
    map.style.cssText = `
      position:absolute; right:20px; bottom:20px;
      width:118px; height:118px;
      border-radius:8px;
      background:radial-gradient(circle at center, rgba(50,110,70,0.82), rgba(12,18,28,0.92));
      border:1px solid rgba(255,255,255,0.12);
      box-shadow:0 8px 26px rgba(0,0,0,0.35);
      pointer-events:none;
      overflow:hidden;
    `;
    const cross = document.createElement('div');
    cross.style.cssText = `
      position:absolute; inset:50% auto auto 50%;
      width:1px; height:100%; background:rgba(255,255,255,0.08);
      transform:translate(-50%,-50%);
    `;
    const cross2 = cross.cloneNode() as HTMLDivElement;
    cross2.style.transform = 'translate(-50%,-50%) rotate(90deg)';
    this.minimapDot = document.createElement('div');
    this.minimapDot.style.cssText = `
      position:absolute; left:50%; top:50%;
      width:8px; height:8px; border-radius:50%;
      background:#ffdf58; box-shadow:0 0 12px rgba(255,220,80,0.9);
      transform:translate(-50%,-50%);
    `;
    this.minimapText = document.createElement('div');
    this.minimapText.style.cssText = `
      position:absolute; left:8px; bottom:7px;
      font-family:'Orbitron',monospace; font-size:9px;
      color:rgba(255,255,255,0.72);
    `;
    map.append(cross, cross2, this.minimapDot, this.minimapText);
    return map;
  }

  private createEscapeMenu(): HTMLDivElement {
    const menu = document.createElement('div');
    this.escapeMenu = menu;
    menu.style.cssText = `
      position:absolute; inset:0;
      display:none; align-items:center; justify-content:center;
      background:rgba(0,0,0,0.55);
      z-index:90; pointer-events:auto;
    `;
    const panel = document.createElement('div');
    panel.style.cssText = `
      width:280px; padding:18px;
      border-radius:8px;
      background:rgba(10,15,30,0.94);
      border:1px solid rgba(255,255,255,0.14);
      font-family:'Orbitron',monospace;
      color:white;
    `;
    panel.innerHTML = `
      <div style="font-size:15px;font-weight:900;margin-bottom:14px;">SETTINGS</div>
      <label style="display:flex;justify-content:space-between;gap:12px;font-size:11px;margin-bottom:10px;">Volume <input id="setting-volume" type="range" min="0" max="100" value="80"></label>
      <label style="display:flex;justify-content:space-between;gap:12px;font-size:11px;margin-bottom:10px;">Sensitivity <input id="setting-sens" type="range" min="50" max="200" value="100"></label>
      <button id="resume-btn" style="width:100%;height:34px;border-radius:7px;border:1px solid rgba(255,255,255,0.18);background:rgba(68,170,255,0.18);color:white;font-family:'Orbitron',monospace;cursor:pointer;">RESUME</button>
    `;
    menu.appendChild(panel);
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && document.activeElement !== this.chatInput) this.toggleEscapeMenu();
    });
    panel.querySelector('#resume-btn')?.addEventListener('click', () => this.toggleEscapeMenu(false));
    return menu;
  }

  private toggleEscapeMenu(force?: boolean) {
    const show = force ?? this.escapeMenu.style.display === 'none';
    this.escapeMenu.style.display = show ? 'flex' : 'none';
    if (show) document.exitPointerLock?.();
  }

  private injectStyles() {
    if (document.getElementById('hud-styles')) return;
    const s = document.createElement('style');
    s.id = 'hud-styles';
    s.textContent = `
      @keyframes dmgFloat {
        0%  { opacity:1; transform:translateY(0) scale(1); }
        100%{ opacity:0; transform:translateY(-64px) scale(0.75); }
      }
      @keyframes hitVignette { 0%,100%{opacity:0} 20%,80%{opacity:1} }
      @keyframes lootPop {
        0%  { opacity:0; transform:translateX(-50%) translateY(10px) scale(0.82); }
        55% { opacity:1; transform:translateX(-50%) translateY(-3px) scale(1.06); }
        100%{ opacity:0; transform:translateX(-50%) translateY(-18px) scale(1); }
      }
      @keyframes levelUp {
        0%  { opacity:0; transform:translateX(-50%) scale(0.55); }
        30% { opacity:1; transform:translateX(-50%) scale(1.18); }
        70% { opacity:1; transform:translateX(-50%) scale(1.0); }
        100%{ opacity:0; transform:translateX(-50%) scale(1.0); }
      }
      @keyframes starBurst {
        0%  { opacity:1; transform:translateX(-50%) rotate(var(--r)) translateY(0px) scale(1); }
        100%{ opacity:0; transform:translateX(-50%) rotate(var(--r)) translateY(-55px) scale(0.3); }
      }
      @keyframes skillPulse {
        0%,100%{ box-shadow:0 0 0 0 rgba(255,200,50,0); }
        50%    { box-shadow:0 0 0 7px rgba(255,200,50,0.3); }
      }
      @keyframes barShimmer {
        0%  { transform:translateX(-100%); }
        100%{ transform:translateX(300%); }
      }
      @keyframes hpLowPulse {
        0%,100%{ border-color:rgba(255,50,50,0.35); }
        50%    { border-color:rgba(255,50,50,0.85); box-shadow:0 0 14px rgba(255,50,50,0.5); }
      }
      @keyframes notifSlide {
        from{ opacity:0; transform:translateY(-14px) scale(0.93); }
        to  { opacity:1; transform:translateY(0) scale(1); }
      }
      /* Hotbar */
      .hotbar-slot {
        position:relative; width:54px; height:54px;
        background:rgba(10,15,30,0.78);
        border:2px solid rgba(255,255,255,0.12);
        border-radius:10px;
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        cursor:pointer;
        backdrop-filter:blur(14px);
        transition:all 0.12s;
        box-shadow:0 2px 10px rgba(0,0,0,0.45);
      }
      .hotbar-slot:hover { border-color:rgba(68,170,255,0.45); background:rgba(68,170,255,0.1); }
      .hotbar-slot.active {
        border-color:rgba(68,170,255,0.95);
        background:rgba(68,170,255,0.16);
        box-shadow:0 0 18px rgba(68,170,255,0.4), 0 2px 10px rgba(0,0,0,0.45);
        transform:scale(1.14) translateY(-4px);
      }
      .hotbar-slot.sword.active {
        border-color:rgba(255,140,0,0.95);
        box-shadow:0 0 18px rgba(255,140,0,0.4);
        background:rgba(255,140,0,0.1);
      }
      .slot-num {
        position:absolute; top:3px; left:5px;
        font-size:9px; font-family:'Orbitron',monospace;
        color:rgba(255,255,255,0.3); line-height:1;
      }
      .hotbar-slot.active .slot-num { color:rgba(68,170,255,0.85); }
      .slot-icon { font-size:23px; line-height:1; }
      .slot-name {
        position:absolute; bottom:-24px; left:50%;
        transform:translateX(-50%);
        font-size:10px; font-family:'Orbitron',monospace;
        color:rgba(255,255,255,0.75); white-space:nowrap;
        background:rgba(0,0,0,0.75); padding:2px 7px; border-radius:4px;
        opacity:0; transition:opacity 0.15s; pointer-events:none;
      }
      .hotbar-slot.active .slot-name { opacity:1; }
      /* Skill slots */
      .skill-slot {
        position:relative; width:58px; height:58px;
        background:rgba(10,15,30,0.82);
        border:2px solid rgba(255,200,50,0.3);
        border-radius:12px;
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        backdrop-filter:blur(14px);
        overflow:hidden;
        transition:border-color 0.25s, box-shadow 0.25s;
      }
      .skill-slot.ready {
        border-color:rgba(255,200,50,0.75);
        box-shadow:0 0 12px rgba(255,200,50,0.22);
      }
      .skill-slot.active-anim { animation:skillPulse 0.55s ease; }
      .skill-key {
        font-size:9px; font-family:'Orbitron',monospace;
        color:rgba(255,200,50,0.75);
        position:absolute; top:4px; left:6px;
      }
      .skill-icon { font-size:25px; position:relative; z-index:1; }
      /* Circular cooldown ring SVG */
      .skill-cd-svg {
        position:absolute; inset:0; width:100%; height:100%;
        transform:rotate(-90deg);
      }
      .skill-cd-ring {
        fill:none;
        stroke:rgba(255,60,60,0.85);
        stroke-width:3;
        stroke-linecap:round;
        transition:stroke-dashoffset 0.1s linear;
      }
      .skill-cd-bg {
        fill:rgba(0,0,0,0.55);
        stroke:none;
      }
      .skill-cd-text {
        position:absolute; inset:0;
        display:flex; align-items:center; justify-content:center;
        font-family:'Orbitron',monospace; font-size:12px; font-weight:700;
        color:white;
        pointer-events:none;
        text-shadow:0 1px 4px rgba(0,0,0,0.9);
      }
      /* Bar shimmer overlay */
      .bar-shimmer {
        position:absolute; inset:0; overflow:hidden; border-radius:100px;
        pointer-events:none;
      }
      .bar-shimmer::after {
        content:'';
        position:absolute; top:0; left:0;
        width:40%; height:100%;
        background:linear-gradient(90deg,transparent,rgba(255,255,255,0.25),transparent);
        animation:barShimmer 1.8s ease-in-out infinite;
      }
    `;
    document.head.appendChild(s);
  }

  private trackMouseVelocity() {
    document.addEventListener('mousemove', (e) => {
      const dx = e.clientX - this.lastMX;
      const dy = e.clientY - this.lastMY;
      this.mouseVelX = Math.abs(dx);
      this.mouseVelY = Math.abs(dy);
      this.lastMX = e.clientX;
      this.lastMY = e.clientY;
      this.updateCrosshairSpread();
    });
  }

  private updateCrosshairSpread() {
    const vel = Math.sqrt(this.mouseVelX ** 2 + this.mouseVelY ** 2);
    const spread = Math.min(10, 4 + vel * 0.25);
    // Top, Bottom, Left, Right lines
    const offsets = [
      [0, -spread - 5, 0, -spread],       // top
      [0,  spread,     0,  spread + 5],    // bottom
      [-spread - 5, 0, -spread, 0],        // left
      [ spread,     0,  spread + 5, 0],    // right
    ];
    this.crosshairLines.forEach((line, i) => {
      const [x1, y1, x2, y2] = offsets[i];
      line.setAttribute('x1', String(12 + x1));
      line.setAttribute('y1', String(12 + y1));
      line.setAttribute('x2', String(12 + x2));
      line.setAttribute('y2', String(12 + y2));
    });
  }

  private injectHitVignette() {
    const v = document.createElement('div');
    v.id = 'hit-vignette';
    v.style.cssText = `
      position:absolute; inset:0; pointer-events:none;
      background:radial-gradient(ellipse at center, transparent 40%, rgba(255,0,0,0.6) 100%);
      opacity:0; z-index:5;
    `;
    this.container.appendChild(v);

    window.addEventListener('playerHit', () => {
      const el = document.getElementById('hit-vignette')!;
      el.style.transition = 'none';
      el.style.opacity = '1';
      setTimeout(() => {
        el.style.transition = 'opacity 0.65s';
        el.style.opacity = '0';
      }, 50);
    });

    // Underwater overlay — teal tint when player is submerged
    const underwater = document.createElement('div');
    underwater.id = 'underwater-overlay';
    underwater.style.cssText = `
      position:absolute; inset:0; pointer-events:none;
      background:
        radial-gradient(ellipse at center, rgba(0,60,100,0.25) 0%, rgba(0,80,130,0.5) 100%);
      opacity:0; z-index:4;
      transition:opacity 0.5s;
    `;
    this.container.appendChild(underwater);

    // Lightning flash — brief white-out overlay
    const lightning = document.createElement('div');
    lightning.id = 'lightning-flash';
    lightning.style.cssText = `
      position:absolute; inset:0; pointer-events:none;
      background:rgba(200,220,255,0.65);
      opacity:0; z-index:6;
    `;
    this.container.appendChild(lightning);

    window.addEventListener('lightningFlash', () => {
      const el = document.getElementById('lightning-flash')!;
      el.style.transition = 'none';
      el.style.opacity = '1';
      setTimeout(() => {
        el.style.transition = 'opacity 0.18s';
        el.style.opacity = '0';
      }, 55);
    });
  }

  private createCrosshair(): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText = `
      position:absolute; top:50%; left:50%;
      transform:translate(-50%,-50%);
      width:24px; height:24px;
      pointer-events:none; z-index:20;
    `;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg') as SVGSVGElement;
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('viewBox', '0 0 24 24');
    // Center dot
    const dot = document.createElementNS(ns, 'circle') as SVGCircleElement;
    dot.setAttribute('cx', '12'); dot.setAttribute('cy', '12');
    dot.setAttribute('r', '1.4');
    dot.setAttribute('fill', 'rgba(255,255,255,0.95)');
    svg.appendChild(dot);

    // 4 lines (top, bottom, left, right) — dynamic spread
    const lineData = [
      [12, 7, 12, 4],
      [12, 17, 12, 20],
      [7, 12, 4, 12],
      [17, 12, 20, 12],
    ];
    for (const [x1, y1, x2, y2] of lineData) {
      const line = document.createElementNS(ns, 'line') as SVGLineElement;
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      line.setAttribute('stroke', 'rgba(255,255,255,0.88)');
      line.setAttribute('stroke-width', '1.6');
      line.setAttribute('stroke-linecap', 'round');
      svg.appendChild(line);
      this.crosshairLines.push(line);
    }

    el.appendChild(svg);
    return el;
  }

  private createTopBar(): HTMLDivElement {
    const bar = document.createElement('div');
    bar.style.cssText = `
      position:absolute; top:16px; left:50%;
      transform:translateX(-50%);
      display:flex; align-items:center; gap:10px;
      pointer-events:none;
    `;

    // Level
    const levelPanel = document.createElement('div');
    this.levelEl = document.createElement('div');
    this.levelEl.style.cssText = `
      display:flex; flex-direction:column; align-items:center; gap:2px;
      background:rgba(10,15,30,0.84); border:1px solid rgba(255,200,50,0.38);
      border-radius:10px; padding:5px 13px; backdrop-filter:blur(14px); min-width:52px;
    `;
    this.levelEl.innerHTML = `
      <span id="lv-num" style="font-family:'Orbitron',monospace;font-size:16px;font-weight:900;color:#ffd700;">1</span>
      <span style="font-size:8px;font-family:'Orbitron',monospace;color:rgba(255,200,50,0.5);letter-spacing:1px;">LEVEL</span>
    `;
    levelPanel.appendChild(this.levelEl);

    // HP bar
    this.hpPanel = document.createElement('div');
    this.hpPanel.style.cssText = `
      display:flex; align-items:center; gap:8px;
      background:rgba(10,15,30,0.84); border:1px solid rgba(255,255,255,0.1);
      border-radius:100px; padding:6px 14px 6px 10px;
      backdrop-filter:blur(14px); min-width:185px;
      transition:border-color 0.3s, box-shadow 0.3s;
    `;
    this.hpPanel.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="#f64">
        <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z"/>
      </svg>
    `;
    const hpTrack = document.createElement('div');
    hpTrack.style.cssText = `
      flex:1; height:7px;
      background:rgba(255,255,255,0.08);
      border-radius:100px; overflow:hidden; position:relative;
    `;
    this.healthFill = document.createElement('div');
    this.healthFill.style.cssText = `
      height:100%; width:100%; border-radius:100px;
      background:linear-gradient(90deg,#f64,#f96);
      transition:width 0.4s cubic-bezier(0.4,0,0.2,1), background 0.4s;
      box-shadow:0 0 8px rgba(255,100,68,0.6);
      position:relative;
    `;
    // Shimmer child
    const shimmer = document.createElement('div');
    shimmer.className = 'bar-shimmer';
    this.healthFill.appendChild(shimmer);
    hpTrack.appendChild(this.healthFill);
    this.healthText = document.createElement('div');
    this.healthText.style.cssText = `
      font-family:'Orbitron',monospace; font-size:11px;
      color:rgba(255,255,255,0.7); min-width:40px; text-align:right;
    `;
    this.healthText.textContent = '100/100';
    this.hpPanel.append(hpTrack, this.healthText);

    // XP bar
    const xpPanel = document.createElement('div');
    xpPanel.style.cssText = `
      display:flex; align-items:center; gap:7px;
      background:rgba(10,15,30,0.84); border:1px solid rgba(80,200,120,0.25);
      border-radius:100px; padding:6px 14px 6px 10px;
      backdrop-filter:blur(14px); min-width:145px;
    `;
    xpPanel.innerHTML = `
      <span style="font-size:10px;font-family:'Orbitron',monospace;color:rgba(80,220,120,0.75);">XP</span>
    `;
    const xpTrack = document.createElement('div');
    xpTrack.style.cssText = `
      flex:1; height:5px;
      background:rgba(255,255,255,0.08);
      border-radius:100px; overflow:hidden; position:relative;
    `;
    this.xpFill = document.createElement('div');
    this.xpFill.style.cssText = `
      height:100%; width:0%; border-radius:100px;
      background:linear-gradient(90deg,#4e8,#8fd);
      transition:width 0.55s cubic-bezier(0.34,1.56,0.64,1);
      box-shadow:0 0 6px rgba(68,220,120,0.55);
    `;
    const xpShimmer = document.createElement('div');
    xpShimmer.className = 'bar-shimmer';
    this.xpFill.appendChild(xpShimmer);
    xpTrack.appendChild(this.xpFill);
    const xpText = document.createElement('div');
    xpText.id = 'xp-text';
    xpText.style.cssText = `
      font-family:'Orbitron',monospace; font-size:10px;
      color:rgba(80,220,120,0.65); min-width:34px; text-align:right;
    `;
    xpText.textContent = '0%';
    xpPanel.append(xpTrack, xpText);

    // Stamina bar — starts hidden, fades in when not full
    this.staminaPanel = document.createElement('div');
    this.staminaPanel.style.cssText = `
      display:flex; align-items:center; gap:7px;
      background:rgba(10,15,30,0.84); border:1px solid rgba(80,200,80,0.25);
      border-radius:100px; padding:6px 14px 6px 10px;
      backdrop-filter:blur(14px); min-width:120px;
      transition:opacity 0.4s;
    `;
    this.staminaPanel.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="rgba(120,220,100,0.85)">
        <polygon points="13,2 3,14 12,14 11,22 21,10 12,10"/>
      </svg>
    `;
    const staminaTrack = document.createElement('div');
    staminaTrack.style.cssText = `
      flex:1; height:5px;
      background:rgba(255,255,255,0.08);
      border-radius:100px; overflow:hidden; position:relative;
    `;
    this.staminaFill = document.createElement('div');
    this.staminaFill.style.cssText = `
      height:100%; width:100%; border-radius:100px;
      background:linear-gradient(90deg,#5c8,#9f8);
      transition:width 0.15s ease-out, background 0.3s;
      box-shadow:0 0 6px rgba(100,220,80,0.5);
    `;
    staminaTrack.appendChild(this.staminaFill);
    this.staminaPanel.appendChild(staminaTrack);

    bar.append(levelPanel, this.hpPanel, xpPanel, this.staminaPanel);
    return bar;
  }

  private createHotbar(): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = `
      position:absolute; bottom:88px; left:50%;
      transform:translateX(-50%);
      display:flex; flex-direction:column; align-items:center; gap:4px;
    `;
    const hotbar = document.createElement('div');
    hotbar.id = 'hotbar';
    hotbar.style.cssText = `
      display:flex; gap:5px; padding:5px;
      background:rgba(0,0,0,0.32);
      border-radius:14px; border:1px solid rgba(255,255,255,0.07);
      backdrop-filter:blur(10px);
    `;
    wrap.appendChild(hotbar);
    return wrap;
  }

  private createSkillBar(): HTMLDivElement {
    const bar = document.createElement('div');
    bar.style.cssText = `
      position:absolute; bottom:20px; left:50%;
      transform:translateX(-50%);
      display:flex; gap:10px; align-items:flex-end;
    `;

    const skillDefs = [
      { key: 'Q', icon: '💨', name: 'Lao tới',  maxCd: 3  },  // matches SkillSystem cooldown
      { key: 'E', icon: '🌀', name: 'Lốc xoáy', maxCd: 8  },
      { key: 'R', icon: '🔥', name: 'Bạo nộ',   maxCd: 20 },
    ];

    for (const def of skillDefs) {
      const slot = document.createElement('div');
      slot.className = 'skill-slot ready';
      slot.title = def.name;
      slot.dataset.maxCd = String(def.maxCd);

      slot.innerHTML = `
        <span class="skill-key">${def.key}</span>
        <span class="skill-icon">${def.icon}</span>
      `;

      // SVG circular cooldown ring
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('class', 'skill-cd-svg');
      svg.setAttribute('viewBox', '0 0 58 58');

      const bgCirc = document.createElementNS(ns, 'rect') as SVGRectElement;
      bgCirc.setAttribute('class', 'skill-cd-bg');
      bgCirc.setAttribute('width', '58');
      bgCirc.setAttribute('height', '58');
      bgCirc.setAttribute('rx', '10');
      svg.appendChild(bgCirc);

      const ring = document.createElementNS(ns, 'circle') as SVGCircleElement;
      ring.setAttribute('class', 'skill-cd-ring');
      ring.setAttribute('cx', '29');
      ring.setAttribute('cy', '29');
      ring.setAttribute('r', '22');
      ring.setAttribute('stroke-dasharray', String(CIRC));
      ring.setAttribute('stroke-dashoffset', String(CIRC));
      svg.appendChild(ring);

      slot.appendChild(svg);

      const cdText = document.createElement('div');
      cdText.className = 'skill-cd-text';
      cdText.style.display = 'none';
      slot.appendChild(cdText);

      this.skillSlots.push(slot);
      this.skillCdRings.push(ring);
      this.skillCdTexts.push(cdText);
      bar.appendChild(slot);
    }

    return bar;
  }

  private createNotifContainer(): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText = `
      position:absolute; top:70px; left:50%;
      transform:translateX(-50%);
      display:flex; flex-direction:column; align-items:center; gap:7px;
      pointer-events:none;
    `;
    return el;
  }

  // ── Oxygen bubbles ────────────────────────────────────────────────────────
  private createOxygenPanel(): HTMLDivElement {
    this.oxygenPanel = document.createElement('div');
    this.oxygenPanel.style.cssText = `
      position:absolute; bottom:160px; left:50%;
      transform:translateX(-50%);
      display:flex; gap:4px; align-items:center;
      opacity:0; transition:opacity 0.4s;
      pointer-events:none;
    `;

    for (let i = 0; i < 10; i++) {
      const b = document.createElement('div');
      b.style.cssText = `
        width:14px; height:14px; border-radius:50%;
        background:rgba(80,200,255,0.75);
        border:1px solid rgba(120,220,255,0.5);
        box-shadow:0 0 6px rgba(80,200,255,0.4);
        transition:all 0.25s;
        font-size:10px; display:flex; align-items:center; justify-content:center;
      `;
      b.textContent = '○';
      this.oxygenBubbles.push(b);
      this.oxygenPanel.appendChild(b);
    }
    return this.oxygenPanel;
  }

  // ── Hunger bar ────────────────────────────────────────────────────────────
  private createHungerPanel(): HTMLDivElement {
    this.hungerPanel = document.createElement('div');
    this.hungerPanel.style.cssText = `
      position:absolute; bottom:136px; left:50%;
      transform:translateX(-50%);
      display:flex; align-items:center; gap:7px;
      background:rgba(10,15,30,0.84); border:1px solid rgba(200,140,50,0.3);
      border-radius:100px; padding:5px 13px 5px 9px;
      backdrop-filter:blur(14px); min-width:130px;
      opacity:0; transition:opacity 0.4s;
      pointer-events:none;
    `;
    this.hungerPanel.innerHTML = `
      <span style="font-size:13px">🍗</span>
    `;
    const track = document.createElement('div');
    track.style.cssText = `
      flex:1; height:5px;
      background:rgba(255,255,255,0.08);
      border-radius:100px; overflow:hidden;
    `;
    this.hungerFill = document.createElement('div');
    this.hungerFill.style.cssText = `
      height:100%; width:100%; border-radius:100px;
      background:linear-gradient(90deg,#e85,#fa8);
      transition:width 0.3s ease-out, background 0.3s;
      box-shadow:0 0 6px rgba(240,160,60,0.5);
    `;
    track.appendChild(this.hungerFill);
    this.hungerPanel.appendChild(track);
    return this.hungerPanel;
  }

  // ── Compass ───────────────────────────────────────────────────────────────
  private createCompass(): HTMLDivElement {
    this.compassEl = document.createElement('div');
    this.compassEl.style.cssText = `
      position:absolute; top:62px; left:50%;
      transform:translateX(-50%);
      background:rgba(10,15,30,0.82);
      border:1px solid rgba(255,255,255,0.1);
      border-radius:100px; padding:4px 16px;
      font-family:'Orbitron',monospace; font-size:11px;
      letter-spacing:2px; color:rgba(255,255,255,0.7);
      backdrop-filter:blur(12px);
      pointer-events:none;
      display:flex; align-items:center; gap:10px;
    `;

    const span = document.createElement('span');
    span.id = 'compass-dir';
    span.style.cssText = `color:rgba(68,170,255,0.9);font-weight:700;min-width:20px;text-align:center;`;
    span.textContent = 'N';

    const deg = document.createElement('span');
    deg.id = 'compass-deg';
    deg.style.cssText = `color:rgba(255,255,255,0.4);font-size:9px;`;
    deg.textContent = '0°';

    this.compassEl.append(span, deg);
    return this.compassEl;
  }

  private createChat(): { box: HTMLDivElement; messages: HTMLDivElement; input: HTMLInputElement } {
    const box = document.createElement('div');
    box.style.cssText = `position:absolute; bottom:174px; left:20px; width:325px;`;

    const messages = document.createElement('div');
    messages.style.cssText = `
      max-height:155px; overflow-y:auto;
      display:flex; flex-direction:column; gap:3px;
      margin-bottom:6px; padding:4px;
    `;

    const inputWrap = document.createElement('div');
    inputWrap.style.cssText = `position:relative; display:flex; align-items:center;`;
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Nhấn T để chat...';
    input.style.cssText = `
      width:100%; padding:9px 42px 9px 14px;
      background:rgba(10,15,30,0.88);
      border:1px solid rgba(68,170,255,0.32);
      border-radius:8px; color:white; font-size:13px;
      outline:none; display:none;
      backdrop-filter:blur(14px);
      transition:border-color 0.2s;
      font-family:'Inter',sans-serif;
    `;
    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyT' && document.activeElement !== input) {
        e.preventDefault();
        input.style.display = 'block';
        input.focus();
      }
      if (e.code === 'Escape' && document.activeElement === input) {
        input.style.display = 'none';
        input.blur();
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
      slot.innerHTML = `
        <span class="slot-num">${i + 1}</span>
        <span class="slot-icon">${item?.icon ?? ''}</span>
        ${item?.count && item.count > 1 ? `<span style="position:absolute;right:5px;bottom:4px;font-family:'Orbitron',monospace;font-size:10px;color:white;text-shadow:0 1px 4px #000;">${item.count}</span>` : ''}
        <span class="slot-name">${item?.name ?? ''}</span>
      `;
      slot.addEventListener('click', () => inventory.setActiveSlot(i));
      hotbar.appendChild(slot);
    });
  }

  /** Call every frame with whether the player camera is submerged */
  updateUnderwater(submerged: boolean) {
    const el = document.getElementById('underwater-overlay');
    if (el) el.style.opacity = submerged ? '1' : '0';
  }

  /**
   * Call every frame with oxygen [0..100] and hunger [0..100].
   * Oxygen panel shows only when in water.
   * Hunger panel shows only when not full.
   * @param inWater  true when underwater
   */
  updateSurvival(oxygen: number, hunger: number, inWater: boolean) {
    // ── Oxygen bubbles ────────────────────────────────────────────────────
    this.oxygenPanel.style.opacity = inWater ? '1' : '0';
    if (inWater) {
      const filled = Math.ceil((oxygen / 100) * this.oxygenBubbles.length);
      this.oxygenBubbles.forEach((b, i) => {
        const alive = i < filled;
        b.style.background = alive
          ? 'rgba(80,200,255,0.82)'
          : 'rgba(30,60,80,0.4)';
        b.style.boxShadow = alive
          ? '0 0 6px rgba(80,200,255,0.5)'
          : 'none';
        // Low oxygen: pulse red
        if (oxygen < 20 && alive) {
          b.style.background  = 'rgba(255,100,80,0.85)';
          b.style.boxShadow   = '0 0 8px rgba(255,80,60,0.7)';
        }
      });
    }

    // ── Hunger bar ────────────────────────────────────────────────────────
    this.hungerPanel.style.opacity = hunger >= 98 ? '0' : '1';
    this.hungerFill.style.width    = `${hunger}%`;
    if (hunger < 20) {
      this.hungerFill.style.background = 'linear-gradient(90deg,#c44,#e55)';
      this.hungerFill.style.boxShadow  = '0 0 8px rgba(200,60,60,0.7)';
    } else {
      this.hungerFill.style.background = 'linear-gradient(90deg,#e85,#fa8)';
      this.hungerFill.style.boxShadow  = '0 0 6px rgba(240,160,60,0.5)';
    }
  }

  /** Call every frame with the player's camera euler.y in radians */
  updateCompass(eulerY: number) {
    const DEG_DIRS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    // eulerY: 0 = looking toward -Z (north), increases clockwise
    const deg360 = (((-eulerY * 180 / Math.PI) % 360) + 360) % 360;
    const idx    = Math.round(deg360 / (360 / DEG_DIRS.length)) % DEG_DIRS.length;

    const dirEl = document.getElementById('compass-dir');
    const degEl = document.getElementById('compass-deg');
    if (dirEl) dirEl.textContent = DEG_DIRS[idx];
    if (degEl) degEl.textContent = `${Math.round(deg360)}°`;

    // Highlight cardinal N red, S/E/W dimmer
    if (dirEl) {
      dirEl.style.color = DEG_DIRS[idx] === 'N' ? 'rgba(255,80,80,0.95)' : 'rgba(68,170,255,0.9)';
    }
  }

  /** Call every frame with player.stamina (0–100) */
  updateMinimap(x: number, z: number, weather: string) {
    const px = ((x % 100) + 100) % 100;
    const pz = ((z % 100) + 100) % 100;
    this.minimapDot.style.left = `${10 + px * 0.8}%`;
    this.minimapDot.style.top = `${10 + pz * 0.8}%`;
    this.minimapText.textContent = `${Math.round(x)}, ${Math.round(z)} · ${weather}`;
  }

  updateStamina(stamina: number) {
    const pct = stamina / 100;
    this.staminaFill.style.width = `${pct * 100}%`;

    if (stamina < 20) {
      // Flash red when exhausted
      this.staminaFill.style.background = 'linear-gradient(90deg,#f44,#f66)';
      this.staminaFill.style.boxShadow  = '0 0 10px rgba(255,50,50,0.7)';
    } else {
      this.staminaFill.style.background = 'linear-gradient(90deg,#5c8,#9f8)';
      this.staminaFill.style.boxShadow  = '0 0 6px rgba(100,220,80,0.5)';
    }

    // Hide panel when stamina is full (less clutter)
    this.staminaPanel.style.opacity = pct >= 0.99 ? '0' : '1';
  }

  updateStats(stats: { hp: number; maxHp: number; xp: number; xpToNext: number; level: number }) {
    const pct = (stats.hp / stats.maxHp) * 100;
    this.healthFill.style.width = `${pct}%`;
    this.healthText.textContent = `${stats.hp}/${stats.maxHp}`;

    // Color transitions
    if (pct > 60) {
      this.healthFill.style.background = 'linear-gradient(90deg,#4d4,#6e6)';
      this.healthFill.style.boxShadow  = '0 0 8px rgba(68,204,68,0.6)';
    } else if (pct > 30) {
      this.healthFill.style.background = 'linear-gradient(90deg,#fa4,#fc6)';
      this.healthFill.style.boxShadow  = '0 0 8px rgba(255,170,68,0.6)';
    } else {
      this.healthFill.style.background = 'linear-gradient(90deg,#f44,#f66)';
      this.healthFill.style.boxShadow  = '0 0 14px rgba(255,50,50,0.85)';
    }

    // Low HP pulse on panel
    if (pct < 30) {
      this.hpPanel.style.animation = 'hpLowPulse 1s ease-in-out infinite';
    } else {
      this.hpPanel.style.animation = '';
    }

    // Crosshair tint on low HP
    const crosshairColor = pct < 30 ? 'rgba(255,100,100,0.9)' : 'rgba(255,255,255,0.88)';
    this.crosshairLines.forEach(l => l.setAttribute('stroke', crosshairColor));

    const xpPct = (stats.xp / stats.xpToNext) * 100;
    this.xpFill.style.width = `${xpPct}%`;
    const xpTextEl = document.getElementById('xp-text');
    if (xpTextEl) xpTextEl.textContent = `${stats.xp}/${stats.xpToNext}`;
    const lvEl = document.getElementById('lv-num');
    if (lvEl) lvEl.textContent = String(stats.level);
  }

  updateSkills(skills: Skill[]) {
    skills.forEach((skill, i) => {
      const ring    = this.skillCdRings[i];
      const text    = this.skillCdTexts[i];
      const slot    = this.skillSlots[i];
      if (!ring || !text || !slot) return;

      const maxCd = parseFloat(slot.dataset.maxCd ?? '10');

      if (skill.remainingCd > 0) {
        // Arc: full circle = on cooldown start, 0 = ready
        const progress = skill.remainingCd / maxCd;
        ring.setAttribute('stroke-dashoffset', String(CIRC * (1 - progress)));
        ring.setAttribute('stroke', 'rgba(255,60,60,0.88)');
        text.style.display = 'flex';
        text.textContent   = skill.remainingCd.toFixed(1);
        slot.classList.remove('ready');
      } else {
        ring.setAttribute('stroke-dashoffset', String(CIRC));
        ring.setAttribute('stroke', 'rgba(255,200,50,0.7)');
        text.style.display = 'none';
        slot.classList.add('ready');
      }

      if (skill.active && skill.id === 'rage') {
        slot.style.borderColor = 'rgba(255,80,0,0.95)';
        slot.style.boxShadow   = '0 0 18px rgba(255,80,0,0.55)';
      } else if (!skill.active) {
        slot.style.borderColor = '';
        slot.style.boxShadow   = '';
      }
    });
  }

  showDamageNumber(screenX: number, screenY: number, value: number, isCrit: boolean) {
    const el = document.createElement('div');
    const color = isCrit ? '#ffd700' : '#ff6644';
    const size  = isCrit ? '21px' : '15px';
    el.style.cssText = `
      position:absolute; left:${screenX}px; top:${screenY}px;
      font-family:'Orbitron',monospace; font-weight:900;
      font-size:${size}; color:${color};
      text-shadow:0 0 10px ${color}, 1px 1px 0 rgba(0,0,0,0.8);
      pointer-events:none; z-index:50;
      animation:dmgFloat 0.95s ease-out forwards;
      transform:translateX(-50%);
    `;
    el.textContent = (isCrit ? '⚡' : '') + value;
    this.container.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  showLootPickup(item: { icon: string; name: string }, effectText: string) {
    const el = document.createElement('div');
    el.style.cssText = `
      position:absolute; bottom:204px; left:50%;
      background:rgba(10,15,30,0.92); border-radius:9px;
      padding:7px 16px; pointer-events:none;
      font-family:'Orbitron',monospace; font-size:11px;
      display:flex; align-items:center; gap:9px;
      animation:lootPop 2.5s ease-out forwards;
      backdrop-filter:blur(14px); z-index:30;
    `;
    const rarity = effectText.includes('💎')
      ? 'rgba(200,68,255,0.75)'
      : effectText.includes('+')
        ? 'rgba(68,220,68,0.75)'
        : 'rgba(68,170,255,0.55)';
    el.style.border = `1px solid ${rarity}`;
    el.innerHTML = `
      <span style="font-size:19px">${item.icon}</span>
      <div>
        <div style="color:white;font-size:10px">${item.name}</div>
        <div style="color:${rarity};font-size:9px">${effectText}</div>
      </div>
    `;
    this.container.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  showLevelUp(level: number) {
    const el = document.createElement('div');
    el.style.cssText = `
      position:absolute; top:38%; left:50%;
      background:linear-gradient(135deg,rgba(20,15,5,0.96),rgba(40,30,5,0.96));
      border:2px solid rgba(255,200,50,0.85); border-radius:18px;
      padding:26px 52px; pointer-events:none;
      font-family:'Orbitron',monospace; text-align:center;
      animation:levelUp 3.5s ease-out forwards;
      box-shadow:0 0 50px rgba(255,200,50,0.55); z-index:60;
    `;
    el.innerHTML = `
      <div style="font-size:38px;margin-bottom:8px">⭐</div>
      <div style="font-size:22px;font-weight:900;color:#ffd700;letter-spacing:3px">LEVEL UP!</div>
      <div style="font-size:14px;color:rgba(255,200,50,0.85);margin-top:5px">Cấp ${level}</div>
      <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:10px">+20 HP &nbsp; +5 Sát thương &nbsp; +2 Phòng thủ</div>
    `;
    this.container.appendChild(el);

    // Star burst particles
    for (let i = 0; i < 8; i++) {
      const star = document.createElement('div');
      const angle = (i / 8) * 360;
      star.style.cssText = `
        position:absolute; top:38%; left:50%;
        font-size:${14 + Math.random() * 10}px;
        pointer-events:none; z-index:59;
        --r:${angle}deg;
        animation:starBurst 1.2s ease-out ${i * 0.06}s forwards;
        transform-origin:center bottom;
      `;
      star.textContent = '✦';
      this.container.appendChild(star);
      setTimeout(() => star.remove(), 1500);
    }

    setTimeout(() => el.remove(), 3500);
  }

  showNotif(text: string, type: 'info' | 'success' | 'warning' = 'info') {
    const colorMap: Record<string, [string, string]> = {
      info:    ['rgba(68,170,255,0.95)',  'ℹ'],
      success: ['rgba(68,220,68,0.95)',   '✓'],
      warning: ['rgba(255,170,68,0.95)',  '⚠'],
    };
    const [color, icon] = colorMap[type];
    const notif = document.createElement('div');
    notif.className = 'notif';
    notif.style.cssText = `
      background:rgba(10,15,30,0.92);
      border:1px solid ${color};
      border-radius:9px;
      padding:0;
      font-family:'Orbitron',monospace;
      font-size:11px; color:${color};
      backdrop-filter:blur(14px);
      box-shadow:0 4px 18px rgba(0,0,0,0.45);
      pointer-events:none;
      overflow:hidden;
      min-width:180px;
      animation:notifSlide 0.28s ease-out;
    `;

    const inner = document.createElement('div');
    inner.style.cssText = `display:flex;align-items:center;gap:8px;padding:7px 14px;`;
    inner.innerHTML = `<span style="font-size:13px">${icon}</span><span>${text}</span>`;

    const progress = document.createElement('div');
    progress.style.cssText = `
      height:2px; background:${color};
      border-radius:0 0 9px 9px;
      transition:width 2.8s linear;
      width:100%;
    `;

    notif.append(inner, progress);
    this.notifContainer.appendChild(notif);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => { progress.style.width = '0%'; });
    });

    setTimeout(() => {
      notif.style.transition = 'opacity 0.4s, transform 0.4s';
      notif.style.opacity = '0';
      notif.style.transform = 'translateY(-8px) scale(0.95)';
      setTimeout(() => notif.remove(), 400);
    }, 2800);
  }

  showDeathScreen(onRespawn: () => void) {
    document.getElementById('death-screen')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'death-screen';
    overlay.style.cssText = `
      position:absolute; inset:0;
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      gap:18px;
      background:radial-gradient(circle at center, rgba(120,0,0,0.28), rgba(0,0,0,0.88) 70%);
      pointer-events:auto; z-index:100;
      font-family:'Orbitron',monospace;
      color:white;
    `;

    const title = document.createElement('div');
    title.style.cssText = `
      font-size:34px; font-weight:900; letter-spacing:3px;
      color:#ff5a4f; text-shadow:0 0 22px rgba(255,60,40,0.65);
    `;
    title.textContent = 'YOU DIED';

    const button = document.createElement('button');
    button.type = 'button';
    button.style.cssText = `
      min-width:160px; height:44px;
      border:1px solid rgba(255,255,255,0.22);
      border-radius:8px;
      background:rgba(255,90,70,0.18);
      color:white;
      font-family:'Orbitron',monospace; font-size:13px; font-weight:800;
      cursor:pointer;
      box-shadow:0 8px 28px rgba(0,0,0,0.45);
    `;
    button.textContent = 'RESPAWN';
    button.addEventListener('click', () => {
      overlay.remove();
      onRespawn();
    }, { once: true });

    overlay.append(title, button);
    this.container.appendChild(overlay);
  }

  addChatMessage(sender: string, text: string) {
    const msg = document.createElement('div');
    msg.className = 'chat-msg';
    msg.style.cssText = `
      background:rgba(10,15,30,0.82);
      border:1px solid rgba(255,255,255,0.07);
      border-left:2px solid #fa4;
      color:rgba(255,255,255,0.92);
      padding:5px 10px; border-radius:6px;
      font-size:12.5px; line-height:1.4;
      backdrop-filter:blur(8px);
      animation:notifSlide 0.2s ease-out;
    `;
    msg.innerHTML = `<span style="color:#fa4;font-weight:600;font-size:11px">${sender}</span> <span style="color:rgba(255,255,255,0.45)">›</span> ${text}`;
    this.chatMessages.appendChild(msg);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    while (this.chatMessages.children.length > 80) this.chatMessages.firstElementChild?.remove();
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
