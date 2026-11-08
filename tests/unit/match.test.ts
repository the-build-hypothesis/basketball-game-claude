import { describe, expect, it } from 'vitest';
import { BASKET_X, SIM_DT } from '../../src/sim/constants';
import { Game } from '../../src/sim/game';
import { count, liveGame, run, shootAt } from './helpers';

describe('match clock (TEST-004)', () => {
  it('ends the match when the 4th-quarter clock expires and reports the final score', () => {
    const g = liveGame(0, 0, 0);
    g.quarter = 4;
    g.gameClock = 0.5;
    g.score = [10, 8];
    const ev = run(g, 2);
    expect(g.phase).toBe('final');
    expect(count(ev, 'final')).toBe(1);
    const fin = ev.find((e) => e.type === 'final');
    expect(fin && fin.type === 'final' && fin.score).toEqual([10, 8]);
    // the clock never goes negative and no further scoring happens
    expect(g.gameClock).toBe(0);
    const before = [...g.score];
    run(g, 5);
    expect(g.score).toEqual(before);
  });

  it('goes to overtime when tied', () => {
    const g = liveGame(0, 0, 0);
    g.quarter = 4;
    g.gameClock = 0.2;
    g.score = [6, 6];
    run(g, 5);
    expect(g.quarter).toBe(5);
    expect(g.gameClock).toBeGreaterThan(0);
  });

  it('advances from quarter 1 to quarter 2 with an inbound', () => {
    const g = liveGame(0, 0, 0);
    g.gameClock = 0.3;
    run(g, 1);
    expect(g.phase).toBe('quarterEnd');
    run(g, 4);
    expect(g.quarter).toBe(2);
    expect(['inbound', 'live']).toContain(g.phase);
    expect(g.gameClock).toBeGreaterThan(100);
  });

  it('counts a shot released before the buzzer that drops after it', () => {
    const g = liveGame(0, BASKET_X - 3, 0);
    g.shotErrorScale = 0;
    g.quarter = 4;
    g.score = [0, 1];
    shootAt(g, 0);
    // release happens ~0.56s after start; expire the clock while the ball is in the air
    run(g, 0.6);
    expect(g.ball.state).toBe('flight');
    g.gameClock = 0.05;
    const ev = run(g, 4);
    expect(g.score[0]).toBe(2);
    expect(count(ev, 'score')).toBe(1);
    expect(g.phase).toBe('final');
  });
});

describe('controls and switching (TEST-005)', () => {
  it('moves the controlled player with the input vector', () => {
    const g = liveGame(0, 0, 0);
    g.controlled = 0;
    g.input.move = { x: 1, z: 0 };
    const x0 = g.players[0].pos.x;
    run(g, 1);
    expect(g.players[0].pos.x - x0).toBeGreaterThan(3);
    g.input.move = { x: 0, z: 0 };
  });

  it('sprint is faster than running and drains stamina', () => {
    const a = liveGame(0, -10, 0);
    const b = liveGame(0, -10, 0);
    a.input.move = { x: 1, z: 0 };
    b.input.move = { x: 1, z: 0 };
    b.input.sprint = true;
    run(a, 1.5);
    run(b, 1.5);
    expect(b.players[0].pos.x).toBeGreaterThan(a.players[0].pos.x + 0.8);
    expect(b.players[0].stamina).toBeLessThan(a.players[0].stamina);
  });

  it('shoot button: press and release produces a shot in flight', () => {
    const g = liveGame(0, BASKET_X - 5, 0);
    g.input.shootHeld = true;
    run(g, 0.5);
    expect(g.players[0].action?.kind).toBe('shoot');
    g.input.shootHeld = false;
    run(g, 0.05);
    expect(g.ball.state).toBe('flight');
    expect(g.ball.flightKind).toBe('shot');
  });

  it('pass button passes toward the teammate in the held direction', () => {
    const g = liveGame(0, 0, 0);
    g.players[3].pos = { x: 0, y: 0, z: -6 };
    g.players[1].pos = { x: 6, y: 0, z: 0 };
    g.input.move = { x: 0, z: -1 };
    g.input.passPressed = true;
    run(g, 0.02);
    expect(g.ball.state).toBe('flight');
    expect(g.ball.passTo).toBe(3);
  });

  it('switch selects the teammate nearest the ball while defending', () => {
    const g = liveGame(5, 0, 0); // AI team has the ball
    expect(g.possession).toBe(1);
    g.players[2].pos = { x: 1, y: 0, z: 1 };
    g.controlled = 4;
    g.players[4].pos = { x: -10, y: 0, z: 0 };
    g.input.switchPressed = true;
    run(g, 0.02);
    expect(g.controlled).toBe(2);
  });

  it('control auto-switches to the defender nearest the ball on a change of possession', () => {
    const g = liveGame(0, 0, 0);
    g.controlled = 0;
    g.gainPossession(g.players[6], 'loose');
    expect(g.controlled).not.toBe(-1);
    expect(g.players[g.controlled].team).toBe(0);
  });

  it('defensive jump (Space without the ball) makes the player leave the ground', () => {
    const g = liveGame(5, 0, 0);
    g.controlled = 0;
    g.input.shootHeld = true;
    run(g, 0.1);
    expect(g.players[0].pos.y).toBeGreaterThan(0.05);
  });
});

describe('restart and full matches (TEST-006 / TEST-008)', () => {
  it('a new match starts clean at 0-0 in Q1 with a tip-off', () => {
    const g = new Game({ seed: 3, humanTeam: 0, quarterLength: 120 });
    g.startMatch();
    run(g, 20);
    g.startMatch();
    expect(g.score).toEqual([0, 0]);
    expect(g.quarter).toBe(1);
    expect(g.gameClock).toBe(120);
    expect(g.phase).toBe('tipoff');
    expect(g.stats[0].fga + g.stats[1].fga).toBe(0);
  });

  it('identical seeds produce identical matches (determinism)', () => {
    const play = (seed: number) => {
      const g = new Game({ seed, humanTeam: -1, quarterLength: 60 });
      g.startMatch();
      let n = 0;
      while (g.phase !== 'final' && n < 120 * 60 * 20) {
        g.step(SIM_DT);
        g.drainEvents();
        n++;
      }
      return { score: [...g.score], n };
    };
    expect(play(11)).toEqual(play(11));
  });

  for (const seed of [1, 2, 3, 4, 5]) {
    it(`headless AI-vs-AI match (seed ${seed}) completes without getting stuck`, () => {
      const g = new Game({ seed, humanTeam: -1, quarterLength: 120 });
      g.startMatch();
      let n = 0;
      let maxLoose = 0;
      let loose = 0;
      let shots = 0;
      let lastPhaseChange = 0;
      let prevPhase = g.phase;
      let maxPhaseStall = 0;
      while (g.phase !== 'final' && n < 120 * 60 * 30) {
        g.step(SIM_DT);
        for (const e of g.drainEvents()) if (e.type === 'shotRelease') shots++;
        n++;
        if (g.ball.state === 'loose') loose += SIM_DT;
        else loose = 0;
        maxLoose = Math.max(maxLoose, loose);
        if (g.phase !== prevPhase) {
          prevPhase = g.phase;
          lastPhaseChange = n;
        }
        if (g.phase !== 'live') maxPhaseStall = Math.max(maxPhaseStall, (n - lastPhaseChange) * SIM_DT);
        for (const p of g.players) {
          expect(Number.isFinite(p.pos.x) && Number.isFinite(p.pos.z)).toBe(true);
          expect(Math.abs(p.pos.x)).toBeLessThan(16.5);
          expect(Math.abs(p.pos.z)).toBeLessThan(9);
        }
      }
      expect(g.phase).toBe('final');
      expect(g.score[0]).not.toBe(g.score[1]);
      expect(shots).toBeGreaterThan(15);
      expect(g.score[0] + g.score[1]).toBeGreaterThan(8);
      expect(maxLoose).toBeLessThan(10.5);
      expect(maxPhaseStall).toBeLessThan(10);
    });
  }
});
