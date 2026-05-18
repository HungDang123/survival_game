/**
 * PropsSystem — Instanced trees and rocks.
 *
 * Trees: CylinderGeometry trunk + cluster of SphereGeometry canopy puffs.
 *   Wind shader sways canopy tips, trunk stays fixed.
 *   Spawn biome: height 2–12, slope < 0.5.
 *
 * Rocks: IcosahedronGeometry in 3 size tiers.
 *   Spawn preference: slope > 0.35 (cliff faces get rocky).
 *
 * Both use InstancedMesh + Matrix4 per instance. Updated lazily every ~0.8s.
 */

import * as THREE from 'three';

// ── Constants ────────────────────────────────────────────────────────────────

const TREE_RANGE       = 55;
const TREE_STEP        = 3.8;       // approx 1 tree per (step²) m²
const MAX_TREES        = 700;
const TREE_MIN_H       = 2.0;
const TREE_MAX_H       = 11.5;
const TREE_MAX_SLOPE   = 0.55;

const ROCK_RANGE       = 50;
const ROCK_STEP        = 5.5;
const MAX_ROCKS        = 350;
const ROCK_MIN_SLOPE   = 0.25;     // rocks appear on slopes

const UPDATE_INTERVAL  = 0.7;      // seconds between repopulate

// ── Canopy wind shader ───────────────────────────────────────────────────────

const canopyVertex = /* glsl */`
  uniform float uTime;
  varying vec3  vNormal;
  varying vec3  vViewDir;

  void main() {
    vNormal  = normalMatrix * normal;

    // Gentle sway — amplitude driven by height in object space
    float tipFactor = (position.y + 1.0) * 0.5;   // 0 at base, 1 at top
    float sway = sin(uTime * 1.4 + position.x * 0.5) * 0.08 * tipFactor
               + cos(uTime * 0.9 + position.z * 0.4) * 0.05 * tipFactor;

    vec3 pos = position;
    pos.x += sway;
    pos.z += sway * 0.6;

    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const canopyFragment = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vViewDir;

  // Two shades of foliage — vary by normal direction for depth
  const vec3 lightGreen = vec3(0.30, 0.58, 0.14);
  const vec3 darkGreen  = vec3(0.17, 0.35, 0.08);

  void main() {
    vec3 N = normalize(vNormal);
    float upFactor = max(0.0, N.y);
    vec3 col = mix(darkGreen, lightGreen, upFactor * 0.8 + 0.2);
    // Soft ambient occlusion tint on underside
    col *= 0.75 + upFactor * 0.25;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ────────────────────────────────────────────────────────────────────────────

export class PropsSystem {
  // Tree meshes
  private trunkMesh: THREE.InstancedMesh;
  private canopyMesh: THREE.InstancedMesh;
  private canopyMat: THREE.ShaderMaterial;

  // Rock meshes (3 size tiers)
  private rockMeshes: THREE.InstancedMesh[];

  private updateTimer = 0;
  private scene: THREE.Scene;

  // Reusable matrix/color objects
  private readonly _mat  = new THREE.Matrix4();
  private readonly _pos  = new THREE.Vector3();
  private readonly _quat = new THREE.Quaternion();
  private readonly _scl  = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // ── Trunk ──────────────────────────────────────────────────────────────
    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 2.4, 6);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x5a3a1a, roughness: 0.92, metalness: 0.0,
    });
    this.trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, MAX_TREES);
    this.trunkMesh.castShadow    = true;
    this.trunkMesh.receiveShadow = true;
    this.trunkMesh.frustumCulled = false;

    // ── Canopy ─────────────────────────────────────────────────────────────
    // Slightly imperfect sphere → organic look
    const canopyGeo = new THREE.SphereGeometry(1.35, 7, 5);
    this.canopyMat = new THREE.ShaderMaterial({
      vertexShader:   canopyVertex,
      fragmentShader: canopyFragment,
      uniforms: { uTime: { value: 0 } },
      side: THREE.FrontSide,
    });
    this.canopyMesh = new THREE.InstancedMesh(canopyGeo, this.canopyMat, MAX_TREES);
    this.canopyMesh.castShadow    = true;
    this.canopyMesh.receiveShadow = false;
    this.canopyMesh.frustumCulled = false;

    // ── Rocks (3 tiers) ────────────────────────────────────────────────────
    const rockSizes = [0.28, 0.55, 0.95];
    const rockMat   = new THREE.MeshStandardMaterial({
      color: 0x7a7570, roughness: 0.93, metalness: 0.0,
    });
    this.rockMeshes = rockSizes.map((r) => {
      const geo  = new THREE.IcosahedronGeometry(r, 1);
      const mesh = new THREE.InstancedMesh(geo, rockMat, MAX_ROCKS);
      mesh.castShadow    = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      return mesh;
    });

    scene.add(this.trunkMesh, this.canopyMesh, ...this.rockMeshes);
    // Hide all instances initially
    this.clearAll();
  }

  private clearAll() {
    const hidden = this._mat.makeTranslation(0, -9999, 0);
    for (let i = 0; i < MAX_TREES; i++) {
      this.trunkMesh.setMatrixAt(i, hidden);
      this.canopyMesh.setMatrixAt(i, hidden);
    }
    for (const rm of this.rockMeshes) {
      for (let i = 0; i < MAX_ROCKS; i++) rm.setMatrixAt(i, hidden);
    }
  }

  update(
    delta: number,
    px: number,
    pz: number,
    getHeight: (x: number, z: number) => number,
    getSlope:  (x: number, z: number) => number,
  ) {
    this.canopyMat.uniforms.uTime.value += delta;

    this.updateTimer += delta;
    if (this.updateTimer < UPDATE_INTERVAL) return;
    this.updateTimer = 0;

    this.repopulate(px, pz, getHeight, getSlope);
  }

  private repopulate(
    px: number,
    pz: number,
    getHeight: (x: number, z: number) => number,
    getSlope:  (x: number, z: number) => number,
  ) {
    let tIdx = 0;
    let rIdx = [0, 0, 0];
    const hidden = this._mat.makeTranslation(0, -9999, 0);
    const rng = (seed: number) => {
      // Deterministic pseudo-random from world position
      const s = Math.sin(seed * 127.1 + seed * 311.7) * 43758.5;
      return s - Math.floor(s);
    };

    // ── Trees ───────────────────────────────────────────────────────────────
    for (let dx = -TREE_RANGE; dx < TREE_RANGE && tIdx < MAX_TREES; dx += TREE_STEP) {
      for (let dz = -TREE_RANGE; dz < TREE_RANGE && tIdx < MAX_TREES; dz += TREE_STEP) {
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > TREE_RANGE) continue;

        // Jitter within cell
        const seed = Math.floor((px + dx) * 73.1 + (pz + dz) * 31.7);
        const jx   = (rng(seed)       - 0.5) * TREE_STEP * 0.9;
        const jz   = (rng(seed + 1.0) - 0.5) * TREE_STEP * 0.9;
        const wx   = px + dx + jx;
        const wz   = pz + dz + jz;

        const h     = getHeight(wx, wz);
        const slope = getSlope(wx, wz);
        if (h < TREE_MIN_H || h > TREE_MAX_H) continue;
        if (slope > TREE_MAX_SLOPE) continue;

        const scale  = 0.75 + rng(seed + 2) * 0.55;
        const rotY   = rng(seed + 3) * Math.PI * 2;

        // Trunk matrix
        this._pos.set(wx, h + 1.2 * scale, wz);
        this._quat.setFromEuler(new THREE.Euler(0, rotY, 0));
        this._scl.set(scale, scale, scale);
        this.trunkMesh.setMatrixAt(tIdx, this._mat.compose(this._pos, this._quat, this._scl));

        // Canopy matrix — raised above trunk top
        this._pos.set(wx, h + 2.8 * scale, wz);
        this.canopyMesh.setMatrixAt(tIdx, this._mat.compose(this._pos, this._quat, this._scl));

        tIdx++;
      }
    }

    // ── Rocks ───────────────────────────────────────────────────────────────
    for (let dx = -ROCK_RANGE; dx < ROCK_RANGE; dx += ROCK_STEP) {
      for (let dz = -ROCK_RANGE; dz < ROCK_RANGE; dz += ROCK_STEP) {
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > ROCK_RANGE) continue;

        const seed  = Math.floor((px + dx) * 61.3 + (pz + dz) * 43.1);
        const jx    = (rng(seed)       - 0.5) * ROCK_STEP * 0.8;
        const jz    = (rng(seed + 1.0) - 0.5) * ROCK_STEP * 0.8;
        const wx    = px + dx + jx;
        const wz    = pz + dz + jz;
        const h     = getHeight(wx, wz);
        const slope = getSlope(wx, wz);

        // Rocks prefer slopes but can appear on flat ground too
        const spawnChance = slope > ROCK_MIN_SLOPE ? 0.7 : 0.15;
        if (rng(seed + 5) > spawnChance) continue;

        // Tier by size based on slope — steeper = larger boulders
        const tier = slope > 0.6 ? 2 : slope > 0.35 ? 1 : 0;
        if (rIdx[tier] >= MAX_ROCKS) continue;

        const scale = 0.55 + rng(seed + 6) * 0.9;
        const rotY  = rng(seed + 7) * Math.PI * 2;
        const rotX  = (rng(seed + 8) - 0.5) * 0.6;   // slight random tilt

        this._pos.set(wx, h + (tier === 0 ? 0.1 : tier === 1 ? 0.2 : 0.35) * scale, wz);
        this._quat.setFromEuler(new THREE.Euler(rotX, rotY, 0));
        this._scl.setScalar(scale);
        this.rockMeshes[tier].setMatrixAt(rIdx[tier], this._mat.compose(this._pos, this._quat, this._scl));
        rIdx[tier]++;
      }
    }

    // ── Fill unused slots off-screen, update GPU buffers ───────────────────
    for (let i = tIdx; i < MAX_TREES; i++) {
      this.trunkMesh.setMatrixAt(i, hidden);
      this.canopyMesh.setMatrixAt(i, hidden);
    }
    for (let t = 0; t < 3; t++) {
      for (let i = rIdx[t]; i < MAX_ROCKS; i++) this.rockMeshes[t].setMatrixAt(i, hidden);
      this.rockMeshes[t].instanceMatrix.needsUpdate = true;
      this.rockMeshes[t].count = rIdx[t];
    }
    this.trunkMesh.instanceMatrix.needsUpdate = true;
    this.canopyMesh.instanceMatrix.needsUpdate = true;
    this.trunkMesh.count  = tIdx;
    this.canopyMesh.count = tIdx;
  }

  dispose() {
    this.scene.remove(this.trunkMesh, this.canopyMesh, ...this.rockMeshes);
    this.trunkMesh.geometry.dispose();
    this.canopyMesh.geometry.dispose();
    this.canopyMat.dispose();
    for (const rm of this.rockMeshes) {
      rm.geometry.dispose();
      (rm.material as THREE.Material).dispose();
    }
  }
}
