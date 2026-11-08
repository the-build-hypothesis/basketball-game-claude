export interface V2 {
  x: number;
  z: number;
}
export interface V3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const v2 = (x = 0, z = 0): V2 => ({ x, z });

export function len2(x: number, z: number): number {
  return Math.sqrt(x * x + z * z);
}
export function dist2(a: V2, b: V2): number {
  return len2(a.x - b.x, a.z - b.z);
}
export function dist3(a: V3, b: V3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
export function norm2(x: number, z: number): V2 {
  const l = len2(x, z);
  return l > 1e-9 ? { x: x / l, z: z / l } : { x: 0, z: 0 };
}
export function angleLerp(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
/** Distance from point p to the segment ab (2D, xz). Returns also the param t along ab. */
export function pointSegDist(p: V2, a: V2, b: V2): { d: number; t: number } {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const l2 = abx * abx + abz * abz;
  let t = l2 > 0 ? ((p.x - a.x) * abx + (p.z - a.z) * abz) / l2 : 0;
  t = clamp(t, 0, 1);
  const cx = a.x + abx * t;
  const cz = a.z + abz * t;
  return { d: len2(p.x - cx, p.z - cz), t };
}

/** Small deterministic PRNG (mulberry32). */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  /** Standard normal via Box-Muller. */
  normal(): number {
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}
