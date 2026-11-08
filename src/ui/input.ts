/** Keyboard + gamepad input. Produces a per-frame snapshot with edge-triggered actions. */
export interface InputSnapshot {
  ax: number; // screen right
  ay: number; // screen up
  sprint: boolean;
  shootHeld: boolean;
  pass: boolean;
  switchP: boolean;
  steal: boolean;
  pause: boolean;
  camera: boolean;
  mute: boolean;
  help: boolean;
  replay: boolean;
  debug: boolean;
}

const PREVENT = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private padPrev: boolean[] = [];
  enabled = true;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (PREVENT.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });
    window.addEventListener('blur', () => this.down.clear());
  }

  private any(...codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }
  private edge(...codes: string[]): boolean {
    return codes.some((c) => this.pressed.has(c));
  }

  /** Read and clear edge-triggered presses. */
  poll(): InputSnapshot {
    let ax = (this.any('KeyD', 'ArrowRight') ? 1 : 0) - (this.any('KeyA', 'ArrowLeft') ? 1 : 0);
    let ay = (this.any('KeyW', 'ArrowUp') ? 1 : 0) - (this.any('KeyS', 'ArrowDown') ? 1 : 0);
    const s: InputSnapshot = {
      ax,
      ay,
      sprint: this.any('ShiftLeft', 'ShiftRight'),
      shootHeld: this.any('Space', 'KeyJ'),
      pass: this.edge('KeyE', 'KeyK'),
      switchP: this.edge('Tab', 'KeyQ'),
      steal: this.edge('KeyF', 'KeyL'),
      pause: this.edge('Escape', 'KeyP'),
      camera: this.edge('KeyC'),
      mute: this.edge('KeyM'),
      help: this.edge('KeyH'),
      replay: this.edge('KeyR'),
      debug: this.edge('Backquote', 'F3'),
    };
    // gamepad (standard mapping)
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = Array.from(pads).find((p) => p && p.connected);
    if (pad) {
      const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
      const gx = dz(pad.axes[0] ?? 0);
      const gy = dz(pad.axes[1] ?? 0);
      if (gx || gy) {
        ax = gx;
        ay = -gy;
        s.ax = ax;
        s.ay = ay;
      }
      const btn = (i: number) => !!pad.buttons[i]?.pressed;
      const edge = (i: number) => btn(i) && !this.padPrev[i];
      s.shootHeld ||= btn(0);
      s.pass ||= edge(1);
      s.steal ||= edge(2);
      s.switchP ||= edge(3) || edge(4);
      s.sprint ||= btn(7) || btn(5);
      s.pause ||= edge(9);
      s.camera ||= edge(8);
      this.padPrev = pad.buttons.map((b) => b.pressed);
    }
    this.pressed.clear();
    return s;
  }
}
