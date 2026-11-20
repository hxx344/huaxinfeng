import * as THREE from 'three';
import { makeNoise, fbm, ridged, smooth, clamp } from '../core/noise.js';
import { U, WORLD, HALF, GRID } from '../core/shared.js';

const N = GRID;
const S = N + 1;
export const CELL = WORLD / N;
export const SEA_FLOOR = -38;

export const FJORD = { ax: 1500, az: -150, bx: 560, bz: -260 };
export const STACK = { x: -1180, z: 980 };
export const ISLET_E = { x: 1330, z: 620 };
export const ISLET_W = { x: -1250, z: -700 };

function distToSegment(x, z, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}

export class Terrain {
  constructor(seed = 20261) {
    this.n1 = makeNoise(seed);
    this.n2 = makeNoise(seed + 11);
    this.n3 = makeNoise(seed + 23);
    this.n4 = makeNoise(seed + 37);
    this.n5 = makeNoise(seed + 53);
    this.h = new Float32Array(S * S);
    for (let j = 0; j < S; j++) {
      const z = -HALF + j * CELL;
      for (let i = 0; i < S; i++) {
        this.h[j * S + i] = this.rawHeight(-HALF + i * CELL, z);
      }
    }
  }

  rawHeight(x, z) {
    const { n1, n2, n3, n4 } = this;
    const d = Math.hypot(x, z) / 1250;
    const e = d + fbm(n1, x * 0.0015 + 3.1, z * 0.0015 - 1.7, 4) * 0.24;
    const gentle = 1 - smooth(0.6, 1.02, e);
    const sharp = 1 - smooth(0.84, 0.92, e);
    // 北岸是陡崖，南岸是缓滩
    const cliff = smooth(-0.05, 0.45, -z / 1250 + 0.35 * n2(x * 0.0011, z * 0.0011));
    const m = gentle + (sharp - gentle) * cliff;
    const hills = 0.5 + 0.5 * fbm(n3, x * 0.0021, z * 0.0021, 5);
    const mm = smooth(820, 150, Math.hypot(x - 320, z + 380));
    const rid = ridged(n4, x * 0.0016, z * 0.0016, 5);
    const land = 5 + 44 * Math.pow(hills, 1.6) + cliff * 30 + mm * (60 + 230 * rid * rid);
    let h = m * (land - SEA_FLOOR) + SEA_FLOOR;

    const fd = distToSegment(x, z, FJORD.ax, FJORD.az, FJORD.bx, FJORD.bz) + 18 * n2(x * 0.01, z * 0.01);
    const carve = 1 - smooth(35, 120, fd);
    h = Math.min(h, h + (-14 - h) * carve);

    h = Math.max(h, 30 - 70 * smooth(16, 46, Math.hypot(x - STACK.x, z - STACK.z)));
    let dx = x - ISLET_E.x;
    let dz = z - ISLET_E.z;
    h = Math.max(h, SEA_FLOOR + 56 * Math.exp(-(dx * dx + dz * dz) / (130 * 130)));
    dx = x - ISLET_W.x;
    dz = z - ISLET_W.z;
    h = Math.max(h, SEA_FLOOR + 52 * Math.exp(-(dx * dx + dz * dz) / (110 * 110)));

    h += fbm(n2, x * 0.02, z * 0.02, 2) * 0.8 * clamp(h / 6, 0, 1);
    return h;
  }

  height(x, z) {
    const fx = (x + HALF) / CELL;
    const fz = (z + HALF) / CELL;
    if (fx < 0 || fz < 0 || fx >= N || fz >= N) return SEA_FLOOR;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const k = j * S + i;
    const h = this.h;
    const a = h[k] + (h[k + 1] - h[k]) * tx;
    const b = h[k + S] + (h[k + S + 1] - h[k + S]) * tx;
    return a + (b - a) * tz;
  }

  // 可以站立或贴着飞的表面高度：陆地或海面
  ground(x, z) {
    const h = this.height(x, z);
    return h > 0 ? h : 0;
  }

  normalY(x, z) {
    const dx = this.height(x + CELL, z) - this.height(x - CELL, z);
    const dz = this.height(x, z + CELL) - this.height(x, z - CELL);
    const l = 2 * CELL;
    return l / Math.sqrt(dx * dx + dz * dz + l * l);
  }

  flatten(cx, cz, radius, target, inner = 0.6) {
    const i0 = Math.max(0, Math.floor((cx - radius + HALF) / CELL));
    const i1 = Math.min(N, Math.ceil((cx + radius + HALF) / CELL));
    const j0 = Math.max(0, Math.floor((cz - radius + HALF) / CELL));
    const j1 = Math.min(N, Math.ceil((cz + radius + HALF) / CELL));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(-HALF + i * CELL - cx, -HALF + j * CELL - cz);
        const w = smooth(radius, radius * inner, d);
        const k = j * S + i;
        this.h[k] += (target - this.h[k]) * w;
      }
    }
  }

  maskIndex(x, z) {
    const i = Math.round((x + HALF) / CELL);
    const j = Math.round((z + HALF) / CELL);
    if (i < 0 || j < 0 || i > N || j > N) return -1;
    return j * S + i;
  }

  // 在场地布置完成后调用：生成遮罩、网格和供着色器采样的高度贴图
  finalize(clears) {
    const { h, n1, n2, n3, n5 } = this;
    const count = S * S;
    this.grass = new Float32Array(count);
    this.flower = new Float32Array(count);
    this.field = new Float32Array(count);
    this.forest = new Float32Array(count);
    this.clear = new Float32Array(count);
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const tex = new Uint16Array(count * 4);
    const half = THREE.DataUtils.toHalfFloat;

    for (const c of clears) {
      const i0 = Math.max(0, Math.floor((c.x - c.r + HALF) / CELL));
      const i1 = Math.min(N, Math.ceil((c.x + c.r + HALF) / CELL));
      const j0 = Math.max(0, Math.floor((c.z - c.r + HALF) / CELL));
      const j1 = Math.min(N, Math.ceil((c.z + c.r + HALF) / CELL));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const d = Math.hypot(-HALF + i * CELL - c.x, -HALF + j * CELL - c.z);
          const w = smooth(c.r, c.r * 0.75, d) * (c.paved ? 2 : 1);
          const k = j * S + i;
          if (w > this.clear[k]) this.clear[k] = w;
        }
      }
    }

    for (let j = 0; j < S; j++) {
      const z = -HALF + j * CELL;
      for (let i = 0; i < S; i++) {
        const x = -HALF + i * CELL;
        const k = j * S + i;
        const y = h[k];
        const hl = h[j * S + Math.max(0, i - 1)];
        const hr = h[j * S + Math.min(N, i + 1)];
        const hd = h[Math.max(0, j - 1) * S + i];
        const hu = h[Math.min(N, j + 1) * S + i];
        let nx = hl - hr;
        let ny = 2 * CELL;
        let nz = hd - hu;
        const nl = Math.hypot(nx, ny, nz);
        nx /= nl;
        ny /= nl;
        nz /= nl;

        const field = 0.5 + 0.5 * n1(x * 0.0042 + 40, z * 0.0042 - 12);
        const dry = 0.5 + 0.5 * fbm(n2, x * 0.009, z * 0.009, 3);
        const speck = n5(x * 0.07, z * 0.07);
        const rock = smooth(0.82, 0.62, ny);
        const sand = smooth(3.4, 1.3, y);
        const alp = smooth(105, 190, y);
        const clearRaw = this.clear[k];
        const paved = clamp(clearRaw - 1, 0, 1);
        const clear = Math.min(1, clearRaw);

        let r = 0.13 + 0.13 * dry + 0.02 * speck;
        let g = 0.27 + 0.11 * dry + 0.03 * speck;
        let b = 0.06 + 0.03 * dry;
        const strata = 0.82 + 0.2 * Math.sin(y * 0.42 + n3(x * 0.004, z * 0.004) * 3) + 0.06 * speck;
        const rk = Math.max(rock, alp * 0.85);
        const tone = strata * (0.78 + 0.3 * dry) * (0.7 + 0.45 * ny);
        r += (0.37 * tone - r) * rk;
        g += (0.33 * tone - g) * rk;
        b += (0.29 * tone - b) * rk;
        r += (0.66 - r) * sand;
        g += (0.58 - g) * sand;
        b += (0.4 - b) * sand;
        if (y < 0) {
          const deep = smooth(0, -12, y);
          r += (0.16 - r) * deep;
          g += (0.3 - g) * deep;
          b += (0.3 - b) * deep;
        }
        if (paved > 0) {
          const cob = 0.4 + 0.05 * speck;
          r += (cob * 1.06 - r) * paved;
          g += (cob - g) * paved;
          b += (cob * 0.9 - b) * paved;
        }

        const grass = (1 - rock) * (1 - sand) * (1 - alp) * (1 - clear);
        const forest = smooth(0.08, 0.34, fbm(n3, x * 0.003 + 9, z * 0.003 + 4, 3));
        const drift = smooth(-0.15, 0.3, fbm(n5, x * 0.0045, z * 0.0045, 3));
        const flower = grass * drift * (1 - forest * 0.85);
        this.grass[k] = grass;
        this.flower[k] = flower;
        this.field[k] = field;
        this.forest[k] = forest * (1 - rock) * (1 - sand) * (1 - clear);

        pos[k * 3] = x;
        pos[k * 3 + 1] = y;
        pos[k * 3 + 2] = z;
        nor[k * 3] = nx;
        nor[k * 3 + 1] = ny;
        nor[k * 3 + 2] = nz;
        col[k * 3] = r;
        col[k * 3 + 1] = g;
        col[k * 3 + 2] = b;
        tex[k * 4] = half(y);
        tex[k * 4 + 1] = half(flower);
        tex[k * 4 + 2] = half(field);
        tex[k * 4 + 3] = half(grass);
      }
    }

    const index = new Uint32Array(N * N * 6);
    let q = 0;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = j * S + i;
        const b = a + 1;
        const c = a + S;
        const d = c + 1;
        index[q++] = a;
        index[q++] = c;
        index[q++] = b;
        index[q++] = b;
        index[q++] = c;
        index[q++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeBoundingSphere();
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 })
    );
    this.mesh.receiveShadow = true;

    const map = new THREE.DataTexture(tex, S, S, THREE.RGBAFormat, THREE.HalfFloatType);
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearFilter;
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
    map.needsUpdate = true;
    this.map = map;
    U.uHeightMap.value = map;
  }
}
