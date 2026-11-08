import { describe, expect, it } from 'vitest';
import { BASKET_X, HALF_L, RIM_H, SHOT_CLOCK, SHOT_CLOCK_OREB } from '../../src/sim/constants';
import { isThreePointShot } from '../../src/sim/court';
import { count, freezeAI, liveGame, run, shootAt } from './helpers';

describe('three-point geometry', () => {
  it('classifies arc and corner shots', () => {
    expect(isThreePointShot(BASKET_X - 4, 0, BASKET_X)).toBe(false);
    expect(isThreePointShot(BASKET_X - 7.0, 0, BASKET_X)).toBe(false);
    expect(isThreePointShot(BASKET_X - 7.5, 0, BASKET_X)).toBe(true);
    // corner: 6.9 m from the center line, near the baseline
    expect(isThreePointShot(HALF_L - 1, 6.9, BASKET_X)).toBe(true);
    expect(isThreePointShot(HALF_L - 1, 6.5, BASKET_X)).toBe(false);
    // mirrored basket
    expect(isThreePointShot(-BASKET_X + 7.5, 0, -BASKET_X)).toBe(true);
    expect(isThreePointShot(-BASKET_X + 3, 1, -BASKET_X)).toBe(false);
  });
});

describe('shot scoring (TEST-002)', () => {
  it('a made two-pointer adds exactly 2 and gives the opponent the ball', () => {
    const g = liveGame(0, BASKET_X - 4.2, 0.5);
    g.shotErrorScale = 0;
    freezeAI(g, [0]);
    shootAt(g, 0);
    const ev = run(g, 4);
    expect(count(ev, 'score')).toBe(1);
    expect(g.score).toEqual([2, 0]);
    const sc = ev.find((e) => e.type === 'score');
    expect(sc && sc.type === 'score' && sc.points).toBe(2);
    // made basket -> opponent possession and inbound
    expect(g.possession).toBe(1);
    expect(['deadball', 'inbound', 'live']).toContain(g.phase);
  });

  it('a made three-pointer adds exactly 3', () => {
    const g = liveGame(0, BASKET_X - 7.7, 1.0);
    g.shotErrorScale = 0;
    freezeAI(g, [0]);
    shootAt(g, 0);
    const ev = run(g, 4);
    expect(count(ev, 'score')).toBe(1);
    expect(g.score).toEqual([3, 0]);
    expect(g.stats[0].tpm).toBe(1);
  });

  it('a made corner three-pointer adds exactly 3', () => {
    const g = liveGame(0, HALF_L - 1.0, -6.95);
    g.shotErrorScale = 0;
    freezeAI(g, [0]);
    shootAt(g, 0);
    const ev = run(g, 4);
    expect(g.score).toEqual([3, 0]);
    expect(count(ev, 'score')).toBe(1);
  });

  it('the AI team (attacking -x) scores into its own basket for 2', () => {
    const g = liveGame(7, -BASKET_X + 3.5, -1);
    g.shotErrorScale = 0;
    freezeAI(g, [7]);
    shootAt(g, 7);
    run(g, 4);
    expect(g.score).toEqual([0, 2]);
    expect(g.possession).toBe(0);
  });

  it('a badly timed (very early) release misses and does not score', () => {
    const g = liveGame(0, BASKET_X - 6, 0);
    g.shotErrorScale = 0;
    freezeAI(g, [0]);
    shootAt(g, 0, 0.35); // way early -> short
    const ev = run(g, 5);
    expect(count(ev, 'score')).toBe(0);
    expect(g.score).toEqual([0, 0]);
    expect(count(ev, 'miss')).toBe(1);
  });

  it('a heave from beyond half court with late timing does not score', () => {
    const g = liveGame(0, -3, 0);
    g.shotErrorScale = 0;
    freezeAI(g, [0]);
    shootAt(g, 0, 1.12);
    const ev = run(g, 6);
    expect(count(ev, 'score')).toBe(0);
  });

  it('never double counts a single basket', () => {
    const g = liveGame(0, BASKET_X - 3, 0);
    g.shotErrorScale = 0;
    freezeAI(g, [0]);
    shootAt(g, 0);
    const ev = run(g, 10);
    expect(count(ev, 'score')).toBe(1);
    expect(g.score[0]).toBe(2);
  });

  it('rejects a ball passing through the rim while play is stopped', () => {
    const g = liveGame(0, 0, 0);
    g.phase = 'deadball';
    g.deadball = { reason: 'test', team: 1, spot: { x: 0, z: 8 }, inbounder: 5 };
    g.ball.state = 'loose';
    g.ball.owner = -1;
    g.ball.pos = { x: BASKET_X, y: RIM_H + 0.6, z: 0 };
    g.ball.vel = { x: 0, y: -1, z: 0 };
    const ev = run(g, 1.0);
    expect(count(ev, 'score')).toBe(0);
    expect(g.score).toEqual([0, 0]);
  });

  it('awards points by real ball geometry: a ball dropped through the hoop in live play scores 2 for the attacking team', () => {
    const g = liveGame(0, 0, 0);
    g.ball.state = 'loose';
    g.ball.owner = -1;
    g.ball.pos = { x: -BASKET_X, y: RIM_H + 0.6, z: 0 };
    g.ball.vel = { x: 0, y: -1, z: 0 };
    run(g, 1.0);
    expect(g.score).toEqual([0, 2]);
  });

  it('a ball that falls next to the rim does not score', () => {
    const g = liveGame(0, 0, 0);
    g.ball.state = 'loose';
    g.ball.owner = -1;
    g.ball.pos = { x: BASKET_X - 0.6, y: RIM_H + 0.6, z: 0 };
    g.ball.vel = { x: 0, y: -1, z: 0 };
    run(g, 1.5);
    expect(g.score).toEqual([0, 0]);
  });
});

describe('possession changes (TEST-003)', () => {
  it('defensive rebound after a miss changes possession and resets the shot clock', () => {
    const g = liveGame(0, BASKET_X - 5, 0);
    g.shotErrorScale = 0;
    shootAt(g, 0, 0.45);
    const ev = run(g, 8, (e) => e.some((x) => x.type === 'rebound'));
    const reb = ev.find((e) => e.type === 'rebound');
    expect(reb).toBeTruthy();
    if (reb && reb.type === 'rebound') {
      expect(g.possession).toBe(reb.team);
      if (reb.team === 1) expect(g.shotClock).toBeCloseTo(SHOT_CLOCK, 0);
      else expect(g.shotClock).toBeLessThanOrEqual(SHOT_CLOCK_OREB + 0.01);
    }
  });

  it('a successful steal turns the ball over to the defense', () => {
    const g = liveGame(0, 2, 0, {}, true);
    const d = g.players[5];
    d.pos.x = 2.8;
    d.pos.z = 0;
    d.defRating = 10; // guarantee success
    const ok = g.attemptSteal(d);
    expect(ok).toBe(true);
    expect(g.ball.state).toBe('loose');
    const ev = run(g, 4, (e) => e.some((x) => x.type === 'steal'));
    expect(count(ev, 'steal')).toBe(1);
    expect(g.possession).toBe(1);
    expect(g.shotClock).toBeGreaterThan(SHOT_CLOCK - 4.5);
  });

  it('a pass that is intercepted changes possession', () => {
    const g = liveGame(0, 0, 0);
    const mate = g.players[1];
    mate.pos.x = 8;
    mate.pos.z = 0;
    const thief = g.players[5];
    thief.pos.x = 4;
    thief.pos.z = 0;
    thief.defRating = 10;
    g.players[0].facing = 0;
    g.doPass(g.players[0], mate);
    const ev = run(g, 2, (e) => e.some((x) => x.type === 'interception' || x.type === 'catch'));
    expect(count(ev, 'interception')).toBe(1);
    expect(g.possession).toBe(1);
  });

  it('a completed pass keeps possession and moves the ball through the air', () => {
    const g = liveGame(0, 0, 0);
    const mate = g.players[1];
    mate.pos.x = 6;
    mate.pos.z = 2;
    g.doPass(g.players[0], mate);
    expect(g.ball.state).toBe('flight');
    const start = { ...g.ball.pos };
    run(g, 0.2);
    expect(Math.hypot(g.ball.pos.x - start.x, g.ball.pos.z - start.z)).toBeGreaterThan(1);
    run(g, 2, (e) => e.some((x) => x.type === 'catch'));
    expect(g.ball.owner).toBe(1);
    expect(g.possession).toBe(0);
    expect(g.controlled).toBe(1);
  });

  it('a loose ball rolling out of bounds goes to the other team', () => {
    const g = liveGame(0, 0, 0);
    g.ball.state = 'loose';
    g.ball.owner = -1;
    g.lastTouchTeam = 0;
    g.ball.pos = { x: 3, y: 0.12, z: 7.0 };
    g.ball.vel = { x: 0, y: 0, z: 4 };
    for (const p of g.players) p.pos.z = -5;
    const ev = run(g, 2, (e) => e.some((x) => x.type === 'turnover'));
    expect(ev.some((e) => e.type === 'turnover' && e.reason === 'Out of bounds')).toBe(true);
    expect(g.possession).toBe(1);
    run(g, 6, () => g.phase === 'inbound');
    expect(g.phase).toBe('inbound');
    expect(g.ball.owner).toBeGreaterThanOrEqual(5);
  });

  it('shot clock violation turns the ball over', () => {
    const g = liveGame(0, 0, 0);
    freezeAI(g);
    g.shotClock = 0.2;
    const ev = run(g, 1);
    expect(ev.some((e) => e.type === 'turnover' && e.reason === 'Shot clock violation')).toBe(true);
    expect(g.possession).toBe(1);
  });

  it('after a made basket the opponent inbounds and play resumes', () => {
    const g = liveGame(0, BASKET_X - 2, 0);
    g.shotErrorScale = 0;
    shootAt(g, 0);
    run(g, 3, (e) => e.some((x) => x.type === 'score'));
    expect(g.phase).toBe('deadball');
    run(g, 6, () => g.phase === 'inbound');
    expect(g.phase).toBe('inbound');
    expect(g.players[g.ball.owner].team).toBe(1);
    run(g, 6, () => g.phase === 'live');
    expect(g.phase).toBe('live');
  });
});

describe('ball ownership guards', () => {
  it('a shooter who loses the ball mid-gather cannot release it', () => {
    const g = liveGame(7, -BASKET_X + 6, 0);
    shootAt(g, 7);
    run(g, 0.2);
    // ball changes hands while #7 is gathering
    g.gainPossession(g.players[0], 'loose');
    run(g, 1.0);
    expect(g.ball.owner).toBe(0);
    expect(g.stats[1].fga).toBe(0);
  });
});

describe('dunks', () => {
  it('a sprinting human close to the rim dunks for exactly 2 through real ball geometry', () => {
    const g = liveGame(0, BASKET_X - 1.3, 0.3);
    freezeAI(g, [0]);
    g.players[0].sprinting = true;
    shootAt(g, 0);
    expect(g.players[0].action?.kind === 'shoot' && g.players[0].action.dunk).toBe(true);
    const ev = run(g, 3);
    expect(ev.some((e) => e.type === 'shotRelease' && e.label === 'DUNK')).toBe(true);
    expect(count(ev, 'score')).toBe(1);
    expect(g.score).toEqual([2, 0]);
  });

  it('an AI center attacking the rim dunks', () => {
    const g = liveGame(9, -BASKET_X + 1.2, -0.2);
    freezeAI(g, [9]);
    shootAt(g, 9);
    const ev = run(g, 3);
    expect(ev.some((e) => e.type === 'shotRelease' && e.label === 'DUNK')).toBe(true);
    expect(g.score).toEqual([0, 2]);
  });
});

describe('ball vs body collisions', () => {
  it('a pass into a defender who fails to intercept deflects off his body instead of passing through', () => {
    const g = liveGame(0, 0, 0);
    freezeAI(g, [0]);
    const mate = g.players[1];
    mate.pos.x = 8;
    mate.pos.z = 0;
    const d = g.players[5];
    d.pos.x = 4;
    d.pos.z = 0;
    d.defRating = 0; // never intercepts
    g.players[0].facing = 0;
    g.doPass(g.players[0], mate);
    let maxX = -Infinity;
    for (let i = 0; i < 60; i++) {
      run(g, 1 / 60);
      if (g.ball.state !== 'held') maxX = Math.max(maxX, g.ball.pos.x);
    }
    expect(maxX).toBeLessThan(4.5); // never got past the defender's body
    expect(g.ball.owner).not.toBe(1);
  });
});
