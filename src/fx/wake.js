import * as THREE from 'three';
import { U, WORLD, HALF, TRAIL_N } from '../core/shared.js';
import { clamp } from '../core/noise.js';

const NS = 72;
const LIFE = 7;
const STRIP_SIZE = 2048;
const CPU = 512;
const TWO_PI = Math.PI * 2;

// 扫帚身后的尾流：一串横截面，每个截面带一对反向旋转的涡核。
// 粒子按最近的截面取诱导速度；草、花和海面通过 uTrail 和“掉瓣图”读到它。
export class Wake {
  constructor() {
    const f = () => new Float32Array(NS);
    this.px = f(); this.py = f(); this.pz = f();
    this.rx = f(); this.rz = f();
    this.ux = f(); this.uy = f(); this.uz = f();
    this.fx = f(); this.fy = f(); this.fz = f();
    this.gamma = f(); this.age = f().fill(99); this.alt = f(); this.speed = f();
    this.head = 0;
    this.timer = 0;

    this.strip = new THREE.WebGLRenderTarget(STRIP_SIZE, STRIP_SIZE, {
      depthBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });
    U.uStripMap.value = this.strip.texture;
    this.cpu = new Float32Array(CPU * CPU);
    this.stampScene = new THREE.Scene();
    this.stampCam = new THREE.OrthographicCamera(-HALF, HALF, HALF, -HALF, -1, 1);
    this.stampMat = new THREE.ShaderMaterial({
      uniforms: { uStrength: { value: 0 } },
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.MaxEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uStrength; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; gl_FragColor = vec4(uStrength * smoothstep(1.0, 0.35, d)); }`,
    });
    this.stampQuad = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), this.stampMat);
    this.stampScene.add(this.stampQuad);
    this.pending = [];
    this.cleared = false;
  }

  update(dt, flight, active) {
    const { age } = this;
    for (let i = 0; i < NS; i++) age[i] += dt;
    this.timer += dt;
    if (active && this.timer >= 0.04) {
      this.timer = 0;
      const i = (this.head = (this.head + 1) % NS);
      const sy = Math.sin(flight.yaw);
      const cy = Math.cos(flight.yaw);
      const sp = Math.sin(flight.pitch);
      const cp = Math.cos(flight.pitch);
      const fx = -sy * cp;
      const fy = sp;
      const fz = -cy * cp;
      const rx = cy;
      const rz = -sy;
      this.px[i] = flight.pos.x - fx * 1.2;
      this.py[i] = flight.pos.y - fy * 1.2;
      this.pz[i] = flight.pos.z - fz * 1.2;
      this.rx[i] = rx;
      this.rz[i] = rz;
      this.fx[i] = fx; this.fy[i] = fy; this.fz[i] = fz;
      // up = right × forward
      this.ux[i] = -rz * fy;
      this.uy[i] = rz * fx - rx * fz;
      this.uz[i] = rx * fy;
      this.gamma[i] = flight.speed * 1.7;
      this.speed[i] = flight.speed;
      this.alt[i] = flight.alt;
      age[i] = 0;
    }
    const trail = U.uTrail.value;
    for (let k = 0; k < TRAIL_N; k++) {
      const i = (this.head - k * 3 + NS * 3) % NS;
      const a = age[i];
      const s = a > LIFE ? 0 : clamp(this.speed[i] / 55, 0, 1.2) * Math.exp(-a * 0.75) * clamp(1 - this.alt[i] / 9, 0, 1);
      trail[k].set(this.px[i], this.pz[i], s, 3.2 + a * 1.1);
    }
  }

  // 位置 (x,y,z) 处尾流诱导出的气流速度，写入 out[0..2]，返回是否在尾流里
  sample(x, y, z, out) {
    const { px, py, pz, age } = this;
    let best = -1;
    let bd = 121;
    for (let i = 0; i < NS; i++) {
      if (age[i] > LIFE) continue;
      const dx = x - px[i];
      const dy = y - py[i];
      const dz = z - pz[i];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < bd) {
        bd = d2;
        best = i;
      }
    }
    if (best < 0) {
      out[0] = out[1] = out[2] = 0;
      return false;
    }
    const i = best;
    const a = age[i];
    const dx = x - px[i];
    const dy = y - py[i];
    const dz = z - pz[i];
    const lat = dx * this.rx[i] + dz * this.rz[i];
    const vert = dx * this.ux[i] + dy * this.uy[i] + dz * this.uz[i];
    const b = 0.8 + 0.45 * a;
    const sink = Math.min(a, Math.max(0, this.alt[i] - 0.4));
    const rc = 0.45 + 0.3 * a;
    const g = (this.gamma[i] * Math.exp(-a / 2.6)) / TWO_PI;
    const ay = vert + sink;
    let ax = lat - b;
    let q = g / (ax * ax + ay * ay + rc * rc);
    let vx = -ay * q;
    let vy = ax * q;
    ax = lat + b;
    q = g / (ax * ax + ay * ay + rc * rc);
    vx += ay * q;
    vy -= ax * q;
    const along = this.speed[i] * 0.3 * Math.exp(-a * 1.2) * Math.exp(-(lat * lat + vert * vert) / 9);
    out[0] = this.rx[i] * vx + this.ux[i] * vy + this.fx[i] * along;
    out[1] = this.uy[i] * vy + this.fy[i] * along;
    out[2] = this.rz[i] * vx + this.uz[i] * vy + this.fz[i] * along;
    return true;
  }

  // 在掉瓣图上盖一个章，返回这一处新增的掉瓣量（0..1），用来决定扬起多少花瓣
  stamp(x, z, strength) {
    this.pending.push(x, z, strength);
    const i = Math.floor(((x + HALF) / WORLD) * CPU);
    const j = Math.floor(((z + HALF) / WORLD) * CPU);
    if (i < 0 || j < 0 || i >= CPU || j >= CPU) return 0;
    const k = j * CPU + i;
    const gain = strength - this.cpu[k];
    if (gain <= 0) return 0;
    this.cpu[k] = strength;
    return gain;
  }

  render(renderer) {
    if (this.cleared && this.pending.length === 0) return;
    const prevTarget = renderer.getRenderTarget();
    const prevAuto = renderer.autoClear;
    renderer.setRenderTarget(this.strip);
    if (!this.cleared) {
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      this.cleared = true;
    }
    renderer.autoClear = false;
    for (let k = 0; k < this.pending.length; k += 3) {
      this.stampQuad.position.set(this.pending[k], this.pending[k + 1], 0);
      this.stampMat.uniforms.uStrength.value = this.pending[k + 2];
      renderer.render(this.stampScene, this.stampCam);
    }
    this.pending.length = 0;
    renderer.autoClear = prevAuto;
    renderer.setRenderTarget(prevTarget);
  }
}
