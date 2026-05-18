/**
 * AmbientParticles
 * Two layers of atmospheric particles:
 *  1. Fireflies — soft green-yellow glow, appear at night, bob and drift
 *  2. Dust motes — tiny white specks, always present, float in air
 *
 * Visual impact: adds life and depth to the scene, especially at dusk/dawn.
 * Both use Points + ShaderMaterial so they glow properly with Bloom.
 */

import * as THREE from 'three';

// ── Constants ────────────────────────────────────────────────────────────────

const FIREFLY_COUNT = 120;
const FIREFLY_RANGE = 28;
const FIREFLY_HEIGHT_MIN = 0.4;
const FIREFLY_HEIGHT_MAX = 3.5;

const DUST_COUNT = 280;
const DUST_RANGE = 18;
const DUST_HEIGHT_MAX = 6.0;

// ── Shaders ──────────────────────────────────────────────────────────────────

const fireflyVertex = /* glsl */`
  attribute float aPhase;
  attribute float aSize;
  uniform   float uTime;
  uniform   float uNight;   // 0 = day, 1 = night
  varying   float vAlpha;

  void main() {
    float bob = sin(uTime * 1.2 + aPhase) * 0.35 + sin(uTime * 0.7 + aPhase * 1.4) * 0.18;
    float drift = cos(uTime * 0.4 + aPhase * 0.9);

    vec3 pos = position;
    pos.y += bob;
    pos.x += drift * 0.25;

    vAlpha = uNight * (0.55 + 0.45 * sin(uTime * 2.5 + aPhase));

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = aSize * (250.0 / -mv.z);
    gl_Position  = projectionMatrix * mv;
  }
`;

const fireflyFragment = /* glsl */`
  varying float vAlpha;

  void main() {
    // Soft circular point
    vec2  uv   = gl_PointCoord - 0.5;
    float dist = length(uv);
    float mask = smoothstep(0.5, 0.1, dist);
    if (mask < 0.01) discard;
    // Warm green-yellow core
    vec3 col = mix(vec3(0.6, 1.0, 0.2), vec3(1.0, 0.95, 0.3), dist * 2.0);
    gl_FragColor = vec4(col, mask * vAlpha);
  }
`;

const dustVertex = /* glsl */`
  attribute float aPhase;
  attribute float aSize;
  uniform   float uTime;
  varying   float vAlpha;

  void main() {
    float swayX = sin(uTime * 0.22 + aPhase) * 0.18;
    float swayZ = cos(uTime * 0.18 + aPhase * 1.2) * 0.12;
    float riseY = mod(uTime * 0.04 + aPhase * 0.1, 1.0) * DUST_HEIGHT;

    vec3 pos = position;
    pos.x += swayX;
    pos.z += swayZ;
    pos.y  = mod(pos.y + riseY, DUST_HEIGHT);

    vAlpha = 0.08 + 0.04 * sin(uTime * 1.8 + aPhase);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = aSize * (150.0 / -mv.z);
    gl_Position  = projectionMatrix * mv;
  }
`;

const dustFragment = /* glsl */`
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(0.88, 0.86, 0.82, (1.0 - d * 2.0) * vAlpha);
  }
`;

// ────────────────────────────────────────────────────────────────────────────

export class AmbientParticles {
  private fireflyMesh!: THREE.Points;
  private fireflyMat!: THREE.ShaderMaterial;
  private dustMesh!: THREE.Points;
  private dustMat!: THREE.ShaderMaterial;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.fireflyMesh = this.buildFireflies();
    this.dustMesh    = this.buildDust();
    scene.add(this.fireflyMesh);
    scene.add(this.dustMesh);
  }

  private buildFireflies(): THREE.Points {
    const N = FIREFLY_COUNT;
    const positions = new Float32Array(N * 3);
    const phases    = new Float32Array(N);
    const sizes     = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      const r     = Math.sqrt(Math.random()) * FIREFLY_RANGE;
      const theta = Math.random() * Math.PI * 2;
      positions[i * 3    ] = Math.cos(theta) * r;
      positions[i * 3 + 1] = FIREFLY_HEIGHT_MIN + Math.random() * (FIREFLY_HEIGHT_MAX - FIREFLY_HEIGHT_MIN);
      positions[i * 3 + 2] = Math.sin(theta) * r;
      phases[i] = Math.random() * Math.PI * 2;
      sizes[i]  = 0.8 + Math.random() * 1.4;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aPhase',   new THREE.BufferAttribute(phases,    1));
    geo.setAttribute('aSize',    new THREE.BufferAttribute(sizes,     1));

    this.fireflyMat = new THREE.ShaderMaterial({
      vertexShader:   fireflyVertex,
      fragmentShader: fireflyFragment,
      uniforms: {
        uTime:  { value: 0 },
        uNight: { value: 0 },
      },
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geo, this.fireflyMat);
    points.frustumCulled = false;
    return points;
  }

  private buildDust(): THREE.Points {
    const N = DUST_COUNT;
    const positions = new Float32Array(N * 3);
    const phases    = new Float32Array(N);
    const sizes     = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      positions[i * 3    ] = (Math.random() - 0.5) * DUST_RANGE * 2;
      positions[i * 3 + 1] = Math.random() * DUST_HEIGHT_MAX;
      positions[i * 3 + 2] = (Math.random() - 0.5) * DUST_RANGE * 2;
      phases[i] = Math.random() * Math.PI * 2;
      sizes[i]  = 0.4 + Math.random() * 0.6;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aPhase',   new THREE.BufferAttribute(phases,    1));
    geo.setAttribute('aSize',    new THREE.BufferAttribute(sizes,     1));

    this.dustMat = new THREE.ShaderMaterial({
      vertexShader:   dustVertex.replace('DUST_HEIGHT', String(DUST_HEIGHT_MAX)),
      fragmentShader: dustFragment,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite:  false,
      blending:    THREE.NormalBlending,
    });

    const points = new THREE.Points(geo, this.dustMat);
    points.frustumCulled = false;
    return points;
  }

  /**
   * @param delta    frame delta in seconds
   * @param px       player X (moves system with player)
   * @param pz       player Z
   * @param nightT   0 = day, 1 = full night (controls firefly opacity)
   * @param getHeight terrain height sampler
   */
  update(
    delta: number,
    px: number,
    pz: number,
    nightT: number,
    getHeight: (x: number, z: number) => number,
  ) {
    this.fireflyMat.uniforms.uTime.value  += delta;
    this.fireflyMat.uniforms.uNight.value  = nightT;
    this.dustMat.uniforms.uTime.value     += delta;

    // Follow player
    this.fireflyMesh.position.set(px, getHeight(px, pz), pz);
    this.dustMesh.position.set(px, getHeight(px, pz), pz);
  }

  dispose() {
    this.scene.remove(this.fireflyMesh);
    this.scene.remove(this.dustMesh);
    this.fireflyMesh.geometry.dispose();
    this.dustMesh.geometry.dispose();
    this.fireflyMat.dispose();
    this.dustMat.dispose();
  }
}
