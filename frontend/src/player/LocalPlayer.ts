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
  private direction = new THREE.Vector3();
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');

  private moveForward = false;
  private moveBackward = false;
  private moveLeft = false;
  private moveRight = false;
  private canJump = false;
  private isPointerLocked = false;

  private speed = 15;
  private jumpSpeed = 10;
  private gravity = -28;
  private playerHeight = 1.8;
  private terminalVelocity = -40;

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
      const sens = 0.002;
      this.euler.setFromQuaternion(this.camera.quaternion);
      this.euler.y -= e.movementX * sens;
      this.euler.x -= e.movementY * sens;
      this.euler.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.euler.x));
      this.camera.quaternion.setFromEuler(this.euler);
    });
  }

  private setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': this.moveForward = true; break;
        case 'KeyS': case 'ArrowDown': this.moveBackward = true; break;
        case 'KeyA': case 'ArrowLeft': this.moveLeft = true; break;
        case 'KeyD': case 'ArrowRight': this.moveRight = true; break;
        case 'Space':
          if (this.canJump) {
            this.velocity.y = this.jumpSpeed;
            this.canJump = false;
          }
          break;
      }
    });

    document.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': this.moveForward = false; break;
        case 'KeyS': case 'ArrowDown': this.moveBackward = false; break;
        case 'KeyA': case 'ArrowLeft': this.moveLeft = false; break;
        case 'KeyD': case 'ArrowRight': this.moveRight = false; break;
      }
    });
  }

  update(delta: number, getTerrainHeight: (x: number, z: number) => number) {
    const dt = Math.min(delta, 0.05);

    this.velocity.x -= this.velocity.x * 10 * dt;
    this.velocity.z -= this.velocity.z * 10 * dt;
    this.velocity.y += this.gravity * dt;
    this.velocity.y = Math.max(this.terminalVelocity, this.velocity.y);

    this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
    this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
    this.direction.normalize();

    if (this.moveForward || this.moveBackward) this.velocity.z -= this.direction.z * this.speed * dt * 10;
    if (this.moveLeft || this.moveRight) this.velocity.x -= this.direction.x * this.speed * dt * 10;

    const forward = new THREE.Vector3(-Math.sin(this.euler.y), 0, -Math.cos(this.euler.y));
    const right   = new THREE.Vector3( Math.cos(this.euler.y), 0, -Math.sin(this.euler.y));

    this.camera.position.addScaledVector(forward, -this.velocity.z * dt);
    this.camera.position.addScaledVector(right,   -this.velocity.x * dt);
    this.camera.position.y += this.velocity.y * dt;

    const gx = this.camera.position.x;
    const gz = this.camera.position.z;
    const groundY = getTerrainHeight(gx, gz) + this.playerHeight;

    if (this.camera.position.y < groundY) {
      this.velocity.y = 0;
      this.camera.position.y = groundY;
      this.canJump = true;
    }

    if (this.camera.position.y < groundY - 0.1) {
      this.camera.position.y = groundY;
    }
  }

  spawnAboveTerrain(getTerrainHeight: (x: number, z: number) => number) {
    const h = getTerrainHeight(this.camera.position.x, this.camera.position.z);
    this.camera.position.y = Math.max(this.camera.position.y, h + this.playerHeight + 1);
    this.velocity.set(0, 0, 0);
  }

  getState(): PlayerState {
    const moving = this.moveForward || this.moveBackward || this.moveLeft || this.moveRight;
    return {
      id: this.id,
      position: {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z,
      },
      rotation: {
        x: this.euler.x,
        y: this.euler.y,
      },
      animState: moving ? 'walk' : 'idle',
    };
  }

  isLocked(): boolean {
    return this.isPointerLocked;
  }

  private onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
