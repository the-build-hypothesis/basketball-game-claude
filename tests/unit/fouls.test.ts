import { describe, expect, it } from 'vitest';
import { BASKET_X } from '../../src/sim/constants';
import { BONUS_FOULS } from '../../src/sim/game';
import { count, freezeAI, liveGame, run, shootAt } from './helpers';

describe('fouls and free throws (GAME-013)', () => {
  it('free throws: each make is worth exactly 1, the last one is a live ball', () => {
    const g = liveGame(7, 0, 0, { humanTeam: -1 });
    g.shotErrorScale = 0;
    g.startFreeThrows(7, 2);
    expect(g.phase).toBe('freethrow');
    expect(g.ball.owner).toBe(7);
    const ev = run(g, 8, () => g.phase !== 'freethrow' && g.ft === null && g.activeShot?.resolved === true);
    const ftScores = ev.filter((e) => e.type === 'score');
    for (const e of ftScores) if (e.type === 'score') expect(e.points).toBe(1);
    expect(g.stats[1].fta).toBe(2);
    expect(g.score[1]).toBe(g.stats[1].ftm);
    expect(g.score[0]).toBe(0);
  });

  it('a shooting foul on a missed two awards two free throws', () => {
    const g = liveGame(0, BASKET_X - 4, 0);
    g.foulRate = 100;
    freezeAI(g, [0]);
    const d = g.players[5];
    d.pos.x = BASKET_X - 3.4;
    d.pos.z = 0;
    g.shotErrorScale = 0;
    shootAt(g, 0, 0.3); // ugly early release -> miss
    // defender jumps into the shooter just before release
    run(g, 0.1);
    g.jump(d, 0.6);
    const ev = run(g, 6, () => g.phase === 'freethrow');
    expect(count(ev, 'foul')).toBe(1);
    const f = ev.find((e) => e.type === 'foul');
    expect(f && f.type === 'foul' && f.kind).toBe('shooting');
    expect(g.phase).toBe('freethrow');
    expect(g.ft?.total).toBe(2);
    expect(g.ft?.shooter).toBe(0);
    expect(g.stats[1].pf).toBe(1);
    expect(g.teamFouls[1]).toBe(1);
  });

  it('a non-shooting foul before the bonus gives a side inbound, in the bonus two free throws', () => {
    const g = liveGame(0, 0, 0);
    g.foulRate = 100;
    const d = g.players[5];
    d.pos.x = 0.9;
    d.pos.z = 0;
    d.defRating = 0; // the steal never succeeds; the reach-in is a foul
    g.attemptSteal(d);
    const ev = run(g, 0.05);
    expect(ev.some((e) => e.type === 'foul' && e.kind === 'reach')).toBe(true);
    expect(g.phase).toBe('deadball');
    expect(g.possession).toBe(0);

    const g2 = liveGame(0, 0, 0);
    g2.foulRate = 100;
    g2.teamFouls[1] = BONUS_FOULS - 1;
    const d2 = g2.players[5];
    d2.pos.x = 0.9;
    d2.pos.z = 0;
    d2.defRating = 0;
    g2.attemptSteal(d2);
    run(g2, 0.05);
    expect(g2.phase).toBe('freethrow');
    expect(g2.ft?.total).toBe(2);
  });

  it('team fouls reset each quarter', () => {
    const g = liveGame(0, 0, 0);
    g.teamFouls = [3, 4];
    g.gameClock = 0.2;
    run(g, 5);
    expect(g.quarter).toBe(2);
    expect(g.teamFouls).toEqual([0, 0]);
  });

  it('no fouls are called on wide-open shots', () => {
    const g = liveGame(0, BASKET_X - 5, 0);
    g.foulRate = 100;
    shootAt(g, 0);
    const ev = run(g, 3);
    expect(count(ev, 'foul')).toBe(0);
  });
});

describe('review regressions', () => {
  it('a post-buzzer shot that lands out of bounds ends the game exactly once (no bogus dead ball)', () => {
    const g = liveGame(0, BASKET_X - 5, 0);
    g.quarter = 4;
    g.score = [5, 2];
    g.buzzerPending = false;
    shootAt(g, 0);
    run(g, 0.62);
    g.gameClock = 0.01;
    run(g, 0.02);
    expect(g.buzzerPending).toBe(true);
    // ball lands just past the sideline before touching the rim
    g.ball.state = 'loose';
    g.ball.pos = { x: 3, y: 0.13, z: 8 };
    g.ball.vel = { x: 0, y: -1, z: 0 };
    const ev = run(g, 6);
    expect(g.phase).toBe('final');
    expect(count(ev, 'final')).toBe(1);
    expect(count(ev, 'turnover')).toBe(0);
  });

  it('a fouled shot that goes out of bounds awards free throws and no turnover', () => {
    const g = liveGame(0, BASKET_X - 4, 0);
    shootAt(g, 0);
    run(g, 0.62);
    expect(g.activeShot).not.toBeNull();
    g.activeShot!.fouledBy = 5;
    g.ball.state = 'loose';
    g.ball.pos = { x: 3, y: 0.13, z: 8 };
    g.ball.vel = { x: 0, y: -1, z: 0 };
    const ev = run(g, 0.1);
    expect(count(ev, 'turnover')).toBe(0);
    expect(g.phase).toBe('freethrow');
    expect(g.stats[0].tov).toBe(0);
  });

  it('the game clock does not run while the last free throw is in the air', () => {
    const g = liveGame(0, 0, 0);
    g.gameClock = 0.4;
    g.startFreeThrows(0, 1);
    g.startShot(g.players[0], 0.9);
    run(g, 0.7); // released, ball in the air
    expect(g.phase).toBe('live');
    const c = g.gameClock;
    run(g, 0.3);
    if (g.ball.state !== 'held' && g.phase === 'live') expect(g.gameClock).toBe(c);
  });
});
