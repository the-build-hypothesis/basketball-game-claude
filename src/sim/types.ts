import type { V2, V3 } from './math';

export type TeamId = 0 | 1;
export type Phase = 'pregame' | 'tipoff' | 'inbound' | 'live' | 'deadball' | 'freethrow' | 'quarterEnd' | 'final';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface GameConfig {
  /** Seconds per quarter. */
  quarterLength: number;
  quarters: number;
  difficulty: Difficulty;
  /** Team controlled by the human, or -1 for full AI-vs-AI (attract mode / tests). */
  humanTeam: TeamId | -1;
  seed: number;
}

export interface ShootAction {
  kind: 'shoot';
  t: number;
  layup: boolean;
  released: boolean;
  /** Meter value at which the AI releases (Infinity for human: released on key-up). */
  autoRelease: number;
  fromX: number;
  fromZ: number;
  jumped: boolean;
  meterAtRelease: number;
  /** Free throw (set shot, no jump). */
  ft: boolean;
  /** Dunk: auto-released at the top of the jump, ball slammed down through the rim. */
  dunk: boolean;
}
export interface SimpleAction {
  kind: 'pass' | 'steal' | 'recover' | 'block';
  t: number;
  dur: number;
}
export type Action = ShootAction | SimpleAction;

export interface AIState {
  decT: number;
  target: V2;
  spotVariant: number;
  spotT: number;
  cutT: number;
  holdT: number;
  lastPassT: number;
  driving: boolean;
  probe: V2 | null;
  reactT: number;
}

export interface Intent {
  mx: number;
  mz: number;
  sprint: boolean;
  /** Desired facing angle, or null to face movement direction. */
  face: number | null;
}

export interface Player {
  id: number;
  team: TeamId;
  role: number;
  number: number;
  name: string;
  pos: V3;
  vel: V2;
  vy: number;
  facing: number;
  speedRating: number;
  shootRating: number;
  defRating: number;
  stamina: number;
  action: Action | null;
  stealCd: number;
  pickupCd: number;
  jumpCd: number;
  holdT: number;
  runPhase: number;
  sprinting: boolean;
  intent: Intent;
  ai: AIState;
  /** visual: defensive stance amount 0..1 */
  stance: number;
}

export type BallState = 'held' | 'flight' | 'loose' | 'dead';

export interface Ball {
  pos: V3;
  vel: V3;
  state: BallState;
  owner: number;
  /** For flight state: 'pass' | 'shot' | 'tip' */
  flightKind: 'pass' | 'shot' | 'tip' | null;
  passFrom: number;
  passTo: number;
  passRolled: Set<number>;
  dribblePhase: number;
  flightT: number;
  /** visual spin (rad) */
  spinAngle: number;
}

export interface ShotInfo {
  id: number;
  shooter: number;
  team: TeamId;
  points: 1 | 2 | 3;
  layup: boolean;
  ft: boolean;
  /** Defender who committed a shooting foul on this attempt, or -1. */
  fouledBy: number;
  dist: number;
  label: string;
  contest: number;
  releaseClock: number;
  valid: boolean;
  touchedRim: boolean;
  touchedBoard: boolean;
  scored: boolean;
  blocked: boolean;
  resolved: boolean;
  t: number;
  blockRolled: Set<number>;
}

export interface TeamStats {
  pts: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  oreb: number;
  dreb: number;
  stl: number;
  blk: number;
  tov: number;
  ftm: number;
  fta: number;
  pf: number;
}

export type GameEvent =
  | { type: 'score'; team: TeamId; points: number; shooter: number; label: string }
  | { type: 'miss'; team: TeamId; airball: boolean }
  | { type: 'shotRelease'; team: TeamId; label: string; points: number; shooter: number; meter: number; contest: number }
  | { type: 'block'; team: TeamId; player: number }
  | { type: 'steal'; team: TeamId; player: number }
  | { type: 'interception'; team: TeamId; player: number }
  | { type: 'rebound'; team: TeamId; offensive: boolean; player: number }
  | { type: 'turnover'; team: TeamId; reason: string }
  | { type: 'possession'; team: TeamId }
  | { type: 'pass'; team: TeamId; from: number; to: number }
  | { type: 'catch'; player: number }
  | { type: 'quarterEnd'; quarter: number }
  | { type: 'quarterStart'; quarter: number }
  | { type: 'final'; score: [number, number] }
  | { type: 'tipoff'; winner: TeamId }
  | { type: 'rim'; strength: number }
  | { type: 'board'; strength: number }
  | { type: 'bounce'; strength: number }
  | { type: 'dribble' }
  | { type: 'swish' }
  | { type: 'buzzer' }
  | { type: 'jump'; player: number }
  | { type: 'rejected'; reason: string }
  | { type: 'switch'; player: number }
  | { type: 'foul'; team: TeamId; player: number; victim: number; kind: 'shooting' | 'reach'; shots: number; teamFouls: number }
  | { type: 'freeThrows'; shooter: number; total: number };

export interface HumanInput {
  /** World-space desired move direction (magnitude 0..1). */
  move: V2;
  sprint: boolean;
  /** Shoot/jump button currently held. */
  shootHeld: boolean;
  passPressed: boolean;
  switchPressed: boolean;
  stealPressed: boolean;
}
