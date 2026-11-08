import * as THREE from 'three';
import type { Game } from '../sim/game';
import type { Player } from '../sim/types';
import { makeJerseyTexture, TEAM_COLORS } from './textures';

const SKIN = [0x8d5524, 0xc68642, 0xe0ac69, 0x6b3e26, 0xf1c27d, 0x4a2c1a, 0xa86b3c, 0xd9a066, 0x5c3a21, 0xc58c5c];
const HAIR = [0x1a1110, 0x2b1d14, 0x0d0d0d, 0x3b2a1a, 0x1a1110];

function lerpTo(cur: number, target: number, k: number): number {
  return cur + (target - cur) * k;
}

export class PlayerView {
  root = new THREE.Group();
  body = new THREE.Group();
  legL = new THREE.Group();
  legR = new THREE.Group();
  shinL = new THREE.Group();
  shinR = new THREE.Group();
  armL = new THREE.Group();
  armR = new THREE.Group();
  foreL = new THREE.Group();
  foreR = new THREE.Group();
  torso: THREE.Mesh;
  head = new THREE.Group();
  ring: THREE.Mesh;
  private disposables: Array<{ dispose(): void }> = [];
  private scale: number;

  constructor(public p: Player) {
    const team = p.team;
    const col = TEAM_COLORS[team];
    const jerseyTex = makeJerseyTexture(team, p.number, p.name);
    const jerseyMat = new THREE.MeshStandardMaterial({ map: jerseyTex, roughness: 0.75 });
    const shortsMat = new THREE.MeshStandardMaterial({ color: col.primary, roughness: 0.8 });
    const trimMat = new THREE.MeshStandardMaterial({ color: col.trim, roughness: 0.6 });
    const skinMat = new THREE.MeshStandardMaterial({ color: SKIN[p.id % SKIN.length], roughness: 0.65 });
    const hairMat = new THREE.MeshStandardMaterial({ color: HAIR[p.id % HAIR.length], roughness: 0.9 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: team === 0 ? 0xf5f5f5 : 0x222222, roughness: 0.5 });
    const sockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    this.disposables.push(jerseyTex, jerseyMat, shortsMat, trimMat, skinMat, hairMat, shoeMat, sockMat);

    this.scale = [1.0, 0.98, 1.0, 1.03, 1.06][p.role] * (0.98 + ((p.id * 37) % 7) * 0.006);
    this.root.add(this.body);
    this.body.scale.setScalar(this.scale);

    const cyl = (rt: number, rb: number, h: number, mat: THREE.Material, seg = 10) => {
      const g = new THREE.CylinderGeometry(rt, rb, h, seg);
      this.disposables.push(g);
      const m = new THREE.Mesh(g, mat);
      m.castShadow = true;
      return m;
    };
    const sph = (r: number, mat: THREE.Material) => {
      const g = new THREE.SphereGeometry(r, 14, 10);
      this.disposables.push(g);
      const m = new THREE.Mesh(g, mat);
      m.castShadow = true;
      return m;
    };

    // legs: hip pivot -> thigh -> knee pivot -> shin -> shoe
    for (const [leg, shin, z] of [
      [this.legL, this.shinL, -0.11],
      [this.legR, this.shinR, 0.11],
    ] as Array<[THREE.Group, THREE.Group, number]>) {
      leg.position.set(0, 0.98, z);
      const thigh = cyl(0.085, 0.07, 0.48, skinMat);
      thigh.position.y = -0.24;
      leg.add(thigh);
      shin.position.y = -0.48;
      leg.add(shin);
      const calf = cyl(0.068, 0.05, 0.44, skinMat);
      calf.position.y = -0.22;
      shin.add(calf);
      const sock = cyl(0.056, 0.052, 0.14, sockMat);
      sock.position.y = -0.37;
      shin.add(sock);
      const shoeG = new THREE.BoxGeometry(0.28, 0.1, 0.12);
      this.disposables.push(shoeG);
      const shoe = new THREE.Mesh(shoeG, shoeMat);
      shoe.position.set(0.06, -0.47, 0);
      shoe.castShadow = true;
      shin.add(shoe);
      this.body.add(leg);
    }
    const shorts = cyl(0.22, 0.25, 0.34, shortsMat, 14);
    shorts.position.y = 0.9;
    shorts.scale.z = 0.85;
    this.body.add(shorts);
    const shortsTrim = cyl(0.252, 0.252, 0.04, trimMat, 14);
    shortsTrim.position.y = 0.745;
    shortsTrim.scale.z = 0.85;
    this.body.add(shortsTrim);

    this.torso = cyl(0.24, 0.2, 0.62, jerseyMat, 18);
    this.torso.position.y = 1.36;
    this.torso.scale.z = 0.72;
    this.body.add(this.torso);
    const shoulders = cyl(0.135, 0.135, 0.56, skinMat, 8);
    shoulders.rotation.x = Math.PI / 2;
    shoulders.position.y = 1.6;
    shoulders.scale.set(1, 1, 0.8);
    this.body.add(shoulders);

    // head
    this.head.position.y = 1.76;
    const neck = cyl(0.055, 0.06, 0.12, skinMat);
    neck.position.y = -0.04;
    this.head.add(neck);
    const skull = sph(0.118, skinMat);
    skull.position.y = 0.1;
    skull.scale.set(1, 1.12, 0.95);
    this.head.add(skull);
    const hair = sph(0.122, hairMat);
    hair.position.set(-0.01, 0.135, 0);
    hair.scale.set(1, 0.85, 0.97);
    this.head.add(hair);
    // eyes (face forward = +x)
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x15100c });
    this.disposables.push(eyeMat);
    for (const ez of [-0.042, 0.042]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 4), eyeMat);
      this.disposables.push(eye.geometry);
      eye.position.set(0.108, 0.115, ez);
      this.head.add(eye);
    }
    const band = cyl(0.122, 0.122, 0.03, trimMat, 14);
    band.position.y = 0.15;
    if (p.role % 2 === 0) this.head.add(band);
    this.body.add(this.head);

    // arms: shoulder pivot -> upper arm -> elbow pivot -> forearm + hand
    for (const [arm, fore, z] of [
      [this.armL, this.foreL, -0.29],
      [this.armR, this.foreR, 0.29],
    ] as Array<[THREE.Group, THREE.Group, number]>) {
      arm.position.set(0, 1.6, z);
      const upper = cyl(0.058, 0.05, 0.36, skinMat);
      upper.position.y = -0.18;
      arm.add(upper);
      fore.position.y = -0.36;
      arm.add(fore);
      const lower = cyl(0.048, 0.04, 0.32, skinMat);
      lower.position.y = -0.16;
      fore.add(lower);
      const hand = sph(0.05, skinMat);
      hand.position.y = -0.35;
      fore.add(hand);
      this.body.add(arm);
    }

    // floor ring (team color, brighter for the controlled player)
    const ringG = new THREE.RingGeometry(0.42, 0.52, 32);
    ringG.rotateX(-Math.PI / 2);
    const ringM = new THREE.MeshBasicMaterial({ color: col.primary, transparent: true, opacity: 0.55, depthWrite: false });
    this.disposables.push(ringG, ringM);
    this.ring = new THREE.Mesh(ringG, ringM);
    this.ring.position.y = 0.012;
    this.ring.renderOrder = 1;
  }

  update(g: Game, dt: number): void {
    const p = this.p;
    const k = Math.min(1, dt * 14);
    this.root.position.set(p.pos.x, 0, p.pos.z);
    this.body.position.y = p.pos.y;
    this.root.rotation.y = -p.facing;
    this.ring.position.set(p.pos.x, 0.012, p.pos.z);

    const sp = Math.hypot(p.vel.x, p.vel.z);
    const run = Math.min(1, sp / 5.5);
    const ph = p.runPhase * 2.2;
    const swing = Math.sin(ph) * 0.75 * run;
    const air = p.pos.y > 0.02;
    const a = p.action;
    const hasBall = g.ball.state === 'held' && g.ball.owner === p.id;
    const stance = p.stance * (hasBall ? 0 : 1) * (1 - run * 0.6);

    // forward lean
    let lean = run * 0.18 + stance * 0.12;
    // legs
    let legL = swing;
    let legR = -swing;
    let kneeL = Math.max(0, -Math.sin(ph)) * 0.9 * run + stance * 0.5;
    let kneeR = Math.max(0, Math.sin(ph)) * 0.9 * run + stance * 0.5;
    let crouch = stance * 0.1;
    if (air) {
      legL = 0.35;
      legR = -0.1;
      kneeL = 0.9;
      kneeR = 0.4;
      crouch = 0;
    }
    if (stance > 0.01 && !air) {
      legL += -0.25 * stance;
      legR += -0.25 * stance;
    }
    // arms (rotation.z: + swings the arm forward/up; rotation.x: spread to the side)
    let armLz = -swing * 0.8;
    let armRz = swing * 0.8;
    let armLx = 0.12 + stance * 0.75;
    let armRx = -0.12 - stance * 0.75;
    let elbowL = 0.25 + run * 0.6;
    let elbowR = 0.25 + run * 0.6;

    if (hasBall && !a) {
      const b = g.ball;
      if (g.phase !== 'live' || p.holdT < 0.25) {
        armLz = armRz = 1.05;
        armLx = 0.35;
        armRx = -0.35;
        elbowL = elbowR = 0.9;
      } else {
        // right hand follows the dribble
        const h = Math.max(0, Math.min(1, (b.pos.y - 0.1) / 0.9));
        armRz = 0.55;
        armRx = -0.35;
        elbowR = 0.2 + h * 0.9;
      }
    }
    if (a) {
      if (a.kind === 'shoot') {
        const t = Math.min(1, a.t / 0.18);
        const rel = a.released ? 1 : 0;
        armLz = armRz = 1.2 + t * 1.5 + rel * 0.3;
        armLx = 0.25;
        armRx = -0.2;
        elbowL = elbowR = a.released ? 0.1 : 1.2 - t * 0.4;
        lean = -0.05;
        if (!air) crouch = 0.12 * (1 - t);
      } else if (a.kind === 'pass') {
        armLz = armRz = 1.45;
        armLx = 0.2;
        armRx = -0.2;
        elbowL = elbowR = 0.2;
      } else if (a.kind === 'steal') {
        const f = Math.sin(Math.min(1, a.t / a.dur) * Math.PI);
        armRz = 0.4 + f * 1.1;
        armRx = -0.2;
        elbowR = 0.1;
        lean += f * 0.25;
      } else if (a.kind === 'block') {
        armLz = armRz = 2.85;
        armLx = 0.15;
        armRx = -0.15;
        elbowL = elbowR = 0.1;
      } else if (a.kind === 'recover') {
        crouch = 0.1;
      }
    }

    this.body.rotation.z = -lean;
    this.body.position.y = p.pos.y - crouch;
    this.legL.rotation.z = lerpTo(this.legL.rotation.z, legL, k);
    this.legR.rotation.z = lerpTo(this.legR.rotation.z, legR, k);
    this.shinL.rotation.z = lerpTo(this.shinL.rotation.z, -kneeL, k);
    this.shinR.rotation.z = lerpTo(this.shinR.rotation.z, -kneeR, k);
    this.armL.rotation.z = lerpTo(this.armL.rotation.z, armLz, k);
    this.armR.rotation.z = lerpTo(this.armR.rotation.z, armRz, k);
    this.armL.rotation.x = lerpTo(this.armL.rotation.x, armLx, k);
    this.armR.rotation.x = lerpTo(this.armR.rotation.x, armRx, k);
    this.foreL.rotation.z = lerpTo(this.foreL.rotation.z, elbowL, k);
    this.foreR.rotation.z = lerpTo(this.foreR.rotation.z, elbowR, k);

    const ctrl = g.isHumanControlled(p);
    const rm = this.ring.material as THREE.MeshBasicMaterial;
    rm.color.set(ctrl ? 0xffe14d : TEAM_COLORS[p.team].primary);
    rm.opacity = ctrl ? 0.95 : 0.5;
    const pulse = ctrl ? 1 + Math.sin(performance.now() * 0.008) * 0.08 : 1;
    this.ring.scale.setScalar(pulse);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
