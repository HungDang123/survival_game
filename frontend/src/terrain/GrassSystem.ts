import * as THREE from 'three';

const GRASS_RANGE   = 32;
const GRASS_DENSITY = 5;       // blades per unit² within range
const BLADE_WIDTH   = 0.1;
const BLADE_HEIGHT  = 0.55;
const GRASS_MIN_H   = 1.5;
const GRASS_MAX_H   = 11.0;
const MAX_BLADES    = 10000;

// Per-blade geometry template (6 verts = 2 triangles, pivot at base)
const hw = BLADE_WIDTH / 2;
const bh = BLADE_HEIGHT;
const BLADE_POS = new Float32Array([
  -hw, 0, 0,   hw, 0, 0,   0, bh, 0,
  -hw, 0, 0,    0, bh, 0,  hw, 0, 0,
]);
const BLADE_UV = new Float32Array([
  0, 0,  1, 0,  0.5, 1,
  0, 0,  0.5, 1,  1, 0,
]);

const vertexShader = /* glsl */`
  attribute vec3  aOrigin;
  attribute float aScale;
  uniform   float uTime;
  varying   vec2  vUv;

  void main() {
    vUv = uv;

    vec3 pos = position;
    pos.x *= aScale;
    pos.y *= aScale;

    // Wind — tip bends, base stays fixed
    float tip = uv.y * uv.y;
    float windX = sin(aOrigin.x * 0.5  + uTime * 2.1  + aOrigin.z * 0.30) * 0.16;
    float windZ = cos(aOrigin.x * 0.42 + uTime * 1.75 + aOrigin.z * 0.25) * 0.09;
    pos.x += windX * tip;
    pos.z += windZ * tip;

    // Random facing per blade
    float angle = aOrigin.x * 27.3 + aOrigin.z * 13.7;
    float ca = cos(angle), sa = sin(angle);
    pos = vec3(pos.x * ca - pos.z * sa, pos.y, pos.x * sa + pos.z * ca);

    vec3 world = pos + aOrigin;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  }
`;

const fragmentShader = /* glsl */`
  varying vec2 vUv;

  void main() {
    // Taper: discard wide edges near the tip
    float edge = abs(vUv.x - 0.5) * 2.0;
    if (edge > (1.0 - vUv.y * 0.75)) discard;

    vec3 base = vec3(0.18, 0.38, 0.08);
    vec3 tip  = vec3(0.42, 0.72, 0.18);
    gl_FragColor = vec4(mix(base, tip, vUv.y), 1.0);
  }
`;

export class GrassSystem {
  private mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private originAttr: THREE.BufferAttribute;
  private scaleAttr:  THREE.BufferAttribute;
  private updateTimer = 0;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { uTime: { value: 0 } },
      side: THREE.DoubleSide,
      alphaTest: 0.1,
    });

    // Pre-replicate blade geometry for MAX_BLADES instances
    const VERTS = MAX_BLADES * 6;
    const posArr = new Float32Array(VERTS * 3);
    const uvArr  = new Float32Array(VERTS * 2);
    const origArr= new Float32Array(VERTS * 3);
    const scaArr = new Float32Array(VERTS);

    // Fill static blade template for every blade slot
    for (let i = 0; i < MAX_BLADES; i++) {
      for (let v = 0; v < 6; v++) {
        const vi = i * 6 + v;
        posArr[vi * 3 + 0] = BLADE_POS[v * 3 + 0];
        posArr[vi * 3 + 1] = BLADE_POS[v * 3 + 1];
        posArr[vi * 3 + 2] = BLADE_POS[v * 3 + 2];
        uvArr[vi  * 2 + 0] = BLADE_UV[v * 2 + 0];
        uvArr[vi  * 2 + 1] = BLADE_UV[v * 2 + 1];
        // origin and scale start hidden far below
        origArr[vi * 3 + 1] = -9999;
        scaArr[vi] = 0;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute('uv',       new THREE.BufferAttribute(uvArr,  2));

    this.originAttr = new THREE.BufferAttribute(origArr, 3);
    this.scaleAttr  = new THREE.BufferAttribute(scaArr,  1);
    this.originAttr.setUsage(THREE.DynamicDrawUsage);
    this.scaleAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aOrigin', this.originAttr);
    geo.setAttribute('aScale',  this.scaleAttr);

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(
    delta: number,
    playerX: number,
    playerZ: number,
    getHeight: (x: number, z: number) => number,
  ) {
    this.material.uniforms.uTime.value += delta;

    this.updateTimer += delta;
    if (this.updateTimer < 0.45) return;
    this.updateTimer = 0;

    this.repopulate(playerX, playerZ, getHeight);
  }

  private repopulate(
    px: number,
    pz: number,
    getHeight: (x: number, z: number) => number,
  ) {
    const orig  = this.originAttr.array as Float32Array;
    const scale = this.scaleAttr.array  as Float32Array;

    const step = 1.0 / Math.sqrt(GRASS_DENSITY);
    let idx = 0;

    for (let dx = -GRASS_RANGE; dx < GRASS_RANGE && idx < MAX_BLADES; dx += step) {
      for (let dz = -GRASS_RANGE; dz < GRASS_RANGE && idx < MAX_BLADES; dz += step) {
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > GRASS_RANGE) continue;

        // Fade density at outer ring
        const chance = dist > 22 ? (GRASS_RANGE - dist) / (GRASS_RANGE - 22) : 1;
        if (Math.random() > chance) continue;

        const wx = px + dx + (Math.random() - 0.5) * step * 0.85;
        const wz = pz + dz + (Math.random() - 0.5) * step * 0.85;
        const h  = getHeight(wx, wz);
        if (h < GRASS_MIN_H || h > GRASS_MAX_H) continue;

        const s = 0.7 + Math.random() * 0.55;

        // Write same origin + scale to all 6 verts of this blade
        for (let v = 0; v < 6; v++) {
          const vi = (idx * 6 + v);
          orig[vi * 3 + 0] = wx;
          orig[vi * 3 + 1] = h;
          orig[vi * 3 + 2] = wz;
          scale[vi] = s;
        }
        idx++;
      }
    }

    // Hide unused blade slots
    for (let i = idx; i < MAX_BLADES; i++) {
      for (let v = 0; v < 6; v++) {
        orig[(i * 6 + v) * 3 + 1] = -9999;
        scale[i * 6 + v] = 0;
      }
    }

    this.originAttr.needsUpdate = true;
    this.scaleAttr.needsUpdate  = true;
    this.mesh.geometry.setDrawRange(0, idx * 6);
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
