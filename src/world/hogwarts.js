import * as THREE from 'three';
import { Builder, rot } from '../core/kit.js';
import { patchLit } from '../core/shared.js';
import { STACK } from './terrain.js';

const WALLS = [
  [0.72, 0.66, 0.55],
  [0.78, 0.75, 0.7],
  [0.62, 0.5, 0.38],
  [0.6, 0.57, 0.5],
  [0.55, 0.57, 0.58],
];
const ROOFS = [
  [0.2, 0.22, 0.27],
  [0.27, 0.17, 0.12],
  [0.16, 0.2, 0.24],
];
const STONE = [0.5, 0.47, 0.42];
const STONE_DARK = [0.34, 0.33, 0.32];
const SLATE = [0.19, 0.23, 0.31];
const WOOD = [0.3, 0.19, 0.1];
const TIMBER = [0.42, 0.3, 0.17];
const GLASS = [0.06, 0.08, 0.13];
const LIT = [2.4, 1.6, 0.6];
const GOLD = [0.9, 0.66, 0.12];
const HOUSES = [
  [0.55, 0.07, 0.06],
  [0.82, 0.63, 0.1],
  [0.1, 0.2, 0.55],
  [0.07, 0.33, 0.15],
];
const pick = (rng, list) => list[Math.floor(rng() * list.length)];

// 选定城堡、村子和场地上各处建筑的位置，并把地面整平。必须在 terrain.finalize 之前调用
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
  // 城堡立在黑湖北岸的一块高台上
  const castle = { x: best.x, z: best.z - 200, y: 24 };
  T.flatten(castle.x, castle.z, 190, castle.y, 0.55);
  castle.astro = { x: castle.x + 58, z: castle.z - 42, top: castle.y + 93 };
  clears.push({ x: castle.x, z: castle.z, r: 108, paved: true });
  taken.push({ x: castle.x, z: castle.z, r: 400 });

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
  taken.push({ x: village.x, z: village.z, r: 300 });

  const shack = { x: village.x + 120, z: village.z + 90 };
  shack.y = Math.max(8, T.height(shack.x, shack.z));
  T.flatten(shack.x, shack.z, 20, shack.y);
  clears.push({ x: shack.x, z: shack.z, r: 11, paved: false });

  const find = (hMin, hMax, preferHigh, radius = 30) => {
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
    T.flatten(found.x, found.z, radius, found.y);
    taken.push({ x: found.x, z: found.z, r: 250 });
    return found;
  };

  const owlery = find(55, 150, true);
  const pitch = find(8, 40, false, 105);
  const hut = find(8, 36, false);
  const circle = find(10, 50, false);
  const willow = find(26, 80, false);
  for (const s of [owlery, circle]) clears.push({ x: s.x, z: s.z, r: 14, paved: false });
  clears.push({ x: pitch.x, z: pitch.z, r: 78, paved: false });
  clears.push({ x: hut.x, z: hut.z, r: 16, paved: true });
  clears.push({ x: willow.x, z: willow.z, r: 5, paved: false });

  T.flatten(STACK.x, STACK.z, 26, 30, 0.7);
  const stack = { x: STACK.x, z: STACK.z, y: 30 };
  clears.push({ x: stack.x, z: stack.z, r: 30, paved: false });

  return { castle, village, shack, owlery, pitch, hut, circle, willow, stack, clears, taken };
}

export function buildGrounds(scene, T, sites, rng) {
  const B = new Builder();
  const G = new Builder();
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);

  function house(x, z, ry, opt = {}) {
    const w = opt.w ?? 6 + rng() * 3.5;
    const d = opt.d ?? 7 + rng() * 4;
    const storeys = opt.storeys ?? (rng() < 0.5 ? 2 : 1);
    const h = 2.9 * storeys + 0.5;
    const rh = w * 0.55 + rng() * 0.8;
    const y = T.height(x, z);
    const wall = opt.wall ?? pick(rng, WALLS);
    const roof = opt.roof ?? pick(rng, ROOFS);
    const litChance = opt.lit ?? 0.5;
    B.box(x, y - 3, z, w, h + 3, d, wall, ry);
    B.gable(x, y + h, z, w + 0.8, rh, d + 0.9, roof, ry);
    let o = rot(ry, w * 0.24, -d * 0.2);
    B.box(x + o[0], y + h + rh * 0.25, z + o[1], 0.75, rh + 0.9, 0.75, STONE_DARK, ry);
    o = rot(ry, 0, d / 2 + 0.03);
    B.box(x + o[0], y, z + o[1], 1.15, 2.05, 0.16, WOOD, ry);
    for (let s = 0; s < storeys; s++) {
      for (const side of [-1, 1]) {
        for (const lx of [-w * 0.3, w * 0.3]) {
          o = rot(ry, lx, side * (d / 2 + 0.03));
          const lit = rng() < litChance;
          (lit ? G : B).box(x + o[0], y + 1.25 + 2.9 * s, z + o[1], 0.95, 1.1, 0.14, lit ? LIT : GLASS, ry);
        }
      }
    }
    colliders.push({ x, z, r: Math.max(w, d) * 0.56, top: y + h + rh });
    return y;
  }

  // 圆塔：塔身、塔顶一圈挑檐、尖顶，四周几层亮着或暗着的窗
  function tower(x, z, r, h, y0, roof = SLATE, litChance = 0.45) {
    B.cyl(x, y0 - 3, z, r * 0.94, r, h + 3, STONE, 16);
    B.cyl(x, y0 + h - 1.4, z, r + 0.9, r * 0.94, 1.4, STONE_DARK, 16);
    const rh = r * 2.3;
    B.cone(x, y0 + h, z, r + 1.3, rh, roof, 14);
    const n = Math.max(4, Math.round(r * 0.9));
    for (let yy = 7; yy < h - 4; yy += 8.5) {
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + yy;
        const lit = rng() < litChance;
        (lit ? G : B).box(x + Math.sin(a) * (r + 0.02), y0 + yy, z + Math.cos(a) * (r + 0.02), 1.0, 2.1, 0.22, lit ? LIT : GLASS, a);
      }
    }
    colliders.push({ x, z, r: r + 0.7, top: y0 + h + rh * 0.55 });
  }

  // 一段带人字屋顶的翼楼，两侧开窗
  function wing(x1, z1, x2, z2, w, h, y0, winH = 2.4) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const ry = Math.atan2(dx, dz);
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;
    const rh = w * 0.6;
    B.box(cx, y0 - 3, cz, w, h + 3, len, STONE, ry);
    B.gable(cx, y0 + h, cz, w + 1, rh, len + 1, SLATE, ry);
    for (let l = -len / 2 + 3; l <= len / 2 - 3; l += 5) {
      for (const side of [-1, 1]) {
        const o = rot(ry, side * (w / 2 + 0.03), l);
        const lit = rng() < 0.6;
        (lit ? G : B).box(cx + o[0], y0 + h * 0.28, cz + o[1], 0.2, winH, 1.2, lit ? LIT : GLASS, ry);
      }
    }
    const steps = Math.max(1, Math.round(len / (w * 0.7)));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      colliders.push({ x: x1 + dx * t, z: z1 + dz * t, r: w * 0.62, top: y0 + h + rh });
    }
  }

  // ---------- 霍格沃茨城堡 ----------
  {
    const { x: cx, z: cz, y } = sites.castle;
    // 礼堂：最长的一段，窗又高又亮
    wing(cx - 62, cz + 18, cx - 14, cz + 18, 20, 17, y, 8);
    // 主楼
    B.box(cx + 14, y - 3, cz - 4, 36, 31, 36, STONE);
    for (let k = 0; k < 16; k++) {
      const side = Math.floor(k / 4);
      const t = (k % 4) * 9 - 13.5;
      const [ox, oz] = side === 0 ? [t, 17.5] : side === 1 ? [t, -17.5] : side === 2 ? [17.5, t] : [-17.5, t];
      B.box(cx + 14 + ox, y + 28, cz - 4 + oz, side < 2 ? 4.5 : 1.4, 1.8, side < 2 ? 1.4 : 4.5, STONE_DARK);
    }
    for (const side of [-1, 1]) {
      for (let t = -12; t <= 12; t += 6) {
        for (const yy of [6, 14, 22]) {
          let lit = rng() < 0.55;
          (lit ? G : B).box(cx + 14 + t, y + yy, cz - 4 + side * 18.03, 1.3, 2.6, 0.2, lit ? LIT : GLASS);
          lit = rng() < 0.55;
          (lit ? G : B).box(cx + 14 + side * 18.03, y + yy, cz - 4 + t, 0.2, 2.6, 1.3, lit ? LIT : GLASS);
        }
      }
    }
    colliders.push({ x: cx + 14, z: cz - 4, r: 23, top: y + 29 });
    for (const [ox, oz] of [[-14, -14], [14, -14], [-14, 14], [14, 14]]) {
      colliders.push({ x: cx + 14 + ox, z: cz - 4 + oz, r: 6, top: y + 29 });
    }
    tower(cx + 14, cz - 4, 8, 30, y + 28);

    wing(cx + 22, cz - 22, cx + 54, cz - 40, 12, 16, y);
    wing(cx + 30, cz + 12, cx + 44, cz + 34, 11, 15, y);
    wing(cx - 12, cz - 14, cx - 40, cz - 44, 11, 14, y);

    tower(sites.castle.astro.x, sites.castle.astro.z, 7.5, 76, y);
    tower(cx + 46, cz + 38, 6.5, 58, y);
    tower(cx - 42, cz - 48, 6, 62, y);
    tower(cx - 66, cz + 18, 5.5, 46, y);
    tower(cx - 14, cz + 40, 4.5, 34, y);
    tower(cx + 72, cz + 4, 4.5, 36, y);

    // 庭院里的喷泉
    B.cyl(cx - 30, y, cz - 12, 3.2, 3.5, 0.9, STONE_DARK, 14);
    B.cyl(cx - 30, y + 0.9, cz - 12, 0.5, 0.7, 2.2, STONE, 8);
  }

  // ---------- 霍格莫德 ----------
  {
    const { x: cx, z: cz, y: cy } = sites.village;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + rng() * 0.25;
      const r = 30 + rng() * 26;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      if (Math.abs(T.height(x, z) - cy) > 1.5) continue;
      house(x, z, Math.atan2(cx - x, cz - z));
    }
    // 村子中央的三把扫帚
    house(cx, cz, 0.3, { w: 11, d: 15, storeys: 3, wall: WALLS[2], roof: ROOFS[1], lit: 0.9 });
    B.cyl(cx + 7.5, cy, cz + 9, 0.08, 0.08, 4.5, WOOD, 6);
    B.box(cx + 8.4, cy + 3.3, cz + 9, 1.7, 1.0, 0.08, GOLD);
  }

  // ---------- 尖叫棚屋：歪着的三层木屋，没有一扇窗亮着 ----------
  {
    const { x, z, y } = sites.shack;
    const dark = [0.2, 0.15, 0.11];
    B.put(new THREE.BoxGeometry(8, 15, 9), x, y + 6.5, z, dark, 0.4, 0, 0.07);
    B.put(new THREE.CylinderGeometry(0, 7.2, 6, 4), x - 1.0, y + 16.8, z, ROOFS[1], 0.4 + Math.PI / 4, 0, 0.07);
    B.put(new THREE.BoxGeometry(3.4, 6, 4), x + 4.6, y + 2.5, z + 1, dark, 0.4, 0, -0.1);
    for (const [lx, ly] of [[-2, 3], [2, 3], [-2, 8], [2, 8], [0, 12]]) {
      const o = rot(0.4, lx, 4.56);
      B.put(new THREE.BoxGeometry(1.4, 1.6, 0.14), x + o[0] - ly * 0.07, y + ly, z + o[1], GLASS, 0.4, 0, 0.07);
      B.put(new THREE.BoxGeometry(1.9, 0.25, 0.2), x + o[0] - ly * 0.07, y + ly, z + o[1], WOOD, 0.4, 0, 0.5);
    }
    colliders.push({ x, z, r: 6.6, top: y + 19.5 });
  }

  // ---------- 魁地奇球场 ----------
  {
    const { x, z, y } = sites.pitch;
    const ry = rng() * Math.PI;
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const o = rot(ry, Math.cos(a) * 64, Math.sin(a) * 42);
      const h = 15 + rng() * 8;
      const col = HOUSES[k % 4];
      const sx = x + o[0];
      const sz = z + o[1];
      const face = Math.atan2(x - sx, z - sz);
      B.box(sx, y - 2, sz, 1.0, h + 2, 1.0, WOOD);
      B.box(sx, y + h * 0.35, sz, 7, h * 0.65, 7, col, face);
      B.box(sx, y + h * 0.35 + 1.5, sz, 7.1, 1.2, 7.1, GOLD, face);
      B.cone(sx, y + h, sz, 5.6, 4.2, col, 4, face + Math.PI / 4);
      colliders.push({ x: sx, z: sz, r: 4.8, top: y + h + 3 });
    }
    for (const end of [-1, 1]) {
      for (const [lz, h] of [[-7, 11], [0, 15], [7, 11]]) {
        const o = rot(ry, end * 50, lz);
        B.cyl(x + o[0], y, z + o[1], 0.18, 0.22, h, GOLD, 8);
        B.put(new THREE.TorusGeometry(1.9, 0.17, 8, 22), x + o[0], y + h + 1.9, z + o[1], GOLD, ry + Math.PI / 2);
      }
    }
  }

  // ---------- 海格的小屋 ----------
  {
    const { x, z, y } = sites.hut;
    B.cyl(x, y - 2, z, 5, 5.3, 6.5, STONE, 12);
    B.cone(x, y + 4.5, z, 6.4, 5.2, TIMBER, 12);
    B.box(x + 2.6, y + 5, z - 1.5, 1.1, 5, 1.1, STONE_DARK);
    B.box(x, y, z + 5.1, 1.5, 2.6, 0.3, WOOD);
    G.box(x + 2.6, y + 1.6, z + 4.35, 1.1, 1.1, 0.2, LIT, 0.55);
    G.box(x - 2.6, y + 1.6, z + 4.35, 1.1, 1.1, 0.2, LIT, -0.55);
    for (let k = 0; k < 9; k++) {
      const px = x - 11 + (k % 3) * 2.6 + rng();
      const pz = z + 3 + Math.floor(k / 3) * 2.6 + rng();
      const r = 0.6 + rng() * 0.6;
      B.ball(px, T.height(px, pz) + r * 0.7, pz, r, [0.85, 0.4, 0.06]);
    }
    colliders.push({ x, z, r: 5.8, top: y + 9 });
  }

  // ---------- 猫头鹰棚屋 ----------
  {
    const { x, z, y } = sites.owlery;
    tower(x, z, 5, 26, y, ROOFS[0], 0.12);
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

  // ---------- 打人柳 ----------
  {
    const { x, z, y } = sites.willow;
    B.cyl(x, y - 1, z, 1.3, 2.0, 8, [0.24, 0.17, 0.11], 9);
    const greens = [[0.2, 0.3, 0.1], [0.24, 0.34, 0.12], [0.16, 0.26, 0.09]];
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const r = k === 0 ? 0 : 4 + rng() * 3;
      B.ball(x + Math.cos(a) * r, y + 9 - (k === 0 ? -1.5 : rng() * 3), z + Math.sin(a) * r, 3.2 + rng() * 1.6, greens[k % 3]);
      if (k > 0) B.put(new THREE.CylinderGeometry(0.3, 0.6, 6, 6), x + Math.cos(a) * r * 0.5, y + 8, z + Math.sin(a) * r * 0.5, [0.24, 0.17, 0.11], -a + Math.PI / 2, 0, 1.0);
    }
    colliders.push({ x, z, r: 2.1, top: y + 8 });
  }

  // ---------- 黑湖孤岩上的废塔 ----------
  {
    const { x, z, y } = sites.stack;
    B.cyl(x, y - 1, z, 4.2, 4.6, 8, STONE_DARK, 12);
    B.box(x + 2.5, y + 7, z + 1, 2.6, 4.5, 2.2, STONE_DARK, 0.5);
    B.box(x - 2.8, y + 7, z - 1.5, 2.0, 2.4, 2.4, STONE_DARK, 1.1);
    colliders.push({ x, z, r: 4.8, top: y + 10 });
  }

  const solid = B.mesh(patchLit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })));
  solid.castShadow = true;
  solid.receiveShadow = true;
  solid.frustumCulled = false;
  group.add(solid);
  const glow = G.mesh(new THREE.MeshBasicMaterial({ vertexColors: true }));
  glow.frustumCulled = false;
  group.add(glow);

  return { colliders };
}
