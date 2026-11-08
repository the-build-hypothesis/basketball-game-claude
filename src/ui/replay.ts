import type { Game } from '../sim/game';
import type { Action, BallState, Phase } from '../sim/types';

/** Minimal visual snapshot of the game (only what the renderer reads). */
interface PlayerSnap {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  facing: number;
  runPhase: number;
  stance: number;
  holdT: number;
  action: Action | null;
}
interface Snap {
  t: number;
  players: PlayerSnap[];
  bx: number;
  by: number;
  bz: number;
  bvx: number;
  bvy: number;
  bvz: number;
  bstate: BallState;
  bowner: number;
  bkind: 'pass' | 'shot' | 'tip' | null;
  phase: Phase;
  controlled: number;
}

function capture(g: Game, t: number): Snap {
  const b = g.ball;
  return {
    t,
    players: g.players.map((p) => ({
      x: p.pos.x,
      y: p.pos.y,
      z: p.pos.z,
      vx: p.vel.x,
      vz: p.vel.z,
      facing: p.facing,
      runPhase: p.runPhase,
      stance: p.stance,
      holdT: p.holdT,
      action: p.action ? { ...p.action } : null,
    })),
    bx: b.pos.x,
    by: b.pos.y,
    bz: b.pos.z,
    bvx: b.vel.x,
    bvy: b.vel.y,
    bvz: b.vel.z,
    bstate: b.state,
    bowner: b.owner,
    bkind: b.flightKind,
    phase: g.phase,
    controlled: g.controlled,
  };
}

function apply(g: Game, s: Snap): void {
  g.players.forEach((p, i) => {
    const q = s.players[i];
    p.pos.x = q.x;
    p.pos.y = q.y;
    p.pos.z = q.z;
    p.vel.x = q.vx;
    p.vel.z = q.vz;
    p.facing = q.facing;
    p.runPhase = q.runPhase;
    p.stance = q.stance;
    p.holdT = q.holdT;
    p.action = q.action ? { ...q.action } : null;
  });
  const b = g.ball;
  b.pos = { x: s.bx, y: s.by, z: s.bz };
  b.vel = { x: s.bvx, y: s.bvy, z: s.bvz };
  b.state = s.bstate;
  b.owner = s.bowner;
  b.flightKind = s.bkind;
  g.phase = s.phase;
  g.controlled = s.controlled;
}

/**
 * Records a rolling window of visual snapshots and plays back the moments around the last made
 * basket. Playback writes snapshots into the (paused) game objects for rendering and restores the
 * exact live state afterwards; the simulation is never stepped during a replay.
 */
export class Replay {
  private buf: Snap[] = [];
  private clock = 0;
  private clip: Snap[] | null = null;
  private scoreT = 0;
  private playT = 0;
  private saved: Snap | null = null;
  basketX = 0;
  active = false;
  swishFired = false;

  reset(): void {
    this.buf = [];
    this.clip = null;
    this.active = false;
  }

  record(g: Game, dt: number): void {
    this.clock += dt;
    this.buf.push(capture(g, this.clock));
    while (this.buf.length && this.clock - this.buf[0].t > 7) this.buf.shift();
  }

  /** Called when a field goal is made; the clip is cut ~1.2 s later to include the ball through the net. */
  markScore(basketX: number): void {
    this.scoreT = this.clock;
    this.basketX = basketX;
    this.clip = null;
  }

  available(): boolean {
    return this.scoreT > 0 && this.clock - this.scoreT > 1.2 && this.clock - this.scoreT < 12;
  }

  start(g: Game): boolean {
    if (!this.available()) return false;
    const from = this.scoreT - 3.5;
    const to = this.scoreT + 1.2;
    this.clip = this.buf.filter((s) => s.t >= from && s.t <= to);
    if (this.clip.length < 10) return false;
    this.saved = capture(g, this.clock);
    this.playT = this.clip[0].t;
    this.active = true;
    this.swishFired = false;
    this.scoreT = 0; // one replay per basket
    return true;
  }

  /** Advance playback (slow motion). Returns false when finished. */
  update(g: Game, dt: number): { done: boolean; atScore: boolean } {
    const clip = this.clip!;
    const prevT = this.playT;
    this.playT += dt * 0.55;
    let i = 0;
    while (i < clip.length - 1 && clip[i + 1].t <= this.playT) i++;
    apply(g, clip[i]);
    const scoreAt = clip[clip.length - 1].t - 1.2;
    const atScore = prevT < scoreAt && this.playT >= scoreAt;
    return { done: this.playT >= clip[clip.length - 1].t, atScore };
  }

  stop(g: Game): void {
    if (this.saved) apply(g, this.saved);
    this.saved = null;
    this.active = false;
    this.clip = null;
  }
}
