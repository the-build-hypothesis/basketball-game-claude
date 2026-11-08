import {
  BACKBOARD_BOTTOM,
  BACKBOARD_FACE_X,
  BACKBOARD_H,
  BACKBOARD_T,
  BACKBOARD_W,
  BALL_R,
  BASKET_X,
  GRAVITY,
  RIM_H,
  RIM_R,
  RIM_TUBE,
} from './constants';
import type { V3 } from './math';

export interface BallBody {
  pos: V3;
  vel: V3;
}

export interface PhysicsHits {
  rim: number; // impact speed (0 if none)
  board: number;
  floor: number;
  /** basket index (0: +x basket, 1: -x basket) the ball passed down through, or -1 */
  basket: number;
  rimBasket: number;
  boardBasket: number;
}

const FLOOR_E = 0.78;
const FLOOR_FRICTION = 0.86;
const RIM_E = 0.55;
const RIM_TANGENT_KEEP = 0.82;
const BOARD_E = 0.62;
const AIR_DRAG = 0; // drag ignored (launch solver is drag-free)

/** x-coordinate of rim centers for basket index 0 (+x) and 1 (-x). */
export const RIM_X = [BASKET_X, -BASKET_X];

function collideRim(b: BallBody, rimX: number): number {
  // Closest point on the rim circle (radius RIM_R + RIM_TUBE centerline) to the ball center.
  const cr = RIM_R + RIM_TUBE;
  const dx = b.pos.x - rimX;
  const dz = b.pos.z;
  let hl = Math.hypot(dx, dz);
  let ux = 1;
  let uz = 0;
  if (hl > 1e-6) {
    ux = dx / hl;
    uz = dz / hl;
  } else {
    hl = 0;
  }
  const cx = rimX + ux * cr;
  const cz = uz * cr;
  const nx = b.pos.x - cx;
  const ny = b.pos.y - RIM_H;
  const nz = b.pos.z - cz;
  const d = Math.sqrt(nx * nx + ny * ny + nz * nz);
  const minD = BALL_R + RIM_TUBE;
  if (d >= minD || d < 1e-9) return 0;
  const inx = nx / d;
  const iny = ny / d;
  const inz = nz / d;
  // push out
  const pen = minD - d;
  b.pos.x += inx * pen;
  b.pos.y += iny * pen;
  b.pos.z += inz * pen;
  const vn = b.vel.x * inx + b.vel.y * iny + b.vel.z * inz;
  if (vn >= 0) return 0;
  // split velocity into normal / tangential
  const tx = b.vel.x - vn * inx;
  const ty = b.vel.y - vn * iny;
  const tz = b.vel.z - vn * inz;
  b.vel.x = tx * RIM_TANGENT_KEEP - vn * RIM_E * inx;
  b.vel.y = ty * RIM_TANGENT_KEEP - vn * RIM_E * iny;
  b.vel.z = tz * RIM_TANGENT_KEEP - vn * RIM_E * inz;
  return -vn;
}

function collideBoard(b: BallBody, side: 1 | -1): number {
  // Board occupies x in [face, face + T] (for side +1) or mirrored.
  const face = side * BACKBOARD_FACE_X;
  const back = side * (BACKBOARD_FACE_X + BACKBOARD_T);
  const minX = Math.min(face, back);
  const maxX = Math.max(face, back);
  const cx = Math.min(Math.max(b.pos.x, minX), maxX);
  const cy = Math.min(Math.max(b.pos.y, BACKBOARD_BOTTOM), BACKBOARD_BOTTOM + BACKBOARD_H);
  const cz = Math.min(Math.max(b.pos.z, -BACKBOARD_W / 2), BACKBOARD_W / 2);
  let nx = b.pos.x - cx;
  let ny = b.pos.y - cy;
  let nz = b.pos.z - cz;
  let d = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (d >= BALL_R) return 0;
  if (d < 1e-9) {
    // center inside the board: push out the front face
    nx = -side;
    ny = 0;
    nz = 0;
    d = 0;
  } else {
    nx /= d;
    ny /= d;
    nz /= d;
  }
  const pen = BALL_R - d;
  b.pos.x += nx * pen;
  b.pos.y += ny * pen;
  b.pos.z += nz * pen;
  const vn = b.vel.x * nx + b.vel.y * ny + b.vel.z * nz;
  if (vn >= 0) return 0;
  b.vel.x -= (1 + BOARD_E) * vn * nx;
  b.vel.y -= (1 + BOARD_E) * vn * ny;
  b.vel.z -= (1 + BOARD_E) * vn * nz;
  // a little friction along the glass
  b.vel.y *= 0.92;
  b.vel.z *= 0.92;
  return -vn;
}

/**
 * Integrate the ball for dt seconds using `substeps` sub-steps.
 * Detects rim/backboard/floor contacts and downward passes through either rim.
 */
export function stepBall(b: BallBody, dt: number, substeps: number): PhysicsHits {
  const hits: PhysicsHits = { rim: 0, board: 0, floor: 0, basket: -1, rimBasket: -1, boardBasket: -1 };
  const h = dt / substeps;
  for (let i = 0; i < substeps; i++) {
    const prevY = b.pos.y;
    b.vel.y -= GRAVITY * h;
    const drag = 1 - AIR_DRAG * h;
    b.vel.x *= drag;
    b.vel.z *= drag;
    b.pos.x += b.vel.x * h;
    b.pos.y += b.vel.y * h;
    b.pos.z += b.vel.z * h;

    // basket crossing: ball center moves down through the rim plane inside the ring
    if (prevY >= RIM_H && b.pos.y < RIM_H && b.vel.y < 0) {
      for (let k = 0; k < 2; k++) {
        const hd = Math.hypot(b.pos.x - RIM_X[k], b.pos.z);
        if (hd < RIM_R - 0.02) hits.basket = k;
      }
    }

    // Only test the hoop near the ball (cheap broad phase)
    const k = b.pos.x > 0 ? 0 : 1;
    if (Math.abs(b.pos.x - RIM_X[k]) < 1.2 && b.pos.y > 2.3 && b.pos.y < 4.3) {
      const r = collideRim(b, RIM_X[k]);
      if (r > 0) {
        hits.rim = Math.max(hits.rim, r);
        hits.rimBasket = k;
      }
      const bb = collideBoard(b, k === 0 ? 1 : -1);
      if (bb > 0) {
        hits.board = Math.max(hits.board, bb);
        hits.boardBasket = k;
      }
      // net: damp horizontal motion while the ball is inside the net volume
      const hd = Math.hypot(b.pos.x - RIM_X[k], b.pos.z);
      if (hd < RIM_R && b.pos.y < RIM_H && b.pos.y > RIM_H - 0.45) {
        const damp = 1 - 6 * h;
        b.vel.x *= damp;
        b.vel.z *= damp;
        if (b.vel.y < -1.5) b.vel.y *= 1 - 3 * h;
      }
    }

    // floor
    if (b.pos.y < BALL_R) {
      b.pos.y = BALL_R;
      if (b.vel.y < 0) {
        const impact = -b.vel.y;
        if (impact > 0.35) {
          hits.floor = Math.max(hits.floor, impact);
          b.vel.y = impact * FLOOR_E;
          b.vel.x *= FLOOR_FRICTION;
          b.vel.z *= FLOOR_FRICTION;
        } else {
          b.vel.y = 0; // resting / rolling contact
        }
      }
    }
    // rolling friction when on the floor
    if (b.pos.y <= BALL_R + 1e-4 && b.vel.y === 0) {
      const f = 1 - 0.9 * h;
      b.vel.x *= f;
      b.vel.z *= f;
    }
  }
  return hits;
}

/**
 * Solve the launch velocity that carries a projectile from p0 to target with the given
 * launch elevation angle (radians). Returns null if unreachable at that angle.
 */
export function solveLaunch(p0: V3, target: V3, angle: number): V3 | null {
  const dx = target.x - p0.x;
  const dz = target.z - p0.z;
  const d = Math.hypot(dx, dz);
  const h = target.y - p0.y;
  const c = Math.cos(angle);
  const t = Math.tan(angle);
  const denom = 2 * c * c * (d * t - h);
  if (d < 1e-4 || denom <= 0) return null;
  const v2 = (GRAVITY * d * d) / denom;
  const v = Math.sqrt(v2);
  const vh = v * c;
  return { x: (dx / d) * vh, y: v * Math.sin(angle), z: (dz / d) * vh };
}

/** Launch velocity to reach target in a given flight time (used for passes). */
export function solveLaunchTime(p0: V3, target: V3, time: number): V3 {
  return {
    x: (target.x - p0.x) / time,
    y: (target.y - p0.y + 0.5 * GRAVITY * time * time) / time,
    z: (target.z - p0.z) / time,
  };
}
