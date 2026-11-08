// All units are meters / seconds. World axes: x runs along the court length,
// z runs across the court (sidelines at ±HALF_W), y is up.
// Team 0 (human by default) attacks the +x basket; team 1 attacks the -x basket.

export const FT = 0.3048;

export const COURT_L = 94 * FT; // 28.65
export const COURT_W = 50 * FT; // 15.24
export const HALF_L = COURT_L / 2;
export const HALF_W = COURT_W / 2;

export const RIM_H = 10 * FT; // 3.048
export const RIM_R = 0.2286; // 18" inner diameter / 2
export const RIM_TUBE = 0.01;
export const BASKET_FROM_BASELINE = 5.25 * FT; // rim center 1.60 m in from baseline
export const BASKET_X = HALF_L - BASKET_FROM_BASELINE;
export const BACKBOARD_FROM_BASELINE = 4 * FT; // board face 1.22 m in from baseline
export const BACKBOARD_FACE_X = HALF_L - BACKBOARD_FROM_BASELINE;
export const BACKBOARD_W = 6 * FT; // 1.83
export const BACKBOARD_H = 3.5 * FT; // 1.07
export const BACKBOARD_BOTTOM = RIM_H - 0.5 * FT; // 2.90
export const BACKBOARD_T = 0.05;

export const BALL_R = 0.1194; // 9.4" diameter

export const THREE_R = 23.75 * FT; // 7.24
export const THREE_CORNER_Z = 22 * FT; // 6.71
/** Distance from basket center (toward mid court) where the corner straight meets the arc. */
export const THREE_CORNER_DX = Math.sqrt(THREE_R * THREE_R - THREE_CORNER_Z * THREE_CORNER_Z);
export const KEY_W = 16 * FT; // 4.88
export const FT_LINE_FROM_BASELINE = 19 * FT; // 5.79
export const FT_CIRCLE_R = 6 * FT;
export const CENTER_CIRCLE_R = 6 * FT;
export const RESTRICTED_R = 4 * FT;

export const GRAVITY = 9.81;

export const PLAYER_RADIUS = 0.36;
export const PLAYER_HEIGHT = 2.0;
export const RUN_SPEED = 5.2;
export const SPRINT_SPEED = 7.2;
export const DRIBBLE_SPEED_MULT = 0.9;
export const ACCEL = 20;

export const SIM_DT = 1 / 120;
export const BALL_SUBSTEPS = 4;

export const SHOT_CLOCK = 24;
export const SHOT_CLOCK_OREB = 14;

/** Meter value (0..1+) considered the ideal release. */
export const SHOT_IDEAL = 0.9;
/** Time in seconds for the shot meter to go from 0 to 1. */
export const SHOT_METER_TIME = 0.62;
/** Meter value at which a still-held shot is forced out (late). */
export const SHOT_FORCE_RELEASE = 1.12;
export const JUMP_AIRTIME = 0.82;
export const JUMP_HEIGHT = 0.5;
export const BLOCK_JUMP_HEIGHT = 0.68;
export const LAYUP_RANGE = 2.6;

export const TEAM_NAMES: [string, string] = ['Harbor City Herons', 'Mesa Ridge Coyotes'];
export const TEAM_SHORT: [string, string] = ['HERONS', 'COYOTES'];

/** Sign of the x-direction a team attacks. */
export function attackSign(team: number): 1 | -1 {
  return team === 0 ? 1 : -1;
}

/** x coordinate of the rim center the team attacks. */
export function attackBasketX(team: number): number {
  return attackSign(team) * BASKET_X;
}
