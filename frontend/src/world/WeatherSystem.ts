/**
 * WeatherSystem
 * State machine: clear → cloudy → rain → clear
 *
 * Visual elements:
 *  - Rain: 3000 falling streaks (LineSegments + custom shader)
 *  - Lightning flash: PointLight spike + HUD white vignette
 *  - Fog / bloom intensity driven by weather intensity
 *  - Callback so World.ts / PostProcessingPipeline can react
 */

import * as THREE from 'three';

// ── State machine ────────────────────────────────────────────────────────────

type WeatherState = 'clear' | 'cloudy' | 'rain';

const STATE_DURATION: Record<WeatherState, [number, number]> = {
  clear:  [40, 90],   // [min, max] seconds
  cloudy: [15, 35],
  rain:   [20, 60],
};

const NEXT_STATE: Record<WeatherState, WeatherState> = {
  clear:  'cloudy',
  cloudy: 'rain',
  rain:   'clear',
};

// ── Rain shader ──────────────────────────────────────────────────────────────

const rainVertex = /* glsl */`
  uniform float uTime;
  uniform float uIntensity;
  varying float vAlpha;

  void main() {
    // Each streak starts at a random height, falls, wraps around
    float fallSpeed = 18.0;
    float range     = 28.0;

    vec3 pos = position;
    // Loop position downward
    pos.y = mod(pos.y - uTime * fallSpeed, range) - range * 0.5;
    // Slight wind angle
    pos.x += pos.y * 0.04;

    vAlpha = uIntensity * 0.55;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const rainFragment = /* glsl */`
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(0.75, 0.82, 0.92, vAlpha);
  }
`;

// ────────────────────────────────────────────────────────────────────────────

const STREAK_COUNT = 3000;
const RAIN_RANGE   = 28;

export class WeatherSystem {
  // Current state
  private state: WeatherState = 'clear';
  private stateTimer  = 0;
  private stateDuration = 60;
  private intensity   = 0;      // 0 = clear, 1 = heavy rain (lerped)
  private targetIntensity = 0;

  // Rain mesh
  private rainMesh!: THREE.LineSegments;
  private rainMat!: THREE.ShaderMaterial;

  // Lightning
  private lightningLight: THREE.PointLight;
  private lightningTimer = 0;
  private lightningNext  = 8;

  /** World fog density base (from World.ts) — weather multiplies on top */
  fogDensityBase = 0.012;

  /** Called each frame with current fog density + bloom threshold offset */
  onWeatherChange: ((fogDensity: number, bloomOffset: number) => void) | null = null;

  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.rainMesh  = this.buildRain();
    this.lightningLight = new THREE.PointLight(0xccddff, 0, 600);
    this.lightningLight.position.set(0, 80, 0);
    scene.add(this.rainMesh, this.lightningLight);
    this.scheduleNextState();
  }

  private buildRain(): THREE.LineSegments {
    const positions = new Float32Array(STREAK_COUNT * 6); // 2 points per line × 3 floats
    for (let i = 0; i < STREAK_COUNT; i++) {
      const x = (Math.random() - 0.5) * RAIN_RANGE * 2;
      const y =  Math.random() * RAIN_RANGE - RAIN_RANGE * 0.5;
      const z = (Math.random() - 0.5) * RAIN_RANGE * 2;
      const base = i * 6;
      positions[base    ] = x;     positions[base + 1] = y;          positions[base + 2] = z;
      positions[base + 3] = x + 0.04; positions[base + 4] = y - 0.5; positions[base + 5] = z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    this.rainMat = new THREE.ShaderMaterial({
      vertexShader:   rainVertex,
      fragmentShader: rainFragment,
      uniforms: {
        uTime:      { value: 0 },
        uIntensity: { value: 0 },
      },
      transparent: true,
      depthWrite:  false,
      blending:    THREE.NormalBlending,
    });

    const mesh = new THREE.LineSegments(geo, this.rainMat);
    mesh.frustumCulled = false;
    return mesh;
  }

  private scheduleNextState() {
    const [mn, mx] = STATE_DURATION[this.state];
    this.stateDuration = mn + Math.random() * (mx - mn);
    this.stateTimer    = 0;
  }

  update(delta: number, px: number, pz: number) {
    // Follow player
    this.rainMesh.position.set(px, 0, pz);
    this.lightningLight.position.set(px, 80, pz);

    // State machine
    this.stateTimer += delta;
    if (this.stateTimer >= this.stateDuration) {
      this.state = NEXT_STATE[this.state];
      this.scheduleNextState();
      this.targetIntensity = this.state === 'rain' ? 1.0 : this.state === 'cloudy' ? 0.25 : 0.0;
    }

    // Smooth intensity lerp
    this.intensity += (this.targetIntensity - this.intensity) * Math.min(1, delta * 0.8);

    // Update rain shader
    this.rainMat.uniforms.uTime.value      += delta;
    this.rainMat.uniforms.uIntensity.value  = this.intensity;

    // Lightning during rain
    if (this.state === 'rain') {
      this.lightningTimer += delta;
      if (this.lightningTimer >= this.lightningNext) {
        this.lightningTimer  = 0;
        this.lightningNext   = 4 + Math.random() * 12;
        this.triggerLightning();
      }
    } else {
      this.lightningLight.intensity = 0;
    }

    // Notify World about fog + bloom changes
    if (this.onWeatherChange) {
      const fogDensity   = this.fogDensityBase + this.intensity * 0.022;
      const bloomOffset  = this.intensity * 0.12;   // raise bloom threshold slightly in rain
      this.onWeatherChange(fogDensity, bloomOffset);
    }
  }

  private triggerLightning() {
    // Flash the point light rapidly — creates realistic lightning strobe
    this.lightningLight.intensity = 8 + Math.random() * 6;
    setTimeout(() => { this.lightningLight.intensity = 0; }, 60);
    setTimeout(() => { this.lightningLight.intensity = 4 + Math.random() * 3; }, 120);
    setTimeout(() => { this.lightningLight.intensity = 0; }, 200);

    // HUD white flash
    window.dispatchEvent(new CustomEvent('lightningFlash'));
  }

  /** Current rain intensity 0–1, useful for water ripple effects */
  getIntensity(): number { return this.intensity; }

  getState(): WeatherState { return this.state; }

  dispose() {
    this.scene.remove(this.rainMesh, this.lightningLight);
    this.rainMesh.geometry.dispose();
    this.rainMat.dispose();
  }
}
