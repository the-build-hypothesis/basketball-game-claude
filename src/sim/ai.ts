import { attackBasketX, attackSign, BLOCK_JUMP_HEIGHT, HALF_L, HALF_W, LAYUP_RANGE, SHOT_IDEAL } from './constants';
import { clampToCourt, defendBasketPos, offenseSpot, shotPointValue } from './court';
import { clamp, dist2, len2, norm2, pointSegDist, type V2 } from './math';
import type { Game } from './game';
import type { Player } from './types';

export interface AIParams {
  /** Std-dev of the AI shooter's release timing around the ideal meter value. */
  timingSigma: number;
  /** Seconds before a defender reacts to a shot. */
  reaction: number;
  /** Probability per decision tick that an on-ball defender tries to steal. */
  stealTry: number;
  speed: number;
  gap: number;
}

const PARAMS: Record<string, AIParams> = {
  easy: { timingSigma: 0.17, reaction: 0.34, stealTry: 0.03, speed: 0.93, gap: 1.35 },
  normal: { timingSigma: 0.11, reaction: 0.22, stealTry: 0.06, speed: 1.0, gap: 1.1 },
  hard: { timingSigma: 0.075, reaction: 0.14, stealTry: 0.09, speed: 1.04, gap: 0.95 },
};

/** Difficulty only applies to the AI opponent of a human team; everyone else plays "normal". */
export function aiParams(g: Game, team: number): AIParams {
  if (g.config.humanTeam >= 0 && team !== g.config.humanTeam) return PARAMS[g.config.difficulty];
  return PARAMS.normal;
}

function moveTo(p: Player, t: V2, sprint = false, arrive = 0.9): void {
  const dx = t.x - p.pos.x;
  const dz = t.z - p.pos.z;
  const d = len2(dx, dz);
  if (d < 0.2) {
    p.intent.mx = 0;
    p.intent.mz = 0;
    p.intent.sprint = false;
    return;
  }
  const k = Math.min(1, d / arrive) / d;
  p.intent.mx = dx * k;
  p.intent.mz = dz * k;
  p.intent.sprint = sprint && d > 2.5;
}

function faceToward(p: Player, t: V2): void {
  p.intent.face = Math.atan2(t.z - p.pos.z, t.x - p.pos.x);
}

/** Where the loose ball will next be reachable (ballistic prediction, ignoring collisions). */
export function predictBall(g: Game): V2 {
  const b = g.ball;
  let x = b.pos.x;
  let y = b.pos.y;
  let z = b.pos.z;
  let vy = b.vel.y;
  const dt = 0.05;
  for (let t = 0; t < 1.6; t += dt) {
    if (y < 2.4 && vy <= 0) break;
    x += b.vel.x * dt;
    z += b.vel.z * dt;
    vy -= 9.81 * dt;
    y += vy * dt;
  }
  if (b.pos.y < 0.4) {
    x = b.pos.x + b.vel.x * 0.3;
    z = b.pos.z + b.vel.z * 0.3;
  }
  const p = { x, z };
  clampToCourt(p, 0.35);
  return p;
}

/** Expected points of a shot by p from pos (used for AI decisions only). */
export function shotValue(g: Game, p: Player, pos: V2): number {
  const bx = attackBasketX(p.team);
  const d = len2(bx - pos.x, pos.z);
  let base: number;
  if (d < 1.6) base = 0.68;
  else if (d < LAYUP_RANGE) base = 0.6;
  else if (d < 4.5) base = 0.46;
  else if (d < 6.7) base = 0.41;
  else if (d < 8.2) base = 0.37;
  else base = Math.max(0, 0.37 - (d - 8.2) * 0.12);
  const pts = shotPointValue(pos.x, pos.z, bx);
  let od = Infinity;
  for (const q of g.players) if (q.team !== p.team) od = Math.min(od, dist2(q.pos, pos));
  const open = clamp(0.4 + (od - 0.8) * 0.4, 0.3, 1);
  return base * open * pts * p.shootRating;
}

function laneRisk(g: Game, from: Player, to: Player): number {
  let risk = 0;
  for (const q of g.players) {
    if (q.team === from.team) continue;
    const r = pointSegDist(q.pos, from.pos, to.pos);
    if (r.t > 0.1 && r.t < 0.95 && r.d < 0.9) risk = Math.max(risk, 1 - r.d / 0.9);
  }
  return risk;
}

function bestPassOption(g: Game, p: Player): { to: Player | null; val: number } {
  let best: Player | null = null;
  let bestVal = -Infinity;
  for (const q of g.players) {
    if (q.team !== p.team || q.id === p.id) continue;
    const d = dist2(q.pos, p.pos);
    if (d < 2 || d > 16) continue;
    const v = shotValue(g, q, q.pos) * 0.92 - laneRisk(g, p, q) * 1.6 - (d > 11 ? 0.25 : 0);
    if (v > bestVal) {
      bestVal = v;
      best = q;
    }
  }
  return { to: best, val: bestVal };
}

function rankAmong(g: Game, p: Player, pt: V2): number {
  // rank of p among AI-controlled teammates by distance to pt
  const dp = dist2(p.pos, pt);
  let rank = 0;
  for (const q of g.players) {
    if (q.team !== p.team || q.id === p.id || g.isHumanControlled(q)) continue;
    if (dist2(q.pos, pt) < dp) rank++;
  }
  return rank;
}

export function updateAI(g: Game, p: Player, dt: number): void {
  const it = p.intent;
  it.mx = 0;
  it.mz = 0;
  it.sprint = false;
  it.face = null;
  const ph = g.phase;
  const b = g.ball;
  if (ph === 'tipoff' || ph === 'final' || ph === 'quarterEnd' || ph === 'pregame' || ph === 'freethrow') return;
  if (ph === 'deadball' && g.deadball && g.deadball.inbounder === p.id) {
    moveTo(p, g.deadball.spot, true, 0.4);
    return;
  }
  if (ph === 'inbound' && g.inbound && g.inbound.inbounder === p.id) {
    faceToward(p, { x: 0, z: 0 });
    return;
  }
  const hasBall = b.state === 'held' && b.owner === p.id;
  if (hasBall) {
    if (ph === 'live') ballhandler(g, p, dt);
    return;
  }
  if (ph === 'live') {
    // pass headed my way
    if (b.state === 'flight' && b.flightKind === 'pass' && b.passTo === p.id) {
      const t = clamp(dist2(b.pos, p.pos) / Math.max(1, len2(b.vel.x, b.vel.z)), 0, 1);
      moveTo(p, { x: b.pos.x + b.vel.x * t, z: b.pos.z + b.vel.z * t }, false, 0.5);
      faceToward(p, b.pos);
      return;
    }
    const shot = g.activeShot;
    const shotDescending = shot && !shot.resolved && (shot.touchedRim || shot.touchedBoard || b.vel.y < 0);
    if (b.state === 'loose' || (b.state === 'flight' && b.flightKind === 'tip') || (shotDescending && b.state !== 'held')) {
      const pred = predictBall(g);
      if (rankAmong(g, p, pred) < 2 || dist2(p.pos, pred) < 2.5) {
        moveTo(p, pred, true, 0.3);
        faceToward(p, b.pos);
        // jump for a high ball we can reach
        const hd = dist2(p.pos, b.pos);
        if (b.vel.y < 0 && hd < 0.9 && b.pos.y > 2.3 && b.pos.y < 3.3 && p.pos.y <= 0) g.jump(p, 0.6);
        return;
      }
    }
  }
  if (g.possession === p.team) offBall(g, p, dt);
  else defense(g, p, dt);
}

function ballhandler(g: Game, p: Player, dt: number): void {
  const ai = p.ai;
  ai.holdT += dt;
  if (p.action && p.action.kind === 'shoot') return;
  const prm = aiParams(g, p.team);
  const s = attackSign(p.team);
  const bx = attackBasketX(p.team);
  const dB = len2(bx - p.pos.x, p.pos.z);
  const front = s * p.pos.x > 0;
  const shootNow = (): void => {
    g.startShot(p, SHOT_IDEAL + g.rng.normal() * prm.timingSigma);
    ai.driving = false;
    ai.probe = null;
  };
  const clockLeft = Math.min(g.shotClock, g.gameClock);
  ai.decT -= dt;

  if (!front || dB > 10.5) {
    // bring the ball up
    const tgt = { x: s * (HALF_L - 9.2), z: clamp(p.pos.z * 0.6, -4, 4) };
    moveTo(p, tgt, dB > 13 && p.stamina > 0.35);
    if (ai.decT <= 0) {
      ai.decT = 0.4;
      if (clockLeft < 1.3) return shootNow();
      if (ai.holdT > 1.2 && g.time - ai.lastPassT > 1.5 && g.rng.chance(0.2)) {
        const o = bestPassOption(g, p);
        if (o.to && s * (o.to.pos.x - p.pos.x) > 3 && o.val > 0.6) g.doPass(p, o.to);
      }
    }
    return;
  }

  if (ai.decT <= 0) {
    ai.decT = g.rng.range(0.22, 0.4);
    const myVal = shotValue(g, p, p.pos);
    let thr = 0.2 + 0.62 * clamp((clockLeft - 2) / 16, 0, 1);
    if (ai.holdT < 0.7) thr += 0.2;
    if (clockLeft < 2.2) thr = 0;
    const o = bestPassOption(g, p);
    const defNear = g.nearestDist(g.opponents(p.team), p.pos);
    // a forward/center already attacking an open lane keeps going to the rim
    const attacking = ai.driving && p.role >= 2 && dB < 4.5 && dB > 1.55 && clockLeft > 2;
    if (!attacking && myVal > thr && (myVal >= o.val - 0.08 || clockLeft < 3)) return shootNow();
    if (o.to && o.val > 0.3 && clockLeft > 2.5 && g.time - ai.lastPassT > 1.0 && ai.holdT > 0.8) {
      if ((o.val > myVal + 0.2 && g.rng.chance(0.5)) || (defNear < 0.75 && g.rng.chance(0.15)) || ai.holdT > 6) {
        g.doPass(p, o.to);
        return;
      }
    }
    // drive if the lane is clear
    const toB = norm2(bx - p.pos.x, -p.pos.z);
    let laneClear = true;
    for (const q of g.opponents(p.team)) {
      const r = pointSegDist(q.pos, p.pos, { x: bx, z: 0 });
      if (r.d < 1.0 && r.t > 0.02 && r.t < 0.85) laneClear = false;
    }
    ai.driving = laneClear && dB > 1.6 && (ai.driving || g.rng.chance(0.45));
    if (!ai.driving && (!ai.probe || dist2(ai.probe, p.pos) < 0.6 || g.rng.chance(0.25))) {
      const ang = g.rng.range(-1.2, 1.2);
      const r = g.rng.range(5.0, 7.9);
      ai.probe = { x: bx - s * Math.cos(ang) * r, z: Math.sin(ang) * r };
      clampToCourt(ai.probe, 0.6);
    }
    void toB;
  }
  if (ai.driving) {
    moveTo(p, { x: bx - s * 0.9, z: 0 }, p.stamina > 0.3, 0.3);
    // guards finish with a layup; forwards/centers attack the rim for a dunk
    if (dB < (p.role >= 2 ? 1.55 : LAYUP_RANGE - 0.4)) {
      shootNow();
      return;
    }
  } else if (ai.probe) {
    moveTo(p, ai.probe, false, 0.8);
  }
}

function offBall(g: Game, p: Player, dt: number): void {
  const ai = p.ai;
  const s = attackSign(p.team);
  const bx = attackBasketX(p.team);
  const bh = g.ballHandler();
  faceToward(p, g.ball.pos);
  // inbound receiver
  if (g.phase === 'inbound' && g.inbound && g.inbound.team === p.team) {
    const spot = g.inbound.spot;
    const mates = g.teamPlayers(p.team).filter((q) => q.id !== g.inbound!.inbounder);
    const recv = g.nearestPlayer(mates, spot);
    if (recv.id === p.id) {
      const inward = norm2(-spot.x * 0.2, -spot.z);
      const tgt = { x: spot.x + inward.x * 3.4 + (Math.abs(spot.x) > HALF_L ? -Math.sign(spot.x) * 2.5 : 0), z: spot.z + inward.z * 3.4 };
      clampToCourt(tgt, 0.6);
      moveTo(p, tgt, true);
      return;
    }
  }
  ai.spotT -= dt;
  if (ai.spotT <= 0) {
    ai.spotT = g.rng.range(3, 6.5);
    ai.spotVariant = Math.floor(g.rng.range(0, 3));
  }
  let tgt = offenseSpot(p.team, p.role, ai.spotVariant);
  // crash the boards on a teammate's shot (bigs), guards get back
  const shot = g.activeShot;
  if (shot && shot.team === p.team && !shot.resolved) {
    if (p.role >= 3) {
      const side = p.pos.z >= 0 ? 1 : -1;
      tgt = { x: bx - s * 1.3, z: side * 1.6 };
    } else if (p.role === 0) tgt = { x: s * 2, z: 0 };
    moveTo(p, tgt, true);
    return;
  }
  // cut to the basket when tightly guarded
  const man = g.players[g.matchups[p.id]];
  if (ai.cutT > 0) {
    ai.cutT -= dt;
    tgt = { x: bx - s * 1.4, z: p.pos.z > 0 ? 0.9 : -0.9 };
  } else if (man && dist2(man.pos, p.pos) < 0.9 && s * p.pos.x > 4 && g.rng.chance(dt * 0.35)) {
    ai.cutT = 1.6;
  }
  // keep spacing from the ballhandler
  if (bh && bh.team === p.team && dist2(tgt, bh.pos) < 3) {
    ai.spotVariant = (ai.spotVariant + 1) % 3;
    tgt = offenseSpot(p.team, p.role, ai.spotVariant);
  }
  moveTo(p, tgt, dist2(tgt, p.pos) > 7);
}

function defense(g: Game, p: Player, dt: number): void {
  const prm = aiParams(g, p.team);
  const ai = p.ai;
  const basket = defendBasketPos(p.team);
  const man = g.players[g.matchups[p.id]];
  const b = g.ball;
  faceToward(p, b.pos);
  if (!man) return;
  const shot = g.activeShot;
  let tgt: V2;
  let sprint = false;
  if (shot && !shot.resolved && shot.team !== p.team && g.phase === 'live') {
    // box out: get between the man and the rim
    const dir = norm2(man.pos.x - basket.x, man.pos.z - basket.z);
    const r = Math.min(2.1, dist2(man.pos, basket) * 0.6);
    tgt = { x: basket.x + dir.x * r, z: basket.z + dir.z * r };
    sprint = true;
  } else if (b.state === 'held' && b.owner === man.id) {
    const dir = norm2(basket.x - man.pos.x, basket.z - man.pos.z);
    tgt = { x: man.pos.x + dir.x * prm.gap, z: man.pos.z + dir.z * prm.gap };
    sprint = dist2(p.pos, tgt) > 2.5;
    ai.decT -= dt;
    if (ai.decT <= 0) {
      ai.decT = 0.5;
      if (g.phase === 'live' && dist2(p.pos, man.pos) < 1.3 && g.rng.chance(prm.stealTry)) g.attemptSteal(p);
    }
  } else {
    // help defense: sag toward the basket and the ball
    const t = 0.33;
    tgt = { x: man.pos.x + (basket.x - man.pos.x) * t, z: man.pos.z + (basket.z - man.pos.z) * t };
    tgt.x += (b.pos.x - tgt.x) * 0.15;
    tgt.z += (b.pos.z - tgt.z) * 0.15;
    sprint = dist2(p.pos, tgt) > 3;
  }
  // don't press beyond ~half court
  const db = dist2(tgt, basket);
  if (db > 15.5) {
    const dir = norm2(tgt.x - basket.x, tgt.z - basket.z);
    tgt = { x: basket.x + dir.x * 15.5, z: basket.z + dir.z * 15.5 };
  }
  tgt.z = clamp(tgt.z, -HALF_W + 0.3, HALF_W - 0.3);

  // contest any shooter close by
  for (const q of g.players) {
    if (q.team === p.team || !q.action || q.action.kind !== 'shoot' || q.action.released) continue;
    const d = dist2(q.pos, p.pos);
    if (d < 2.6) {
      const away = norm2(p.pos.x - q.pos.x, p.pos.z - q.pos.z);
      tgt = { x: q.pos.x + away.x * 1.0, z: q.pos.z + away.z * 1.0 };
      sprint = true;
      faceToward(p, q.pos);
      if (q.action.t > prm.reaction + (q.action.layup ? 0 : 0.12) && d < 1.7 && p.pos.y <= 0) g.jump(p, BLOCK_JUMP_HEIGHT);
    }
  }
  moveTo(p, tgt, sprint, 0.5);
}
