import {
  attackBasketX,
  attackSign,
  BASKET_X,
  HALF_L,
  HALF_W,
  THREE_CORNER_DX,
  THREE_CORNER_Z,
  THREE_R,
} from './constants';
import type { V2 } from './math';

/** True if a shot released from (x,z) at the basket located at basketX is worth three points. */
export function isThreePointShot(x: number, z: number, basketX: number): boolean {
  const s = Math.sign(basketX) || 1;
  // distance from the rim toward mid-court (positive = in front of the basket)
  const dx = s * (basketX - x);
  if (dx < THREE_CORNER_DX) return Math.abs(z) > THREE_CORNER_Z;
  return Math.hypot(basketX - x, z) > THREE_R;
}

export function shotPointValue(x: number, z: number, basketX: number): 2 | 3 {
  return isThreePointShot(x, z, basketX) ? 3 : 2;
}

export function isInBounds(x: number, z: number, margin = 0): boolean {
  return Math.abs(x) <= HALF_L - margin && Math.abs(z) <= HALF_W - margin;
}

/** True if (x) is in the frontcourt (offensive half) of the team. */
export function inFrontcourt(team: number, x: number): boolean {
  return attackSign(team) * x > 0;
}

/**
 * Offensive spacing spots by role (0 PG,1 SG,2 SF,3 PF,4 C) for a team.
 * Given as positions relative to the attacked basket and converted to world space.
 */
const SPOTS: Array<Array<[number, number]>> = [
  // [distance in from baseline, z]
  [
    [9.4, 0.6],
    [8.6, -2.5],
    [9.6, 2.4],
  ], // PG: top of the key variants
  [
    [6.6, 5.6],
    [1.0, 7.05],
    [4.2, 6.9],
  ], // SG: right wing / corner
  [
    [6.6, -5.6],
    [1.0, -7.05],
    [4.2, -6.9],
  ], // SF: left wing / corner
  [
    [5.4, 2.9],
    [2.4, 3.0],
    [6.2, 0.4],
  ], // PF: elbow / short corner / high post
  [
    [2.2, -2.8],
    [3.0, 2.6],
    [2.2, -1.2],
  ], // C: block
];

export function offenseSpot(team: number, role: number, variant: number): V2 {
  const s = attackSign(team);
  const opts = SPOTS[role % 5];
  const [u, z] = opts[variant % opts.length];
  return { x: s * (HALF_L - u), z: z * s };
}

export function basketPos(team: number): V2 {
  return { x: attackBasketX(team), z: 0 };
}

/** The basket a team defends. */
export function defendBasketPos(team: number): V2 {
  return { x: -attackBasketX(team), z: 0 };
}

export function clampToCourt(p: V2, margin: number): void {
  const mx = HALF_L - margin;
  const mz = HALF_W - margin;
  if (p.x > mx) p.x = mx;
  if (p.x < -mx) p.x = -mx;
  if (p.z > mz) p.z = mz;
  if (p.z < -mz) p.z = -mz;
}

export const BASKETS: V2[] = [
  { x: BASKET_X, z: 0 },
  { x: -BASKET_X, z: 0 },
];
