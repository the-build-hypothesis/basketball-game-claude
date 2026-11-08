import type { GameEvent } from '../sim/types';

/** Tiny procedural sound engine (WebAudio, no audio files). */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private crowd: GainNode | null = null;
  muted = false;

  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // ambient crowd murmur
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 500;
      this.crowd = this.ctx.createGain();
      this.crowd.gain.value = 0.05;
      src.connect(lp).connect(this.crowd).connect(this.master);
      src.start();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }

  suspend(): void {
    void this.ctx?.suspend();
  }
  resume(): void {
    void this.ctx?.resume();
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 1): void {
    const c = this.ctx;
    if (!c || !this.master) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, type: BiquadFilterType, freq: number, q = 1): void {
    const c = this.ctx;
    if (!c || !this.master || !this.noiseBuf) return;
    const t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random());
    s.stop(t + dur + 0.02);
  }

  cheer(level: number): void {
    const c = this.ctx;
    if (!c || !this.crowd) return;
    const t = c.currentTime;
    this.crowd.gain.cancelScheduledValues(t);
    this.crowd.gain.setValueAtTime(0.05 + 0.25 * level, t);
    this.crowd.gain.exponentialRampToValueAtTime(0.05, t + 2.5);
    this.noise(1.5 * level, 0.2 * level, 'bandpass', 900, 0.6);
  }

  whistle(): void {
    this.tone(2900, 0.35, 'sine', 0.12, 1.02);
  }

  onEvents(events: GameEvent[], humanTeam: number): void {
    if (!this.ctx) return;
    for (const e of events) {
      switch (e.type) {
        case 'dribble':
          this.tone(85, 0.09, 'sine', 0.35, 0.6);
          this.noise(0.04, 0.12, 'lowpass', 600);
          break;
        case 'bounce':
          this.tone(80, 0.1, 'sine', Math.min(0.45, e.strength * 0.06), 0.6);
          break;
        case 'rim':
          this.tone(620, 0.25, 'triangle', Math.min(0.25, e.strength * 0.05), 0.97);
          this.tone(930, 0.18, 'square', Math.min(0.06, e.strength * 0.015), 0.98);
          break;
        case 'board':
          this.tone(160, 0.12, 'triangle', Math.min(0.3, e.strength * 0.05), 0.8);
          this.noise(0.08, 0.1, 'bandpass', 1200);
          break;
        case 'swish':
          this.noise(0.35, 0.22, 'highpass', 3500);
          break;
        case 'score':
          if (e.team === humanTeam) this.cheer(e.points === 3 ? 1 : 0.75);
          else this.cheer(0.3);
          break;
        case 'buzzer':
          this.tone(210, 1.0, 'sawtooth', 0.12, 1.0);
          this.tone(213, 1.0, 'square', 0.05, 1.0);
          break;
        case 'turnover':
          this.whistle();
          break;
        case 'block':
        case 'steal':
        case 'interception':
          this.cheer(0.5);
          break;
        case 'pass':
          this.noise(0.05, 0.08, 'bandpass', 2000);
          break;
        case 'catch':
          this.tone(140, 0.06, 'sine', 0.2, 0.7);
          break;
      }
    }
  }
}
