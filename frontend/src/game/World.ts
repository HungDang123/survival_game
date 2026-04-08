import * as THREE from 'three';
import { TerrainChunk, CHUNK_SIZE } from '../terrain/TerrainChunk';
import { NoiseGenerator } from '../terrain/NoiseGenerator';

const RENDER_DISTANCE = 4;
const WATER_LEVEL = -1.0;

export class World {
  scene: THREE.Scene;
  private chunks = new Map<string, TerrainChunk>();
  private noise: NoiseGenerator;
  private sun!: THREE.DirectionalLight;
  private moon!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private skyMesh!: THREE.Mesh;
  private skyMat!: THREE.ShaderMaterial;
  private waterMesh!: THREE.Mesh;
  private clouds: THREE.Mesh[] = [];
  private time = 0.25;

  constructor(seed: number) {
    this.scene = new THREE.Scene();
    this.noise = new NoiseGenerator(seed);

    this.setupLighting();
    this.createSky();
    this.createWater();
    this.createClouds();
  }

  private setupLighting() {
    this.hemi = new THREE.HemisphereLight(0x87ceeb, 0x4a6741, 0.5);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff5e0, 1.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 600;
    this.sun.shadow.camera.left = -200;
    this.sun.shadow.camera.right = 200;
    this.sun.shadow.camera.top = 200;
    this.sun.shadow.camera.bottom = -200;
    this.sun.shadow.bias = -0.0003;
    this.scene.add(this.sun);

    this.moon = new THREE.DirectionalLight(0x8899cc, 0.0);
    this.scene.add(this.moon);
  }

  private createSky() {
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor:    { value: new THREE.Color(0x1a6fcc) },
        bottomColor: { value: new THREE.Color(0xb0d8f0) },
        horizonColor:{ value: new THREE.Color(0xddeeff) },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform vec3 horizonColor;
        varying vec3 vWorldPos;
        void main() {
          float h = normalize(vWorldPos).y;
          vec3 c = mix(horizonColor, topColor, max(h, 0.0));
          c = mix(bottomColor, c, step(0.0, h));
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    });

    const skyGeo = new THREE.SphereGeometry(800, 32, 16);
    this.skyMesh = new THREE.Mesh(skyGeo, this.skyMat);
    this.scene.add(this.skyMesh);
  }

  private createWater() {
    const geo = new THREE.PlaneGeometry(3000, 3000, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2278c8,
      transparent: true,
      opacity: 0.72,
      roughness: 0.08,
      metalness: 0.05,
      envMapIntensity: 1.0,
    });
    this.waterMesh = new THREE.Mesh(geo, mat);
    this.waterMesh.rotation.x = -Math.PI / 2;
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

    for (let i = 0; i < 18; i++) {
      const cloud = new THREE.Group() as unknown as THREE.Mesh;
      const numPuffs = 3 + Math.floor(Math.random() * 4);
      for (let j = 0; j < numPuffs; j++) {
        const size = 8 + Math.random() * 14;
        const geo = new THREE.SphereGeometry(size, 7, 5);
        const puff = new THREE.Mesh(geo, cloudMat);
        puff.position.set(
          (Math.random() - 0.5) * 30,
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 12
        );
        puff.scale.y = 0.42;
        (cloud as unknown as THREE.Group).add(puff);
      }

      const g = cloud as unknown as THREE.Group;
      g.position.set(
        (Math.random() - 0.5) * 600,
        90 + Math.random() * 40,
        (Math.random() - 0.5) * 600
      );
      g.userData.speed = 0.5 + Math.random() * 1.5;
      this.clouds.push(cloud);
      this.scene.add(g);
    }
  }

  update(playerX: number, playerZ: number, delta: number) {
    this.time += delta * 0.008;
    const sunAngle = this.time * Math.PI * 2;
    const sinA = Math.sin(sunAngle);
    const cosA = Math.cos(sunAngle);

    this.sun.position.set(cosA * 300, sinA * 300, 80);
    this.moon.position.set(-cosA * 300, -sinA * 300, -80);

    const dayT = Math.max(0, Math.min(1, (sinA + 0.15) / 1.15));
    const twilight = Math.max(0, Math.min(1, (sinA + 0.25) / 0.5));

    this.sun.intensity = 0.1 + dayT * 1.3;
    this.moon.intensity = Math.max(0, -sinA * 0.4);

    const dayTop    = new THREE.Color(0x1a6fcc);
    const nightTop  = new THREE.Color(0x030818);
    const sunriseTop= new THREE.Color(0xd06030);

    const topColor = new THREE.Color().lerpColors(nightTop, dayTop, dayT);
    if (twilight < 0.8) topColor.lerp(sunriseTop, (1 - twilight / 0.8) * 0.6);

    const horizDay  = new THREE.Color(0xddeeff);
    const horizNight= new THREE.Color(0x080c1a);
    const horizColor= new THREE.Color().lerpColors(horizNight, horizDay, dayT);

    this.skyMat.uniforms.topColor.value.copy(topColor);
    this.skyMat.uniforms.horizonColor.value.copy(horizColor);
    this.skyMat.uniforms.bottomColor.value.lerpColors(
      new THREE.Color(0x1a1208), new THREE.Color(0x4a6741), dayT
    );

    const fogColor = new THREE.Color().lerpColors(
      new THREE.Color(0x050a18),
      new THREE.Color(0xa8cce8),
      dayT
    );
    this.scene.fog = new THREE.FogExp2(fogColor, 0.004);

    this.hemi.color.set(topColor);
    this.hemi.groundColor.lerpColors(
      new THREE.Color(0x141008), new THREE.Color(0x4a6741), dayT
    );
    this.hemi.intensity = 0.2 + dayT * 0.5;

    const waterColor = new THREE.Color().lerpColors(
      new THREE.Color(0x0a1830), new THREE.Color(0x2278c8), dayT
    );
    (this.waterMesh.material as THREE.MeshStandardMaterial).color.copy(waterColor);
    (this.waterMesh.material as THREE.MeshStandardMaterial).opacity = 0.5 + dayT * 0.25;

    this.waterMesh.position.y = WATER_LEVEL + Math.sin(this.time * 12) * 0.05;

    this.skyMesh.position.set(playerX, 0, playerZ);
    this.waterMesh.position.x = playerX;
    this.waterMesh.position.z = playerZ;

    for (const cloud of this.clouds) {
      const g = cloud as unknown as THREE.Group;
      g.position.x += g.userData.speed * delta;
      if (g.position.x > playerX + 400) g.position.x = playerX - 400;
    }

    this.updateChunks(playerX, playerZ);
  }

  private updateChunks(px: number, pz: number) {
    const cx0 = Math.round(px / CHUNK_SIZE);
    const cz0 = Math.round(pz / CHUNK_SIZE);

    for (let cx = cx0 - RENDER_DISTANCE; cx <= cx0 + RENDER_DISTANCE; cx++) {
      for (let cz = cz0 - RENDER_DISTANCE; cz <= cz0 + RENDER_DISTANCE; cz++) {
        const id = `${cx}_${cz}`;
        if (!this.chunks.has(id)) {
          const chunk = new TerrainChunk(cx, cz, this.noise);
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

  getTerrainHeight(wx: number, wz: number): number {
    const cx = Math.round(wx / CHUNK_SIZE);
    const cz = Math.round(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(`${cx}_${cz}`);
    if (!chunk) return this.noise.getHeight(wx, wz);
    return chunk.getHeightAt(wx - cx * CHUNK_SIZE, wz - cz * CHUNK_SIZE);
  }
}
