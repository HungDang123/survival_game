import * as THREE from 'three';
import type { PlayerState } from './LocalPlayer';

const SKIN   = new THREE.MeshLambertMaterial({ color: 0xffc87a });
const HAIR   = new THREE.MeshLambertMaterial({ color: 0x2a1a08 });
const SHIRT  = new THREE.MeshLambertMaterial({ color: 0x2a5fa8 });
const ARMOR  = new THREE.MeshLambertMaterial({ color: 0x6a7e8e });
const PANTS  = new THREE.MeshLambertMaterial({ color: 0x2c3a52 });
const BOOTS  = new THREE.MeshLambertMaterial({ color: 0x1a0e06 });
const EYE    = new THREE.MeshLambertMaterial({ color: 0x111111 });
const BELT   = new THREE.MeshLambertMaterial({ color: 0x1a1208 });

function box(w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  return m;
}

export class RemotePlayer {
  readonly id: string;
  readonly mesh: THREE.Group;

  private leftArm!: THREE.Group;
  private rightArm!: THREE.Group;
  private leftLeg!: THREE.Group;
  private rightLeg!: THREE.Group;
  private head!: THREE.Group;

  private targetPosition = new THREE.Vector3();
  private targetRotationY = 0;
  private walkCycle = 0;
  private animState: PlayerState['animState'] = 'idle';
  private nameLabel: HTMLDivElement;

  constructor(id: string, scene: THREE.Scene) {
    this.id = id;
    this.mesh = this.buildMesh();
    scene.add(this.mesh);
    this.nameLabel = this.createNameLabel(id);
    document.getElementById('hud')?.appendChild(this.nameLabel);
  }

  private buildMesh(): THREE.Group {
    const root = new THREE.Group();

    /* HEAD GROUP */
    this.head = new THREE.Group();
    this.head.position.set(0, 1.56, 0);

    const skull = box(0.44, 0.44, 0.44, SKIN);
    const eyeL  = box(0.10, 0.08, 0.02, EYE);
    eyeL.position.set( 0.11, 0.04, 0.23);
    const eyeR  = box(0.10, 0.08, 0.02, EYE);
    eyeR.position.set(-0.11, 0.04, 0.23);
    const hair  = box(0.46, 0.14, 0.46, HAIR);
    hair.position.set(0, 0.26, -0.01);
    const hairSide = box(0.46, 0.28, 0.06, HAIR);
    hairSide.position.set(0, 0.04, -0.25);

    this.head.add(skull, eyeL, eyeR, hair, hairSide);
    root.add(this.head);

    /* TORSO */
    const torso = box(0.56, 0.70, 0.28, SHIRT);
    torso.position.set(0, 1.13, 0);

    const armorChest = box(0.54, 0.38, 0.06, ARMOR);
    armorChest.position.set(0, 1.20, 0.17);

    const armorShoulder = box(0.18, 0.12, 0.08, ARMOR);
    armorShoulder.position.set( 0.37, 1.44, 0);
    const armorShoulder2 = armorShoulder.clone();
    armorShoulder2.position.set(-0.37, 1.44, 0);

    const belt = box(0.58, 0.08, 0.32, BELT);
    belt.position.set(0, 0.79, 0);

    root.add(torso, armorChest, armorShoulder, armorShoulder2, belt);

    /* LEFT ARM */
    this.leftArm = new THREE.Group();
    this.leftArm.position.set(0.40, 1.44, 0);
    const lArmUpper = box(0.20, 0.34, 0.20, SHIRT);
    lArmUpper.position.set(0, -0.17, 0);
    const lArmLower = box(0.18, 0.32, 0.18, SKIN);
    lArmLower.position.set(0, -0.49, 0);
    const lHand = box(0.20, 0.12, 0.22, SKIN);
    lHand.position.set(0, -0.69, 0);
    this.leftArm.add(lArmUpper, lArmLower, lHand);
    root.add(this.leftArm);

    /* RIGHT ARM */
    this.rightArm = new THREE.Group();
    this.rightArm.position.set(-0.40, 1.44, 0);
    const rArmUpper = lArmUpper.clone();
    const rArmLower = lArmLower.clone();
    const rHand     = lHand.clone();
    this.rightArm.add(rArmUpper, rArmLower, rHand);
    root.add(this.rightArm);

    /* LEFT LEG */
    this.leftLeg = new THREE.Group();
    this.leftLeg.position.set(0.14, 0.78, 0);
    const lLegUpper = box(0.22, 0.38, 0.22, PANTS);
    lLegUpper.position.set(0, -0.19, 0);
    const lLegLower = box(0.20, 0.36, 0.20, PANTS);
    lLegLower.position.set(0, -0.55, 0);
    const lBoot = box(0.24, 0.14, 0.30, BOOTS);
    lBoot.position.set(0, -0.78, 0.03);
    this.leftLeg.add(lLegUpper, lLegLower, lBoot);
    root.add(this.leftLeg);

    /* RIGHT LEG */
    this.rightLeg = new THREE.Group();
    this.rightLeg.position.set(-0.14, 0.78, 0);
    const rLegUpper = lLegUpper.clone();
    const rLegLower = lLegLower.clone();
    const rBoot     = lBoot.clone();
    this.rightLeg.add(rLegUpper, rLegLower, rBoot);
    root.add(this.rightLeg);

    return root;
  }

  private createNameLabel(id: string): HTMLDivElement {
    const div = document.createElement('div');
    div.className = 'player-label';
    div.style.cssText = `
      position: absolute; pointer-events: none; display: none;
      transform: translateX(-50%);
      font-family: 'Orbitron', monospace; font-size: 10px;
      color: rgba(255,255,255,0.9);
      background: rgba(10,15,30,0.75);
      border: 1px solid rgba(68,170,255,0.3);
      padding: 3px 10px; border-radius: 100px;
      white-space: nowrap;
      backdrop-filter: blur(6px);
    `;
    div.textContent = id.slice(0, 8).toUpperCase();
    return div;
  }

  updateState(state: PlayerState) {
    this.targetPosition.set(
      state.position.x,
      state.position.y - 1.82,
      state.position.z
    );
    this.targetRotationY = state.rotation.y;
    this.animState = state.animState;
  }

  update(delta: number, camera: THREE.Camera, _renderer: THREE.WebGLRenderer) {
    this.mesh.position.lerp(this.targetPosition, Math.min(1, delta * 18));
    this.mesh.rotation.y +=
      (this.targetRotationY - this.mesh.rotation.y) * Math.min(1, delta * 18);

    const isMoving = this.animState === 'walk' || this.animState === 'run';
    const speed = this.animState === 'run' ? 9 : 5.5;
    if (isMoving) this.walkCycle += delta * speed;

    const swing = isMoving ? Math.sin(this.walkCycle) * 0.55 : 0;
    const armRest = 0.15;

    this.leftArm.rotation.x  +=  (swing + armRest - this.leftArm.rotation.x)  * 0.3;
    this.rightArm.rotation.x += (-swing + armRest - this.rightArm.rotation.x) * 0.3;
    this.leftLeg.rotation.x  += (-swing - this.leftLeg.rotation.x)  * 0.3;
    this.rightLeg.rotation.x +=  (swing - this.rightLeg.rotation.x) * 0.3;

    const bobY = isMoving ? Math.abs(Math.sin(this.walkCycle)) * 0.04 : 0;
    this.head.position.y = 1.56 + bobY;

    const headTarget = isMoving ? Math.sin(this.walkCycle * 0.5) * 0.04 : 0;
    this.head.rotation.z += (headTarget - this.head.rotation.z) * 0.2;

    const screenPos = new THREE.Vector3(
      this.mesh.position.x,
      this.mesh.position.y + 2.1,
      this.mesh.position.z
    ).project(camera);

    if (screenPos.z < 1 && screenPos.z > -1) {
      const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
      const y = (1 - (screenPos.y * 0.5 + 0.5)) * window.innerHeight;
      this.nameLabel.style.display = 'block';
      this.nameLabel.style.left = `${x}px`;
      this.nameLabel.style.top = `${y}px`;
    } else {
      this.nameLabel.style.display = 'none';
    }
  }

  setSpeaking(speaking: boolean) {
    this.nameLabel.style.borderColor = speaking
      ? 'rgba(68,220,68,0.7)'
      : 'rgba(68,170,255,0.3)';
    this.nameLabel.style.boxShadow = speaking
      ? '0 0 8px rgba(68,220,68,0.4)'
      : '';
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.mesh);
    this.nameLabel.remove();
  }
}
