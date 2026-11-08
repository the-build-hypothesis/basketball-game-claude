import { TEAM_SHORT } from '../sim/constants';
import type { Game } from '../sim/game';
import type { GameEvent } from '../sim/types';

const $ = (id: string) => document.getElementById(id)!;

function fmtClock(t: number): string {
  if (t < 10) return t.toFixed(1);
  const s = Math.ceil(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const ROLE = ['Point Guard', 'Shooting Guard', 'Small Forward', 'Power Forward', 'Center'];

export class Hud {
  private toasts = $('toasts');
  private meterHold = 0;
  private lastMeter = -1;

  show(v: boolean): void {
    $('hud').classList.toggle('hidden', !v);
  }

  toast(text: string, cls = '', small = false, dur = 1.6): void {
    const el = document.createElement('div');
    el.className = `toast ${cls} ${small ? 'small' : ''}`;
    el.textContent = text;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 3) this.toasts.firstChild?.remove();
    window.setTimeout(() => {
      el.style.opacity = '0';
      window.setTimeout(() => el.remove(), 450);
    }, dur * 1000);
  }

  clearToasts(): void {
    this.toasts.innerHTML = '';
  }

  onEvents(events: GameEvent[], g: Game): void {
    const human = g.config.humanTeam;
    const name = (t: number) => TEAM_SHORT[t];
    for (const e of events) {
      switch (e.type) {
        case 'score': {
          const mine = e.team === human;
          const shooter = e.shooter >= 0 ? g.players[e.shooter] : null;
          this.toast(
            `${e.points === 3 ? 'THREE! ' : ''}+${e.points} ${name(e.team)}`,
            mine ? 'good' : 'bad',
          );
          if (shooter) this.toast(`#${shooter.number} ${shooter.name}${e.label ? ' · ' + e.label + ' release' : ''}`, '', true, 1.4);
          break;
        }
        case 'miss':
          this.toast(e.airball ? 'AIRBALL' : 'MISS', e.team === human ? 'bad' : 'good', true, 1.0);
          break;
        case 'block':
          this.toast(`BLOCKED by #${g.players[e.player].number}!`, e.team === human ? 'good' : 'bad');
          break;
        case 'steal':
          this.toast(`STEAL — ${name(e.team)}`, e.team === human ? 'good' : 'bad');
          break;
        case 'interception':
          this.toast(`INTERCEPTED — ${name(e.team)}`, e.team === human ? 'good' : 'bad');
          break;
        case 'turnover':
          this.toast(`TURNOVER: ${e.reason}`, e.team === human ? 'bad' : 'good', true, 2);
          break;
        case 'rebound':
          this.toast(`${e.offensive ? 'Offensive' : 'Defensive'} rebound · ${name(e.team)}`, '', true, 1.1);
          break;
        case 'shotRelease':
          if (e.team === human) {
            this.lastMeter = e.meter;
            this.meterHold = 0.9;
            const l = $('meter-label');
            l.textContent = e.label;
            l.style.color = e.label === 'PERFECT' ? '#7dff9a' : e.label === 'GOOD' ? '#d8ff7d' : '#ff8a80';
          }
          break;
        case 'quarterEnd':
          this.toast(`END OF ${g.quarter > g.config.quarters ? 'OT' : 'Q' + e.quarter}`, 'gold', false, 3);
          break;
        case 'quarterStart':
          if (e.quarter > 1) this.toast(e.quarter > g.config.quarters ? 'OVERTIME' : `QUARTER ${e.quarter}`, 'gold', false, 2);
          break;
        case 'tipoff':
          this.toast(`${name(e.winner)} win the tip`, 'gold', true, 1.6);
          break;
        case 'rejected':
          this.toast(`No basket (${e.reason})`, 'bad', true, 1.5);
          break;
      }
    }
  }

  update(g: Game, dt: number): void {
    $('score0').textContent = String(g.score[0]);
    $('score1').textContent = String(g.score[1]);
    const q = g.quarter > g.config.quarters ? `OT${g.quarter - g.config.quarters > 1 ? g.quarter - g.config.quarters : ''}` : `Q${g.quarter}`;
    $('quarter').textContent = q;
    $('clock').textContent = fmtClock(Math.max(0, g.gameClock));
    const sc = $('shotclock');
    const showShot = g.shotClock <= g.gameClock + 0.01 && g.phase !== 'final';
    sc.textContent = showShot ? (g.shotClock < 5 ? g.shotClock.toFixed(1) : String(Math.ceil(g.shotClock))) : '—';
    sc.classList.toggle('low', showShot && g.shotClock < 5);
    $('poss0').classList.toggle('on', g.possession === 0);
    $('poss1').classList.toggle('on', g.possession === 1);

    let pl = '';
    const human = g.config.humanTeam;
    switch (g.phase) {
      case 'tipoff':
        pl = 'TIP-OFF — press Space to jump at the top of the toss';
        break;
      case 'inbound':
        pl = g.possession === human ? 'INBOUND — press E to pass in' : `${TEAM_SHORT[g.possession as 0 | 1]} INBOUNDING`;
        break;
      case 'deadball':
        pl = `${TEAM_SHORT[g.possession as 0 | 1]} BALL`;
        break;
      case 'quarterEnd':
        pl = 'END OF PERIOD';
        break;
      case 'final':
        pl = 'FINAL';
        break;
      default:
        if (g.possession < 0) pl = 'LOOSE BALL';
        else pl = g.possession === human ? 'OFFENSE — HERONS BALL' : 'DEFENSE — COYOTES BALL';
        if (g.ball.state === 'loose') pl = 'LOOSE BALL';
    }
    $('possession-label').textContent = pl;

    // shot meter
    const m = g.shotMeter();
    const meterEl = $('shotmeter');
    if (m >= 0 || this.meterHold > 0) {
      meterEl.classList.remove('hidden');
      const v = m >= 0 ? m : this.lastMeter;
      $('meter-fill').style.height = `${Math.min(100, (v / 1.12) * 100)}%`;
      if (m >= 0) {
        const p = g.players[g.controlled];
        if (p.action?.kind === 'shoot' && !p.action.released) $('meter-label').textContent = '';
      }
      this.meterHold -= dt;
    } else meterEl.classList.add('hidden');

    // controlled player
    const p = g.controlled >= 0 ? g.players[g.controlled] : null;
    if (p) {
      $('pi-name').textContent = `#${p.number} ${p.name}`;
      ($('pi-stamina') as HTMLElement).style.width = `${Math.round(p.stamina * 100)}%`;
      const hasBall = g.ball.state === 'held' && g.ball.owner === p.id;
      $('pi-role').textContent = `${ROLE[p.role]}${hasBall ? ' · ball handler' : ''}`;
    }
  }
}
