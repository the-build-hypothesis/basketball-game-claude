import {
  ACCEL,
  attackBasketX,
  attackSign,
  BALL_R,
  BALL_SUBSTEPS,
  BLOCK_JUMP_HEIGHT,
  DRIBBLE_SPEED_MULT,
  GRAVITY,
  HALF_L,
  HALF_W,
  JUMP_HEIGHT,
  LAYUP_RANGE,
  PLAYER_RADIUS,
  RIM_H,
  RUN_SPEED,
  SHOT_CLOCK,
  SHOT_CLOCK_OREB,
  SHOT_FORCE_RELEASE,
  SHOT_IDEAL,
  SHOT_METER_TIME,
  SPRINT_SPEED,
} from './constants';
import { clampToCourt, isInBounds, shotPointValue } from './court';
import { solveLaunch, solveLaunchTime, stepBall } from './ballPhysics';
import { angleLerp, clamp, dist2, len2, norm2, Rng, type V2, type V3 } from './math';
import type {
  Ball,
  GameConfig,
  GameEvent,
  HumanInput,
  Phase,
  Player,
  ShootAction,
  ShotInfo,
  TeamId,
  TeamStats,
} from './types';
import { updateAI, aiParams } from './ai';

const NAMES: [string[], string[]] = [
  ['Okafor', 'Lindqvist', 'Marrero', 'Tanaka', 'Brennan'],
  ['Vasquez', 'Achebe', 'Kowalski', 'Duarte', 'Haldane'],
];
const NUMBERS: [number[], number[]] = [
  [3, 11, 23, 32, 50],
  [1, 7, 15, 24, 44],
];

export const DEFAULT_CONFIG: GameConfig = {
  quarterLength: 120,
  quarters: 4,
  difficulty: 'normal',
  humanTeam: 0,
  seed: 12345,
};

function emptyStats(): TeamStats {
  return { pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, oreb: 0, dreb: 0, stl: 0, blk: 0, tov: 0 };
}

export interface DeadballInfo {
  reason: string;
  team: TeamId;
  spot: V2;
  inbounder: number;
}

export class Game {
  config: GameConfig;
  rng: Rng;
  time = 0;
  phase: Phase = 'pregame';
  phaseT = 0;
  quarter = 1;
  gameClock = 0;
  shotClock = SHOT_CLOCK;
  /** Shot clock frozen after a shot hits the rim until a new possession is established. */
  shotClockFrozen = false;
  possession: TeamId | -1 = -1;
  score: [number, number] = [0, 0];
  stats: [TeamStats, TeamStats] = [emptyStats(), emptyStats()];
  players: Player[] = [];
  ball: Ball;
  activeShot: ShotInfo | null = null;
  shotCounter = 0;
  /** id of the player controlled by the human, or -1 */
  controlled = -1;
  events: GameEvent[] = [];
  lastTouchTeam: TeamId = 0;
  buzzerPending = false;
  buzzerT = 0;
  deadball: DeadballInfo | null = null;
  inbound: DeadballInfo | null = null;
  tipWinner: TeamId = 0;
  tipJumpTime = -1;
  tipDone = false;
  /** defender id -> offensive player id */
  matchups: number[] = new Array(10).fill(-1);
  looseT = 0;
  input: HumanInput = {
    move: { x: 0, z: 0 },
    sprint: false,
    shootHeld: false,
    passPressed: false,
    switchPressed: false,
    stealPressed: false,
  };
  private prevShootHeld = false;
  /** Multiplier on random shot error (1 = normal). Tests use 0 for deterministic aim. */
  shotErrorScale = 1;

  constructor(config: Partial<GameConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rng = new Rng(this.config.seed);
    this.ball = {
      pos: { x: 0, y: 1.5, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
      state: 'dead',
      owner: -1,
      flightKind: null,
      passFrom: -1,
      passTo: -1,
      passRolled: new Set(),
      dribblePhase: 0,
      flightT: 0,
      spinAngle: 0,
    };
    for (let t = 0; t < 2; t++) {
      for (let r = 0; r < 5; r++) {
        const isGuard = r <= 1;
        this.players.push({
          id: t * 5 + r,
          team: t as TeamId,
          role: r,
          number: NUMBERS[t][r],
          name: NAMES[t][r],
          pos: { x: 0, y: 0, z: 0 },
          vel: { x: 0, z: 0 },
          vy: 0,
          facing: 0,
          speedRating: (isGuard ? 1.04 : r === 4 ? 0.95 : 1.0) + this.rng.range(-0.02, 0.02),
          shootRating: (isGuard ? 1.08 : r === 4 ? 0.9 : 1.0) + this.rng.range(-0.04, 0.04),
          defRating: (r >= 3 ? 1.05 : 1.0) + this.rng.range(-0.04, 0.04),
          stamina: 1,
          action: null,
          stealCd: 0,
          pickupCd: 0,
          jumpCd: 0,
          holdT: 0,
          runPhase: this.rng.range(0, 6),
          sprinting: false,
          intent: { mx: 0, mz: 0, sprint: false, face: null },
          ai: {
            decT: this.rng.range(0, 0.3),
            target: { x: 0, z: 0 },
            spotVariant: 0,
            spotT: this.rng.range(3, 6),
            cutT: 0,
            holdT: 0,
            lastPassT: -10,
            driving: false,
            probe: null,
            reactT: 0,
          },
          stance: 0,
        });
      }
    }
    this.resetMatchups();
  }

  // ------------------------------------------------------------------ helpers
  emit(e: GameEvent): void {
    this.events.push(e);
    if (this.events.length > 500) this.events.splice(0, this.events.length - 500);
  }
  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
  isHumanTeam(team: number): boolean {
    return this.config.humanTeam === team;
  }
  isHumanControlled(p: Player): boolean {
    return p.id === this.controlled && this.config.humanTeam === p.team;
  }
  ballHandler(): Player | null {
    return this.ball.state === 'held' && this.ball.owner >= 0 ? this.players[this.ball.owner] : null;
  }
  teamPlayers(team: number): Player[] {
    return this.players.filter((p) => p.team === team);
  }
  opponents(team: number): Player[] {
    return this.players.filter((p) => p.team !== team);
  }
  resetMatchups(): void {
    for (const p of this.players) this.matchups[p.id] = p.team === 0 ? p.id + 5 : p.id - 5;
  }

  // -------------------------------------------------------------- match flow
  /** Begin a fresh match (score 0-0, quarter 1, tip-off). */
  startMatch(): void {
    this.score = [0, 0];
    this.stats = [emptyStats(), emptyStats()];
    this.events = [];
    this.activeShot = null;
    this.buzzerPending = false;
    this.possession = -1;
    this.startQuarter(1);
  }

  private quarterLengthFor(q: number): number {
    return q <= this.config.quarters ? this.config.quarterLength : Math.max(30, Math.round(this.config.quarterLength / 2));
  }

  startQuarter(q: number): void {
    this.quarter = q;
    this.gameClock = this.quarterLengthFor(q);
    this.shotClock = SHOT_CLOCK;
    this.shotClockFrozen = false;
    this.activeShot = null;
    this.buzzerPending = false;
    this.deadball = null;
    this.inbound = null;
    for (const p of this.players) {
      p.action = null;
      p.vel.x = p.vel.z = 0;
      p.vy = 0;
      p.pos.y = 0;
      p.stealCd = p.pickupCd = p.jumpCd = 0;
      p.stamina = 1;
    }
    this.emit({ type: 'quarterStart', quarter: q });
    if (q === 1 || q > this.config.quarters) {
      this.setupTipoff();
    } else {
      // NBA-style: the team that lost the opening tip starts Q2 and Q3.
      const team: TeamId = q === 2 || q === 3 ? ((1 - this.tipWinner) as TeamId) : this.tipWinner;
      this.formationReset(team);
      const s = attackSign(team);
      const spot = { x: -s * 1.0, z: HALF_W + 0.45 };
      const inb = this.nearestPlayer(this.teamPlayers(team), spot);
      inb.pos.x = spot.x;
      inb.pos.z = spot.z;
      this.possession = team;
      this.beginInbound({ reason: 'quarter', team, spot, inbounder: inb.id });
    }
  }

  /** Explicit reset of all players to a half-court formation (used only at period starts). */
  private formationReset(offTeam: TeamId): void {
    const s = attackSign(offTeam);
    const offPos: Array<[number, number]> = [
      [-1, 3.5],
      [2, 5.5],
      [2, -5.5],
      [-3, -2],
      [-4.5, 2],
    ];
    const defPos: Array<[number, number]> = [
      [5, 2.5],
      [6, 5],
      [6, -5],
      [8, -2],
      [9, 1.5],
    ];
    for (const p of this.players) {
      const src = p.team === offTeam ? offPos[p.role] : defPos[p.role];
      p.pos.x = s * src[0];
      p.pos.z = src[1];
      p.facing = s > 0 ? 0 : Math.PI;
    }
    this.resetMatchups();
  }

  private setupTipoff(): void {
    this.phase = 'tipoff';
    this.phaseT = 0;
    this.tipDone = false;
    this.tipJumpTime = -1;
    this.possession = -1;
    const pos: Array<[number, number]> = [
      [-2.6, 3.2],
      [-2.6, -3.2],
      [-4.4, 5.5],
      [-3.5, -0.2],
      [-0.55, 0],
    ];
    for (const p of this.players) {
      const s = p.team === 0 ? 1 : -1;
      const src = pos[p.role];
      p.pos.x = s * src[0] + (p.role < 4 ? -s * 0.0 : 0);
      p.pos.z = s * src[1] + (p.team === 1 && p.role < 4 ? 0.7 : 0);
      p.facing = p.team === 0 ? 0 : Math.PI;
    }
    this.resetMatchups();
    this.ball.state = 'dead';
    this.ball.owner = -1;
    this.ball.pos = { x: 0, y: 1.4, z: 1.2 };
    this.ball.vel = { x: 0, y: 0, z: 0 };
    if (this.config.humanTeam >= 0) this.controlled = this.config.humanTeam * 5 + 4;
  }

  private updateTipoff(): void {
    const t = this.phaseT;
    const b = this.ball;
    const TOSS = 1.2;
    if (t < TOSS) {
      b.pos = { x: 0, y: 1.4, z: 0.35 };
      b.vel = { x: 0, y: 0, z: 0 };
      return;
    }
    if (b.state === 'dead' && !this.tipDone && b.flightKind !== 'tip') {
      b.state = 'flight';
      b.flightKind = 'tip';
      b.pos = { x: 0, y: 1.9, z: 0 };
      b.vel = { x: 0, y: 6.4, z: 0 };
      b.owner = -1;
    }
    const c0 = this.players[4];
    const c1 = this.players[9];
    const ideal = TOSS + 0.38;
    // AI-controlled centers jump on their own timing.
    for (const c of [c0, c1]) {
      const human = this.isHumanControlled(c);
      if (c.pos.y === 0 && c.jumpCd <= 0 && !human && t > ideal + this.rng.range(-0.05, 0.08) - (c.team === 1 ? aiParams(this, 1).reaction * 0.2 : 0)) {
        this.jump(c, 0.7);
      }
      if (human && c.pos.y === 0 && c.jumpCd <= 0 && t > ideal + 0.45) this.jump(c, 0.65);
    }
    if (!this.tipDone && b.vel.y < 0 && b.pos.y < 3.45) {
      // resolve the tip
      let p0 = 0.5;
      if (this.config.humanTeam >= 0) {
        const hj = this.tipJumpTime;
        let hp = 0.42;
        if (hj > 0) {
          const err = Math.abs(hj - ideal);
          hp = err < 0.1 ? 0.82 : err < 0.2 ? 0.58 : 0.3;
        }
        p0 = this.config.humanTeam === 0 ? hp : 1 - hp;
      }
      const winner: TeamId = this.rng.chance(p0) ? 0 : 1;
      this.tipDone = true;
      this.tipWinner = winner;
      const target = this.players[this.rng.next() < 0.5 ? winner * 5 : winner * 5 + 3];
      const tgt = { x: target.pos.x, y: 1.3, z: target.pos.z };
      b.vel = solveLaunchTime(b.pos, tgt, 0.75);
      b.state = 'loose';
      b.flightKind = null;
      this.lastTouchTeam = winner;
      this.phase = 'live';
      this.phaseT = 0;
      this.looseT = 0;
      this.emit({ type: 'tipoff', winner });
    }
  }

  private beginInbound(info: DeadballInfo): void {
    this.phase = 'inbound';
    this.phaseT = 0;
    this.deadball = null;
    this.inbound = info;
    const inb = this.players[info.inbounder];
    inb.pos.x = info.spot.x;
    inb.pos.z = info.spot.z;
    inb.vel.x = inb.vel.z = 0;
    inb.action = null;
    inb.pos.y = 0;
    inb.vy = 0;
    inb.facing = Math.atan2(-info.spot.z * 0.6, -info.spot.x * 0.3 - Math.sign(info.spot.x) * 2);
    // ball is placed in the inbounder's hands (explicit inbound transition)
    this.ball.state = 'held';
    this.ball.owner = inb.id;
    this.ball.flightKind = null;
    this.activeShot = null;
    this.possession = info.team;
    this.shotClock = SHOT_CLOCK;
    this.shotClockFrozen = false;
    this.lastTouchTeam = info.team;
    if (this.isHumanTeam(info.team)) this.setControlled(inb.id);
    else if (this.config.humanTeam >= 0) this.autoSwitchDefense();
  }

  /** Stop play and schedule an inbound for `team` at `spot`. */
  private startDeadball(reason: string, team: TeamId, spot: V2): void {
    const cands = this.teamPlayers(team);
    const inb = this.nearestPlayer(cands, spot);
    this.deadball = { reason, team, spot, inbounder: inb.id };
    this.phase = 'deadball';
    this.phaseT = 0;
    this.possession = team;
    for (const p of this.players) {
      if (p.action && p.action.kind === 'shoot' && !p.action.released) p.action = null;
    }
    if (this.ball.state === 'held') {
      // drop the ball where it is
      this.ball.state = 'dead';
      this.ball.owner = -1;
      this.ball.vel = { x: 0, y: 0, z: 0 };
    } else {
      this.ball.state = 'dead';
    }
  }

  private updateDeadball(): void {
    const d = this.deadball!;
    const inb = this.players[d.inbounder];
    const arrived = dist2(inb.pos, d.spot) < 0.45;
    if ((this.phaseT > 1.4 && arrived) || this.phaseT > 4.0) {
      this.beginInbound(d);
    }
  }

  private updateInbound(dt: number): void {
    const info = this.inbound!;
    const inb = this.players[info.inbounder];
    inb.pos.x = info.spot.x;
    inb.pos.z = info.spot.z;
    inb.vel.x = inb.vel.z = 0;
    const human = this.isHumanControlled(inb);
    const autoAt = human ? 3.5 : 1.0 + aiParams(this, inb.team).reaction;
    if (human && this.input.passPressed && this.phaseT > 0.25) {
      this.doPass(inb, this.choosePassTarget(inb, this.input.move));
    } else if (this.phaseT > autoAt) {
      const target = this.choosePassTarget(inb, null);
      // wait for a reasonably open receiver unless we're running long
      const open = this.nearestDist(this.opponents(inb.team), target.pos);
      if (open > 1.4 || this.phaseT > autoAt + 2.0) this.doPass(inb, target);
    }
    void dt;
  }

  private endQuarter(): void {
    this.buzzerPending = false;
    this.gameClock = 0;
    this.activeShot = null;
    if (this.ball.state === 'held') {
      this.ball.state = 'dead';
      this.ball.owner = -1;
    } else this.ball.state = 'dead';
    for (const p of this.players) {
      if (p.action && p.action.kind === 'shoot' && !p.action.released) p.action = null;
    }
    this.emit({ type: 'buzzer' });
    if (this.quarter >= this.config.quarters && this.score[0] !== this.score[1]) {
      this.phase = 'final';
      this.phaseT = 0;
      this.emit({ type: 'final', score: [this.score[0], this.score[1]] });
    } else {
      this.phase = 'quarterEnd';
      this.phaseT = 0;
      this.emit({ type: 'quarterEnd', quarter: this.quarter });
    }
  }

  // ---------------------------------------------------------------- control
  setControlled(id: number): void {
    if (this.config.humanTeam < 0) return;
    if (this.controlled !== id) {
      this.controlled = id;
      this.emit({ type: 'switch', player: id });
    }
  }

  /** Human switch: pick the teammate nearest the ball (other than the current one). */
  switchPlayer(): void {
    const ht = this.config.humanTeam;
    if (ht < 0) return;
    const bh = this.ballHandler();
    if (bh && bh.team === ht && this.phase !== 'tipoff') return; // on offense you control the ballhandler
    const mates = this.teamPlayers(ht).filter((p) => p.id !== this.controlled);
    mates.sort((a, b) => dist2(a.pos, this.ball.pos) - dist2(b.pos, this.ball.pos));
    // nearest teammate to the ball other than the current one (repeated presses cycle outward)
    const pick = mates[0];
    this.setControlled(pick.id);
  }

  private autoSwitchDefense(): void {
    const ht = this.config.humanTeam;
    if (ht < 0) return;
    const mates = this.teamPlayers(ht);
    const target = this.nearestPlayer(mates, this.ball.pos);
    this.setControlled(target.id);
  }

  // ---------------------------------------------------------------- actions
  canAct(p: Player): boolean {
    return !p.action || (p.action.kind !== 'shoot' && p.action.kind !== 'recover');
  }

  jump(p: Player, height = JUMP_HEIGHT): boolean {
    if (p.pos.y > 0.001 || p.jumpCd > 0) return false;
    p.vy = Math.sqrt(2 * GRAVITY * height);
    p.pos.y = 0.001;
    p.jumpCd = 1.0;
    if (!p.action) p.action = { kind: 'block', t: 0, dur: (2 * p.vy) / GRAVITY };
    this.emit({ type: 'jump', player: p.id });
    return true;
  }

  startShot(p: Player, autoRelease = Infinity): boolean {
    if (this.ball.owner !== p.id || this.ball.state !== 'held' || this.phase !== 'live') return false;
    if (p.action && p.action.kind === 'shoot') return false;
    const bx = attackBasketX(p.team);
    const d = len2(bx - p.pos.x, p.pos.z);
    const layup = d < LAYUP_RANGE;
    const a: ShootAction = {
      kind: 'shoot',
      t: 0,
      layup,
      released: false,
      autoRelease,
      fromX: p.pos.x,
      fromZ: p.pos.z,
      jumped: false,
      meterAtRelease: 0,
    };
    p.action = a;
    p.facing = Math.atan2(-p.pos.z, bx - p.pos.x);
    return true;
  }

  /** Measure how strongly defenders contest a shooter (0..1). */
  contestLevel(p: Player): number {
    const bx = attackBasketX(p.team);
    const dir = norm2(bx - p.pos.x, -p.pos.z);
    let c = 0;
    for (const q of this.opponents(p.team)) {
      const dx = q.pos.x - p.pos.x;
      const dz = q.pos.z - p.pos.z;
      const d = len2(dx, dz);
      const front = (dx * dir.x + dz * dir.z) / Math.max(d, 1e-3);
      if (front < -0.2) continue;
      let f = clamp(1 - (d - 0.7) / 2.0, 0, 1) * (0.55 + 0.45 * clamp(front, 0, 1));
      if (q.pos.y > 0.1) f *= 1.35;
      c = Math.max(c, f * q.defRating);
    }
    return clamp(c, 0, 1.2);
  }

  releaseShot(p: Player): void {
    const a = p.action as ShootAction;
    if (!a || a.kind !== 'shoot' || a.released) return;
    a.released = true;
    const meter = a.t / SHOT_METER_TIME;
    a.meterAtRelease = meter;
    const e = meter - SHOT_IDEAL;
    const bx = attackBasketX(p.team);
    const rim: V3 = { x: bx, y: RIM_H, z: 0 };
    const toR = norm2(bx - p.pos.x, -p.pos.z);
    const hand: V3 = {
      x: p.pos.x + toR.x * (a.layup ? 0.35 : 0.2),
      y: p.pos.y + (a.layup ? 2.55 : 2.4),
      z: p.pos.z + toR.z * (a.layup ? 0.35 : 0.2),
    };
    const d = len2(rim.x - hand.x, rim.z - hand.z);
    const points: 2 | 3 = a.layup ? 2 : shotPointValue(a.fromX, a.fromZ, bx);
    const ae = Math.abs(e);
    const label = ae < 0.035 ? 'PERFECT' : ae < 0.09 ? 'GOOD' : e < 0 ? 'EARLY' : 'LATE';
    const contest = this.contestLevel(p);
    const base = a.layup ? 0.028 + 0.01 * d : 0.03 + 0.011 * d;
    const tm = Math.min(a.layup ? 0.7 + 2.2 * ae : 0.55 + 5 * ae, 4.5);
    const fatigue = 1 + (1 - p.stamina) * 0.25;
    const sigma = ((base * tm * (1 + 0.9 * contest) * fatigue) / p.shootRating) * this.shotErrorScale;
    const bias = e * (a.layup ? 0.2 : 0.85);
    const depthErr = 0.035 + bias + this.rng.normal() * sigma;
    const latErr = this.rng.normal() * sigma * 0.75;
    const perp = { x: -toR.z, z: toR.x };
    const target: V3 = {
      x: rim.x + toR.x * depthErr + perp.x * latErr,
      y: RIM_H,
      z: rim.z + toR.z * depthErr + perp.z * latErr,
    };
    let angle = a.layup ? 1.08 : 0.86 + clamp((d - 5) * 0.012, -0.06, 0.08);
    let vel = solveLaunch(hand, target, angle);
    while (!vel && angle < 1.45) {
      angle += 0.05;
      vel = solveLaunch(hand, target, angle);
    }
    if (!vel) vel = { x: toR.x * 2, y: 5, z: toR.z * 2 };
    const b = this.ball;
    b.state = 'flight';
    b.flightKind = 'shot';
    b.owner = -1;
    b.pos = hand;
    b.vel = vel;
    b.flightT = 0;
    this.lastTouchTeam = p.team;
    this.activeShot = {
      id: ++this.shotCounter,
      shooter: p.id,
      team: p.team,
      points,
      layup: a.layup,
      dist: d,
      label,
      contest,
      releaseClock: this.gameClock,
      valid: this.phase === 'live' && this.gameClock > 0,
      touchedRim: false,
      touchedBoard: false,
      scored: false,
      blocked: false,
      resolved: false,
      t: 0,
      blockRolled: new Set(),
    };
    const st = this.stats[p.team];
    st.fga++;
    if (points === 3) st.tpa++;
    this.emit({ type: 'shotRelease', team: p.team, label, points, shooter: p.id, meter, contest });
  }

  doPass(p: Player, to: Player): void {
    if (this.ball.owner !== p.id || this.ball.state !== 'held') return;
    if (p.action && p.action.kind === 'shoot') return;
    const b = this.ball;
    const from: V3 = {
      x: p.pos.x + Math.cos(p.facing) * 0.35,
      y: p.pos.y + 1.35,
      z: p.pos.z + Math.sin(p.facing) * 0.35,
    };
    const d0 = dist2(p.pos, to.pos);
    const speed = clamp(9 + d0 * 0.35, 9, 15);
    let t = Math.max(0.18, d0 / speed);
    // lead the receiver
    const lead = { x: to.pos.x + to.vel.x * t * 0.7, z: to.pos.z + to.vel.z * t * 0.7 };
    clampToCourt(lead, 0.3);
    const d1 = dist2(from, lead);
    t = Math.max(0.18, d1 / speed);
    const tgt: V3 = { x: lead.x, y: 1.35, z: lead.z };
    b.vel = solveLaunchTime(from, tgt, t);
    b.pos = from;
    b.state = 'flight';
    b.flightKind = 'pass';
    b.passFrom = p.id;
    b.passTo = to.id;
    b.passRolled = new Set();
    b.owner = -1;
    b.flightT = 0;
    p.action = { kind: 'pass', t: 0, dur: 0.25 };
    p.ai.lastPassT = this.time;
    this.lastTouchTeam = p.team;
    to.ai.reactT = 0;
    this.emit({ type: 'pass', team: p.team, from: p.id, to: to.id });
    if (this.phase === 'inbound') {
      this.phase = 'live';
      this.phaseT = 0;
      this.inbound = null;
    }
  }

  choosePassTarget(p: Player, dir: V2 | null): Player {
    const mates = this.teamPlayers(p.team).filter((q) => q.id !== p.id);
    const opp = this.opponents(p.team);
    const dl = dir ? len2(dir.x, dir.z) : 0;
    let best = mates[0];
    let bestScore = -Infinity;
    for (const q of mates) {
      const dx = q.pos.x - p.pos.x;
      const dz = q.pos.z - p.pos.z;
      const d = len2(dx, dz);
      let score: number;
      if (dl > 0.3 && dir) {
        const cos = (dx * dir.x + dz * dir.z) / (d * dl + 1e-6);
        score = cos * 3 - d * 0.04;
      } else {
        const open = Math.min(this.nearestDist(opp, q.pos), 4);
        score = open * 0.6 - Math.abs(d - 6) * 0.12 + attackSign(p.team) * (q.pos.x - p.pos.x) * 0.03;
      }
      if (score > bestScore) {
        bestScore = score;
        best = q;
      }
    }
    return best;
  }

  attemptSteal(p: Player): boolean {
    if (p.stealCd > 0 || !this.canAct(p)) return false;
    p.stealCd = 0.9;
    p.action = { kind: 'steal', t: 0, dur: 0.35 };
    const h = this.ballHandler();
    if (!h || h.team === p.team || this.phase !== 'live') return false;
    const d = dist2(p.pos, h.pos);
    if (d > 1.6) return false;
    // ball position matters: closer to the ball than to the handler is better
    const bd = dist2(p.pos, this.ball.pos);
    let prob = 0.24 * p.defRating * clamp(1 - (d - 0.7) / 1.0, 0.15, 1);
    if (bd < d) prob *= 1.3;
    if (h.action && h.action.kind === 'shoot') prob *= 0.5;
    if (h.sprinting) prob *= 1.2;
    prob *= h.team === this.config.humanTeam ? 1 : 1.05;
    if (!this.rng.chance(prob)) return false;
    // knock the ball loose toward the defender
    const b = this.ball;
    const dir = norm2(p.pos.x - h.pos.x, p.pos.z - h.pos.z);
    b.state = 'loose';
    b.owner = -1;
    b.flightKind = null;
    b.pos = { x: (h.pos.x + p.pos.x) / 2, y: 0.9, z: (h.pos.z + p.pos.z) / 2 };
    b.vel = { x: dir.x * 2.2 + this.rng.range(-0.6, 0.6), y: 1.2, z: dir.z * 2.2 + this.rng.range(-0.6, 0.6) };
    h.pickupCd = 0.7;
    if (h.action && h.action.kind === 'shoot') h.action = null;
    this.lastTouchTeam = p.team;
    this.looseT = 0;
    this.pendingSteal = p.id;
    return true;
  }
  /** id of the player who last poked the ball loose; credited a steal if their team recovers. */
  pendingSteal = -1;

  // ------------------------------------------------------------------ step
  step(dt: number): void {
    this.time += dt;
    if (this.phase === 'pregame') return;
    this.phaseT += dt;

    if (this.phase === 'final') {
      this.updatePlayers(dt, true);
      this.updateBall(dt);
      return;
    }
    if (this.phase === 'quarterEnd') {
      this.updatePlayers(dt, true);
      this.updateBall(dt);
      if (this.phaseT > 3.2) this.startQuarter(this.quarter + 1);
      return;
    }

    if (this.phase === 'live') this.updateClocks(dt);
    if (this.phase === 'deadball') this.updateDeadball();
    if (this.phase === 'inbound') this.updateInbound(dt);

    this.updateHuman(dt);
    for (const p of this.players) {
      if (!this.isHumanControlled(p)) updateAI(this, p, dt);
    }
    this.updatePlayers(dt, false);
    if (this.phase === 'tipoff') this.updateTipoff();
    this.updateBall(dt);
    this.watchdog(dt);
    this.input.passPressed = false;
    this.input.switchPressed = false;
    this.input.stealPressed = false;
  }

  private updateClocks(dt: number): void {
    if (this.buzzerPending) {
      this.buzzerT += dt;
      if (this.buzzerT > 4) this.endQuarter();
      return;
    }
    this.gameClock -= dt;
    if (!this.shotClockFrozen) this.shotClock -= dt;
    if (this.gameClock <= 0) {
      this.gameClock = 0;
      const s = this.activeShot;
      if (s && !s.resolved && s.valid) {
        // shot released before the buzzer is still live
        this.buzzerPending = true;
        this.buzzerT = 0;
        this.emit({ type: 'buzzer' });
      } else {
        this.endQuarter();
      }
      return;
    }
    if (this.shotClock <= 0) {
      this.shotClock = 0;
      const s = this.activeShot;
      const shotInAir = s && !s.resolved;
      if (!shotInAir && this.possession >= 0) {
        const team = this.possession as TeamId;
        this.stats[team].tov++;
        this.emit({ type: 'turnover', team, reason: 'Shot clock violation' });
        this.startDeadball('shotclock', (1 - team) as TeamId, this.sidelineSpot(this.ball.pos.x, this.ball.pos.z));
      }
    }
  }

  private updateHuman(dt: number): void {
    const ht = this.config.humanTeam;
    if (ht < 0 || this.controlled < 0) return;
    const p = this.players[this.controlled];
    const inp = this.input;
    p.intent.mx = inp.move.x;
    p.intent.mz = inp.move.z;
    p.intent.sprint = inp.sprint;
    p.intent.face = null;
    const pressed = inp.shootHeld && !this.prevShootHeld;
    const released = !inp.shootHeld && this.prevShootHeld;
    this.prevShootHeld = inp.shootHeld;
    const hasBall = this.ball.state === 'held' && this.ball.owner === p.id;

    if (this.phase === 'tipoff') {
      if (pressed && p.role === 4 && this.jump(p, 0.7)) this.tipJumpTime = this.phaseT;
      p.intent.mx = p.intent.mz = 0;
      return;
    }
    if (inp.switchPressed) this.switchPlayer();
    if (hasBall && this.phase === 'live') {
      if (pressed && this.canAct(p) && p.pos.y < 0.01) this.startShot(p);
      if (p.action && p.action.kind === 'shoot' && !p.action.released && released) this.releaseShot(p);
      if (inp.passPressed && this.canAct(p)) this.doPass(p, this.choosePassTarget(p, inp.move));
    } else if (!hasBall && (this.phase === 'live' || this.phase === 'deadball' || this.phase === 'inbound')) {
      if (pressed && this.canAct(p)) this.jump(p, BLOCK_JUMP_HEIGHT);
      if (inp.stealPressed) this.attemptSteal(p);
    }
    void dt;
  }

  private updatePlayers(dt: number, frozen: boolean): void {
    for (const p of this.players) {
      p.stealCd = Math.max(0, p.stealCd - dt);
      p.pickupCd = Math.max(0, p.pickupCd - dt);
      if (p.pos.y <= 0) p.jumpCd = Math.max(0, p.jumpCd - dt);
      if (this.ball.owner === p.id && this.ball.state === 'held') p.holdT += dt;
      else p.holdT = 0;

      // actions
      const a = p.action;
      if (a) {
        a.t += dt;
        if (a.kind === 'shoot') {
          if (!a.jumped && a.t > 0.12) {
            a.jumped = true;
            p.vy = Math.sqrt(2 * GRAVITY * (a.layup ? 0.6 : JUMP_HEIGHT));
            p.pos.y = 0.001;
            this.emit({ type: 'jump', player: p.id });
          }
          if (!a.released) {
            const meter = a.t / SHOT_METER_TIME;
            if (meter >= a.autoRelease || meter >= SHOT_FORCE_RELEASE) this.releaseShot(p);
          }
          if (a.released && p.pos.y <= 0 && a.jumped) p.action = { kind: 'recover', t: 0, dur: 0.18 };
        } else if (a.t >= a.dur && (a.kind !== 'block' || p.pos.y <= 0)) {
          p.action = null;
        }
      }

      // desired velocity
      let dvx = 0;
      let dvz = 0;
      if (!frozen) {
        const hasBall = this.ball.owner === p.id && this.ball.state === 'held';
        const im = len2(p.intent.mx, p.intent.mz);
        const sprint = p.intent.sprint && p.stamina > 0.08 && im > 0.2;
        p.sprinting = sprint;
        let speed = (sprint ? SPRINT_SPEED : RUN_SPEED) * p.speedRating;
        if (hasBall) speed *= DRIBBLE_SPEED_MULT;
        speed *= 0.82 + 0.18 * p.stamina;
        if (p.team === 1 && this.config.humanTeam === 0) speed *= aiParams(this, 1).speed;
        if (p.action) {
          if (p.action.kind === 'shoot') speed = 0;
          else if (p.action.kind === 'recover') speed *= 0.2;
          else if (p.action.kind === 'pass' || p.action.kind === 'steal') speed *= 0.6;
        }
        const n = im > 1 ? 1 / im : 1;
        dvx = p.intent.mx * n * speed;
        dvz = p.intent.mz * n * speed;
        if (sprint) p.stamina = Math.max(0, p.stamina - dt * 0.2);
        else p.stamina = Math.min(1, p.stamina + dt * 0.12);
      }
      const airborne = p.pos.y > 0.001;
      const a2 = p.action;
      if (a2 && a2.kind === 'shoot' && a2.layup && !a2.released) {
        // layup: glide toward the rim
        const bx = attackBasketX(p.team);
        const d = len2(bx - p.pos.x, p.pos.z);
        const dir = norm2(bx - p.pos.x, -p.pos.z);
        const sp = d > 0.85 ? 3.2 : 0;
        p.vel.x = dir.x * sp;
        p.vel.z = dir.z * sp;
      } else if (!airborne) {
        const ax = dvx - p.vel.x;
        const az = dvz - p.vel.z;
        const al = len2(ax, az);
        const maxA = ACCEL * dt;
        if (al > maxA) {
          p.vel.x += (ax / al) * maxA;
          p.vel.z += (az / al) * maxA;
        } else {
          p.vel.x = dvx;
          p.vel.z = dvz;
        }
      } else {
        p.vel.x *= 1 - 0.8 * dt;
        p.vel.z *= 1 - 0.8 * dt;
      }
      p.pos.x += p.vel.x * dt;
      p.pos.z += p.vel.z * dt;

      // vertical
      if (p.pos.y > 0 || p.vy > 0) {
        p.vy -= GRAVITY * dt;
        p.pos.y += p.vy * dt;
        if (p.pos.y <= 0) {
          p.pos.y = 0;
          p.vy = 0;
        }
      }

      // facing
      const sp = len2(p.vel.x, p.vel.z);
      let want: number | null = p.intent.face;
      if (p.action && p.action.kind === 'shoot') want = null;
      else if (want === null && sp > 0.4) want = Math.atan2(p.vel.z, p.vel.x);
      if (want !== null) p.facing = angleLerp(p.facing, want, Math.min(1, dt * 10));
      p.runPhase += sp * dt * 2.3;
      const wantStance = this.possession >= 0 && this.possession !== p.team && this.phase === 'live' ? 1 : 0;
      p.stance += (wantStance - p.stance) * Math.min(1, dt * 4);
    }

    // separation between players
    const ps = this.players;
    const minD = PLAYER_RADIUS * 2;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i];
        const b = ps[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d = len2(dx, dz);
        if (d < minD && d > 1e-6) {
          const push = (minD - d) / 2;
          const nx = dx / d;
          const nz = dz / d;
          const fa = this.isPinned(a) ? 0 : this.isPinned(b) ? 2 : 1;
          const fb = this.isPinned(b) ? 0 : this.isPinned(a) ? 2 : 1;
          a.pos.x -= nx * push * fa;
          a.pos.z -= nz * push * fa;
          b.pos.x += nx * push * fb;
          b.pos.z += nz * push * fb;
        }
      }
    }

    // bounds
    for (const p of ps) {
      if (this.inbound && this.phase === 'inbound' && p.id === this.inbound.inbounder) continue;
      if (this.deadball && this.phase === 'deadball' && p.id === this.deadball.inbounder) {
        p.pos.x = clamp(p.pos.x, -HALF_L - 1.2, HALF_L + 1.2);
        p.pos.z = clamp(p.pos.z, -HALF_W - 1.2, HALF_W + 1.2);
        continue;
      }
      if (this.isHumanControlled(p)) {
        p.pos.x = clamp(p.pos.x, -HALF_L - 1.0, HALF_L + 1.0);
        p.pos.z = clamp(p.pos.z, -HALF_W - 1.0, HALF_W + 1.0);
      } else {
        clampToCourt(p.pos, 0.3);
      }
    }
  }

  private isPinned(p: Player): boolean {
    return (this.phase === 'inbound' && this.inbound?.inbounder === p.id) || (p.action?.kind === 'shoot' && !p.action.released);
  }

  private updateBall(dt: number): void {
    const b = this.ball;
    if (b.state === 'held') {
      const p = this.players[b.owner];
      this.placeHeldBall(p, dt);
      // ballhandler stepping out of bounds
      if (this.phase === 'live' && !isInBounds(p.pos.x, p.pos.z)) {
        this.stats[p.team].tov++;
        this.emit({ type: 'turnover', team: p.team, reason: 'Stepped out of bounds' });
        this.startDeadball('oob', (1 - p.team) as TeamId, this.oobSpot(p.pos.x, p.pos.z));
      }
      return;
    }
    if (this.phase === 'tipoff' && b.state === 'dead') return;

    const prevVy = b.vel.y;
    const hits = stepBall(b, dt, BALL_SUBSTEPS);
    b.flightT += dt;
    const sp = len2(b.vel.x, b.vel.z);
    b.spinAngle += (sp / 0.12) * dt * (b.pos.y <= BALL_R + 0.01 ? 1 : 0.5) + (b.state === 'flight' ? dt * 12 : 0);

    if (hits.rim > 0.3) this.emit({ type: 'rim', strength: hits.rim });
    if (hits.board > 0.3) this.emit({ type: 'board', strength: hits.board });
    if (hits.floor > 0.5) this.emit({ type: 'bounce', strength: hits.floor });

    const shot = this.activeShot;
    if (shot && !shot.resolved) {
      shot.t += dt;
      if (hits.rim > 0 || hits.board > 0) {
        if (hits.rim > 0 && !shot.touchedRim) {
          shot.touchedRim = true;
          // rim contact: shot clock is reset when the new possession is established
          this.shotClockFrozen = true;
          this.shotClock = SHOT_CLOCK;
        }
        if (hits.board > 0) shot.touchedBoard = true;
        if (b.state === 'flight') b.state = 'loose';
      }
      if (b.state === 'flight' && b.flightKind === 'shot') this.checkBlock(shot);
    }

    if (hits.basket >= 0) this.handleBasket(hits.basket);

    if (b.state === 'dead') return;

    // shot miss resolution
    if (shot && !shot.resolved && !shot.scored) {
      const fallenBelow = (shot.touchedRim || shot.touchedBoard) && b.vel.y < 0 && b.pos.y < RIM_H - 0.45;
      if (fallenBelow || hits.floor > 0 || shot.t > 5) this.resolveMiss(shot);
    }

    if (b.state === 'flight' && hits.floor > 0) {
      b.state = 'loose';
      b.flightKind = null;
    }
    if (b.state === 'flight' && b.flightKind === 'shot' && prevVy >= 0 && b.vel.y < 0 && b.pos.y < RIM_H - 0.2) {
      // way short (well below the rim on the way down) - it's just a loose ball now
      b.state = 'loose';
    }

    // out of bounds
    const onFloor = b.pos.y <= BALL_R + 0.03;
    if ((onFloor && !isInBounds(b.pos.x, b.pos.z)) || Math.abs(b.pos.x) > HALF_L + 6 || Math.abs(b.pos.z) > HALF_W + 6) {
      if (this.phase === 'live') {
        const team = (1 - this.lastTouchTeam) as TeamId;
        this.stats[this.lastTouchTeam].tov++;
        this.emit({ type: 'turnover', team: this.lastTouchTeam, reason: 'Out of bounds' });
        if (shot && !shot.resolved) this.resolveMiss(shot);
        this.startDeadball('oob', team, this.oobSpot(b.pos.x, b.pos.z));
        return;
      }
    }

    if (this.phase === 'live') this.checkCatches();
  }

  private placeHeldBall(p: Player, dt: number): void {
    const b = this.ball;
    const fx = Math.cos(p.facing);
    const fz = Math.sin(p.facing);
    // "right hand" side vector
    const rx = -fz;
    const rz = fx;
    const prev = { ...b.pos };
    const a = p.action;
    if (a && a.kind === 'shoot' && !a.released) {
      const k = clamp(a.t / 0.15, 0, 1);
      b.pos.x = p.pos.x + fx * 0.22;
      b.pos.z = p.pos.z + fz * 0.22;
      b.pos.y = p.pos.y + 1.25 + k * (a.layup ? 1.25 : 1.1);
    } else if (this.phase !== 'live' || p.holdT < 0.25 || (a && a.kind === 'pass')) {
      b.pos.x = p.pos.x + fx * 0.38;
      b.pos.z = p.pos.z + fz * 0.38;
      b.pos.y = p.pos.y + 1.25;
    } else {
      const sp = len2(p.vel.x, p.vel.z);
      const freq = 1.6 + sp * 0.22;
      const before = b.dribblePhase % 1;
      b.dribblePhase += dt * freq;
      const u = b.dribblePhase % 1;
      if (before < 0.5 && u >= 0.5) this.emit({ type: 'dribble' });
      const s = Math.abs(1 - 2 * u); // 1 at hand, 0 at floor
      const top = 1.0;
      const lead = 0.32 + sp * 0.04;
      b.pos.x = p.pos.x + fx * lead + rx * 0.3;
      b.pos.z = p.pos.z + fz * lead + rz * 0.3;
      b.pos.y = BALL_R + (top - BALL_R) * (1 - (1 - s) * (1 - s));
    }
    if (dt > 0) {
      b.vel.x = (b.pos.x - prev.x) / dt;
      b.vel.y = (b.pos.y - prev.y) / dt;
      b.vel.z = (b.pos.z - prev.z) / dt;
    }
    b.spinAngle += len2(p.vel.x, p.vel.z) * dt * 4;
  }

  private checkBlock(shot: ShotInfo): void {
    const b = this.ball;
    if (shot.t > 0.5 || b.vel.y < -2.5) return; // descending ball: goaltending territory, ignored
    for (const q of this.opponents(shot.team)) {
      if (q.pos.y < 0.25 || shot.blockRolled.has(q.id)) continue;
      const fx = Math.cos(q.facing);
      const fz = Math.sin(q.facing);
      for (const side of [-1, 1]) {
        const hx = q.pos.x + fx * 0.18 - fz * 0.2 * side;
        const hz = q.pos.z + fz * 0.18 + fx * 0.2 * side;
        const hy = q.pos.y + 2.62;
        const d = Math.hypot(b.pos.x - hx, b.pos.y - hy, b.pos.z - hz);
        if (d < 0.25) {
          shot.blockRolled.add(q.id);
          if (!this.rng.chance(0.4 * q.defRating)) break; // got a piece of nothing
          shot.blocked = true;
          shot.valid = false;
          const dir = norm2(b.pos.x - q.pos.x, b.pos.z - q.pos.z);
          b.vel = {
            x: -b.vel.x * 0.25 + dir.x * 2.5 + this.rng.range(-1.5, 1.5),
            y: 1.0 + this.rng.range(0, 1.5),
            z: -b.vel.z * 0.25 + dir.z * 2.5 + this.rng.range(-1.5, 1.5),
          };
          b.state = 'loose';
          b.flightKind = null;
          this.lastTouchTeam = q.team;
          this.stats[q.team].blk++;
          this.emit({ type: 'block', team: q.team, player: q.id });
          this.resolveMiss(shot, true);
          return;
        }
      }
    }
  }

  private resolveMiss(shot: ShotInfo, blocked = false): void {
    if (shot.resolved) return;
    shot.resolved = true;
    if (!blocked) this.emit({ type: 'miss', team: shot.team, airball: !shot.touchedRim && !shot.touchedBoard });
    if (this.buzzerPending) this.endQuarter();
  }

  private handleBasket(k: number): void {
    const team: TeamId = k === 0 ? 0 : 1;
    const shot = this.activeShot;
    if (this.phase !== 'live') {
      if (this.phase !== 'deadball' && this.phase !== 'final' && this.phase !== 'quarterEnd') this.emit({ type: 'rejected', reason: 'play stopped' });
      return;
    }
    if (this.ball.state === 'dead') return;
    let points = 2;
    let shooter = -1;
    let label = '';
    if (shot && !shot.scored) {
      if (shot.team === team && shot.valid) {
        points = shot.points;
        shooter = shot.shooter;
        label = shot.label;
      }
      if (this.buzzerPending && !shot.valid) {
        this.emit({ type: 'rejected', reason: 'after buzzer' });
        return;
      }
      shot.scored = true;
      shot.resolved = true;
    } else if (this.buzzerPending) {
      this.emit({ type: 'rejected', reason: 'after buzzer' });
      return;
    }
    this.score[team] += points;
    const st = this.stats[team];
    st.pts += points;
    if (shooter >= 0) {
      st.fgm++;
      if (points === 3) st.tpm++;
    }
    this.ball.state = 'dead';
    this.emit({ type: 'score', team, points, shooter, label });
    if (shot && !shot.touchedRim && !shot.touchedBoard) this.emit({ type: 'swish' });
    if (this.buzzerPending) {
      this.endQuarter();
      return;
    }
    const s = k === 0 ? 1 : -1;
    this.startDeadball('made', (1 - team) as TeamId, { x: s * (HALF_L + 0.45), z: 1.9 });
  }

  private checkCatches(): void {
    const b = this.ball;
    if (b.state !== 'flight' && b.state !== 'loose') return;
    const shot = this.activeShot;
    // a rising shot before contact with the rim can't be caught (blocks handled separately)
    if (b.state === 'flight' && b.flightKind === 'shot') return;
    if (b.state === 'flight' && b.flightKind === 'tip') return;
    let best: Player | null = null;
    let bestD = Infinity;
    for (const p of this.players) {
      if (p.pickupCd > 0) continue;
      if (p.action && p.action.kind === 'shoot' && !p.action.released) continue;
      if (b.state === 'flight' && b.flightKind === 'pass' && p.id === b.passFrom && b.flightT < 0.5) continue;
      const hd = len2(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
      const reach = p.pos.y + 2.5;
      if (b.pos.y > reach || b.pos.y < 0) continue;
      if (b.state === 'flight' && b.flightKind === 'pass') {
        if (p.id === b.passTo) {
          if (hd < 0.75 && hd < bestD) {
            best = p;
            bestD = hd;
          }
        } else if (hd < 0.5 && !b.passRolled.has(p.id)) {
          b.passRolled.add(p.id);
          const prob = p.team === this.players[b.passFrom].team ? 0.8 : 0.22 * p.defRating;
          if (this.rng.chance(prob) && hd < bestD) {
            best = p;
            bestD = hd;
          }
        }
      } else if (hd < 0.62 && hd < bestD) {
        best = p;
        bestD = hd;
      }
    }
    if (best) {
      const fromPass = b.state === 'flight' && b.flightKind === 'pass';
      const intercept = fromPass && best.team !== this.players[b.passFrom].team;
      this.gainPossession(best, intercept ? 'interception' : fromPass ? 'pass' : 'loose');
      void shot;
    }
  }

  gainPossession(p: Player, how: 'pass' | 'loose' | 'interception'): void {
    const b = this.ball;
    const prevPoss = this.possession;
    const shot = this.activeShot;
    b.state = 'held';
    b.owner = p.id;
    b.flightKind = null;
    b.dribblePhase = 0;
    p.holdT = 0;
    p.ai.holdT = 0;
    this.lastTouchTeam = p.team;
    this.looseT = 0;
    if (shot) {
      if (!shot.resolved) this.resolveMiss(shot);
      if (!shot.scored) {
        const off = shot.team === p.team;
        if (off) this.stats[p.team].oreb++;
        else this.stats[p.team].dreb++;
        this.emit({ type: 'rebound', team: p.team, offensive: off, player: p.id });
      }
      this.activeShot = null;
    }
    if (how === 'pass') this.emit({ type: 'catch', player: p.id });
    if (prevPoss !== p.team) {
      if (how === 'interception') {
        this.stats[p.team].stl++;
        if (prevPoss >= 0) this.stats[prevPoss as TeamId].tov++;
        this.emit({ type: 'interception', team: p.team, player: p.id });
      } else if (this.pendingSteal >= 0 && this.players[this.pendingSteal].team === p.team) {
        this.stats[p.team].stl++;
        if (prevPoss >= 0) this.stats[prevPoss as TeamId].tov++;
        this.emit({ type: 'steal', team: p.team, player: this.pendingSteal });
      }
      this.possession = p.team;
      this.shotClock = SHOT_CLOCK;
      this.emit({ type: 'possession', team: p.team });
      this.assignMatchups(p.team);
    } else if (this.shotClockFrozen) {
      this.shotClock = Math.max(SHOT_CLOCK_OREB, 0);
    }
    this.shotClockFrozen = false;
    this.pendingSteal = -1;
    const ht = this.config.humanTeam;
    if (ht >= 0) {
      if (p.team === ht) this.setControlled(p.id);
      else if (prevPoss !== p.team) this.autoSwitchDefense();
    }
  }

  /** Greedy nearest matchups for the defending team when possession changes. */
  private assignMatchups(offTeam: TeamId): void {
    const offense = this.teamPlayers(offTeam);
    const defense = this.teamPlayers(1 - offTeam);
    // keep role matchups (stable and readable), they are nearest on average
    for (const d of defense) this.matchups[d.id] = offense[d.role].id;
    for (const o of offense) this.matchups[o.id] = defense[o.role].id;
  }

  private watchdog(dt: number): void {
    const b = this.ball;
    if (!Number.isFinite(b.pos.x) || !Number.isFinite(b.pos.y) || !Number.isFinite(b.pos.z)) {
      b.pos = { x: 0, y: 1, z: 0 };
      b.vel = { x: 0, y: 0, z: 0 };
      if (this.phase === 'live') this.startDeadball('reset', (1 - this.lastTouchTeam) as TeamId, this.sidelineSpot(0, 1));
      return;
    }
    if (this.phase === 'live' && (b.state === 'loose' || b.state === 'flight')) {
      this.looseT += dt;
      if (this.looseT > 10) {
        this.looseT = 0;
        const team = (1 - this.lastTouchTeam) as TeamId;
        this.emit({ type: 'turnover', team: this.lastTouchTeam, reason: 'Ball reset' });
        this.startDeadball('stuck', team, this.sidelineSpot(b.pos.x, b.pos.z));
      }
    } else this.looseT = 0;
    if (this.phase === 'inbound' && this.phaseT > 9) {
      const inb = this.players[this.inbound!.inbounder];
      this.doPass(inb, this.choosePassTarget(inb, null));
    }
    if (this.phase === 'deadball' && this.phaseT > 6) this.beginInbound(this.deadball!);
  }

  // ---------------------------------------------------------------- utils
  nearestPlayer(list: Player[], pt: V2): Player {
    let best = list[0];
    let bd = Infinity;
    for (const p of list) {
      const d = dist2(p.pos, pt);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }
  nearestDist(list: Player[], pt: V2): number {
    let bd = Infinity;
    for (const p of list) bd = Math.min(bd, dist2(p.pos, pt));
    return bd;
  }
  sidelineSpot(x: number, z: number): V2 {
    return { x: clamp(x, -HALF_L + 1.5, HALF_L - 1.5), z: (z >= 0 ? 1 : -1) * (HALF_W + 0.45) };
  }
  oobSpot(x: number, z: number): V2 {
    if (Math.abs(x) > HALF_L) {
      let zz = clamp(z, -HALF_W + 0.8, HALF_W - 0.8);
      if (Math.abs(zz) < 1.9) zz = zz >= 0 ? 1.9 : -1.9;
      return { x: Math.sign(x) * (HALF_L + 0.45), z: zz };
    }
    return this.sidelineSpot(x, z);
  }

  /** Current meter value of the controlled shooter (for the HUD), or -1. */
  shotMeter(): number {
    const p = this.players[this.controlled];
    if (!p || !p.action || p.action.kind !== 'shoot') return -1;
    return p.action.released ? p.action.meterAtRelease : p.action.t / SHOT_METER_TIME;
  }
}
