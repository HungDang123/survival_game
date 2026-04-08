import { createNoise2D } from 'simplex-noise';

export class NoiseGenerator {
  private n1: ReturnType<typeof createNoise2D>;
  private n2: ReturnType<typeof createNoise2D>;
  private n3: ReturnType<typeof createNoise2D>;
  private n4: ReturnType<typeof createNoise2D>;

  constructor(seed: number = Math.random()) {
    const rng = this.mulberry32(Math.floor(seed));
    this.n1 = createNoise2D(rng);
    this.n2 = createNoise2D(rng);
    this.n3 = createNoise2D(rng);
    this.n4 = createNoise2D(rng);
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

  getHeight(x: number, z: number): number {
    const STEP = 2;

    const continent = (this.n1(x * 0.0035, z * 0.0035) + 1) / 2;

    const hills = (this.n2(x * 0.018, z * 0.018) + 1) / 2;

    const ridge = Math.abs(this.n3(x * 0.012, z * 0.012));

    const detail = this.n4(x * 0.07, z * 0.07) * 1.2;

    const landT = this.smoothstep(Math.max(0, Math.min(1, continent)));

    const flatBase = landT * 5;

    const hillFactor = landT * landT;
    const hillH = hills * hills * 14 * hillFactor;

    const ridgeH = ridge * ridge * 8 * hillFactor;

    let h = -3 + flatBase + hillH * 0.6 + ridgeH * 0.4 + detail;

    h = Math.floor(h / STEP) * STEP;

    return h;
  }
}
