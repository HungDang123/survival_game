import * as THREE from 'three';

export interface PlayerState {
  id: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number };
  animState: 'idle' | 'walk' | 'run';
}

export class LocalPlayer {
  readonly id: string;
  camera: THREE.PerspectiveCamera;

  private velocity = new THREE.Vector3();
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');

  private moveForward = false;
  private moveBackward = false;
  private moveLeft = false;
  private moveRight = false;
  private canJump = false;
  private isPointerLocked = false;

  private readonly BASE_SPEED = 10;
  private readonly JUMP_SPEED = 9;
  private readonly GRAVITY = -26;
  private readonly TERMINAL_VEL = -38;
  private readonly PLAYER_HEIGHT = 1.8;
  private readonly ACCEL = 22;
  private readonly DECEL = 20;

  speedMultiplier = 1.0;

  constructor(id: string, renderer: THREE.WebGLRenderer) {
    this.id = id;
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
        case 'Space':
          if (this.canJump) { this.velocity.y = this.JUMP_SPEED; this.canJump = false; }
          break;
      }
    });
    document.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp':    this.moveForward  = false; break;
        case 'KeyS': case 'ArrowDown':  this.moveBackward = false; break;
        case 'KeyA': case 'ArrowLeft':  this.moveLeft     = false; break;
        case 'KeyD': case 'ArrowRight': this.moveRight    = false; break;
      }
    });
  }

  update(delta: number, getTerrainHeight: (x: number, z: number) => number) {
    const dt = Math.min(delta, 0.05);

    const fwd   = new THREE.Vector3(-Math.sin(this.euler.y), 0, -Math.cos(this.euler.y));
    const right = new THREE.Vector3( Math.cos(this.euler.y), 0, -Math.sin(this.euler.y));

    const moveDir = new THREE.Vector3();
    if (this.moveForward)  moveDir.addScaledVector(fwd,    1);
    if (this.moveBackward) moveDir.addScaledVector(fwd,   -1);
    if (this.moveRight)    moveDir.addScaledVector(right,  1);
    if (this.moveLeft)     moveDir.addScaledVector(right, -1);

    const hasInput = moveDir.lengthSq() > 0.001;
    if (hasInput) moveDir.normalize();

    const topSpeed = this.BASE_SPEED * this.speedMultiplier;
    const rate = hasInput ? this.ACCEL : this.DECEL;
    const blend = Math.min(1, rate * dt);

    this.velocity.x += (moveDir.x * topSpeed - this.velocity.x) * blend;
    this.velocity.z += (moveDir.z * topSpeed - this.velocity.z) * blend;

    this.velocity.y += this.GRAVITY * dt;
    if (this.velocity.y < this.TERMINAL_VEL) this.velocity.y = this.TERMINAL_VEL;

    this.camera.position.x += this.velocity.x * dt;
    this.camera.position.z += this.velocity.z * dt;
    this.camera.position.y += this.velocity.y * dt;

    const groundY = getTerrainHeight(this.camera.position.x, this.camera.position.z) + this.PLAYER_HEIGHT;
    if (this.camera.position.y < groundY) {
      this.velocity.y = 0;
      this.camera.position.y = groundY;
      this.canJump = true;
    }
  }

  spawnAboveTerrain(getTerrainHeight: (x: number, z: number) => number) {
    const h = getTerrainHeight(this.camera.position.x, this.camera.position.z);
    this.camera.position.y = Math.max(h + this.PLAYER_HEIGHT + 1, h + this.PLAYER_HEIGHT + 1);
    this.velocity.set(0, 0, 0);
  }

  getState(): PlayerState {
    const moving = this.moveForward || this.moveBackward || this.moveLeft || this.moveRight;
    return {
      id: this.id,
      position: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      rotation: { x: this.euler.x, y: this.euler.y },
      animState: moving ? 'walk' : 'idle',
    };
  }

  isLocked(): boolean { return this.isPointerLocked; }

  private onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
