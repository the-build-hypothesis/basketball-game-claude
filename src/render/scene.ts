import * as THREE from 'three';
import {
  BACKBOARD_BOTTOM,
  BACKBOARD_FACE_X,
  BACKBOARD_H,
  BACKBOARD_T,
  BACKBOARD_W,
  BASKET_X,
  HALF_L,
  HALF_W,
  RIM_H,
  RIM_R,
  RIM_TUBE,
} from '../sim/constants';
import { Rng } from '../sim/math';
import { FLOOR_L, FLOOR_W, makeBackboardTexture, makeBannerTexture, makeCourtTexture, TEAM_COLORS } from './textures';

export type Quality = 'low' | 'medium' | 'high';

export interface NetView {
  lines: THREE.LineSegments;
  base: Float32Array;
  swishT: number;
  rimShake: number;
  x: number;
}

export interface Arena {
  scene: THREE.Scene;
  nets: NetView[];
  crowd: THREE.InstancedMesh | null;
  crowdBase: Float32Array;
  crowdExcite: number;
  sun: THREE.DirectionalLight;
  update(dt: number, time: number): void;
  dispose(): void;
}

const NET_DEPTH = 0.44;
const NET_SEG = 14;
const NET_LEVELS = 5;

function buildNet(x: number): NetView {
  // diamond mesh: strands zig-zag between neighbouring columns at each level
  const pts: number[] = [];
  const ring = (lvl: number, i: number): [number, number, number] => {
    const t = lvl / NET_LEVELS;
    const r = RIM_R * (1 - t) + 0.13 * t;
    const a = ((i + (lvl % 2) * 0.5) / NET_SEG) * Math.PI * 2;
    return [Math.cos(a) * r, -t * NET_DEPTH, Math.sin(a) * r];
  };
  for (let l = 0; l < NET_LEVELS; l++) {
    for (let i = 0; i < NET_SEG; i++) {
      const a = ring(l, i);
      const b = ring(l + 1, i);
      const c = ring(l + 1, (i + (l % 2 === 0 ? -1 : 1) + NET_SEG) % NET_SEG);
      pts.push(...a, ...b, ...a, ...c);
    }
  }
  const geo = new THREE.BufferGeometry();
  const arr = new Float32Array(pts);
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xf4f4f4 });
  const lines = new THREE.LineSegments(geo, mat);
  lines.position.set(x, RIM_H - RIM_TUBE, 0);
  lines.frustumCulled = false;
  return { lines, base: arr.slice(), swishT: 0, rimShake: 0, x };
}

export function buildArena(quality: Quality, maxAniso: number): Arena {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0e16);
  scene.fog = new THREE.Fog(0x0b0e16, 45, 95);

  // lights
  const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x3a2a1a, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.1);
  sun.position.set(-6, 26, 10);
  sun.target.position.set(0, 0, 0);
  scene.add(sun.target);
  if (quality !== 'low') {
    sun.castShadow = true;
    const sz = quality === 'high' ? 4096 : 2048;
    sun.shadow.mapSize.set(sz, sz);
    const cam = sun.shadow.camera;
    cam.left = -18;
    cam.right = 18;
    cam.top = 12;
    cam.bottom = -12;
    cam.near = 5;
    cam.far = 60;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
  }
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xc8d8ff, 0.55);
  fill.position.set(10, 14, -12);
  scene.add(fill);

  // court
  const pxPerM = quality === 'low' ? 64 : quality === 'medium' ? 100 : 128;
  const courtTex = makeCourtTexture(pxPerM, maxAniso);
  const courtMat = new THREE.MeshStandardMaterial({ map: courtTex, roughness: 0.42, metalness: 0.0 });
  const court = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_L, FLOOR_W), courtMat);
  court.rotation.x = -Math.PI / 2;
  court.receiveShadow = true;
  scene.add(court);

  // surrounding arena floor
  const outer = new THREE.Mesh(
    new THREE.PlaneGeometry(140, 100),
    new THREE.MeshStandardMaterial({ color: 0x1b1f2a, roughness: 0.9 }),
  );
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.01;
  outer.receiveShadow = true;
  scene.add(outer);

  // hoops
  const nets: NetView[] = [];
  const bbTex = makeBackboardTexture();
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xcfe6ff,
    transparent: true,
    opacity: 0.28,
    roughness: 0.05,
    metalness: 0.1,
    depthWrite: false,
  });
  const markMat = new THREE.MeshBasicMaterial({ map: bbTex, transparent: true, depthWrite: false });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xe0471b, roughness: 0.35, metalness: 0.6 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x5f6772, roughness: 0.5, metalness: 0.5 });
  const pad = new THREE.MeshStandardMaterial({ color: 0x1d2c55, roughness: 0.8 });
  for (const s of [1, -1]) {
    const g = new THREE.Group();
    // glass
    const glass = new THREE.Mesh(new THREE.BoxGeometry(BACKBOARD_T, BACKBOARD_H, BACKBOARD_W), glassMat);
    glass.position.set(s * (BACKBOARD_FACE_X + BACKBOARD_T / 2), BACKBOARD_BOTTOM + BACKBOARD_H / 2, 0);
    g.add(glass);
    const marks = new THREE.Mesh(new THREE.PlaneGeometry(BACKBOARD_W, BACKBOARD_H), markMat);
    marks.position.set(s * (BACKBOARD_FACE_X - 0.002), BACKBOARD_BOTTOM + BACKBOARD_H / 2, 0);
    marks.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    g.add(marks);
    // bottom padding of the board
    const bpad = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, BACKBOARD_W), pad);
    bpad.position.set(s * (BACKBOARD_FACE_X + 0.03), BACKBOARD_BOTTOM - 0.03, 0);
    g.add(bpad);
    // rim
    const rim = new THREE.Mesh(new THREE.TorusGeometry(RIM_R + RIM_TUBE, RIM_TUBE * 1.6, 8, 40), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(s * BASKET_X, RIM_H, 0);
    rim.castShadow = true;
    g.add(rim);
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.14), rimMat);
    bracket.position.set(s * (BACKBOARD_FACE_X - 0.08), RIM_H - 0.02, 0);
    g.add(bracket);
    // support arm + pole + base
    const armLen = 1.25;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(armLen, 0.14, 0.14), steel);
    arm.position.set(s * (BACKBOARD_FACE_X + BACKBOARD_T + armLen / 2), RIM_H + 0.35, 0);
    arm.castShadow = true;
    g.add(arm);
    const poleX = s * (HALF_L + 1.5);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.22, RIM_H + 0.5, 0.22), steel);
    pole.position.set(poleX, (RIM_H + 0.5) / 2, 0);
    pole.castShadow = true;
    g.add(pole);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.8), pad);
    base.position.set(s * (HALF_L + 1.85), 0.5, 0);
    base.castShadow = true;
    base.receiveShadow = true;
    g.add(base);
    const polePad = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.9, 0.4), pad);
    polePad.position.set(poleX, 1.95, 0);
    g.add(polePad);
    scene.add(g);
    const net = buildNet(s * BASKET_X);
    scene.add(net.lines);
    nets.push(net);
  }

  // benches + scorer's table on the far sideline
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 0.7 });
  for (const s of [-1, 1]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(7, 0.5, 0.7), benchMat);
    bench.position.set(s * 6.5, 0.25, -HALF_W - 2.6);
    bench.castShadow = true;
    scene.add(bench);
    const chairBack = new THREE.Mesh(new THREE.BoxGeometry(7, 0.6, 0.12), new THREE.MeshStandardMaterial({ color: TEAM_COLORS[s < 0 ? 0 : 1].primary }));
    chairBack.position.set(s * 6.5, 0.75, -HALF_W - 2.95);
    scene.add(chairBack);
  }
  const table = new THREE.Mesh(new THREE.BoxGeometry(5, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: 0x11151f }));
  table.position.set(0, 0.4, -HALF_W - 2.4);
  table.castShadow = true;
  scene.add(table);
  const tableFront = new THREE.Mesh(
    new THREE.PlaneGeometry(5, 0.7),
    new THREE.MeshBasicMaterial({ map: makeBannerTexture('FASTBREAK LEAGUE', '#11151f', '#f2c230') }),
  );
  tableFront.position.set(0, 0.42, -HALF_W - 1.99);
  scene.add(tableFront);

  // stands: tiers + instanced crowd
  let crowd: THREE.InstancedMesh | null = null;
  let crowdBase = new Float32Array(0);
  const standMat = new THREE.MeshStandardMaterial({ color: 0x232838, roughness: 0.95 });
  const rows = quality === 'low' ? 5 : 9;
  const sides: Array<{ cx: number; cz: number; len: number; rotY: number }> = [
    { cx: 0, cz: -(HALF_W + 4.6), len: 40, rotY: 0 },
    { cx: 0, cz: HALF_W + 4.6, len: 40, rotY: Math.PI },
    { cx: -(HALF_L + 5.2), cz: 0, len: 22, rotY: Math.PI / 2 },
    { cx: HALF_L + 5.2, cz: 0, len: 22, rotY: -Math.PI / 2 },
  ];
  const seats: Array<[number, number, number, number]> = [];
  for (const sd of sides) {
    const g = new THREE.Group();
    g.position.set(sd.cx, 0, sd.cz);
    g.rotation.y = sd.rotY;
    for (let r = 0; r < rows; r++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(sd.len, 0.5 * (r + 1), 0.9), standMat);
      step.position.set(0, 0.25 * (r + 1), -r * 0.9);
      step.receiveShadow = quality === 'high';
      g.add(step);
      for (let x = -sd.len / 2 + 0.4; x < sd.len / 2 - 0.3; x += 0.62) {
        const v = new THREE.Vector3(x, 0.5 * (r + 1), -r * 0.9 - 0.1);
        v.applyEuler(new THREE.Euler(0, sd.rotY, 0));
        seats.push([v.x + sd.cx, v.y, v.z + sd.cz, sd.rotY]);
      }
    }
    scene.add(g);
  }
  if (quality !== 'low' || true) {
    const geo = new THREE.CapsuleGeometry(0.2, 0.42, 3, 8);
    geo.translate(0, 0.41, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    crowd = new THREE.InstancedMesh(geo, mat, seats.length);
    const rng = new Rng(99);
    const m = new THREE.Matrix4();
    const palette = [0x1f4fbf, 0xb3202a, 0xf2c230, 0xeeeeee, 0x333333, 0x5a7d2a, 0x8a5a9c, 0x1f4fbf, 0xb3202a, 0xd98c3a];
    crowdBase = new Float32Array(seats.length * 4);
    const col = new THREE.Color();
    seats.forEach((s, i) => {
      const empty = rng.chance(0.08);
      const sc = empty ? 0.001 : rng.range(0.9, 1.1);
      m.makeScale(sc, sc, sc);
      m.setPosition(s[0], s[1], s[2]);
      crowd!.setMatrixAt(i, m);
      col.setHex(palette[Math.floor(rng.range(0, palette.length))]);
      crowd!.setColorAt(i, col);
      crowdBase[i * 4] = s[0];
      crowdBase[i * 4 + 1] = s[1];
      crowdBase[i * 4 + 2] = s[2];
      crowdBase[i * 4 + 3] = empty ? 0 : sc + rng.range(0, 0.001) + Math.floor(rng.range(0, 1000)) * 1000;
    });
    crowd.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(crowd);
  }

  // hanging banners
  for (const [x, z, text, bg, fg] of [
    [-8, -(HALF_W + 9), 'HERONS', TEAM_COLORS[0].primary, '#ffffff'],
    [8, -(HALF_W + 9), 'COYOTES', TEAM_COLORS[1].primary, '#ffd34d'],
  ] as Array<[number, number, string, string, string]>) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(8, 1), new THREE.MeshBasicMaterial({ map: makeBannerTexture(text, bg, fg) }));
    b.position.set(x, 8.5, z);
    scene.add(b);
  }

  const arena: Arena = {
    scene,
    nets,
    crowd,
    crowdBase,
    crowdExcite: 0,
    sun,
    update(dt: number, time: number) {
      for (const n of nets) updateNet(n, dt);
      if (crowd && crowdBase.length) {
        this.crowdExcite = Math.max(0, this.crowdExcite - dt * 0.35);
        const ex = this.crowdExcite;
        const m = new THREE.Matrix4();
        const count = crowd.count;
        for (let i = 0; i < count; i++) {
          const meta = crowdBase[i * 4 + 3];
          const sc = meta % 1000;
          if (sc < 0.01) continue;
          const ph = Math.floor(meta / 1000) * 0.0063;
          const bob = Math.max(0, Math.sin(time * (2 + ex * 6) + ph * 40)) * (0.02 + ex * 0.35);
          m.makeScale(sc, sc, sc);
          m.setPosition(crowdBase[i * 4], crowdBase[i * 4 + 1] + bob, crowdBase[i * 4 + 2]);
          crowd.setMatrixAt(i, m);
        }
        crowd.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (mat) {
          for (const mm of Array.isArray(mat) ? mat : [mat]) {
            const anyM = mm as THREE.MeshStandardMaterial;
            anyM.map?.dispose();
            mm.dispose();
          }
        }
      });
    },
  };
  return arena;
}

function updateNet(n: NetView, dt: number): void {
  const pos = n.lines.geometry.getAttribute('position') as THREE.BufferAttribute;
  const arr = pos.array as Float32Array;
  n.swishT = Math.max(0, n.swishT - dt);
  n.rimShake = Math.max(0, n.rimShake - dt * 3);
  const sw = n.swishT;
  const k = sw > 0 ? Math.sin((1 - sw / 0.7) * Math.PI) : 0;
  const shake = n.rimShake;
  const tt = performance.now() * 0.03;
  for (let i = 0; i < arr.length; i += 3) {
    const bx = n.base[i];
    const by = n.base[i + 1];
    const bz = n.base[i + 2];
    const depth = -by / NET_DEPTH; // 0 at rim, 1 at bottom
    // swish: net stretches downward and pinches
    const pinch = 1 - 0.35 * k * depth;
    arr[i] = bx * pinch + Math.sin(tt + by * 20) * 0.02 * shake * depth;
    arr[i + 1] = by * (1 + 0.35 * k);
    arr[i + 2] = bz * pinch + Math.cos(tt + by * 17) * 0.02 * shake * depth;
  }
  pos.needsUpdate = true;
}
