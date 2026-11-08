import { Game } from '../../src/sim/game';
import { SHOT_IDEAL, SHOT_METER_TIME, SIM_DT, attackBasketX } from '../../src/sim/constants';
import type { GameConfig, GameEvent, TeamId } from '../../src/sim/types';

/** Create a game in live play with `holder` owning the ball at (x,z). Opponents are moved far away. */
export function liveGame(holder: number, x: number, z: number, cfg: Partial<GameConfig> = {}, clearDefense = true): Game {
  const g = new Game({ seed: 42, humanTeam: 0, ...cfg });
  g.startMatch();
  // skip the tip-off: put the game directly into live play
  g.phase = 'live';
  g.phaseT = 0;
  const p = g.players[holder];
  p.pos.x = x;
  p.pos.z = z;
  if (clearDefense) {
    for (const q of g.players) {
      if (q.team !== p.team) {
        // park defenders near their own (far) baseline corner, out of the play
        q.pos.x = -attackBasketX(p.team) * 0.2;
        q.pos.z = 6.5 - q.role * 0.8;
      } else if (q.id !== holder) {
        q.pos.x = -attackBasketX(p.team) * 0.4;
        q.pos.z = -6 + q.role;
      }
    }
  }
  g.gainPossession(p, 'loose');
  g.possession = p.team;
  g.drainEvents();
  return g;
}

/** Freeze every player except listed ones (AI would otherwise react). */
export function freezeAI(g: Game, except: number[] = []): void {
  for (const p of g.players) {
    if (except.includes(p.id)) continue;
    p.speedRating = 0;
  }
}

/** Shoot with p, releasing at meter value `meter`, using the real release code. */
export function shootAt(g: Game, playerId: number, meter = SHOT_IDEAL): void {
  const p = g.players[playerId];
  if (!g.startShot(p, meter)) throw new Error('could not start shot');
  void SHOT_METER_TIME;
}

export function run(g: Game, seconds: number, until?: (e: GameEvent[]) => boolean): GameEvent[] {
  const all: GameEvent[] = [];
  const n = Math.round(seconds / SIM_DT);
  for (let i = 0; i < n; i++) {
    g.step(SIM_DT);
    const ev = g.drainEvents();
    all.push(...ev);
    if (until && until(all)) break;
  }
  return all;
}

export function count(ev: GameEvent[], type: GameEvent['type']): number {
  return ev.filter((e) => e.type === type).length;
}

export function otherTeam(t: TeamId): TeamId {
  return (1 - t) as TeamId;
}
