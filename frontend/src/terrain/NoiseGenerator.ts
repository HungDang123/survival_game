import { createNoise2D } from 'simplex-noise';

// ── Biome types ──────────────────────────────────────────────────────────────
export type Biome =
  | 'deep_ocean'
  | 'ocean'
  | 'reef'
  | 'beach'
  | 'desert'
  | 'plains'
  | 'forest'
  | 'taiga'
  | 'hills'
  | 'mountain'
  | 'arctic';

// ────────────────────────────────────────────────────────────────────────────

export class NoiseGenerator {
  private n1: ReturnType<typeof createNoise2D>; // continent shape
  private n2: ReturnType<typeof createNoise2D>; // hills
  private n3: ReturnType<typeof createNoise2D>; // ridges
  private n4: ReturnType<typeof createNoise2D>; // micro detail
  private n5: ReturnType<typeof createNoise2D>; // temperature (biome)

  constructor(seed: number = Math.random()) {
    const rng = this.mulberry32(Math.floor(seed));
    this.n1 = createNoise2D(rng);
    this.n2 = createNoise2D(rng);
    this.n3 = createNoise2D(rng);
    this.n4 = createNoise2D(rng);
    this.n5 = createNoise2D(rng);
  }

  private mulberry32(seed: number): () => number {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  private smoothstep(t: number): number {
    return t * t * (3 - 2 * t);
  }

  /**
   * Returns the continent influence [0..1] at world position.
   * < 0.42 = ocean / deep ocean
   * > 0.42 = land
   */
  getContinent(x: number, z: number): number {
    return (this.n1(x * 0.003, z * 0.003) + 1) / 2;
  }

  /** Temperature [0..1] — 0 = arctic, 1 = tropical/desert */
  getTemperature(x: number, z: number): number {
    return (this.n5(x * 0.0018, z * 0.0018) + 1) / 2;
  }

  getHeight(x: number, z: number): number {
    const STEP = 2;
    const continent = this.getContinent(x, z);

    // Ocean depth — when continent < 0.42 push terrain deep below water
    const oceanness  = Math.max(0, 0.42 - continent) / 0.42;
    const oceanDepth = oceanness * oceanness * 22;  // up to -22 at centre of ocean

    // Land height — only contributes when continent > 0.42
    const landT      = this.smoothstep(Math.max(0, Math.min(1, (continent - 0.42) / 0.32)));
    const hills      = (this.n2(x * 0.018, z * 0.018) + 1) / 2;
    const ridge      = Math.abs(this.n3(x * 0.012, z * 0.012));
    const detail     = this.n4(x * 0.07,  z * 0.07)  * 1.2;

    const flatBase   = landT * 5;
    const hillFactor = landT * landT;
    const hillH      = hills * hills * 18 * hillFactor;
    const ridgeH     = ridge * ridge * 11 * hillFactor;

    let h = -oceanDepth + flatBase + hillH * 0.6 + ridgeH * 0.4 + detail;
    h = Math.floor(h / STEP) * STEP;
    return h;
  }

  /**
   * Returns the biome at world position based on continent + temperature.
   * This is deterministic and does NOT need the terrain height.
   */
  getBiome(x: number, z: number): Biome {
    const c    = this.getContinent(x, z);
    const temp = this.getTemperature(x, z);

    if (c < 0.30)  return 'deep_ocean';
    if (c < 0.38)  return 'ocean';
    if (c < 0.42)  return 'reef';         // shallow / tropical shelf
    if (c < 0.47)  return temp > 0.60 ? 'beach' : 'beach';   // always beach at shore
    if (c < 0.58)  return temp > 0.68 ? 'desert' : 'plains';
    if (c < 0.70)  return temp < 0.32 ? 'taiga'  : 'forest';
    if (c < 0.82)  return 'hills';
    if (c < 0.92)  return 'mountain';
    return 'arctic';
  }
}
