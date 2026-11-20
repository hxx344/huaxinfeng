import * as THREE from 'three';
import { Builder } from '../core/kit.js';
import { SPARK } from '../fx/particles.js';

const _v = new THREE.Vector3();
const BLACK = [0.03, 0.033, 0.045];
let parts = null;

// 模型都朝 -z，原点在身体中心
function build() {
  if (parts) return parts;
  const std = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });

  let B = new Builder();
  B.cone(0, -2.4, 0, 1.25, 4.5, BLACK, 9);
  B.ball(0, 2.0, -0.1, 0.62, [0.02, 0.02, 0.03]);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    B.put(new THREE.BoxGeometry(0.4, 1.7, 0.05), Math.cos(a) * 0.95, -2.9, Math.sin(a) * 0.95, BLACK, -a, 0.3);
  }
  for (const s of [-1, 1]) {
    B.put(new THREE.CylinderGeometry(0.05, 0.08, 1.7, 5), s * 0.55, 0.9, -0.85, [0.3, 0.33, 0.36], 0, -Math.PI / 2 + 0.35);
    B.ball(s * 0.55, 0.62, -1.65, 0.13, [0.36, 0.39, 0.42], 0);
  }
  const dementor = B.geometry();

  B = new Builder();
  B.cone(0, -1.7, 0, 0.82, 2.7, BLACK, 9);
  B.ball(0, 0.95, 0, 0.5, BLACK);
  B.ball(0, 1.62, -0.03, 0.36, [0.05, 0.05, 0.06]);
  B.box(0, 1.42, -0.36, 0.36, 0.44, 0.1, [0.78, 0.8, 0.84]);
  B.cone(0, 1.75, 0.05, 0.42, 0.7, BLACK, 7);
  B.put(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 5), 0.5, 1.0, -0.5, BLACK, 0, -Math.PI / 2);
  B.put(new THREE.CylinderGeometry(0.015, 0.025, 0.7, 5), 0.5, 1.05, -1.25, [0.6, 0.5, 0.35], 0, -Math.PI / 2);
  const eater = B.geometry();

  B = new Builder();
  const hairy = [0.1, 0.075, 0.055];
  B.ball(0, 0.3, 1.3, 1.5, hairy);
  B.ball(0, 0.1, -0.6, 0.9, [0.13, 0.1, 0.075]);
  for (let i = 0; i < 4; i++) {
    for (const s of [-1, 1]) {
      const z = -0.9 + i * 0.65;
      B.put(new THREE.BoxGeometry(1.9, 0.17, 0.17), s * 1.5, 0.75, z, hairy, s * (i - 1.5) * 0.25, 0, s * 0.55);
      B.put(new THREE.BoxGeometry(0.15, 2.0, 0.15), s * 2.45, 0.2, z - s * 0 + (i - 1.5) * 0.45, hairy, 0, 0, s * -0.2);
    }
  }
  for (const [x, y] of [[-0.3, 0.45], [0.3, 0.45], [-0.12, 0.25], [0.12, 0.25]]) B.ball(x, y, -1.42, 0.09, [1.6, 0.1, 0.05], 0);
  const spider = B.geometry();

  B = new Builder();
  const scale = [0.14, 0.12, 0.1];
  const bronze = [0.42, 0.3, 0.14];
  B.put(new THREE.CylinderGeometry(1.3, 1.6, 7, 9), 0, 0, 0, scale, 0, Math.PI / 2);
  B.put(new THREE.CylinderGeometry(0.7, 1.15, 4.4, 8), 0, 0.9, -5.2, scale, 0, -Math.PI / 2 + 0.4);
  B.put(new THREE.BoxGeometry(1.4, 1.1, 2.6), 0, 1.9, -7.9, scale);
  B.put(new THREE.CylinderGeometry(0.05, 1.25, 8, 7), 0, -0.1, 7.3, scale, 0, Math.PI / 2);
  for (const s of [-1, 1]) {
    B.put(new THREE.CylinderGeometry(0, 0.2, 1.3, 5), s * 0.45, 2.8, -7.2, bronze, 0, 0.5);
    B.ball(s * 0.5, 2.25, -8.6, 0.14, [1.8, 1.2, 0.2], 0);
    B.put(new THREE.CylinderGeometry(0.3, 0.2, 2.2, 6), s * 1.2, -1.5, -1.6, scale);
    B.put(new THREE.CylinderGeometry(0.35, 0.22, 2.4, 6), s * 1.3, -1.5, 2.2, scale);
  }
  for (let k = 0; k < 9; k++) B.cone(0, 1.25, -3 + k * 1.3, 0.28, 0.9, bronze, 4);
  const dragon = B.geometry();
  const wingR = new THREE.BoxGeometry(8, 0.14, 4.6).translate(4, 0, 0.6);
  const wingL = new THREE.BoxGeometry(8, 0.14, 4.6).translate(-4, 0, 0.6);
  const wingMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.2, 0.13, 0.09), roughness: 0.9, side: THREE.DoubleSide });

  parts = { std, dementor, eater, spider, dragon, wingR, wingL, wingMat };
  return parts;
}

const SPEC = {
  dementor: { hp: 1, radius: 3.0, scale: 1.25, glow: [0.35, 0.55, 1.0], glowSize: 11, glowAlpha: 0.4 },
  eater: { hp: 5, radius: 2.8, scale: 1.5, glow: [0.65, 0.2, 1.0], glowSize: 10, glowAlpha: 0.45 },
  spider: { hp: 2, radius: 3.4, scale: 1.5, glow: [1.0, 0.15, 0.1], glowSize: 7, glowAlpha: 0.35 },
  dragon: { hp: 26, radius: 6.5, scale: 1.3, glow: [1.0, 0.45, 0.1], glowSize: 22, glowAlpha: 0.3 },
};

export function makeEnemy(type, scene, glowMap, x, y, z) {
  const P = build();
  const spec = SPEC[type];
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const mesh = new THREE.Mesh(P[type], P.std);
  mesh.castShadow = type !== 'dementor';
  const body = new THREE.Group();
  body.scale.setScalar(spec.scale);
  body.add(mesh);
  group.add(body);
  const e = {
    type,
    group,
    body,
    pos: group.position,
    vel: new THREE.Vector3(),
    face: new THREE.Vector3(0, 0, -1),
    home: new THREE.Vector3(x, y, z),
    hp: spec.hp,
    radius: spec.radius,
    alive: true,
    guard: false,
    t: Math.random() * 10,
    cd: 1.5 + Math.random() * 2,
    side: Math.random() < 0.5 ? -1 : 1,
    burst: 0,
    burstT: 0,
    a: Math.random() * Math.PI * 2,
    flash: 0,
    smoke: 0,
  };
  if (type === 'dragon') {
    e.wings = [new THREE.Mesh(P.wingR, P.wingMat), new THREE.Mesh(P.wingL, P.wingMat)];
    e.wings[0].position.set(1.2, 0.9, -1);
    e.wings[1].position.set(-1.2, 0.9, -1);
    body.add(...e.wings);
  }
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowMap, color: new THREE.Color(...spec.glow), opacity: spec.glowAlpha, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
  );
  glow.scale.setScalar(spec.glowSize);
  group.add(glow);
  e.glow = glow;
  e.glowAlpha = spec.glowAlpha;
  scene.add(group);
  return e;
}

export function removeEnemy(e, scene) {
  scene.remove(e.group);
  e.glow.material.dispose();
}

function steer(e, tx, ty, tz, maxSpeed, gain, resp, dt, T, minAlt) {
  _v.set(tx - e.pos.x, ty - e.pos.y, tz - e.pos.z);
  const d = _v.length() || 1;
  _v.multiplyScalar(Math.min(maxSpeed, d * gain) / d);
  e.vel.lerp(_v, Math.min(1, dt * resp));
  e.pos.addScaledVector(e.vel, dt);
  const floor = T.ground(e.pos.x, e.pos.z) + minAlt;
  if (e.pos.y < floor) e.pos.y = floor;
}

function faceTo(e, dx, dz, dt, rate = 6) {
  const want = Math.atan2(-dx, -dz);
  let diff = want - e.group.rotation.y;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  e.group.rotation.y += diff * Math.min(1, dt * rate);
}

function puff(particles, e, dt, rate, size) {
  e.smoke += dt * rate;
  while (e.smoke > 1) {
    e.smoke -= 1;
    particles.spawn(SPARK, e.pos.x + (Math.random() - 0.5) * 1.5, e.pos.y + (Math.random() - 0.5) * 2.5, e.pos.z + (Math.random() - 0.5) * 1.5,
      -e.vel.x * 0.2, 0.5, -e.vel.z * 0.2, 0.7 + Math.random() * 0.5, size, 0.012, 0.012, 0.018);
  }
}

// ctx 是 Combat：提供玩家状态、开火和吸取
export function updateEnemy(e, dt, time, ctx) {
  const { flight, T, fwd, right, particles } = ctx;
  const p = flight.pos;
  const dx = p.x - e.pos.x;
  const dy = p.y - e.pos.y;
  const dz = p.z - e.pos.z;
  const dist = Math.hypot(dx, dy, dz);
  e.t += dt;
  e.cd -= dt;
  if (e.flash > 0) e.flash -= dt;
  e.glow.material.opacity = e.flash > 0 ? 1 : e.glowAlpha;

  if (e.type === 'dementor') {
    steer(e, p.x, p.y + 0.5, p.z, 31, 1.2, 1.4, dt, T, 2.5);
    faceTo(e, dx, dz, dt, 3);
    e.body.rotation.z = Math.sin(e.t * 1.3) * 0.16;
    e.body.rotation.x = -0.25 + Math.sin(e.t * 0.9) * 0.08;
    e.body.position.y = Math.sin(e.t * 1.7) * 0.4;
    puff(particles, e, dt, 6, 1.3);
    if (dist < 26) ctx.drain(0.16 * dt, dist < 13 ? 8 * dt : 0);
  } else if (e.type === 'eater') {
    // 先咬在身后偏一侧开火，隔一阵再抢到前面拦截：只有拦截的这几秒会进到玩家的锁定范围里
    const ahead = e.t % 11 > 6;
    const k = ahead ? 58 : -42;
    const off = e.side * (ahead ? 12 : 22);
    const top = ahead ? Math.max(60, flight.speed * 1.6 + 20) : 47;
    steer(e, p.x + fwd.x * k + right.x * off, p.y + (ahead ? 3 : 7), p.z + fwd.z * k + right.z * off, top, 1.3, ahead ? 2.2 : 1.5, dt, T, 5);
    faceTo(e, dx, dz, dt);
    e.body.rotation.x = -0.5;
    puff(particles, e, dt, 26, 1.5);
    if (e.cd <= 0 && dist < 150 && dist > 12) {
      e.cd = 2.2 + Math.random() * 1.3;
      ctx.hostileFire(e, 'curse', 0.02);
    }
  } else if (e.type === 'spider') {
    const dh = Math.hypot(dx, dz);
    // 不往玩家脚底下钻：停在外圈吐丝，玩家才有角度俯冲下来打它
    if (dh < 220 && dh > 70) {
      let nx = e.pos.x + (dx / dh) * 13 * dt;
      let nz = e.pos.z + (dz / dh) * 13 * dt;
      const hx = nx - e.home.x;
      const hz = nz - e.home.z;
      const hd = Math.hypot(hx, hz);
      if (hd > 90) {
        nx = e.home.x + (hx / hd) * 90;
        nz = e.home.z + (hz / hd) * 90;
      }
      e.pos.x = nx;
      e.pos.z = nz;
      faceTo(e, dx, dz, dt, 4);
    }
    e.pos.y = T.ground(e.pos.x, e.pos.z) + 1.9;
    e.body.position.y = Math.abs(Math.sin(e.t * 9)) * 0.25;
    if (e.cd <= 0 && dh < 120 && flight.alt < 55) {
      e.cd = 2.6 + Math.random() * 1.2;
      ctx.hostileFire(e, 'web', 0.03);
    }
  } else if (e.type === 'dragon') {
    e.a += dt * 0.45;
    steer(e, e.home.x + Math.cos(e.a) * 65, e.home.y + 6, e.home.z + Math.sin(e.a) * 65, 34, 1.5, 1.2, dt, T, 10);
    const attacking = e.burst > 0;
    const sp = e.vel.length() || 1;
    if (attacking) faceTo(e, dx, dz, dt, 5);
    else faceTo(e, e.vel.x, e.vel.z, dt, 3);
    const yaw = e.group.rotation.y;
    e.face.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    e.body.rotation.x = (e.vel.y / sp) * 0.5;
    const flap = Math.sin(e.t * 5) * 0.6;
    e.wings[0].rotation.z = flap;
    e.wings[1].rotation.z = -flap;
    if (!attacking && e.cd <= 0 && dist < 160) {
      e.burst = 6;
      e.burstT = 0.5;
    }
    if (attacking) {
      e.burstT -= dt;
      if (e.burstT <= 0) {
        e.burstT = 0.13;
        e.burst--;
        ctx.hostileFire(e, 'fire', 0.07);
        if (e.burst === 0) e.cd = 4.5;
      }
    }
  }
}
