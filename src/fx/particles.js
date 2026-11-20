import * as THREE from 'three';
import { commonUniforms, GLSL_COMMON } from '../core/shared.js';

export const PETAL = 0;
export const SPRAY = 1;
export const SPARK = 2;
const MAX = 6000;

export class Particles {
  constructor(scene, T, wake) {
    this.T = T;
    this.wake = wake;
    this.n = 0;
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.data = new Float32Array(MAX * 4); // seed, size, alpha, type
    this.life = new Float32Array(MAX);
    this.span = new Float32Array(MAX);
    this.tmp = [0, 0, 0];
    this.petals = 0;

    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', quad.attributes.position);
    g.setAttribute('uv', quad.attributes.uv);
    g.setIndex(quad.index);
    const dyn = (arr, size) => {
      const a = new THREE.InstancedBufferAttribute(arr, size);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    g.setAttribute('iPos', (this.aPos = dyn(this.pos, 3)));
    g.setAttribute('iColor', (this.aCol = dyn(this.col, 3)));
    g.setAttribute('iData', (this.aData = dyn(this.data, 4)));
    g.instanceCount = 0;
    this.geo = g;

    const material = new THREE.ShaderMaterial({
      uniforms: commonUniforms(),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        ${GLSL_COMMON}
        attribute vec3 iPos;
        attribute vec3 iColor;
        attribute vec4 iData;
        varying vec2 vUv;
        varying vec3 vCol;
        varying float vAlpha;
        varying float vType;
        varying float vDist;
        void main() {
          vUv = uv;
          vAlpha = iData.z;
          vType = iData.w;
          float seed = iData.x;
          float size = iData.y;
          vec4 mv;
          if (iData.w < 0.5) {
            // 花瓣：绕着自己乱翻的小片
            float a = seed * 91.0 + uTime * (4.0 + seed * 6.0);
            float b = seed * 37.0 + uTime * (2.0 + seed * 3.0);
            vec3 e1 = vec3(cos(a), sin(a) * cos(b), sin(a) * sin(b));
            vec3 e2 = normalize(cross(e1, vec3(sin(b), cos(b), 0.31)));
            vec3 n = cross(e1, e2);
            vec3 wp = iPos + (e1 * position.x + e2 * position.y * 0.72) * size;
            vCol = iColor * (uSunLight * (0.5 + 0.5 * abs(dot(n, uSunDir))) + uSkyLight);
            mv = viewMatrix * vec4(wp, 1.0);
          } else {
            mv = viewMatrix * vec4(iPos, 1.0);
            mv.xy += position.xy * size;
            vCol = iData.w < 1.5 ? iColor * (uSunLight * 0.8 + uSkyLight) : iColor * 3.0;
          }
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        ${GLSL_COMMON}
        varying vec2 vUv;
        varying vec3 vCol;
        varying float vAlpha;
        varying float vType;
        varying float vDist;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          if (d > 1.0) discard;
          float alpha = vAlpha;
          if (vType > 1.5) alpha *= pow(1.0 - d, 1.6);
          else if (vType > 0.5) alpha *= smoothstep(1.0, 0.25, d) * 0.55;
          gl_FragColor = vec4(applyFog(vCol, vDist), alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }

  spawn(type, x, y, z, vx, vy, vz, life, size, r, g, b) {
    if (this.n >= MAX) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.data[i * 4] = Math.random();
    this.data[i * 4 + 1] = size;
    this.data[i * 4 + 2] = 0;
    this.data[i * 4 + 3] = type;
    this.life[i] = life;
    this.span[i] = life;
  }

  kill(i) {
    const j = --this.n;
    if (i === j) return;
    for (let k = 0; k < 3; k++) {
      this.pos[i * 3 + k] = this.pos[j * 3 + k];
      this.vel[i * 3 + k] = this.vel[j * 3 + k];
      this.col[i * 3 + k] = this.col[j * 3 + k];
    }
    for (let k = 0; k < 4; k++) this.data[i * 4 + k] = this.data[j * 4 + k];
    this.life[i] = this.life[j];
    this.span[i] = this.span[j];
  }

  update(dt, time) {
    const { pos, vel, data, life, span, tmp, wake, T } = this;
    const wx = 1.6 + Math.sin(time * 0.6) * 0.8;
    const wz = 1.0 + Math.cos(time * 0.45) * 0.6;
    let petals = 0;
    for (let i = this.n - 1; i >= 0; i--) {
      life[i] -= dt;
      if (life[i] <= 0) {
        this.kill(i);
        continue;
      }
      const p = i * 3;
      const type = data[i * 4 + 3];
      const seed = data[i * 4];
      let x = pos[p];
      let y = pos[p + 1];
      let z = pos[p + 2];
      const inWake = wake.sample(x, y, z, tmp);
      if (type === PETAL) {
        petals++;
        const k = Math.min(1, dt * (inWake ? 5 : 2));
        const flutter = Math.sin(time * 3 + seed * 40) * 0.7;
        vel[p] += (wx + tmp[0] + flutter - vel[p]) * k;
        vel[p + 1] += (tmp[1] - 0.55 + Math.cos(time * 2.3 + seed * 30) * 0.4 - vel[p + 1]) * k;
        vel[p + 2] += (wz + tmp[2] - flutter - vel[p + 2]) * k;
      } else if (type === SPRAY) {
        const k = Math.min(1, dt * 2.2);
        vel[p] += (tmp[0] - vel[p]) * k;
        vel[p + 1] += (tmp[1] * 0.6 - vel[p + 1]) * k * 0.5 - 7.5 * dt;
        vel[p + 2] += (tmp[2] - vel[p + 2]) * k;
      } else {
        const k = Math.min(1, dt * 1.6);
        vel[p] -= vel[p] * k;
        vel[p + 1] += (0.8 - vel[p + 1]) * k;
        vel[p + 2] -= vel[p + 2] * k;
      }
      x += vel[p] * dt;
      y += vel[p + 1] * dt;
      z += vel[p + 2] * dt;
      const h = T.height(x, z);
      if (type === PETAL) {
        const floor = (h > 0 ? h : 0) + 0.06;
        if (y < floor) {
          y = floor;
          vel[p] *= 0.6;
          vel[p + 2] *= 0.6;
          if (h <= 0 && life[i] > 0.6) life[i] = 0.6;
        }
      } else if (type === SPRAY && y < Math.max(h, 0)) {
        this.kill(i);
        continue;
      }
      pos[p] = x;
      pos[p + 1] = y;
      pos[p + 2] = z;
      data[i * 4 + 2] = Math.min(1, life[i] * 2.2, (span[i] - life[i]) * 5);
    }
    this.petals = petals;
    this.geo.instanceCount = this.n;
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
    this.aData.needsUpdate = true;
  }
}
