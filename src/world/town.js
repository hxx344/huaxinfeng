import * as THREE from 'three';
import { Builder, rot } from '../core/kit.js';
import { STACK } from './terrain.js';

const WALLS = [
  [0.82, 0.76, 0.63],
  [0.86, 0.83, 0.77],
  [0.76, 0.6, 0.44],
  [0.72, 0.67, 0.58],
  [0.8, 0.64, 0.56],
  [0.64, 0.67, 0.66],
];
const ROOFS = [
  [0.52, 0.18, 0.1],
  [0.58, 0.25, 0.13],
  [0.24, 0.26, 0.31],
  [0.32, 0.2, 0.14],
  [0.27, 0.33, 0.22],
];
const STONE = [0.5, 0.48, 0.44];
const STONE_DARK = [0.36, 0.35, 0.34];
const WOOD = [0.3, 0.19, 0.1];
const TIMBER = [0.45, 0.32, 0.18];
const GLASS = [0.1, 0.14, 0.2];
const LIT = [2.2, 1.5, 0.6];
const WHITE = [0.88, 0.87, 0.84];
const RED = [0.7, 0.12, 0.09];
const pick = (rng, list) => list[Math.floor(rng() * list.length)];

// 选定城镇、村子和野外各处建筑的位置，并把地面整平。必须在 terrain.finalize 之前调用
export function planSites(T, rng) {
  const clears = [];
  const taken = [];

  let best = null;
  for (let x = -600; x <= 600; x += 60) {
    let z = 150;
    while (z < 1500 && T.height(x, z) > 1.5) z += 10;
    if (z >= 1500 || z < 500) continue;
    let sum = 0;
    for (let k = 1; k <= 6; k++) sum += T.height(x, z - 40 * k);
    if (!best || sum < best.sum) best = { x, z, sum };
  }
  if (!best) best = { x: 0, z: 900 };
  const harbour = { x: best.x, z: best.z - 150, y: 4.5 };
  T.flatten(harbour.x, harbour.z, 210, harbour.y);
  let qz = harbour.z;
  while (qz < harbour.z + 400 && T.height(harbour.x, qz) > 1.2) qz += 2;
  harbour.qz = qz;
  clears.push({ x: harbour.x, z: harbour.z - 8, r: 112, paved: true });
  taken.push({ x: harbour.x, z: harbour.z, r: 340 });

  let bestV = null;
  for (let x = -700; x <= 700; x += 50) {
    let z = -150;
    while (z > -1500 && T.height(x, z) > 1.5) z -= 10;
    if (z <= -1500 || z > -500) continue;
    const ch = T.height(x, z + 120);
    if (ch > 100 || T.normalY(x, z + 120) < 0.9) continue;
    if (!bestV || ch > bestV.y) bestV = { x, z: z + 120, y: ch };
  }
  if (!bestV) bestV = { x: -300, z: -700, y: Math.max(8, T.height(-300, -700)) };
  const village = bestV;
  T.flatten(village.x, village.z, 85, village.y);
  clears.push({ x: village.x, z: village.z, r: 62, paved: true });
  taken.push({ x: village.x, z: village.z, r: 240 });

  const find = (hMin, hMax, preferHigh) => {
    let found = null;
    let seen = 0;
    for (let i = 0; i < 6000; i++) {
      const x = (rng() * 2 - 1) * 1150;
      const z = (rng() * 2 - 1) * 1150;
      const y = T.height(x, z);
      if (y < hMin || y > hMax) continue;
      if (T.normalY(x, z) < (i < 3000 ? 0.95 : 0.85)) continue;
      if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r)) continue;
      if (!preferHigh) {
        found = { x, z, y };
        break;
      }
      if (!found || y > found.y) found = { x, z, y };
      if (++seen > 70) break;
    }
    if (!found) found = { x: (rng() * 2 - 1) * 400, z: (rng() * 2 - 1) * 400, y: 0 };
    found.y = Math.max(6, T.height(found.x, found.z));
    T.flatten(found.x, found.z, 30, found.y);
    taken.push({ x: found.x, z: found.z, r: 250 });
    return found;
  };

  const beacon = find(55, 150, true);
  const observatory = find(32, 95, true);
  const mills = [find(10, 45, false), find(10, 45, false)];
  const farms = [find(8, 36, false), find(8, 36, false)];
  const circle = find(10, 50, false);
  const loneTree = find(26, 80, false);
  for (const s of [beacon, observatory, ...mills, circle]) clears.push({ x: s.x, z: s.z, r: 14, paved: false });
  for (const s of farms) clears.push({ x: s.x, z: s.z, r: 26, paved: true });
  clears.push({ x: loneTree.x, z: loneTree.z, r: 5, paved: false });

  T.flatten(STACK.x, STACK.z, 26, 30, 0.7);
  const stack = { x: STACK.x, z: STACK.z, y: 30 };
  clears.push({ x: stack.x, z: stack.z, r: 30, paved: false });

  return { harbour, village, beacon, observatory, mills, farms, circle, loneTree, stack, clears };
}

export function buildTown(scene, T, sites, rng) {
  const B = new Builder();
  const G = new Builder();
  const places = [];
  const colliders = [];
  const spinners = [];
  const group = new THREE.Group();
  scene.add(group);

  const addPlace = (name, x, y, z, yaw) => {
    places.push({ name, spot: new THREE.Vector3(x, y, z), yaw });
  };

  function house(x, z, ry, opt = {}) {
    const w = opt.w ?? 6 + rng() * 3.5;
    const d = opt.d ?? 7 + rng() * 4;
    const storeys = opt.storeys ?? (rng() < 0.45 ? 2 : 1);
    const h = 2.9 * storeys + 0.5;
    const rh = w * 0.42 + rng() * 0.8;
    const y = T.height(x, z);
    const wall = opt.wall ?? pick(rng, WALLS);
    const roof = opt.roof ?? pick(rng, ROOFS);
    B.box(x, y - 3, z, w, h + 3, d, wall, ry);
    B.gable(x, y + h, z, w + 0.8, rh, d + 0.9, roof, ry);
    let o = rot(ry, w * 0.24, -d * 0.2);
    B.box(x + o[0], y + h + rh * 0.25, z + o[1], 0.75, rh + 0.9, 0.75, STONE_DARK, ry);
    o = rot(ry, (rng() - 0.5) * w * 0.3, d / 2 + 0.03);
    B.box(x + o[0], y, z + o[1], 1.15, 2.05, 0.16, WOOD, ry);
    for (let s = 0; s < storeys; s++) {
      for (const side of [-1, 1]) {
        for (const lx of [-w * 0.3, w * 0.3]) {
          if (s === 0 && side === 1 && Math.abs(lx) < 0.01) continue;
          o = rot(ry, lx, side * (d / 2 + 0.03));
          const lit = rng() < 0.22;
          (lit ? G : B).box(x + o[0], y + 1.25 + 2.9 * s, z + o[1], 0.95, 1.1, 0.14, lit ? LIT : GLASS, ry);
        }
      }
    }
    colliders.push({ x, z, r: Math.max(w, d) * 0.56, top: y + h + rh });
    return y;
  }

  function landingRing(x, y, z) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.3, 40),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.0, 0.75, 0.25),
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y + 0.08, z);
    group.add(ring);
    return ring;
  }

  // ---------- 云雀港 ----------
  {
    const { x: cx, z: cz, y: cy, qz } = sites.harbour;
    const rows = [
      { v: -80, ry: 0 },
      { v: -52, ry: Math.PI },
      { v: -22, ry: 0, gap: 42 },
      { v: 30, ry: Math.PI, gap: 42 },
      { v: 58, ry: 0 },
    ];
    for (const row of rows) {
      for (let u = -150; u <= 150; u += 12.5 + rng() * 5) {
        if (row.gap && Math.abs(u) < row.gap) continue;
        const x = cx + u;
        const z = cz + row.v + (rng() - 0.5) * 3;
        if (Math.abs(T.height(x, z) - cy) > 1.0) continue;
        house(x, z, row.ry + (rng() - 0.5) * 0.12);
      }
    }

    // 钟楼：方塔，高处一圈回廊
    const tx = cx + 24;
    const tz = cz - 14;
    B.box(tx, cy - 2, tz, 6.5, 20, 6.5, STONE);
    B.box(tx, cy + 18, tz, 10, 0.5, 10, TIMBER);
    for (const [ax, az] of [[-4.8, -4.8], [4.8, -4.8], [-4.8, 4.8], [4.8, 4.8]]) {
      B.box(tx + ax, cy + 18.5, tz + az, 0.3, 1.1, 0.3, WOOD);
    }
    B.box(tx, cy + 18.5, tz, 5.2, 6, 5.2, WALLS[1]);
    B.cone(tx, cy + 24.5, tz, 4.6, 6.5, ROOFS[0], 4, Math.PI / 4);
    for (const [ax, az, ry] of [[0, 2.65, 0], [0, -2.65, 0], [2.65, 0, Math.PI / 2], [-2.65, 0, Math.PI / 2]]) {
      G.put(new THREE.CylinderGeometry(1.3, 1.3, 0.12, 20), tx + ax, cy + 21.9, tz + az, [1.5, 1.35, 1.0], ry, Math.PI / 2);
      G.put(new THREE.BoxGeometry(0.12, 1.0, 0.06), tx + ax * 1.03, cy + 22.3, tz + az * 1.03, [0.1, 0.08, 0.06], ry);
    }
    colliders.push({ x: tx, z: tz, r: 5.2, top: cy + 31 });
    addPlace('钟楼', tx, cy + 18.5, tz + 3.9, Math.PI);

    // 信使公会：平顶，屋顶是露台
    const gx = cx - 24;
    const gz = cz - 14;
    B.box(gx, cy - 3, gz, 14, 11, 16, WALLS[0]);
    for (const [ax, az, w, d] of [[0, 7.8, 14.6, 0.5], [0, -7.8, 14.6, 0.5], [7.05, 0, 0.5, 16], [-7.05, 0, 0.5, 16]]) {
      B.box(gx + ax, cy + 8, gz + az, w, 0.9, d, STONE);
    }
    B.box(gx - 4.2, cy + 8, gz - 5, 4, 3.2, 4.5, WALLS[2]);
    B.gable(gx - 4.2, cy + 11.2, gz - 5, 4.6, 2, 5, ROOFS[1]);
    B.cyl(gx + 5.6, cy + 8, gz - 6.2, 0.07, 0.07, 6, WOOD, 6);
    B.box(gx + 6.6, cy + 12.6, gz - 6.2, 1.9, 1.2, 0.05, [0.85, 0.6, 0.1]);
    B.box(gx, cy, gz + 8.03, 1.8, 2.6, 0.2, WOOD);
    for (const lx of [-4.5, 4.5]) {
      for (const ly of [1.3, 4.6]) G.box(gx + lx, cy + ly, gz + 8.03, 1.3, 1.5, 0.14, LIT);
    }
    colliders.push({ x: gx, z: gz, r: 9.2, top: cy + 9 });
    addPlace('信使公会', gx + 1.5, cy + 8, gz + 1.5, Math.PI);

    // 广场中央的井
    B.cyl(cx, cy, cz + 12, 2.2, 2.4, 0.9, STONE, 14);
    B.cyl(cx, cy + 0.9, cz + 12, 1.8, 1.8, 0.05, [0.1, 0.3, 0.4], 14);

    // 码头、两道防波堤和堤头的灯标
    B.box(cx, -8, qz + 3, 210, 10.2, 12, STONE);
    for (const side of [-1, 1]) B.box(cx + side * 98, -8, qz + 44, 5, 10, 76, STONE_DARK);
    const lx = cx + 98;
    const lz = qz + 80;
    B.cyl(lx, 2, lz, 2.2, 2.7, 8, WHITE, 14);
    B.cyl(lx, 5, lz, 2.45, 2.52, 1.6, RED, 14);
    B.cyl(lx, 10, lz, 3.4, 3.4, 0.4, STONE_DARK, 16);
    B.cyl(lx + 2.6, 10.4, lz, 0.1, 0.1, 2.2, WOOD, 6);
    G.ball(lx + 2.6, 12.8, lz, 0.35, [2.6, 1.8, 0.6]);
    colliders.push({ x: lx, z: lz, r: 3.4, top: 10.4 });
    addPlace('港口灯标', lx - 0.3, 10.4, lz, Math.PI / 2);

    for (let i = 0; i < 6; i++) {
      const bx = cx + (rng() * 2 - 1) * 80;
      const bz = qz + 20 + rng() * 45;
      const ry = rng() * Math.PI * 2;
      const hull = pick(rng, [[0.75, 0.74, 0.7], [0.2, 0.32, 0.5], [0.5, 0.16, 0.12], [0.3, 0.42, 0.3]]);
      B.box(bx, -0.35, bz, 2.3, 1.1, 6.4, hull, ry);
      let o = rot(ry, 0, 1.2);
      B.box(bx + o[0], 0.75, bz + o[1], 1.5, 0.9, 1.8, WALLS[1], ry);
      o = rot(ry, 0, -0.8);
      B.cyl(bx + o[0], 0.75, bz + o[1], 0.06, 0.08, 5.5, WOOD, 6);
      B.box(bx + o[0], 2.0, bz + o[1], 0.05, 3.6, 2.2, [0.85, 0.8, 0.68], ry);
    }
  }

  // ---------- 石冢村 ----------
  {
    const { x: cx, z: cz, y: cy } = sites.village;
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + rng() * 0.25;
      const r = 30 + rng() * 26;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      if (Math.abs(T.height(x, z) - cy) > 1.5) continue;
      house(x, z, Math.atan2(cx - x, cz - z), { wall: pick(rng, [WALLS[3], WALLS[5], WALLS[1]]), roof: ROOFS[2] });
    }
    B.cyl(cx, cy - 2, cz, 4.2, 4.9, 22, STONE, 16);
    B.cyl(cx, cy + 20, cz, 5.5, 5.5, 0.6, STONE_DARK, 16);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      B.box(cx + Math.cos(a) * 5.0, cy + 20.6, cz + Math.sin(a) * 5.0, 1.3, 1.1, 0.6, STONE, -a + Math.PI / 2);
    }
    B.cyl(cx + 4.1, cy + 20.6, cz, 0.08, 0.08, 6, WOOD, 6);
    B.box(cx + 4.1, cy + 25.2, cz + 1.0, 0.05, 1.3, 2.0, [0.2, 0.35, 0.65]);
    colliders.push({ x: cx, z: cz, r: 5.6, top: cy + 21.5 });
    addPlace('北崖瞭望塔', cx, cy + 20.6, cz, 0);
  }

  // ---------- 海蚀柱上的灯塔 ----------
  {
    const { x, z, y } = sites.stack;
    for (let i = 0; i < 4; i++) {
      const r0 = 4.3 - i * 0.33;
      B.cyl(x, y - 1 + i * 6.25, z, r0 - 0.33, r0, 6.25, i % 2 ? RED : WHITE, 18);
    }
    B.cyl(x, y + 24, z, 4.7, 4.7, 0.4, STONE_DARK, 18);
    G.cyl(x, y + 24.4, z, 1.9, 1.9, 3.2, [2.6, 2.2, 1.2], 12);
    B.cone(x, y + 27.6, z, 2.6, 2.4, RED, 12);
    colliders.push({ x, z, r: 4.8, top: y + 30 });
    addPlace('海崖灯塔', x + 2.4, y + 24.4, z - 2.4, -Math.PI / 4);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 7, 150, 14, 1, true).rotateZ(Math.PI / 2).translate(75, 0, 0),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(1, 0.9, 0.6),
        transparent: true,
        opacity: 0.1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    beam.position.set(x, y + 26, z);
    group.add(beam);
    spinners.push((dt) => {
      beam.rotation.y += dt * 0.5;
    });
  }

  // ---------- 风车 ----------
  sites.mills.forEach((s, i) => {
    const { x, z, y } = s;
    const ry = rng() * Math.PI * 2;
    B.cyl(x, y - 2, z, 2.8, 4.4, 15, WALLS[1], 14);
    B.cyl(x, y + 5, z, 5.7, 5.7, 0.35, TIMBER, 16);
    B.cone(x, y + 13, z, 3.3, 3.6, ROOFS[3], 12);
    let o = rot(ry, 0, 3.6);
    B.box(x + o[0], y, z + o[1], 1.2, 2.1, 0.2, WOOD, ry);
    const sails = new Builder();
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      sails.put(new THREE.BoxGeometry(0.25, 9.5, 0.2), -Math.sin(a) * 4.75, Math.cos(a) * 4.75, 0, WOOD, 0, 0, a);
      sails.put(
        new THREE.BoxGeometry(1.7, 7.2, 0.06),
        -Math.sin(a) * 5.6 + Math.cos(a) * 0.95,
        Math.cos(a) * 5.6 + Math.sin(a) * 0.95,
        0,
        [0.85, 0.8, 0.68],
        0,
        0,
        a
      );
    }
    sails.cyl(0, -0.4, 0, 0.5, 0.5, 0.8, WOOD, 8);
    const sailMesh = sails.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
    o = rot(ry, 0, 3.5);
    sailMesh.position.set(x + o[0], y + 12.6, z + o[1]);
    sailMesh.rotation.set(0, ry, 0, 'YXZ');
    sailMesh.castShadow = true;
    group.add(sailMesh);
    spinners.push((dt) => {
      sailMesh.rotation.z += dt * 0.55;
    });
    colliders.push({ x, z, r: 4.6, top: y + 16.5 });
    o = rot(ry, 0, -4.8);
    addPlace(i === 0 ? '老风车' : '东风车', x + o[0], y + 5.35, z + o[1], ry);
  });

  // ---------- 农场 ----------
  sites.farms.forEach((s, i) => {
    const { x, z } = s;
    const ry = rng() * Math.PI * 2;
    let o = rot(ry, -9, 0);
    house(x + o[0], z + o[1], ry + Math.PI / 2, { storeys: 1 });
    o = rot(ry, 8, -5);
    house(x + o[0], z + o[1], ry, { w: 9, d: 14, storeys: 2, wall: [0.5, 0.17, 0.12], roof: ROOFS[2] });
    o = rot(ry, 3, 13);
    const gx = x + o[0];
    const gz = z + o[1];
    const gy = T.height(gx, gz);
    B.cyl(gx, gy - 2, gz, 3.0, 3.3, 13, STONE, 14);
    B.cyl(gx, gy + 11, gz, 3.8, 3.8, 0.35, TIMBER, 14);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      B.box(gx + Math.cos(a) * 3.55, gy + 11.35, gz + Math.sin(a) * 3.55, 0.22, 0.9, 0.22, WOOD);
    }
    colliders.push({ x: gx, z: gz, r: 3.9, top: gy + 12.2 });
    addPlace(i === 0 ? '麦垛农场' : '果园农场', gx, gy + 11.35, gz, ry);
    for (let k = 0; k < 4; k++) {
      o = rot(ry, -4 + k * 2.6, 9 + (k % 2) * 2);
      const hy = T.height(x + o[0], z + o[1]);
      B.cone(x + o[0], hy, z + o[1], 1.3, 2.2, [0.8, 0.62, 0.2], 9);
    }
  });

  // ---------- 烽火台 ----------
  {
    const { x, z, y } = sites.beacon;
    B.cyl(x, y - 3, z, 3.6, 4.6, 19, STONE_DARK, 4, Math.PI / 4);
    B.box(x, y + 16, z, 7.4, 0.5, 7.4, STONE);
    for (const [ax, az] of [[-3.3, -3.3], [3.3, -3.3], [-3.3, 3.3], [3.3, 3.3]]) {
      B.box(x + ax, y + 16.5, z + az, 0.8, 1.0, 0.8, STONE);
    }
    B.cyl(x + 2.3, y + 16.5, z - 2.3, 0.6, 0.35, 1.1, [0.15, 0.14, 0.14], 8);
    G.cone(x + 2.3, y + 17.6, z - 2.3, 0.55, 1.5, [3.0, 1.2, 0.2], 7);
    colliders.push({ x, z, r: 4.6, top: y + 17.5 });
    addPlace('烽火台', x - 0.5, y + 16.5, z + 0.5, 0);
  }

  // ---------- 观星塔 ----------
  {
    const { x, z, y } = sites.observatory;
    B.cyl(x, y - 3, z, 3.4, 3.9, 20, WALLS[5], 16);
    B.cyl(x, y + 12.5, z, 5.8, 5.8, 0.4, TIMBER, 18);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      B.box(x + Math.cos(a) * 5.55, y + 12.9, z + Math.sin(a) * 5.55, 0.18, 1.0, 0.18, WOOD);
    }
    B.put(new THREE.SphereGeometry(3.7, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), x, y + 17, z, [0.3, 0.5, 0.45]);
    B.put(new THREE.CylinderGeometry(0.45, 0.6, 4.5, 10), x + 1.4, y + 19.4, z + 1.4, [0.6, 0.5, 0.2], Math.PI / 4, 0.9);
    colliders.push({ x, z, r: 5.9, top: y + 21 });
    addPlace('观星塔', x - 4.6, y + 12.9, z, Math.PI / 2);
  }

  // ---------- 环石阵 ----------
  {
    const { x, z, y } = sites.circle;
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const hgt = 3.4 + rng() * 1.8;
      B.box(x + Math.cos(a) * 12, y - 0.6, z + Math.sin(a) * 12, 1.7, hgt, 1.0, STONE_DARK, -a + Math.PI / 2 + (rng() - 0.5) * 0.3);
    }
    B.box(x, y - 0.3, z, 3.2, 0.9, 1.6, STONE, 0.4);
  }

  // ---------- 山丘上的孤树 ----------
  {
    const { x, z, y } = sites.loneTree;
    B.cyl(x, y - 1, z, 0.9, 1.5, 10, [0.27, 0.17, 0.1], 9);
    const greens = [[0.16, 0.35, 0.09], [0.2, 0.4, 0.1], [0.13, 0.3, 0.08]];
    for (let k = 0; k < 7; k++) {
      const a = rng() * Math.PI * 2;
      const r = k === 0 ? 0 : 3 + rng() * 3;
      B.ball(x + Math.cos(a) * r, y + 10 + rng() * 4, z + Math.sin(a) * r, 4 + rng() * 2.2, greens[k % 3]);
    }
    colliders.push({ x, z, r: 1.6, top: y + 9 });
  }

  const solid = B.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  solid.castShadow = true;
  solid.receiveShadow = true;
  solid.frustumCulled = false;
  group.add(solid);
  const glow = G.mesh(new THREE.MeshBasicMaterial({ vertexColors: true }));
  glow.frustumCulled = false;
  group.add(glow);

  for (const p of places) p.ring = landingRing(p.spot.x, p.spot.y, p.spot.z);

  return {
    places,
    colliders,
    update(dt) {
      for (const s of spinners) s(dt);
    },
  };
}
