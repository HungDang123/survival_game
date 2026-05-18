import * as THREE from 'three';
import { NoiseGenerator, type Biome } from './NoiseGenerator';

export const CHUNK_SIZE    = 64;
export const CHUNK_SEGMENTS = CHUNK_SIZE - 1;
export const VERTEX_COUNT  = CHUNK_SIZE * CHUNK_SIZE;

export const LOD_SEGMENTS = [63, 31, 15] as const;

export interface TerrainModification {
  chunkId:     string;
  vertexIndex: number;
  deltaY:      number;
  toolType:    'dig' | 'build';
}

// ── Height-zone colour table ─────────────────────────────────────────────────
// Extended to cover deep ocean floor (down to -24).
const HEIGHT_ZONES: [number, number, number, number][] = [
  [-24, 0.03, 0.07, 0.22],   // deep ocean floor — near black sediment
  [-16, 0.04, 0.10, 0.32],   // abyssal plain
  [ -8, 0.06, 0.18, 0.48],   // deep-mid ocean
  [ -3, 0.08, 0.24, 0.62],   // shallow ocean
  [ -1, 0.80, 0.74, 0.50],   // wet sand / shore
  [  1, 0.84, 0.78, 0.54],   // dry sand / beach
  [  2, 0.34, 0.56, 0.18],   // light grass
  [  8, 0.26, 0.46, 0.12],   // medium grass
  [ 12, 0.22, 0.38, 0.10],   // dark grass / shrubs
  [ 16, 0.52, 0.50, 0.46],   // rock transition
  [ 22, 0.48, 0.46, 0.42],   // grey rock
  [ 28, 0.94, 0.95, 0.98],   // snow cap
];

// Biome tint colours [R, G, B, strength] applied on top of height colour
const BIOME_TINT: Record<Biome, [number, number, number, number]> = {
  deep_ocean: [0.02, 0.05, 0.18, 0.6],
  ocean:      [0.04, 0.12, 0.38, 0.4],
  reef:       [0.10, 0.38, 0.42, 0.35],  // teal-green reef
  beach:      [0.88, 0.82, 0.58, 0.3],
  desert:     [0.85, 0.58, 0.22, 0.45],  // orange sand
  plains:     [0.32, 0.55, 0.18, 0.1],
  forest:     [0.18, 0.42, 0.12, 0.25],  // dark green
  taiga:      [0.22, 0.40, 0.35, 0.25],  // blue-green
  hills:      [0.38, 0.40, 0.28, 0.15],
  mountain:   [0.52, 0.50, 0.46, 0.1],
  arctic:     [0.90, 0.94, 1.00, 0.5],   // ice blue-white
};

// Rock colour for steep slopes
const ROCK_R = 0.52, ROCK_G = 0.50, ROCK_B = 0.46;
const SLOPE_FULL_ROCK  = 0.75;
const SLOPE_START_ROCK = 0.28;

function heightToRGB(
  h: number,
  slope: number,
  biome: Biome,
  out: Float32Array,
  idx: number,
) {
  const zones = HEIGHT_ZONES;
  let i = 0;
  while (i < zones.length - 2 && h > zones[i + 1][0]) i++;

  const [h0, r0, g0, b0] = zones[i];
  const [h1, r1, g1, b1] = zones[i + 1];
  const t = h1 > h0 ? Math.max(0, Math.min(1, (h - h0) / (h1 - h0))) : 0;

  let r = r0 + (r1 - r0) * t;
  let g = g0 + (g1 - g0) * t;
  let b = b0 + (b1 - b0) * t;

  // Apply biome tint
  const [br, bg, bb, bs] = BIOME_TINT[biome];
  r += (br - r) * bs;
  g += (bg - g) * bs;
  b += (bb - b) * bs;

  // Steep slope → rock colour (not on ocean floor)
  if (h > -3 && slope > SLOPE_START_ROCK) {
    const blend = Math.min(1, (slope - SLOPE_START_ROCK) / (SLOPE_FULL_ROCK - SLOPE_START_ROCK));
    r += (ROCK_R - r) * blend;
    g += (ROCK_G - g) * blend;
    b += (ROCK_B - b) * blend;
  }

  out[idx * 3    ] = r;
  out[idx * 3 + 1] = g;
  out[idx * 3 + 2] = b;
}

// ────────────────────────────────────────────────────────────────────────────

export class TerrainChunk {
  readonly chunkX: number;
  readonly chunkZ:  number;
  readonly id:      string;
  readonly mesh:    THREE.Mesh;
  readonly lodLevel: number;

  private geometry:   THREE.BufferGeometry;
  private heights:    Float32Array;
  private colorArray: Float32Array;
  private segments:   number;

  constructor(chunkX: number, chunkZ: number, noise: NoiseGenerator, segments = 63) {
    this.chunkX   = chunkX;
    this.chunkZ   = chunkZ;
    this.id       = `${chunkX}_${chunkZ}`;
    this.segments = segments;
    this.lodLevel = segments >= 63 ? 0 : segments >= 31 ? 1 : 2;

    const verts = (segments + 1) * (segments + 1);

    const plane = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, segments, segments);
    plane.rotateX(-Math.PI / 2);
    this.geometry = plane;

    this.heights    = new Float32Array(verts);
    this.colorArray = new Float32Array(verts * 3);

    const positions   = this.geometry.attributes.position;
    const worldOffX   = chunkX * CHUNK_SIZE;
    const worldOffZ   = chunkZ * CHUNK_SIZE;
    const vertPerRow  = segments + 1;

    // Pass 1 — compute heights
    for (let i = 0; i < positions.count; i++) {
      const wx = positions.getX(i) + worldOffX;
      const wz = positions.getZ(i) + worldOffZ;
      const h  = noise.getHeight(wx, wz);
      positions.setY(i, h);
      this.heights[i] = h;
    }

    positions.needsUpdate = true;

    // Pass 2 — compute colours with slope + biome
    for (let i = 0; i < positions.count; i++) {
      const row = Math.floor(i / vertPerRow);
      const col = i % vertPerRow;
      const h   = this.heights[i];

      const hL = col > 0        ? this.heights[i - 1]          : h;
      const hR = col < segments ? this.heights[i + 1]          : h;
      const hD = row > 0        ? this.heights[i - vertPerRow] : h;
      const hU = row < segments ? this.heights[i + vertPerRow] : h;

      const slope = Math.sqrt(((hR - hL) * 0.5) ** 2 + ((hU - hD) * 0.5) ** 2);

      const wx    = positions.getX(i) + worldOffX;
      const wz    = positions.getZ(i) + worldOffZ;
      const biome = noise.getBiome(wx, wz);

      heightToRGB(h, slope, biome, this.colorArray, i);
    }

    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colorArray, 3));
    this.geometry.computeVertexNormals();

    // PBR material: realistic roughness, no metalness on terrain
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness:    0.92,
      metalness:    0.0,
      envMapIntensity: 0.8,
    });

    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow    = false;
    this.mesh.position.set(worldOffX, 0, worldOffZ);
    this.mesh.userData.chunkId = this.id;
  }

  applyModification(vertexIndex: number, deltaY: number): void {
    const positions = this.geometry.attributes.position;
    if (vertexIndex < 0 || vertexIndex >= positions.count) return;

    const newY = positions.getY(vertexIndex) + deltaY;
    positions.setY(vertexIndex, newY);
    this.heights[vertexIndex] = newY;

    // Recompute colour for this vertex (approximate slope from neighbours)
    const vpr  = this.segments + 1;
    const row  = Math.floor(vertexIndex / vpr);
    const col  = vertexIndex % vpr;
    const get  = (idx: number) => this.heights[Math.max(0, Math.min(positions.count - 1, idx))];
    const hL   = col > 0           ? get(vertexIndex - 1)   : newY;
    const hR   = col < this.segments ? get(vertexIndex + 1) : newY;
    const hD   = row > 0           ? get(vertexIndex - vpr) : newY;
    const hU   = row < this.segments ? get(vertexIndex + vpr) : newY;
    const slope = Math.sqrt(((hR - hL) * 0.5) ** 2 + ((hU - hD) * 0.5) ** 2);

    // Use 'plains' as fallback biome for modifications (noise not available here)
    heightToRGB(newY, slope, 'plains', this.colorArray, vertexIndex);

    positions.needsUpdate = true;
    (this.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  getHeightAt(localX: number, localZ: number): number {
    const verts = this.segments + 1;
    const scale = this.segments / CHUNK_SIZE;
    const fx    = (localX + CHUNK_SIZE / 2) * scale;
    const fz    = (localZ + CHUNK_SIZE / 2) * scale;

    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const tx = fx - x0;
    const tz = fz - z0;

    const clamp = (v: number) => Math.max(0, Math.min(verts - 1, v));
    const cx0 = clamp(x0);
    const cx1 = clamp(x0 + 1);
    const cz0 = clamp(z0);
    const cz1 = clamp(z0 + 1);

    const h00 = this.heights[cz0 * verts + cx0];
    const h10 = this.heights[cz0 * verts + cx1];
    const h01 = this.heights[cz1 * verts + cx0];
    const h11 = this.heights[cz1 * verts + cx1];

    return h00 * (1 - tx) * (1 - tz)
         + h10 * tx        * (1 - tz)
         + h01 * (1 - tx)  * tz
         + h11 * tx        * tz;
  }

  getHeights(): Float32Array { return this.heights; }

  dispose(): void {
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
