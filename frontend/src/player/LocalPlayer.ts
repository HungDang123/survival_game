import * as THREE from 'three';

export interface PlayerState {
  id: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number };
  animState: 'idle' | 'walk' | 'run' | 'swim';
}

const WATER_LEVEL      = -1.0;

// Movement constants
const BASE_SPEED       = 10;
const SPRINT_MULT      = 1.65;
const JUMP_SPEED       = 9;
const GRAVITY          = -26;
const TERMINAL_VEL     = -38;
const PLAYER_HEIGHT    = 1.8;
const ACCEL            = 22;
const DECEL            = 20;

// Stamina
const STAMINA_MAX      = 100;
const STAMINA_DRAIN    = 22;   // per second while sprinting
const STAMINA_REGEN    = 12;   // per second while not sprinting
const STAMINA_MIN_SPRINT = 5;

// Water
const BUOYANCY_STRENGTH = 9;
const WATER_DRAG        = 0.88;
const SWIM_SPEED_MULT   = 0.55;

export class LocalPlayer {
  readonly id: string;
  camera: THREE.PerspectiveCamera;

  private velocity    = new THREE.Vector3();
  private euler       = new THREE.Euler(0, 0, 0, 'YXZ');

  private moveForward  = false;
  private moveBackward = false;
  private moveLeft     = false;
  private moveRight    = false;
  private isSprinting  = false;
  private canJump      = false;
  private isPointerLocked = false;

  // Public stamina so HUD can read it
  stamina = STAMINA_MAX;

  speedMultiplier = 1.0;

  constructor(id: string, renderer: THREE.WebGLRenderer) {
    this.id     = id;
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 10, 0);

    this.setupPointerLock(renderer.domElement);
    this.setupKeyboard();
    window.addEventListener('resize', () => this.onResize());
  }

  private setupPointerLock(canvas: HTMLElement) {
    canvas.addEventListener('click', () => {
      if (!this.isPointerLocked) canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.isPointerLocked) return;
      const sens = 0.0018;
      this.euler.setFromQuaternion(this.camera.quaternion);
      this.euler.y -= e.movementX * sens;
      this.euler.x -= e.movementY * sens;
      this.euler.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.euler.x));
      this.camera.quaternion.setFromEuler(this.euler);
    });
  }

  private setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      switch (e.code) {
        case 'KeyW': case 'ArrowUp':    this.moveForward  = true; break;
        case 'KeyS': case 'ArrowDown':  this.moveBackward = true; break;
        case 'KeyA': case 'ArrowLeft':  this.moveLeft     = true; break;
        case 'KeyD': case 'ArrowRight': this.moveRight    = true; break;
        case 'ShiftLeft': case 'ShiftRight': this.isSprinting = true; break;
        case 'Space':
          if (this.canJump && !this.isUnderwater()) {
            this.velocity.y = JUMP_SPEED;
            this.canJump = false;
          }
          break;
      }
    });
    document.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp':    this.moveForward  = false; break;
        case 'KeyS': case 'ArrowDown':  this.moveBackward = false; break;
        case 'KeyA': case 'ArrowLeft':  this.moveLeft     = false; break;
        case 'KeyD': case 'ArrowRight': this.moveRight    = false; break;
        case 'ShiftLeft': case 'ShiftRight': this.isSprinting = false; break;
      }
    });
  }

  private isUnderwater(): boolean {
    return this.camera.position.y < WATER_LEVEL + 0.5;
  }

  update(delta: number, getTerrainHeight: (x: number, z: number) => number) {
    const dt        = Math.min(delta, 0.05);
    const inWater   = this.isUnderwater();
    const sprinting = this.isSprinting && !inWater && this.stamina > STAMINA_MIN_SPRINT;

    // ── Stamina update ─────────────────────────────────────────────────────
    const moving = this.moveForward || this.moveBackward || this.moveLeft || this.moveRight;
    if (sprinting && moving) {
      this.stamina = Math.max(0, this.stamina - STAMINA_DRAIN * dt);
      if (this.stamina === 0) this.isSprinting = false;
    } else {
      this.stamina = Math.min(STAMINA_MAX, this.stamina + STAMINA_REGEN * dt);
    }

    // ── Movement direction ─────────────────────────────────────────────────
    const fwd   = new THREE.Vector3(-Math.sin(this.euler.y), 0, -Math.cos(this.euler.y));
    const right = new THREE.Vector3( Math.cos(this.euler.y), 0, -Math.sin(this.euler.y));

    const moveDir = new THREE.Vector3();
    if (this.moveForward)  moveDir.addScaledVector(fwd,    1);
    if (this.moveBackward) moveDir.addScaledVector(fwd,   -1);
    if (this.moveRight)    moveDir.addScaledVector(right,  1);
    if (this.moveLeft)     moveDir.addScaledVector(right, -1);

    const hasInput = moveDir.lengthSq() > 0.001;
    if (hasInput) moveDir.normalize();

    // ── Speed ──────────────────────────────────────────────────────────────
    let speedFactor = this.speedMultiplier;
    if (sprinting) speedFactor *= SPRINT_MULT;
    if (inWater)   speedFactor *= SWIM_SPEED_MULT;

    const topSpeed = BASE_SPEED * speedFactor;
    const rate     = hasInput ? ACCEL : DECEL;
    const blend    = Math.min(1, rate * dt);

    this.velocity.x += (moveDir.x * topSpeed - this.velocity.x) * blend;
    this.velocity.z += (moveDir.z * topSpeed - this.velocity.z) * blend;

    // ── Vertical physics ───────────────────────────────────────────────────
    if (inWater) {
      // Buoyancy pushes up toward water surface
      const depth = WATER_LEVEL - this.camera.position.y + PLAYER_HEIGHT * 0.5;
      this.velocity.y += depth * BUOYANCY_STRENGTH * dt;
      // Water drag on all axes
      this.velocity.x *= Math.pow(WATER_DRAG, dt * 60);
      this.velocity.z *= Math.pow(WATER_DRAG, dt * 60);
      this.velocity.y *= Math.pow(WATER_DRAG, dt * 60);
      this.canJump = false;
    } else {
      this.velocity.y += GRAVITY * dt;
      if (this.velocity.y < TERMINAL_VEL) this.velocity.y = TERMINAL_VEL;
    }

    // ── Integrate ──────────────────────────────────────────────────────────
    this.camera.position.x += this.velocity.x * dt;
    this.camera.position.z += this.velocity.z * dt;
    this.camera.position.y += this.velocity.y * dt;

    // ── Ground collision ───────────────────────────────────────────────────
    const groundY = getTerrainHeight(this.camera.position.x, this.camera.position.z) + PLAYER_HEIGHT;
    if (this.camera.position.y < groundY) {
      this.velocity.y = 0;
      this.camera.position.y = groundY;
      this.canJump = true;
    }
  }

  spawnAboveTerrain(getTerrainHeight: (x: number, z: number) => number) {
    const h = getTerrainHeight(this.camera.position.x, this.camera.position.z);
    this.camera.position.y = h + PLAYER_HEIGHT + 1;
    this.velocity.set(0, 0, 0);
  }

  getState(): PlayerState {
    const moving    = this.moveForward || this.moveBackward || this.moveLeft || this.moveRight;
    const sprinting = this.isSprinting && moving && this.stamina > STAMINA_MIN_SPRINT;
    const inWater   = this.isUnderwater();
    const animState = inWater ? 'swim' : sprinting ? 'run' : moving ? 'walk' : 'idle';
    return {
      id: this.id,
      position: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      rotation: { x: this.euler.x, y: this.euler.y },
      animState,
    };
  }

  isLocked(): boolean { return this.isPointerLocked; }

  spendStamina(amount: number): boolean {
    if (this.stamina < amount) return false;
    this.stamina -= amount;
    return true;
  }

  private onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
