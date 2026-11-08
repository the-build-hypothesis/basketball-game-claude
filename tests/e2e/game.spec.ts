import { expect, test, type Page } from '@playwright/test';

type Snap = {
  phase: string;
  poss: number;
  ball: string;
  kind: string | null;
  owner: number;
  ctrl: number;
  score: number[];
  quarter: number;
  clock: number;
  players: number;
  cx: number;
  cz: number;
};

async function snap(page: Page): Promise<Snap> {
  return page.evaluate(() => {
    const g = (window as any).__app.game;
    const c = g.players[g.controlled] ?? g.players[0];
    return {
      phase: g.phase,
      poss: g.possession,
      ball: g.ball.state,
      kind: g.ball.flightKind,
      owner: g.ball.owner,
      ctrl: g.controlled,
      score: [...g.score],
      quarter: g.quarter,
      clock: g.gameClock,
      players: g.players.length,
      cx: c.pos.x,
      cz: c.pos.z,
    };
  });
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));
  return errors;
}

async function startMatch(page: Page, quarter = '120'): Promise<void> {
  await page.goto('/?quality=low');
  await expect(page.locator('#menu')).toBeVisible({ timeout: 30_000 });
  await page.selectOption('#opt-quarter', quarter);
  await page.click('#btn-start');
  await expect(page.locator('#hud')).toBeVisible();
}

/** Give the human team the ball in live play at (x,z) with no defenders nearby. */
async function giveBall(page: Page, x: number, z: number): Promise<void> {
  await page.evaluate(
    ([x, z]) => {
      const g = (window as any).__app.game;
      g.phase = 'live';
      g.deadball = null;
      g.inbound = null;
      const p = g.players[0];
      p.pos.x = x;
      p.pos.z = z;
      p.action = null;
      for (const q of g.players) {
        if (q.team === 1) {
          q.pos.x = -10;
          q.pos.z = -6 + (q.role % 5) * 3;
        }
      }
      g.gainPossession(p, 'loose');
      g.shotErrorScale = 0;
    },
    [x, z],
  );
}

test('smoke: loads, renders, starts a match with 10 players and no errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.locator('#menu')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.click('#btn-start');
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#score0')).toHaveText('0');
  await expect(page.locator('#score1')).toHaveText('0');
  const s = await snap(page);
  expect(s.players).toBe(10);
  expect(s.quarter).toBe(1);
  // play proceeds past the tip-off into live play and the clock runs
  await expect.poll(async () => (await snap(page)).phase, { timeout: 20_000 }).toBe('live');
  const c0 = (await snap(page)).clock;
  await page.waitForTimeout(1500);
  expect((await snap(page)).clock).toBeLessThan(c0);
  // canvas actually drew something (not a blank frame)
  const nonBlank = await page.evaluate(() => {
    const c = document.querySelector('canvas') as HTMLCanvasElement;
    // render and sample in the same task (the WebGL drawing buffer is not preserved)
    (window as any).__app.view.render(0, performance.now() / 1000);
    const tmp = document.createElement('canvas');
    tmp.width = 64;
    tmp.height = 36;
    const ctx = tmp.getContext('2d')!;
    ctx.drawImage(c, 0, 0, 64, 36);
    const d = ctx.getImageData(0, 0, 64, 36).data;
    const set = new Set<number>();
    for (let i = 0; i < d.length; i += 4) set.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4));
    return set.size;
  });
  expect(nonBlank).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});

test('controls: move, pass to a teammate, and shoot through the keyboard', async ({ page }) => {
  const errors = collectErrors(page);
  await startMatch(page);
  await giveBall(page, -6, 0);
  const a = await snap(page);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(900);
  await page.keyboard.up('KeyD');
  const b = await snap(page);
  expect(b.cx - a.cx).toBeGreaterThan(1.5); // D moves screen-right (+x)
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyW');
  expect((await snap(page)).cz).toBeLessThan(b.cz - 0.8); // W moves up-screen (-z)

  // pass
  const passer = (await snap(page)).ctrl;
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await snap(page)).kind, { timeout: 2000 }).toBe('pass');
  await expect.poll(async () => (await snap(page)).ball, { timeout: 4000 }).toBe('held');
  const afterPass = await snap(page);
  expect(afterPass.owner).not.toBe(passer);
  expect(afterPass.ctrl).toBe(afterPass.owner); // control follows the ball

  // shoot (hold and release)
  await page.keyboard.down('Space');
  await page.waitForTimeout(450);
  await page.keyboard.up('Space');
  await expect.poll(async () => (await snap(page)).kind, { timeout: 2000 }).toBe('shot');
  expect(errors).toEqual([]);
});

test('scoring through the UI: a well-timed short jumper adds exactly 2 and flips possession', async ({ page }) => {
  await startMatch(page);
  await giveBall(page, 9.0, 0.5); // ~3.7 m from the +x rim
  // use the sim's own clock for release timing so slow software rendering can't skew it
  await page.evaluate(() => {
    const g = (window as any).__app.game;
    g.startShot(g.players[g.controlled], 0.9);
  });
  await expect(page.locator('#score0')).toHaveText('2', { timeout: 6000 });
  await page.waitForTimeout(1500);
  await expect(page.locator('#score0')).toHaveText('2'); // no double count
  expect((await snap(page)).poss).toBe(1);
});

test('three-pointer through the UI adds exactly 3', async ({ page }) => {
  await startMatch(page);
  await giveBall(page, 12.725 - 7.8, 0.3);
  await page.evaluate(() => {
    const g = (window as any).__app.game;
    g.startShot(g.players[g.controlled], 0.9);
  });
  await expect(page.locator('#score0')).toHaveText('3', { timeout: 6000 });
});

test('clock expiry shows the final screen; play again starts a clean match', async ({ page }) => {
  const errors = collectErrors(page);
  await startMatch(page, '60');
  await page.evaluate(() => {
    const g = (window as any).__app.game;
    g.quarter = 4;
    g.phase = 'live';
    g.gameClock = 1.0;
    g.score = [7, 4];
  });
  await expect(page.locator('#final')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#final-score')).toContainText('7');
  await expect(page.locator('#final-score')).toContainText('4');
  await expect(page.locator('#final-title')).toHaveText('YOU WIN!');
  await page.click('#btn-again');
  await expect(page.locator('#final')).toBeHidden();
  const s = await snap(page);
  expect(s.score).toEqual([0, 0]);
  expect(s.quarter).toBe(1);
  expect(s.clock).toBeCloseTo(60, 0);
  await expect(page.locator('#score0')).toHaveText('0');
  expect(errors).toEqual([]);
});

test('pause, resume, restart, and switching player on defense', async ({ page }) => {
  await startMatch(page);
  await expect.poll(async () => (await snap(page)).phase, { timeout: 20_000 }).toBe('live');
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause')).toBeVisible();
  const c0 = (await snap(page)).clock;
  await page.waitForTimeout(800);
  expect((await snap(page)).clock).toBe(c0); // frozen while paused
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause')).toBeHidden();

  // defense: give the AI the ball, then Tab switches to the defender nearest the ball
  await page.evaluate(() => {
    const g = (window as any).__app.game;
    g.phase = 'live';
    g.gainPossession(g.players[5], 'loose');
    g.setControlled(4);
    g.players[4].pos.x = -12;
    g.players[4].pos.z = 6;
  });
  await page.keyboard.press('Tab');
  await expect.poll(async () => (await snap(page)).ctrl).not.toBe(4);

  // restart from the pause menu resets everything
  await page.evaluate(() => ((window as any).__app.game.score = [5, 9]));
  await page.keyboard.press('Escape');
  await page.click('#btn-restart');
  const s = await snap(page);
  expect(s.score).toEqual([0, 0]);
  expect(s.phase).toBe('tipoff');
});

test('survives a browser reload and can start again', async ({ page }) => {
  const errors = collectErrors(page);
  await startMatch(page);
  await page.waitForTimeout(1000);
  await page.reload();
  await expect(page.locator('#menu')).toBeVisible({ timeout: 30_000 });
  await page.click('#btn-start');
  await expect(page.locator('#hud')).toBeVisible();
  expect((await snap(page)).score).toEqual([0, 0]);
  expect(errors).toEqual([]);
});

test('AI offense advances the ball and attempts shots on its own', async ({ page }) => {
  await startMatch(page);
  await page.evaluate(() => {
    const g = (window as any).__app.game;
    g.phase = 'live';
    g.gainPossession(g.players[5], 'loose');
    (window as any).__app.timeScale = 4;
  });
  await expect
    .poll(async () => page.evaluate(() => (window as any).__app.game.stats[1].fga), { timeout: 30_000 })
    .toBeGreaterThan(0);
});

test('free throws: human shoots both with the Space meter', async ({ page }) => {
  const errors = collectErrors(page);
  await startMatch(page);
  await page.evaluate(() => {
    const g = (window as any).__app.game;
    g.phase = 'live';
    g.startFreeThrows(0, 2);
  });
  await expect(page.locator('#possession-label')).toContainText('FREE THROW 1 of 2');
  for (let i = 0; i < 2; i++) {
    await expect
      .poll(async () => page.evaluate(() => { const g = (window as any).__app.game; return g.ball.state === 'held' && g.ball.owner === 0 && !g.players[0].action; }), { timeout: 8000 })
      .toBe(true);
    await page.keyboard.down('Space');
    await page.waitForTimeout(500);
    await page.keyboard.up('Space');
    await expect.poll(async () => page.evaluate(() => (window as any).__app.game.stats[0].fta), { timeout: 4000 }).toBe(i + 1);
  }
  const s = await page.evaluate(() => { const g = (window as any).__app.game; return { ftm: g.stats[0].ftm, score: g.score[0] }; });
  expect(s.score).toBe(s.ftm);
  expect(errors).toEqual([]);
});
