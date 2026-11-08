import * as THREE from 'three';
import { BALL_R, HALF_L } from '../sim/constants';
import type { Game } from '../sim/game';
import type { GameEvent } from '../sim/types';
import { buildArena, type Arena, type Quality } from './scene';
import { PlayerView } from './players';
import { makeBallTexture } from './textures';

export type CameraMode = 'broadcast' | 'follow';

export class GameView {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  arena: Arena;
  players: PlayerView[] = [];
  ball: THREE.Mesh;
  ballShadow: THREE.Mesh;
  ctrlArrow: THREE.Mesh;
  passMarker: THREE.Mesh;
  cameraMode: CameraMode = 'broadcast';
  private camPos = new THREE.Vector3(0, 11, 18);
  private camLook = new THREE.Vector3(0, 0.5, 0);
  private game: Game | null = null;
  private ballQuat = new THREE.Quaternion();
  quality: Quality;

  constructor(
    private canvas: HTMLCanvasElement,
    quality: Quality,
  ) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : quality === 'medium' ? 1.25 : 1));
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);
    this.arena = buildArena(quality, this.renderer.capabilities.getMaxAnisotropy());

    const ballGeo = new THREE.SphereGeometry(BALL_R, 32, 20);
    const ballMat = new THREE.MeshStandardMaterial({ map: makeBallTexture(), roughness: 0.6 });
    this.ball = new THREE.Mesh(ballGeo, ballMat);
    this.ball.castShadow = true;
    this.arena.scene.add(this.ball);

    // soft blob shadow directly under the ball: a strong depth cue for height
    const sc = document.createElement('canvas');
    sc.width = sc.height = 64;
    const g = sc.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0,0,0,0.6)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const shGeo = new THREE.PlaneGeometry(0.5, 0.5);
    shGeo.rotateX(-Math.PI / 2);
    this.ballShadow = new THREE.Mesh(shGeo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
    this.ballShadow.renderOrder = 2;
    this.arena.scene.add(this.ballShadow);

    const arrowGeo = new THREE.ConeGeometry(0.16, 0.32, 4);
    arrowGeo.rotateX(Math.PI);
    this.ctrlArrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0xffe14d }));
    this.arena.scene.add(this.ctrlArrow);
    const pmGeo = new THREE.OctahedronGeometry(0.12);
    this.passMarker = new THREE.Mesh(pmGeo, new THREE.MeshBasicMaterial({ color: 0x7fffd4 }));
    this.arena.scene.add(this.passMarker);
    this.resize();
  }

  attach(game: Game): void {
    for (const pv of this.players) {
      this.arena.scene.remove(pv.root, pv.ring);
      pv.dispose();
    }
    this.players = game.players.map((p) => new PlayerView(p));
    for (const pv of this.players) this.arena.scene.add(pv.root, pv.ring);
    this.game = game;
    this.snapCamera();
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  onEvents(events: GameEvent[]): void {
    const nets = this.arena.nets;
    for (const e of events) {
      if (e.type === 'score') {
        const net = nets.find((n) => Math.sign(n.x) === (e.team === 0 ? 1 : -1));
        if (net) net.swishT = 0.7;
        this.arena.crowdExcite = 1;
      } else if (e.type === 'rim') {
        const bx = this.game?.ball.pos.x ?? 0;
        const net = nets.find((n) => Math.sign(n.x) === Math.sign(bx));
        if (net) net.rimShake = Math.min(1, e.strength / 4);
      } else if (e.type === 'block' || e.type === 'steal') {
        this.arena.crowdExcite = Math.max(this.arena.crowdExcite, 0.6);
      }
    }
  }

  private cameraTarget(): { pos: THREE.Vector3; look: THREE.Vector3 } {
    const g = this.game!;
    const b = g.ball.pos;
    const ctrl = g.controlled >= 0 ? g.players[g.controlled] : null;
    if (this.cameraMode === 'follow' && ctrl) {
      const s = g.config.humanTeam === 1 ? -1 : 1;
      const fx = ctrl.pos.x * 0.6 + b.x * 0.4;
      const fz = ctrl.pos.z * 0.6 + b.z * 0.4;
      return {
        pos: new THREE.Vector3(fx - s * 9.5, 6.2, fz * 0.6),
        look: new THREE.Vector3(fx + s * 4, 1.2, fz * 0.8),
      };
    }
    let fx = b.x * 0.75 + (ctrl ? ctrl.pos.x * 0.25 : b.x * 0.25);
    fx = Math.max(-HALF_L + 5.5, Math.min(HALF_L - 5.5, fx));
    const fz = b.z * 0.25;
    return {
      pos: new THREE.Vector3(fx * 0.92, 11.5, 19.5 + fz * 0.2),
      look: new THREE.Vector3(fx, 0.6, fz - 0.8),
    };
  }

  snapCamera(): void {
    if (!this.game) return;
    const t = this.cameraTarget();
    this.camPos.copy(t.pos);
    this.camLook.copy(t.look);
  }

  render(dt: number, time: number): void {
    const g = this.game;
    if (!g) return;
    for (const pv of this.players) pv.update(g, dt);

    // ball
    const b = g.ball;
    this.ball.position.set(b.pos.x, b.pos.y, b.pos.z);
    const sp = Math.hypot(b.vel.x, b.vel.z);
    if (sp > 0.01 && dt > 0) {
      const axis = new THREE.Vector3(b.vel.z, 0, -b.vel.x).normalize();
      const backspin = b.state === 'flight' && b.flightKind === 'shot' ? -1.6 : 1;
      const q = new THREE.Quaternion().setFromAxisAngle(axis, ((sp * dt) / BALL_R) * backspin);
      this.ballQuat.premultiply(q);
      this.ball.quaternion.copy(this.ballQuat);
    }
    const hgt = Math.max(0, b.pos.y - BALL_R);
    this.ballShadow.position.set(b.pos.x, 0.014, b.pos.z);
    const ss = 0.6 + hgt * 0.25;
    this.ballShadow.scale.set(ss, 1, ss);
    (this.ballShadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.15, 1 - hgt * 0.22);

    // controlled player arrow
    const ctrl = g.controlled >= 0 && g.config.humanTeam >= 0 ? g.players[g.controlled] : null;
    this.ctrlArrow.visible = !!ctrl && g.phase !== 'pregame';
    if (ctrl) {
      this.ctrlArrow.position.set(ctrl.pos.x, ctrl.pos.y + 2.45 + Math.sin(time * 6) * 0.06, ctrl.pos.z);
      this.ctrlArrow.rotation.y = time * 2;
    }
    // pass target preview
    this.passMarker.visible = false;
    if (ctrl && b.state === 'held' && b.owner === ctrl.id && (g.phase === 'live' || g.phase === 'inbound')) {
      const tgt = g.choosePassTarget(ctrl, g.input.move);
      this.passMarker.visible = true;
      this.passMarker.position.set(tgt.pos.x, tgt.pos.y + 2.4 + Math.sin(time * 5) * 0.05, tgt.pos.z);
      this.passMarker.rotation.y = time * 3;
    }

    this.arena.update(dt, time);

    // camera smoothing
    const t = this.cameraTarget();
    const k = 1 - Math.exp(-dt * 3.2);
    this.camPos.lerp(t.pos, k);
    this.camLook.lerp(t.look, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.renderer.render(this.arena.scene, this.camera);
  }

  /** Project a world point to CSS pixel coordinates (null if behind the camera). */
  toScreen(x: number, y: number, z: number): { x: number; y: number } | null {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    if (v.z > 1) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  /** Screen-space right/forward vectors projected onto the court for camera-relative controls. */
  controlBasis(): { right: { x: number; z: number }; fwd: { x: number; z: number } } {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    let fx = dir.x;
    let fz = dir.z;
    const l = Math.hypot(fx, fz) || 1;
    fx /= l;
    fz /= l;
    return { fwd: { x: fx, z: fz }, right: { x: -fz, z: fx } };
  }

  dispose(): void {
    for (const pv of this.players) pv.dispose();
    this.arena.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
