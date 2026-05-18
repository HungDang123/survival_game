/**
 * UnderwaterFlora — Seaweed + Coral instanced meshes.
 *
 * Seaweed: tall thin quads with flowing vertex shader. Spawn in ocean/reef zones (h -8 to -2).
 * Coral: rounded clusters, colourful emissive materials. Spawn in reef zones (h -4 to -1).
 *
 * Both only visible when underwater and nearby. Repopulate every 1.2s following player.
 */

import * as THREE from 'three';

// ── Constants ────────────────────────────────────────────────────────────────

const SEAWEED_COUNT   = 400;
const CORAL_COUNT     = 180;
const FLORA_RANGE     = 30;
const FLORA_STEP      = 2.2;
const UPDATE_INTERVAL = 1.0;

const SEAWEED_MIN_H  = -14;
const SEAWEED_MAX_H  = -1.5;
const CORAL_MIN_H    = -5;
const CORAL_MAX_H    = -1;

// ── Seaweed shader ───────────────────────────────────────────────────────────

const seaweedVertex = /* glsl */`
  attribute vec3  aOrigin;
  attribute float aScale;
  uniform float   uTime;
  varying vec2    vUv;
  varying float   vDepth;

  void main() {
    vUv = uv;
    vec3 pos = position;
    pos.x *= aScale;
    pos.y *= aScale;

    // Sway — tip bends more, base fixed (pivot at y=0)
    float tip   = uv.y;
    float wave  = sin(uTime * 1.2 + aOrigin.x * 0.6) * 0.18 * tip * tip;
    float wave2 = cos(uTime * 0.9 + aOrigin.z * 0.5) * 0.10 * tip;
    pos.x += wave;
    pos.z += wave2;

    // Random facing per blade
    float angle = aOrigin.x * 27.3 + aOrigin.z * 13.7;
    float ca = cos(angle), sa = sin(angle);
    pos = vec3(pos.x*ca - pos.z*sa, pos.y, pos.x*sa + pos.z*ca);

    vec3 world = pos + aOrigin;
    vDepth = clamp(-world.y / 12.0, 0.0, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  }
`;

const seaweedFragment = /* glsl */`
  varying vec2  vUv;
  varying float vDepth;

  void main() {
    // Discard edges for natural blade shape
    float edge = abs(vUv.x - 0.5) * 2.0;
    if (edge > (1.0 - vUv.y * 0.6)) discard;

    vec3 shallowCol = vec3(0.15, 0.62, 0.22);
    vec3 deepCol    = vec3(0.06, 0.30, 0.18);
    vec3 col        = mix(shallowCol, deepCol, vDepth);
    // Slight tip fade to simulate light
    col *= 0.7 + vUv.y * 0.3;

    gl_FragColor = vec4(col, 0.9);
  }
`;

// ────────────────────────────────────────────────────────────────────────────

export class UnderwaterFlora {
  private seaweedMesh!: THREE.Mesh;
  private seaweedMat!:  THREE.ShaderMaterial;
  private coralMesh!:   THREE.InstancedMesh;

  private seaweedOriginAttr!: THREE.BufferAttribute;
  private seaweedScaleAttr!:  THREE.BufferAttribute;

  private updateTimer = 0;
  private scene: THREE.Scene;

  // Reusable matrix objects
  private readonly _m   = new THREE.Matrix4();
  private readonly _pos = new THREE.Vector3();
  private readonly _q   = new THREE.Quaternion();
  private readonly _s   = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.seaweedMesh = this.buildSeaweed();
    this.coralMesh   = this.buildCoral();
    scene.add(this.seaweedMesh, this.coralMesh);
  }

  private buildSeaweed(): THREE.Mesh {
    // Single blade: 6 verts replicated for SEAWEED_COUNT blades
    const hw   = 0.12;
    const bh   = 1.2;
    const BLADE_POS = [-hw,0,0, hw,0,0, 0,bh,0, -hw,0,0, 0,bh,0, hw,0,0];
    const BLADE_UV  = [0,0, 1,0, 0.5,1, 0,0, 0.5,1, 1,0];

    const N    = SEAWEED_COUNT;
    const vCnt = N * 6;
    const posArr  = new Float32Array(vCnt * 3);
    const uvArr   = new Float32Array(vCnt * 2);
    const origArr = new Float32Array(vCnt * 3);
    const scaArr  = new Float32Array(vCnt);

    for (let i = 0; i < N; i++) {
      for (let v = 0; v < 6; v++) {
        const vi = i * 6 + v;
        posArr[vi*3]   = BLADE_POS[v*3];
        posArr[vi*3+1] = BLADE_POS[v*3+1];
        posArr[vi*3+2] = BLADE_POS[v*3+2];
        uvArr[vi*2]    = BLADE_UV[v*2];
        uvArr[vi*2+1]  = BLADE_UV[v*2+1];
        origArr[vi*3+1] = -9999; // hidden initially
        scaArr[vi]      = 0;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute('uv',       new THREE.BufferAttribute(uvArr,  2));

    this.seaweedOriginAttr = new THREE.BufferAttribute(origArr, 3);
    this.seaweedScaleAttr  = new THREE.BufferAttribute(scaArr,  1);
    this.seaweedOriginAttr.setUsage(THREE.DynamicDrawUsage);
    this.seaweedScaleAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aOrigin', this.seaweedOriginAttr);
    geo.setAttribute('aScale',  this.seaweedScaleAttr);

    this.seaweedMat = new THREE.ShaderMaterial({
      vertexShader:   seaweedVertex,
      fragmentShader: seaweedFragment,
      uniforms: { uTime: { value: 0 } },
      side:        THREE.DoubleSide,
      transparent: true,
      depthWrite:  false,
    });

    const mesh = new THREE.Mesh(geo, this.seaweedMat);
    mesh.frustumCulled = false;
    return mesh;
  }

  private buildCoral(): THREE.InstancedMesh {
    const geo = new THREE.IcosahedronGeometry(0.35, 1);
    // Warm emissive coral material
    const mat = new THREE.MeshStandardMaterial({
      color:            0xff6680,
      emissive:         0xff3355,
      emissiveIntensity: 0.3,
      roughness:        0.6,
      metalness:        0.0,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, CORAL_COUNT);
    mesh.castShadow    = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    // Hide all initially
    for (let i = 0; i < CORAL_COUNT; i++) {
      mesh.setMatrixAt(i, this._m.makeTranslation(0, -9999, 0));
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  update(
    delta: number,
    px: number,
    pz: number,
    getHeight:   (x: number, z: number) => number,
    getBiome:    (x: number, z: number) => string,
  ) {
    this.seaweedMat.uniforms.uTime.value += delta;
    this.updateTimer += delta;
    if (this.updateTimer < UPDATE_INTERVAL) return;
    this.updateTimer = 0;
    this.repopulate(px, pz, getHeight, getBiome);
  }

  private repopulate(
    px: number,
    pz: number,
    getHeight: (x: number, z: number) => number,
    getBiome:  (x: number, z: number) => string,
  ) {
    const orig  = this.seaweedOriginAttr.array as Float32Array;
    const scale = this.seaweedScaleAttr.array  as Float32Array;
    const hidden = this._m.makeTranslation(0, -9999, 0);

    const rng = (s: number) => {
      const x = Math.sin(s * 127.1 + 311.7) * 43758.5;
      return x - Math.floor(x);
    };

    let sIdx = 0;
    let cIdx = 0;

    for (let dx = -FLORA_RANGE; dx < FLORA_RANGE && (sIdx < SEAWEED_COUNT || cIdx < CORAL_COUNT); dx += FLORA_STEP) {
      for (let dz = -FLORA_RANGE; dz < FLORA_RANGE && (sIdx < SEAWEED_COUNT || cIdx < CORAL_COUNT); dz += FLORA_STEP) {
        if (Math.sqrt(dx * dx + dz * dz) > FLORA_RANGE) continue;
        const seed = Math.floor((px + dx) * 73.1 + (pz + dz) * 31.7);
        const wx   = px + dx + (rng(seed) - 0.5) * FLORA_STEP * 0.85;
        const wz   = pz + dz + (rng(seed + 1) - 0.5) * FLORA_STEP * 0.85;
        const h    = getHeight(wx, wz);
        const biome = getBiome(wx, wz);

        const inOcean = biome === 'deep_ocean' || biome === 'ocean' || biome === 'reef';
        if (!inOcean) continue;

        // ── Seaweed ────────────────────────────────────────────────────────
        if (sIdx < SEAWEED_COUNT && h >= SEAWEED_MIN_H && h <= SEAWEED_MAX_H) {
          if (rng(seed + 2) > 0.45) {
            const s = 0.7 + rng(seed + 3) * 0.8;
            for (let v = 0; v < 6; v++) {
              const vi = (sIdx * 6 + v);
              orig[vi*3]   = wx;
              orig[vi*3+1] = h;
              orig[vi*3+2] = wz;
              scale[vi]    = s;
            }
            sIdx++;
          }
        }

        // ── Coral ──────────────────────────────────────────────────────────
        if (cIdx < CORAL_COUNT && h >= CORAL_MIN_H && h <= CORAL_MAX_H && biome === 'reef') {
          if (rng(seed + 4) > 0.55) {
            const cs = 0.4 + rng(seed + 5) * 0.7;
            const ry = rng(seed + 6) * Math.PI * 2;
            this._pos.set(wx, h + cs * 0.35, wz);
            this._q.setFromEuler(new THREE.Euler(0, ry, 0));
            this._s.setScalar(cs);
            this.coralMesh.setMatrixAt(cIdx, this._m.compose(this._pos, this._q, this._s));
            cIdx++;
          }
        }
      }
    }

    // Hide unused
    for (let i = sIdx; i < SEAWEED_COUNT; i++) {
      for (let v = 0; v < 6; v++) { orig[(i*6+v)*3+1] = -9999; scale[i*6+v] = 0; }
    }
    for (let i = cIdx; i < CORAL_COUNT; i++) this.coralMesh.setMatrixAt(i, hidden);

    this.seaweedOriginAttr.needsUpdate    = true;
    this.seaweedScaleAttr.needsUpdate     = true;
    this.seaweedMesh.geometry.setDrawRange(0, sIdx * 6);
    this.coralMesh.instanceMatrix.needsUpdate = true;
    this.coralMesh.count = cIdx;
  }

  dispose() {
    this.scene.remove(this.seaweedMesh, this.coralMesh);
    this.seaweedMesh.geometry.dispose();
    this.seaweedMat.dispose();
    this.coralMesh.geometry.dispose();
    (this.coralMesh.material as THREE.Material).dispose();
  }
}
