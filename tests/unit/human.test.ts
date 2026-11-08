import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../../src/sim/constants';
import { Game } from '../../src/sim/game';
import { Rng } from '../../src/sim/math';

function playMatch(g: Game, drive: (g: Game, t: number) => void) {
  g.startMatch();
  let n = 0;
  let stall = 0;
  let maxStall = 0;
  let prev = '';
  while (g.phase !== 'final' && n < 120 * 60 * 40) {
    drive(g, n * SIM_DT);
    g.step(SIM_DT);
    g.drainEvents();
    n++;
    const key = `${g.phase}|${g.quarter}`;
    if (key === prev && g.phase !== 'live') stall += SIM_DT;
    else stall = 0;
    prev = key;
    maxStall = Math.max(maxStall, stall);
  }
  return { n, maxStall };
}

describe('human-controlled team robustness (QUAL-002)', () => {
  it('a completely idle human still reaches the end of the match', () => {
    const g = new Game({ seed: 21, humanTeam: 0, quarterLength: 60 });
    const r = playMatch(g, () => {});
    console.log('idle', r.n, g.score, g.quarter, JSON.stringify(g.stats));
    expect(r.n * SIM_DT).toBeGreaterThan(240);
    expect(g.phase).toBe('final');
    expect(r.maxStall).toBeLessThan(12);
    // the AI should comfortably win against an idle opponent
    expect(g.score[1]).toBeGreaterThan(g.score[0]);
  });

  for (const seed of [1, 2, 3]) {
    it(`a button-mashing human (seed ${seed}) never breaks the game state`, () => {
      const g = new Game({ seed, humanTeam: 0, quarterLength: 60 });
      const rng = new Rng(seed * 77);
      let nextT = 0;
      const r = playMatch(g, (gg, t) => {
        if (t < nextT) return;
        nextT = t + rng.range(0.1, 0.6);
        const a = rng.range(0, Math.PI * 2);
        const inp = gg.input;
        inp.move = rng.chance(0.8) ? { x: Math.cos(a), z: Math.sin(a) } : { x: 0, z: 0 };
        inp.sprint = rng.chance(0.4);
        inp.shootHeld = rng.chance(0.3) ? !inp.shootHeld : inp.shootHeld;
        if (rng.chance(0.25)) inp.passPressed = true;
        if (rng.chance(0.15)) inp.switchPressed = true;
        if (rng.chance(0.25)) inp.stealPressed = true;
      });
      console.log('mash', seed, r.n, g.score, g.quarter, JSON.stringify(g.stats));
      expect(r.n * SIM_DT).toBeGreaterThan(240);
      expect(g.phase).toBe('final');
      expect(r.maxStall).toBeLessThan(12);
      for (const p of g.players) expect(Number.isFinite(p.pos.x)).toBe(true);
      expect(g.controlled).toBeGreaterThanOrEqual(0);
      expect(g.players[g.controlled].team).toBe(0);
    });
  }
});
