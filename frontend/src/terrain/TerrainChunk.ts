import * as THREE from 'three';
import { NoiseGenerator } from './NoiseGenerator';

export const CHUNK_SIZE = 64;
export const CHUNK_SEGMENTS = CHUNK_SIZE - 1;
export const VERTEX_COUNT = CHUNK_SIZE * CHUNK_SIZE;

export interface TerrainModification {
  chunkId: string;
  vertexIndex: number;
  deltaY: number;
  toolType: 'dig' | 'build';
}

const HEIGHT_ZONES: [number, number, number, number][] = [
  [-12, 0.08, 0.22, 0.60],
  [ -3, 0.12, 0.34, 0.75],
  [ -1, 0.86, 0.78, 0.46],
  [  1, 0.88, 0.80, 0.48],
  [  2, 0.36, 0.63, 0.17],
  [ 10, 0.32, 0.56, 0.14],
  [ 12, 0.53, 0.53, 0.53],
  [ 20, 0.46, 0.46, 0.46],
  [ 28, 0.94, 0.96, 1.00],
];

function heightToRGB(h: number, out: Float32Array, idx: number) {
  const zones = HEIGHT_ZONES;
  let i = 0;
  while (i < zones.length - 2 && h > zones[i + 1][0]) i++;
  const [h0, r0, g0, b0] = zones[i];
  const [h1, r1, g1, b1] = zones[i + 1];
  const t = h1 > h0 ? Math.max(0, Math.min(1, (h - h0) / (h1 - h0))) : 0;
  out[idx * 3    ] = r0 + (r1 - r0) * t;
  out[idx * 3 + 1] = g0 + (g1 - g0) * t;
  out[idx * 3 + 2] = b0 + (b1 - b0) * t;
}

export class TerrainChunk {
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly id: string;
  readonly mesh: THREE.Mesh;
  private geometry: THREE.BufferGeometry;
  private heights: Float32Array;
  private colorArray: Float32Array;

  constructor(chunkX: number, chunkZ: number, noise: NoiseGenerator) {
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.id = `${chunkX}_${chunkZ}`;

    const plane = new THREE.PlaneGeometry(
      CHUNK_SIZE, CHUNK_SIZE, CHUNK_SEGMENTS, CHUNK_SEGMENTS
    );
    plane.rotateX(-Math.PI / 2);
    this.geometry = plane;

    this.heights = new Float32Array(VERTEX_COUNT);
    this.colorArray = new Float32Array(VERTEX_COUNT * 3);

    const positions = this.geometry.attributes.position;
    const worldOffsetX = chunkX * CHUNK_SIZE;
    const worldOffsetZ = chunkZ * CHUNK_SIZE;

    for (let i = 0; i < positions.count; i++) {
      const wx = positions.getX(i) + worldOffsetX;
      const wz = positions.getZ(i) + worldOffsetZ;
      const h = noise.getHeight(wx, wz);
      positions.setY(i, h);
      this.heights[i] = h;
      heightToRGB(h, this.colorArray, i);
    }

    positions.needsUpdate = true;
    this.geometry.setAttribute('color',
      new THREE.BufferAttribute(this.colorArray, 3)
    );
    this.geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.02,
    });

    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.position.set(worldOffsetX, 0, worldOffsetZ);
    this.mesh.userData.chunkId = this.id;
  }

  applyModification(vertexIndex: number, deltaY: number): void {
    const positions = this.geometry.attributes.position;
    if (vertexIndex < 0 || vertexIndex >= positions.count) return;
    const newY = positions.getY(vertexIndex) + deltaY;
    positions.setY(vertexIndex, newY);
    this.heights[vertexIndex] = newY;
    heightToRGB(newY, this.colorArray, vertexIndex);
    positions.needsUpdate = true;
    (this.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  getHeightAt(localX: number, localZ: number): number {
    const fx = localX + CHUNK_SIZE / 2;
    const fz = localZ + CHUNK_SIZE / 2;

    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const tx = fx - x0;
    const tz = fz - z0;

    const clamp = (v: number) => Math.max(0, Math.min(CHUNK_SIZE - 1, v));
    const cx0 = clamp(x0);
    const cx1 = clamp(x0 + 1);
    const cz0 = clamp(z0);
    const cz1 = clamp(z0 + 1);

    const h00 = this.heights[cz0 * CHUNK_SIZE + cx0];
    const h10 = this.heights[cz0 * CHUNK_SIZE + cx1];
    const h01 = this.heights[cz1 * CHUNK_SIZE + cx0];
    const h11 = this.heights[cz1 * CHUNK_SIZE + cx1];

    return h00 * (1 - tx) * (1 - tz)
         + h10 * tx        * (1 - tz)
         + h01 * (1 - tx)  * tz
         + h11 * tx        * tz;
  }

  getHeights(): Float32Array {
    return this.heights;
  }

  dispose(): void {
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
