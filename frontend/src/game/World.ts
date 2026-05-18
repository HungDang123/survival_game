import * as THREE from 'three';
import { TerrainChunk, CHUNK_SIZE, LOD_SEGMENTS } from '../terrain/TerrainChunk';
import { NoiseGenerator } from '../terrain/NoiseGenerator';
import { GrassSystem } from '../terrain/GrassSystem';
import { LightingSystem, type LightingState } from '../graphics/LightingSystem';
import { AmbientParticles } from '../graphics/AmbientParticles';
import { PropsSystem } from '../world/PropsSystem';
import { WeatherSystem } from '../world/WeatherSystem';
import { UnderwaterFlora } from '../world/UnderwaterFlora';

const RENDER_DISTANCE = 4;
const WATER_LEVEL = -1.0;

// ─── Sky Shaders ────────────────────────────────────────────────────────────

const skyVertexShader = /* glsl */`
  varying vec3 vWorldPos;
  void main() {
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFragmentShader = /* glsl */`
  uniform vec3  uTopColor;
  uniform vec3  uBottomColor;
  uniform vec3  uHorizonColor;
  uniform vec3  uSunDir;
  uniform vec3  uMoonDir;
  uniform float uSunIntensity;
  uniform float uNightFactor;
  uniform float uTwilightFactor;
  varying vec3  vWorldPos;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.4))) * 43758.5453);
  }

  void main() {
    vec3 dir = normalize(vWorldPos);
    float h   = dir.y;

    // Base sky gradient
    vec3 c = mix(uHorizonColor, uTopColor, max(h, 0.0));
    c = mix(uBottomColor, c, step(0.0, h));

    // Twilight / sunset glow at horizon
    float horizonBand = exp(-abs(h) * 7.0);
    c = mix(c, vec3(1.0, 0.38, 0.08), horizonBand * uTwilightFactor * 0.65);

    // Sun disc + corona
    float sunDot  = dot(dir, uSunDir);
    float sunDisc = smoothstep(0.9975, 1.0, sunDot) * uSunIntensity;
    float sunGlow = smoothstep(0.92,   1.0, sunDot) * 0.45 * uSunIntensity;
    c += vec3(1.0, 0.95, 0.75) * sunDisc;
    c += vec3(1.0, 0.65, 0.25) * sunGlow * (1.0 - uNightFactor);

    // Moon disc
    float moonDot  = dot(dir, uMoonDir);
    float moonDisc = smoothstep(0.9985, 1.0, moonDot) * uNightFactor * 0.8;
    c += vec3(0.85, 0.90, 1.0) * moonDisc;

    // Stars — visible only at night
    vec3 starCell = floor(dir * 220.0);
    float star = step(0.9975, hash(starCell)) * uNightFactor;
    // Twinkle
    float twinkle = 0.7 + 0.3 * sin(hash(starCell * 3.1) * 100.0 + uTwilightFactor * 8.0);
    c += star * twinkle * 0.85;

    gl_FragColor = vec4(c, 1.0);
  }
`;

// ─── Water Shaders ───────────────────────────────────────────────────────────

const waterVertexShader = /* glsl */`
  uniform float uTime;
  varying vec3  vWorldPos;
  varying vec3  vNormal;
  varying vec3  vViewDir;
  varying float vFogDepth;

  void main() {
    vec3 pos = position;
    float wx = pos.x;
    float wz = pos.z;

    float wave =
      sin(wx * 0.15 + uTime * 1.25) * 0.18
    + sin(wz * 0.12 + uTime * 0.85) * 0.14
    + sin((wx + wz) * 0.08 + uTime)  * 0.10
    + sin(wx * 0.25 - uTime * 0.6)   * 0.06;
    pos.y += wave;

    // Approximate normal via partial derivatives
    float eps = 0.5;
    float waveDx =
      cos(wx * 0.15 + uTime * 1.25) * 0.15 * 0.18
    + cos((wx + wz) * 0.08 + uTime) * 0.08 * 0.10
    + cos(wx * 0.25 - uTime * 0.6)  * 0.25 * 0.06;
    float waveDz =
      cos(wz * 0.12 + uTime * 0.85) * 0.12 * 0.14
    + cos((wx + wz) * 0.08 + uTime) * 0.08 * 0.10;

    vec3 approxNormal = normalize(vec3(-waveDx, 1.0, -waveDz));

    vec4 worldPos4 = modelMatrix * vec4(pos, 1.0);
    vWorldPos = worldPos4.xyz;
    vNormal   = normalMatrix * approxNormal;
    vViewDir  = normalize(cameraPosition - vWorldPos);
    vFogDepth = -( modelViewMatrix * vec4(pos, 1.0) ).z;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const waterFragmentShader = /* glsl */`
  uniform vec3  uDeepColor;
  uniform vec3  uShallowColor;
  uniform vec3  uSkyColor;
  uniform float uTime;
  uniform vec3  uFogColor;
  uniform float uFogDensity;
  varying vec3  vWorldPos;
  varying vec3  vNormal;
  varying vec3  vViewDir;
  varying float vFogDepth;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewDir);

    // Fresnel
    float fresnel = pow(clamp(1.0 - dot(N, V), 0.0, 1.0), 3.0);

    // Base water color
    vec3 water = mix(uDeepColor, uShallowColor, fresnel * 0.6);
    // Sky reflection tint
    water += uSkyColor * fresnel * 0.38;

    // Specular highlight
    vec3 lightDir = normalize(vec3(0.4, 1.0, 0.3));
    vec3 H = normalize(lightDir + V);
    float spec = pow(max(dot(N, H), 0.0), 80.0) * 0.5;
    water += vec3(1.0, 0.98, 0.95) * spec;

    // Foam hint at shallow edges
    float foam = smoothstep(0.18, 0.0, abs(vWorldPos.y - (-1.0))) * 0.3;
    water = mix(water, vec3(0.9, 0.95, 1.0), foam);

    float alpha = 0.68 + fresnel * 0.24;

    // Exponential fog
    float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
    water = mix(water, uFogColor, clamp(fogFactor, 0.0, 1.0));

    gl_FragColor = vec4(water, alpha);
  }
`;

// ────────────────────────────────────────────────────────────────────────────

export class World {
  scene: THREE.Scene;
  private chunks = new Map<string, TerrainChunk>();
  readonly noise: NoiseGenerator;
  private lighting!: LightingSystem;
  private particles!: AmbientParticles;
  private props!: PropsSystem;
  private weather!: WeatherSystem;
  private underwaterFlora!: UnderwaterFlora;
  private skyMesh!: THREE.Mesh;
  private skyMat!: THREE.ShaderMaterial;
  private waterMesh!: THREE.Mesh;
  private waterMat!: THREE.ShaderMaterial;
  private clouds: THREE.Mesh[] = [];
  private grass!: GrassSystem;
  private time = 0.25;

  constructor(seed: number) {
    this.scene = new THREE.Scene();
    this.noise = new NoiseGenerator(seed);

    this.lighting       = new LightingSystem(this.scene);
    this.particles      = new AmbientParticles(this.scene);
    this.props          = new PropsSystem(this.scene);
    this.weather        = new WeatherSystem(this.scene);
    this.underwaterFlora = new UnderwaterFlora(this.scene);
    this.createSky();
    this.createWater();
    this.createClouds();
    this.grass = new GrassSystem(this.scene);
  }

  private createSky() {
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        uTopColor:      { value: new THREE.Color(0x1a6fcc) },
        uBottomColor:   { value: new THREE.Color(0x4a6741) },
        uHorizonColor:  { value: new THREE.Color(0xddeeff) },
        uSunDir:        { value: new THREE.Vector3(0, 1, 0) },
        uMoonDir:       { value: new THREE.Vector3(0, -1, 0) },
        uSunIntensity:  { value: 1.0 },
        uNightFactor:   { value: 0.0 },
        uTwilightFactor:{ value: 0.0 },
      },
      vertexShader:   skyVertexShader,
      fragmentShader: skyFragmentShader,
    });

    const skyGeo = new THREE.SphereGeometry(800, 32, 16);
    this.skyMesh = new THREE.Mesh(skyGeo, this.skyMat);
    this.scene.add(this.skyMesh);
  }

  private createWater() {
    const geo = new THREE.PlaneGeometry(3000, 3000, 128, 128);
    geo.rotateX(-Math.PI / 2);

    this.waterMat = new THREE.ShaderMaterial({
      vertexShader:   waterVertexShader,
      fragmentShader: waterFragmentShader,
      transparent: true,
      side: THREE.FrontSide,
      uniforms: {
        uTime:        { value: 0 },
        uDeepColor:   { value: new THREE.Color(0x0a2a5a) },
        uShallowColor:{ value: new THREE.Color(0x2c8ad4) },
        uSkyColor:    { value: new THREE.Color(0x87ceeb) },
        uFogColor:    { value: new THREE.Color(0xa8cce8) },
        uFogDensity:  { value: 0.004 },
      },
    });

    this.waterMesh = new THREE.Mesh(geo, this.waterMat);
    this.waterMesh.position.y = WATER_LEVEL;
    this.waterMesh.receiveShadow = false;
    this.scene.add(this.waterMesh);
  }

  private createClouds() {
    const cloudMat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.82,
    });

    for (let i = 0; i < 22; i++) {
      const cloud = new THREE.Group() as unknown as THREE.Mesh;
      const numPuffs = 3 + Math.floor(Math.random() * 5);
      for (let j = 0; j < numPuffs; j++) {
        const size = 8 + Math.random() * 16;
        const geo = new THREE.SphereGeometry(size, 7, 5);
        const puff = new THREE.Mesh(geo, cloudMat);
        puff.position.set(
          (Math.random() - 0.5) * 35,
          (Math.random() - 0.5) * 6,
          (Math.random() - 0.5) * 14,
        );
        puff.scale.y = 0.4;
        (cloud as unknown as THREE.Group).add(puff);
      }

      const g = cloud as unknown as THREE.Group;
      g.position.set(
        (Math.random() - 0.5) * 600,
        88 + Math.random() * 45,
        (Math.random() - 0.5) * 600,
      );
      g.userData.speed = 0.4 + Math.random() * 1.6;
      this.clouds.push(cloud);
      this.scene.add(g);
    }
  }

  update(playerX: number, playerZ: number, delta: number) {
    this.time += delta * 0.0015;
    const sunAngle = this.time * Math.PI * 2;
    const sinA = Math.sin(sunAngle);
    const cosA = Math.cos(sunAngle);

    const sunDir = new THREE.Vector3(cosA, sinA, 0.28).normalize();
    const dayT   = Math.max(0, Math.min(1, (sinA + 0.15) / 1.15));
    const twilight = Math.max(0, Math.min(1, (sinA + 0.25) / 0.5));
    const nightT = Math.max(0, 1.0 - dayT * 1.5);

    // ── Lighting system ────────────────────────────────────────────────────
    const lightState: LightingState = { dayT, twilight, nightT, sunDir };
    this.lighting.update(lightState);

    // ── Sky colours ────────────────────────────────────────────────────────
    const dayTop     = new THREE.Color(0x1a6fcc);
    const nightTop   = new THREE.Color(0x030818);
    const sunriseTop = new THREE.Color(0xd06030);
    const topColor   = new THREE.Color().lerpColors(nightTop, dayTop, dayT);
    if (twilight < 0.8) topColor.lerp(sunriseTop, (1 - twilight / 0.8) * 0.6);

    const horizColor = new THREE.Color().lerpColors(
      new THREE.Color(0x080c1a), new THREE.Color(0xddeeff), dayT,
    );

    const skyU = this.skyMat.uniforms;
    skyU.uTopColor.value.copy(topColor);
    skyU.uHorizonColor.value.copy(horizColor);
    skyU.uBottomColor.value.lerpColors(new THREE.Color(0x1a1208), new THREE.Color(0x4a6741), dayT);
    skyU.uSunDir.value.copy(sunDir);
    skyU.uMoonDir.value.copy(sunDir.clone().negate());
    skyU.uSunIntensity.value   = dayT;
    skyU.uNightFactor.value    = nightT;
    skyU.uTwilightFactor.value = Math.max(0, 1 - twilight / 0.8) * (1 - dayT * 2);

    // ── Weather update (drives fog density dynamically) ────────────────────
    this.weather.fogDensityBase = 0.012;
    this.weather.update(delta, playerX, playerZ);

    // ── Fog ────────────────────────────────────────────────────────────────
    const fogColor = new THREE.Color().lerpColors(
      new THREE.Color(0x050a18), new THREE.Color(0xa8cce8), dayT,
    );
    const fogDensity = 0.012 + this.weather.getIntensity() * 0.022;
    this.scene.fog = new THREE.FogExp2(fogColor, fogDensity);

    // ── Water uniforms ─────────────────────────────────────────────────────
    const wu = this.waterMat.uniforms;
    wu.uTime.value += delta;
    wu.uSkyColor.value.copy(topColor);
    wu.uFogColor.value.copy(fogColor);
    wu.uFogDensity.value = 0.012;
    wu.uDeepColor.value.lerpColors(new THREE.Color(0x050d1e), new THREE.Color(0x0a2a5a), dayT);
    wu.uShallowColor.value.lerpColors(new THREE.Color(0x0a1a3a), new THREE.Color(0x2c8ad4), dayT);

    // ── Move sky + water with player ───────────────────────────────────────
    this.skyMesh.position.set(playerX, 0, playerZ);
    this.waterMesh.position.x = playerX;
    this.waterMesh.position.z = playerZ;

    // ── Clouds ─────────────────────────────────────────────────────────────
    for (const cloud of this.clouds) {
      const g = cloud as unknown as THREE.Group;
      g.position.x += g.userData.speed * delta;
      if (g.position.x > playerX + 400) g.position.x = playerX - 400;
    }

    // ── Grass ──────────────────────────────────────────────────────────────
    this.grass.update(delta, playerX, playerZ, (x, z) => this.getTerrainHeight(x, z));

    // ── Ambient particles ──────────────────────────────────────────────────
    this.particles.update(
      delta, playerX, playerZ, nightT,
      (x, z) => this.getTerrainHeight(x, z),
    );

    // ── World props (trees + rocks) ────────────────────────────────────────
    this.props.update(
      delta, playerX, playerZ,
      (x, z) => this.getTerrainHeight(x, z),
      (x, z) => this.getTerrainSlope(x, z),
    );

    // ── Underwater flora ───────────────────────────────────────────────────
    this.underwaterFlora.update(
      delta, playerX, playerZ,
      (x, z) => this.getTerrainHeight(x, z),
      (x, z) => this.noise.getBiome(x, z),
    );

    this.updateChunks(playerX, playerZ);
  }

  private getLodSegments(dx: number, dz: number): number {
    const d = Math.max(Math.abs(dx), Math.abs(dz));
    if (d <= 1) return LOD_SEGMENTS[0];
    if (d <= 3) return LOD_SEGMENTS[1];
    return LOD_SEGMENTS[2];
  }

  private updateChunks(px: number, pz: number) {
    const cx0 = Math.round(px / CHUNK_SIZE);
    const cz0 = Math.round(pz / CHUNK_SIZE);

    for (let cx = cx0 - RENDER_DISTANCE; cx <= cx0 + RENDER_DISTANCE; cx++) {
      for (let cz = cz0 - RENDER_DISTANCE; cz <= cz0 + RENDER_DISTANCE; cz++) {
        const id = `${cx}_${cz}`;
        const desiredSegs = this.getLodSegments(cx - cx0, cz - cz0);
        const existing = this.chunks.get(id);

        if (!existing) {
          const chunk = new TerrainChunk(cx, cz, this.noise, desiredSegs);
          this.chunks.set(id, chunk);
          this.scene.add(chunk.mesh);
        } else if (existing.lodLevel !== (desiredSegs >= 63 ? 0 : desiredSegs >= 31 ? 1 : 2)) {
          this.scene.remove(existing.mesh);
          existing.dispose();
          const chunk = new TerrainChunk(cx, cz, this.noise, desiredSegs);
          this.chunks.set(id, chunk);
          this.scene.add(chunk.mesh);
        }
      }
    }

    for (const [id, chunk] of this.chunks) {
      if (
        Math.abs(chunk.chunkX - cx0) > RENDER_DISTANCE + 1 ||
        Math.abs(chunk.chunkZ - cz0) > RENDER_DISTANCE + 1
      ) {
        this.scene.remove(chunk.mesh);
        chunk.dispose();
        this.chunks.delete(id);
      }
    }
  }

  getChunks(): Map<string, TerrainChunk> {
    return this.chunks;
  }

  getTerrainSlope(wx: number, wz: number): number {
    const step = 2;
    const hL = this.getTerrainHeight(wx - step, wz);
    const hR = this.getTerrainHeight(wx + step, wz);
    const hD = this.getTerrainHeight(wx, wz - step);
    const hU = this.getTerrainHeight(wx, wz + step);
    const dX = (hR - hL) / (2 * step);
    const dZ = (hU - hD) / (2 * step);
    return Math.sqrt(dX * dX + dZ * dZ);
  }

  getTerrainHeight(wx: number, wz: number): number {
    const cx = Math.round(wx / CHUNK_SIZE);
    const cz = Math.round(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(`${cx}_${cz}`);
    if (!chunk) return this.noise.getHeight(wx, wz);
    return chunk.getHeightAt(wx - cx * CHUNK_SIZE, wz - cz * CHUNK_SIZE);
  }

  getWeatherIntensity(): number {
    return this.weather.getIntensity();
  }

  getWeatherState(): string {
    return this.weather.getState();
  }
}
