import { createNoise2D } from 'simplex-noise';

export class NoiseGenerator {
  private noise2D: ReturnType<typeof createNoise2D>;
  private noise2D2: ReturnType<typeof createNoise2D>;
  private noise2D3: ReturnType<typeof createNoise2D>;

  constructor(seed: number = Math.random()) {
    const seededRandom = this.mulberry32(seed);
    this.noise2D = createNoise2D(seededRandom);
    this.noise2D2 = createNoise2D(seededRandom);
    this.noise2D3 = createNoise2D(seededRandom);
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

  getHeight(x: number, z: number): number {
    const scale1 = 0.008;
    const scale2 = 0.025;
    const scale3 = 0.1;

    const h1 = this.noise2D(x * scale1, z * scale1) * 30;
    const h2 = this.noise2D2(x * scale2, z * scale2) * 10;
    const h3 = this.noise2D3(x * scale3, z * scale3) * 3;

    return h1 + h2 + h3;
  }
}
