import './ui/style.css';
import { SIM_DT } from './sim/constants';
import { Game } from './sim/game';
import type { Difficulty, GameConfig } from './sim/types';
import { GameView, type CameraMode } from './render/view';
import type { Quality } from './render/scene';
import { Hud } from './ui/hud';
import { Input } from './ui/input';
import { Sfx } from './ui/audio';
import { BASKET_X, TEAM_SHORT } from './sim/constants';
import { Replay } from './ui/replay';

type AppState = 'loading' | 'menu' | 'playing' | 'paused' | 'replay' | 'final' | 'error';

const $ = (id: string) => document.getElementById(id)!;
const show = (id: string, v: boolean) => $(id).classList.toggle('hidden', !v);

function showError(err: unknown): void {
  const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
  console.error(err);
  $('error-msg').textContent = msg;
  show('error', true);
  app.state = 'error';
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

class App {
  state: AppState = 'loading';
  game!: Game;
  view!: GameView;
  hud = new Hud();
  input = new Input();
  sfx = new Sfx();
  replay = new Replay();
  quality: Quality = 'high';
  cameraMode: CameraMode = 'broadcast';
  config: GameConfig = { quarterLength: 120, quarters: 4, difficulty: 'normal', humanTeam: 0, seed: 1 };
  private acc = 0;
  private last = performance.now();
  private finalT = 0;
  private showDebug = false;
  private frameTimes: number[] = [];
  private perfWindow = 0;
  private perfFrames = 0;
  private autoDowngrades = 0;
  /** Disable automatic quality reduction (tests). */
  autoQuality = true;
  /** Optional sim speed multiplier (tests / debugging). */
  timeScale = 1;
  matches = 0;

  init(): void {
    if (!hasWebGL()) throw new Error('WebGL is not available in this browser. Please enable hardware acceleration.');
    const params = new URLSearchParams(location.search);
    const q = params.get('quality');
    if (q === 'low' || q === 'medium' || q === 'high') this.quality = q;
    ($('opt-quality') as HTMLSelectElement).value = this.quality;
    this.buildView();
    // attract mode: AI vs AI behind the menu
    this.game = new Game({ humanTeam: -1, seed: 7, quarterLength: 600 });
    this.game.startMatch();
    this.view.attach(this.game);
    this.bindUi();
    window.addEventListener('resize', () => this.view.resize());
    window.addEventListener('blur', () => this.autoPause());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.autoPause();
    });
    show('loading', false);
    show('menu', true);
    this.state = 'menu';
    requestAnimationFrame(this.frame);
  }

  private buildView(): void {
    const host = $('canvas-host');
    if (this.view) {
      this.view.dispose();
      host.innerHTML = '';
    }
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    this.view = new GameView(canvas, this.quality);
    this.view.cameraMode = this.cameraMode;
    if (this.game) this.view.attach(this.game);
  }

  private bindUi(): void {
    $('btn-start').addEventListener('click', () => this.startFromMenu());
    $('btn-resume').addEventListener('click', () => this.resume());
    $('btn-restart').addEventListener('click', () => this.newMatch());
    $('btn-quit').addEventListener('click', () => this.toMenu());
    $('btn-again').addEventListener('click', () => this.newMatch());
    $('btn-menu').addEventListener('click', () => this.toMenu());
    $('btn-reload').addEventListener('click', () => location.reload());
  }

  startFromMenu(): void {
    this.sfx.unlock();
    this.config.quarterLength = Number(($('opt-quarter') as HTMLSelectElement).value);
    this.config.difficulty = ($('opt-diff') as HTMLSelectElement).value as Difficulty;
    this.cameraMode = ($('opt-cam') as HTMLSelectElement).value as CameraMode;
    const q = ($('opt-quality') as HTMLSelectElement).value as Quality;
    if (q !== this.quality) {
      this.quality = q;
      this.buildView();
    }
    this.view.cameraMode = this.cameraMode;
    this.newMatch();
  }

  /** Start a brand-new match with a clean state. */
  newMatch(cfg: Partial<GameConfig> = {}): void {
    this.config = { ...this.config, ...cfg, humanTeam: cfg.humanTeam ?? 0, seed: (Date.now() & 0xffff) + this.matches };
    this.matches++;
    this.game = new Game(this.config);
    this.game.startMatch();
    this.view.attach(this.game);
    this.hud.clearToasts();
    this.replay.reset();
    this.hud.show(true);
    show('menu', false);
    show('pause', false);
    show('final', false);
    this.finalT = 0;
    this.acc = 0;
    this.state = 'playing';
    this.sfx.resume();
  }

  toMenu(): void {
    this.game = new Game({ humanTeam: -1, seed: 7, quarterLength: 600 });
    this.game.startMatch();
    this.view.attach(this.game);
    this.hud.show(false);
    this.hud.clearToasts();
    show('pause', false);
    show('final', false);
    show('menu', true);
    this.state = 'menu';
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    show('pause', true);
    this.sfx.suspend();
    this.game.input.shootHeld = false;
  }
  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    show('pause', false);
    this.last = performance.now();
    this.acc = 0;
    this.sfx.resume();
  }
  endReplay(): void {
    if (this.state !== 'replay') return;
    this.replay.stop(this.game);
    this.view.replayBasketX = null;
    show('replay-banner', false);
    this.state = 'playing';
    this.acc = 0;
  }

  autoPause(): void {
    if (this.state === 'replay') this.endReplay();
    if (this.state === 'playing') this.pause();
  }

  private showFinal(): void {
    const g = this.game;
    this.state = 'final';
    const win = g.score[0] > g.score[1] ? 0 : 1;
    $('final-title').textContent = win === g.config.humanTeam ? 'YOU WIN!' : 'YOU LOSE';
    $('final-score').textContent = `HERONS ${g.score[0]} — ${g.score[1]} COYOTES`;
    const s = g.stats;
    const pct = (m: number, a: number) => `${m}/${a}${a ? ` (${Math.round((m / a) * 100)}%)` : ''}`;
    const rows: Array<[string, string, string]> = [
      ['Field goals', pct(s[0].fgm, s[0].fga), pct(s[1].fgm, s[1].fga)],
      ['3-pointers', pct(s[0].tpm, s[0].tpa), pct(s[1].tpm, s[1].tpa)],
      ['Free throws', pct(s[0].ftm, s[0].fta), pct(s[1].ftm, s[1].fta)],
      ['Rebounds (off)', `${s[0].oreb + s[0].dreb} (${s[0].oreb})`, `${s[1].oreb + s[1].dreb} (${s[1].oreb})`],
      ['Steals', String(s[0].stl), String(s[1].stl)],
      ['Blocks', String(s[0].blk), String(s[1].blk)],
      ['Turnovers', String(s[0].tov), String(s[1].tov)],
      ['Fouls', String(s[0].pf), String(s[1].pf)],
    ];
    const top = (t: number) => {
      const ps = g.players.filter((p) => p.team === t).sort((a, b) => g.playerPts[b.id] - g.playerPts[a.id]);
      const p = ps[0];
      return `#${p.number} ${p.name} ${g.playerPts[p.id]} pts`;
    };
    rows.unshift(['Top scorer', top(0), top(1)]);
    $('final-stats').innerHTML =
      `<tr><th></th><th>${TEAM_SHORT[0]}</th><th>${TEAM_SHORT[1]}</th></tr>` +
      rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('');
    show('final', true);
  }

  private applyInput(): void {
    const s = this.input.poll();
    if (s.mute) this.sfx.setMuted(!this.sfx.muted);
    if (s.help) $('controls-hint').classList.toggle('hidden');
    if (s.debug) {
      this.showDebug = !this.showDebug;
      show('fps', this.showDebug);
    }
    if (s.camera) {
      this.cameraMode = this.cameraMode === 'broadcast' ? 'follow' : 'broadcast';
      this.view.cameraMode = this.cameraMode;
    }
    if (this.state === 'replay') {
      if (s.replay || s.pause) this.endReplay();
      return;
    }
    if (s.replay && this.state === 'playing') {
      const ph = this.game.phase;
      if ((ph === 'deadball' || ph === 'inbound') && this.replay.start(this.game)) {
        this.state = 'replay';
        this.view.replayBasketX = this.replay.basketX;
        show('replay-banner', true);
        return;
      }
    }
    if (s.pause) {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
    }
    if (this.state !== 'playing') return;
    const basis = this.view.controlBasis();
    const inp = this.game.input;
    inp.move.x = basis.right.x * s.ax + basis.fwd.x * s.ay;
    inp.move.z = basis.right.z * s.ax + basis.fwd.z * s.ay;
    inp.sprint = s.sprint;
    inp.shootHeld = s.shootHeld;
    // edges persist until consumed by a sim step
    inp.passPressed ||= s.pass;
    inp.switchPressed ||= s.switchP;
    inp.stealPressed ||= s.steal;
  }

  frame = (now: number): void => {
    try {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.applyInput();
      const g = this.game;
      const running = this.state === 'playing' || this.state === 'menu' || this.state === 'final';
      if (running) {
        this.acc += dt * this.timeScale;
        let steps = 0;
        const maxSteps = Math.max(24, Math.ceil(this.timeScale * 14));
        while (this.acc >= SIM_DT && steps < maxSteps) {
          g.step(SIM_DT);
          this.acc -= SIM_DT;
          steps++;
        }
        if (steps >= maxSteps) this.acc = 0;
        // attract mode loops forever
        if (this.state === 'menu' && g.phase === 'final') {
          g.startMatch();
        }
      }
      if (this.state === 'playing') this.replay.record(g, dt);
      if (this.state === 'replay') {
        const r = this.replay.update(g, dt);
        if (r.atScore) {
          const net = this.view.arena.nets.find((n) => Math.sign(n.x) === Math.sign(this.replay.basketX));
          if (net) net.swishT = 0.9;
        }
        if (r.done) this.endReplay();
      }
      const events = g.drainEvents();
      for (const e of events) {
        if (e.type === 'score' && e.label !== 'FT' && this.state === 'playing') {
          this.replay.markScore(e.team === 0 ? BASKET_X : -BASKET_X);
          window.setTimeout(() => {
            if (this.state === 'playing' && this.replay.available()) this.hud.toast('Press R for instant replay', '', true, 2.5);
          }, 1300);
        }
      }
      if (this.state === 'playing' || this.state === 'final') {
        this.hud.onEvents(events, g);
        this.sfx.onEvents(events, g.config.humanTeam);
      }
      this.view.onEvents(events);
      this.view.render(this.state === 'paused' ? 0 : dt, now / 1000);
      if (this.state === 'playing' || this.state === 'paused' || this.state === 'final' || this.state === 'replay') this.hud.update(g, dt);
      // anchor the shot meter beside the controlled player
      if (g.controlled >= 0 && this.state === 'playing') {
        const p = g.players[g.controlled];
        const sp = this.view.toScreen(p.pos.x, p.pos.y + 1.3, p.pos.z);
        const m = $('shotmeter');
        if (sp) {
          m.style.left = `${Math.min(window.innerWidth - 60, Math.max(10, sp.x + 40))}px`;
          m.style.top = `${Math.min(window.innerHeight - 120, Math.max(120, sp.y))}px`;
          m.style.bottom = 'auto';
        }
      }
      if (this.state === 'playing' && g.phase === 'final') {
        this.finalT += dt;
        if (this.finalT > 2.5) this.showFinal();
      }
      // adaptive quality: if a match runs below ~32 FPS for 5 s, step graphics down a level
      if (this.state === 'playing' && this.autoQuality) {
        this.perfWindow += dt;
        this.perfFrames++;
        if (this.perfWindow >= 5) {
          const fps = this.perfFrames / this.perfWindow;
          this.perfWindow = 0;
          this.perfFrames = 0;
          if (fps < 32 && this.quality !== 'low' && this.autoDowngrades < 2) {
            this.autoDowngrades++;
            this.quality = this.quality === 'high' ? 'medium' : 'low';
            ($('opt-quality') as HTMLSelectElement).value = this.quality;
            this.buildView();
            this.hud.toast(`Graphics set to ${this.quality.toUpperCase()} for smoother play`, '', true, 2.5);
          }
        }
      }
      // perf telemetry
      this.frameTimes.push(dt);
      if (this.frameTimes.length > 120) this.frameTimes.shift();
      if (this.showDebug) {
        const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
        const info = this.view.renderer.info;
        $('fps').textContent = `FPS ${(1 / avg).toFixed(0)}  draw ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(0)}k\nphase ${g.phase}  ball ${g.ball.state}`;
      }
    } catch (err) {
      showError(err);
      return;
    }
    requestAnimationFrame(this.frame);
  };

  fps(): number {
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / Math.max(1, this.frameTimes.length);
    return avg > 0 ? 1 / avg : 0;
  }
}

const app = new App();
// Exposed for automated tests and debugging.
(window as unknown as { __app: App }).__app = app;
window.addEventListener('error', (e) => showError(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => showError(e.reason));
try {
  app.init();
} catch (err) {
  show('loading', false);
  showError(err);
}
