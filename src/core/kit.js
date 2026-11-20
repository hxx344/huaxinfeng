import * as THREE from 'three';
import { mulberry32 } from './noise.js';

const _m = new THREE.Matrix4();
const _nm = new THREE.Matrix3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);

function prism(w, h, d) {
  const a = [-w / 2, 0, d / 2];
  const b = [w / 2, 0, d / 2];
  const c = [0, h, d / 2];
  const a2 = [-w / 2, 0, -d / 2];
  const b2 = [w / 2, 0, -d / 2];
  const c2 = [0, h, -d / 2];
  const tris = [a, b, c, b2, a2, c2, a2, a, c, a2, c, c2, b, b2, c2, b, c2, c];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  g.computeVertexNormals();
  return g;
}

// 把基本几何体按位置、朝向和顶点色累积成一个网格，用来在代码里“搭”建筑和道具
export class Builder {
  constructor() {
    this.p = [];
    this.n = [];
    this.c = [];
  }

  put(geo, x, y, z, color, ry = 0, rx = 0, rz = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _one);
    _nm.getNormalMatrix(_m);
    const P = g.attributes.position;
    const N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(_m);
      this.p.push(_v.x, _v.y, _v.z);
      _v.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize();
      this.n.push(_v.x, _v.y, _v.z);
      this.c.push(color[0], color[1], color[2]);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
    return this;
  }

  // y 均为底面高度
  box(x, y, z, w, h, d, color, ry = 0) {
    return this.put(new THREE.BoxGeometry(w, h, d), x, y + h / 2, z, color, ry);
  }
  cyl(x, y, z, rTop, rBottom, h, color, seg = 12, ry = 0) {
    return this.put(new THREE.CylinderGeometry(rTop, rBottom, h, seg), x, y + h / 2, z, color, ry);
  }
  cone(x, y, z, r, h, color, seg = 12, ry = 0) {
    return this.put(new THREE.CylinderGeometry(0, r, h, seg), x, y + h / 2, z, color, ry);
  }
  ball(x, y, z, r, color, detail = 1) {
    return this.put(new THREE.IcosahedronGeometry(r, detail), x, y, z, color);
  }
  gable(x, y, z, w, h, d, color, ry = 0) {
    return this.put(prism(w, h, d), x, y, z, color, ry);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
  mesh(material) {
    return new THREE.Mesh(this.geometry(), material);
  }
}

// 把局部坐标 (lx, lz) 按绕 y 轴的朝向 ry 转到世界坐标偏移
export function rot(ry, lx, lz) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  return [lx * c + lz * s, -lx * s + lz * c];
}

export function glowTexture() {
  const size = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 一张四方连续的噪声贴图，着色器里采样它比现算噪声便宜得多。
// R、G 是两组互不相关的大块起伏，B 是细碎的颗粒
export function noiseTexture(size = 256) {
  const rng = mulberry32(8123);
  const lattice = (period) => {
    const v = new Float32Array(period * period);
    for (let i = 0; i < v.length; i++) v[i] = rng();
    return (u, w) => {
      const x = u * period;
      const y = w * period;
      const i = Math.floor(x);
      const j = Math.floor(y);
      let fx = x - i;
      let fy = y - j;
      fx = fx * fx * (3 - 2 * fx);
      fy = fy * fy * (3 - 2 * fy);
      const i0 = i % period;
      const j0 = j % period;
      const i1 = (i0 + 1) % period;
      const j1 = (j0 + 1) % period;
      const a = v[j0 * period + i0] + (v[j0 * period + i1] - v[j0 * period + i0]) * fx;
      const b = v[j1 * period + i0] + (v[j1 * period + i1] - v[j1 * period + i0]) * fx;
      return a + (b - a) * fy;
    };
  };
  const channels = [[4, 8, 16, 32], [6, 12, 24, 48], [32, 64, 128]].map((periods) => {
    const layers = periods.map(lattice);
    const out = new Float32Array(size * size);
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        let s = 0;
        let amp = 1;
        for (const f of layers) {
          s += amp * f(i / size, j / size);
          amp *= 0.5;
        }
        out[j * size + i] = s;
        lo = Math.min(lo, s);
        hi = Math.max(hi, s);
      }
    }
    for (let k = 0; k < out.length; k++) out[k] = (out[k] - lo) / (hi - lo);
    return out;
  });
  const data = new Uint8Array(size * size * 4);
  for (let k = 0; k < size * size; k++) {
    data[k * 4] = channels[0][k] * 255;
    data[k * 4 + 1] = channels[1][k] * 255;
    data[k * 4 + 2] = channels[2][k] * 255;
    data[k * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}
