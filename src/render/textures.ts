import * as THREE from 'three';
import {
  BASKET_FROM_BASELINE,
  CENTER_CIRCLE_R,
  COURT_L,
  COURT_W,
  FT_CIRCLE_R,
  FT_LINE_FROM_BASELINE,
  HALF_L,
  HALF_W,
  KEY_W,
  RESTRICTED_R,
  THREE_CORNER_DX,
  THREE_CORNER_Z,
  THREE_R,
  BACKBOARD_FROM_BASELINE,
} from '../sim/constants';
import { Rng } from '../sim/math';

export const APRON = 2.2; // meters of floor beyond each line
export const FLOOR_L = COURT_L + APRON * 2;
export const FLOOR_W = COURT_W + APRON * 2;

export const TEAM_COLORS = [
  { primary: '#1f4fbf', secondary: '#ffffff', trim: '#f2c230', paint: 'rgba(31,79,191,0.55)' },
  { primary: '#b3202a', secondary: '#ffd34d', trim: '#1b1b1b', paint: 'rgba(179,32,42,0.55)' },
];

/** Court floor texture. World x maps to canvas x; world z maps to canvas y. */
export function makeCourtTexture(pxPerM: number, maxAniso: number): THREE.CanvasTexture {
  const W = Math.round(FLOOR_L * pxPerM);
  const H = Math.round(FLOOR_W * pxPerM);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const rng = new Rng(7);
  const X = (x: number) => (x + FLOOR_L / 2) * pxPerM;
  const Y = (z: number) => (z + FLOOR_W / 2) * pxPerM;
  const M = (m: number) => m * pxPerM;

  // apron: darker stain
  g.fillStyle = '#6b3f22';
  g.fillRect(0, 0, W, H);
  // maple planks along x
  const plankW = 0.0725;
  for (let z = -FLOOR_W / 2; z < FLOOR_W / 2; z += plankW) {
    let x = -FLOOR_L / 2 - rng.range(0, 2);
    while (x < FLOOR_L / 2) {
      const len = rng.range(1.2, 3.2);
      const inCourt = Math.abs(z) < HALF_W && true;
      const l = rng.range(0, 1);
      const base = inCourt ? [214, 165, 112] : [120, 70, 38];
      const k = 0.9 + l * 0.16;
      g.fillStyle = `rgb(${(base[0] * k) | 0},${(base[1] * k) | 0},${(base[2] * k) | 0})`;
      g.fillRect(X(x), Y(z), M(len), M(plankW) + 1);
      g.fillStyle = 'rgba(70,40,15,0.25)';
      g.fillRect(X(x), Y(z), 1, M(plankW));
      x += len;
    }
    g.fillStyle = 'rgba(80,45,20,0.18)';
    g.fillRect(0, Y(z), W, 1);
  }
  // court area clean lighter overlay inside lines
  // grain streaks
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(110,60,20,${rng.range(0.02, 0.07)})`;
    g.fillRect(rng.range(0, W), rng.range(0, H), rng.range(20, 160), 1);
  }

  // painted keys
  for (const s of [-1, 1]) {
    const team = s > 0 ? 1 : 0; // key colored by the defending team's color
    g.fillStyle = TEAM_COLORS[team].paint;
    const x0 = s > 0 ? HALF_L - FT_LINE_FROM_BASELINE : -HALF_L;
    g.fillRect(X(x0), Y(-KEY_W / 2), M(FT_LINE_FROM_BASELINE), M(KEY_W));
  }
  // center logo
  g.save();
  g.fillStyle = 'rgba(20,30,60,0.85)';
  g.beginPath();
  g.arc(X(0), Y(0), M(CENTER_CIRCLE_R), 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f2c230';
  g.font = `bold ${M(0.62)}px Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('FB5', X(0), Y(-0.15));
  g.font = `bold ${M(0.2)}px Arial, sans-serif`;
  g.fillStyle = '#ffffff';
  g.fillText('FASTBREAK LEAGUE', X(0), Y(0.55));
  g.restore();

  // baseline apron text
  g.save();
  g.font = `bold ${M(0.9)}px Arial Black, Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const s of [-1, 1]) {
    g.save();
    g.translate(X(s * (HALF_L + APRON / 2)), Y(0));
    g.rotate(s > 0 ? -Math.PI / 2 : Math.PI / 2);
    g.fillStyle = s < 0 ? TEAM_COLORS[0].primary : TEAM_COLORS[1].primary;
    g.fillText(s < 0 ? 'HERONS' : 'COYOTES', 0, 0);
    g.restore();
  }
  g.restore();

  // lines
  g.strokeStyle = '#ffffff';
  g.fillStyle = '#ffffff';
  g.lineWidth = Math.max(2, M(0.05));
  const line = (x0: number, z0: number, x1: number, z1: number) => {
    g.beginPath();
    g.moveTo(X(x0), Y(z0));
    g.lineTo(X(x1), Y(z1));
    g.stroke();
  };
  const arc = (cx: number, cz: number, r: number, a0: number, a1: number, dashed = false) => {
    g.save();
    if (dashed) g.setLineDash([M(0.3), M(0.3)]);
    g.beginPath();
    g.arc(X(cx), Y(cz), M(r), a0, a1);
    g.stroke();
    g.restore();
  };
  // boundary
  g.strokeRect(X(-HALF_L), Y(-HALF_W), M(COURT_L), M(COURT_W));
  // half court + circles
  line(0, -HALF_W, 0, HALF_W);
  arc(0, 0, CENTER_CIRCLE_R, 0, Math.PI * 2);
  arc(0, 0, 0.61, 0, Math.PI * 2);
  for (const s of [-1, 1]) {
    const bx = s * (HALF_L - BASKET_FROM_BASELINE);
    const base = s * HALF_L;
    const ftx = s * (HALF_L - FT_LINE_FROM_BASELINE);
    // key
    line(base, -KEY_W / 2, ftx, -KEY_W / 2);
    line(base, KEY_W / 2, ftx, KEY_W / 2);
    line(ftx, -KEY_W / 2, ftx, KEY_W / 2);
    // free throw circle: solid half toward mid court, dashed half inside the key
    poly((t) => [ftx - s * FT_CIRCLE_R * Math.cos(t), FT_CIRCLE_R * Math.sin(t)], -Math.PI / 2, Math.PI / 2);
    g.save();
    g.setLineDash([M(0.3), M(0.3)]);
    poly((t) => [ftx + s * FT_CIRCLE_R * Math.cos(t), FT_CIRCLE_R * Math.sin(t)], -Math.PI / 2, Math.PI / 2);
    g.restore();
    // three point line
    const cornerEnd = bx - s * THREE_CORNER_DX;
    line(base, -THREE_CORNER_Z, cornerEnd, -THREE_CORNER_Z);
    line(base, THREE_CORNER_Z, cornerEnd, THREE_CORNER_Z);
    // arc around the rim toward mid court, from one corner line to the other
    const tE = Math.atan2(THREE_CORNER_Z, THREE_CORNER_DX);
    poly((t) => [bx - s * THREE_R * Math.cos(t), THREE_R * Math.sin(t)], -tE, tE);
    // restricted area
    poly((t) => [bx - s * RESTRICTED_R * Math.cos(t), RESTRICTED_R * Math.sin(t)], -Math.PI / 2, Math.PI / 2);
    // lane hash marks
    for (const d of [2.13, 2.44, 3.35, 4.27]) {
      const hx = s * (HALF_L - d);
      line(hx, -KEY_W / 2, hx, -KEY_W / 2 - 0.15);
      line(hx, KEY_W / 2, hx, KEY_W / 2 + 0.15);
    }
    // sideline hash (coaching box / 28ft)
    const hx = s * (HALF_L - 8.53);
    line(hx, -HALF_W, hx, -HALF_W + 0.9);
    line(hx, HALF_W, hx, HALF_W - 0.9);
    void BACKBOARD_FROM_BASELINE;
  }
  function poly(f: (t: number) => [number, number], t0: number, t1: number) {
    g.beginPath();
    for (let i = 0; i <= 96; i++) {
      const [x, z] = f(t0 + ((t1 - t0) * i) / 96);
      if (i === 0) g.moveTo(X(x), Y(z));
      else g.lineTo(X(x), Y(z));
    }
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export function makeBallTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d4621c';
  g.fillRect(0, 0, W, H);
  const rng = new Rng(3);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = rng.chance(0.5) ? 'rgba(0,0,0,0.10)' : 'rgba(255,190,140,0.10)';
    g.fillRect(rng.range(0, W), rng.range(0, H), 2, 2);
  }
  g.strokeStyle = '#1a0d05';
  g.lineWidth = 5;
  // equator + two meridians
  g.beginPath();
  g.moveTo(0, H / 2);
  g.lineTo(W, H / 2);
  for (const u of [0, 0.5]) {
    g.moveTo(u * W, 0);
    g.lineTo(u * W, H);
  }
  g.stroke();
  // curved panel seams
  g.beginPath();
  for (const off of [0.25, 0.75]) {
    for (let i = 0; i <= 64; i++) {
      const v = i / 64;
      const u = off + 0.14 * Math.sin(v * Math.PI) * (off < 0.5 ? 1 : -1) * 0;
      const x = (off + Math.cos((v - 0.5) * Math.PI) * 0.12 * (off < 0.5 ? 1 : -1)) * W;
      if (i === 0) g.moveTo(x, v * H);
      else g.lineTo(x, v * H);
      void u;
    }
  }
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeJerseyTexture(team: number, num: number, name: string): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const col = TEAM_COLORS[team];
  g.fillStyle = col.primary;
  g.fillRect(0, 0, W, H);
  // side panels / trim
  g.fillStyle = col.trim;
  g.fillRect(0, 0, W, 10);
  g.fillRect(W * 0.49, 0, 8, H);
  g.fillRect(W * 0.99, 0, 8, H);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // front (u=0.25 maps to +x / forward) and back (u=0.75)
  for (const [u, big] of [
    [0.25, false],
    [0.75, true],
  ] as Array<[number, boolean]>) {
    g.font = `bold ${big ? 120 : 92}px Arial Black, Arial, sans-serif`;
    g.lineWidth = 8;
    g.strokeStyle = col.trim;
    g.strokeText(String(num), u * W, H * 0.58);
    g.fillStyle = col.secondary;
    g.fillText(String(num), u * W, H * 0.58);
    if (big) {
      g.font = 'bold 30px Arial, sans-serif';
      g.fillText(name.toUpperCase(), u * W, H * 0.2);
    } else {
      g.font = 'bold 28px Arial, sans-serif';
      g.fillText(team === 0 ? 'HERONS' : 'COYOTES', u * W, H * 0.2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeBackboardTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 300;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, W, H);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 12;
  g.strokeRect(6, 6, W - 12, H - 12);
  // shooter's square: 24" x 18" above the rim
  const sw = (0.61 / 1.83) * W;
  const sh = (0.45 / 1.07) * H;
  g.lineWidth = 9;
  g.strokeRect(W / 2 - sw / 2, H - (0.15 / 1.07) * H - sh, sw, sh);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeBannerTexture(text: string, bg: string, fg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 128);
  g.fillStyle = fg;
  g.font = 'bold 76px Arial Black, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 512, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
